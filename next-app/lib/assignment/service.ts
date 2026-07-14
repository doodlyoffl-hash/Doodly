/* =============================================================
   Auto Delivery Assignment — service layer (Prisma persistence).
   Wraps the pure engine with transactional, race-safe DB writes:
     • runAutoAssignment   — distribute a slot's deliveries
     • onExecutiveReturned — pull the next batch from the queue
     • manualAssign / reassign / unassign / setLock — admin overrides
     • getDashboard        — live aggregates for the dashboard

   Race safety: DeliveryAssignment.deliveryId and AssignmentQueue.deliveryId
   are UNIQUE, so concurrent writers can never double-assign — createMany uses
   skipDuplicates and Delivery updates are guarded by `driverId: null`.
   Transactions run Serializable with a small retry on transient conflicts.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { planAssignments, planEqualAssignments, assignFromQueue } from "./engine";
import { getAssignmentStrategy } from "./strategy";
import { BOTTLE_CAPACITY, QUEUE_REASON } from "./constants";
import type { DeliveryInput, ExecutiveInput } from "./types";
import type { DashboardData } from "./dashboard-types";
import { notifyExecutive, notifyAdmins, EXEC_EVENT, ADMIN_EVENT } from "./notify";

export interface Actor { actorId?: string; actorRole?: string }
export interface SlotArgs extends Actor { date: Date | string; slot: string }

const QUEUE_ALERT_THRESHOLD = 50; // bottles in queue that trigger an admin alert

// ---------- helpers ----------

const IST_MS = 5.5 * 60 * 60 * 1000;
/* The IST calendar day that contains `date` (a Date instant, an ISO string, or a
   "YYYY-MM-DD" string), expressed as a UTC [gte, lt) window. IST is the business
   timezone; computing the window this way keeps the assignment day aligned with the
   IST-dated Delivery records on both an IST dev box and a UTC server (Vercel). */
function dayRange(date: Date | string) {
  const d = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : new Date(date);
  const ist = new Date(d.getTime() + IST_MS);
  const startMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS;
  return { gte: new Date(startMs), lt: new Date(startMs + 24 * 60 * 60 * 1000) };
}
/** "YYYY-MM-DD" (IST) for a UTC window start produced by dayRange(). */
function isoOf(windowStart: Date): string {
  const ist = new Date(windowStart.getTime() + IST_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

/** Retry a transaction on transient write-conflict / deadlock (P2034). */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
      if (code === "P2034" || code === "P2037") { await sleep(40 * (i + 1)); continue; } // retryable
      throw e;
    }
  }
  throw lastErr;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 } as const;

// A delivery row joined with its address (for locality/geo) — used to build engine inputs.
// Prefer the delivery's own address snapshot (set for order-linked deliveries by the
// Order→Delivery bridge, and pinned history), falling back to the live subscription address.
const deliveryInclude = { address: true, subscription: { include: { address: true } } } as const;
type DeliveryWithAddr = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

function toDeliveryInput(d: DeliveryWithAddr): DeliveryInput {
  const addr = d.address ?? d.subscription?.address;
  return {
    id: d.id,
    bottles: d.bottleCount ?? 1,
    area: addr?.pincode ?? addr?.city ?? null,
    zoneId: addr?.zoneId ?? null,
    lat: addr?.lat ?? null,
    lng: addr?.lng ?? null,
  };
}

const driverInclude = { execStatus: true, capacity: true, user: { select: { id: true } } } as const;
type DriverWithStatus = Prisma.DriverGetPayload<{ include: typeof driverInclude }>;

function toExecutiveInput(dr: DriverWithStatus): ExecutiveInput {
  const cap = dr.capacity?.maxBottles ?? BOTTLE_CAPACITY;
  const used = dr.execStatus?.assignedBottles ?? 0;
  const avail = dr.execStatus?.availability ?? "AVAILABLE";
  return {
    id: dr.id,
    capacity: cap,
    used,
    zoneId: dr.zoneId ?? null,
    lat: dr.lat ?? null,
    lng: dr.lng ?? null,
    available: avail === "AVAILABLE" || avail === "RETURNED_TO_DAIRY",
  };
}

// ---------- AUTO ASSIGNMENT ----------

export async function runAutoAssignment(args: SlotArgs) {
  const { slot, actorRole } = args;
  // AssignmentLog.actorId is a User FK — a cross-origin/dev-bridge actor id may not be a
  // real User row, so resolve it to null rather than violate the constraint (attribution
  // still rides on actorRole). Mirrors the AuditLog userId handling elsewhere.
  let actorId = args.actorId;
  if (actorId && !(await db.user.findUnique({ where: { id: actorId }, select: { id: true } }))) actorId = undefined;
  const range = dayRange(args.date);
  const date = range.gte;

  // Assignment strategy (admin-configurable; Startup Mode = EQUAL is the default).
  const strategy = await getAssignmentStrategy();
  if (strategy === "MANUAL") {
    return { ok: true, assigned: 0, queued: 0, executives: 0, strategy, message: "Manual mode — auto-assignment is switched off. Assign deliveries from the board." };
  }

  return withRetry(() =>
    db.$transaction(async (tx) => {
      // 1) Confirmed deliveries for the slot that aren't assigned or queued yet.
      const deliveries = await tx.delivery.findMany({
        where: { date: range, slot, status: "SCHEDULED", assignment: null, queueEntry: null },
        include: deliveryInclude,
      });

      // 2) Executives that can take work right now.
      const drivers = await tx.driver.findMany({
        where: { active: true, execStatus: { availability: { in: ["AVAILABLE", "RETURNED_TO_DAIRY"] } } },
        include: driverInclude,
      });

      if (!deliveries.length) {
        return { ok: true, assigned: 0, queued: 0, executives: 0, message: "No deliveries to assign." };
      }

      const dInputs = deliveries.map(toDeliveryInput);
      const meta = new Map(dInputs.map((d) => [d.id, d]));
      const eInputs = drivers.map(toExecutiveInput);
      const userIdByDriver = new Map(drivers.map((d) => [d.id, d.user.id]));

      // EQUAL (Startup Mode) balances order counts across peers; CAPACITY packs
      // fuller trips without locality bias; AREA = the enterprise zone/route planner.
      const plan =
        strategy === "EQUAL" ? planEqualAssignments(dInputs, eInputs)
        : strategy === "CAPACITY" ? planAssignments(dInputs, eInputs, { zoneAffinity: false })
        : planAssignments(dInputs, eInputs);

      // 3) Persist assignments (one trip per executive).
      for (const a of plan.assignments) {
        const trip = await tx.tripHistory.create({
          data: { driverId: a.executiveId, slot, date, status: "ASSIGNED", totalBottles: a.bottles, stops: a.stops },
        });
        await tx.deliveryAssignment.createMany({
          data: a.deliveryIds.map((id, i) => {
            const m = meta.get(id)!;
            return {
              deliveryId: id, driverId: a.executiveId, tripId: trip.id, slot, date,
              bottles: m.bottles, status: "ASSIGNED" as const, sequence: i + 1, area: m.area, zoneId: m.zoneId,
            };
          }),
          skipDuplicates: true, // concurrent assigner already claimed it → skip
        });
        // only claim deliveries still unassigned (guards against races)
        await tx.delivery.updateMany({
          where: { id: { in: a.deliveryIds }, driverId: null },
          data: { driverId: a.executiveId, status: "ASSIGNED", routeId: null },
        });
        await tx.executiveStatus.update({
          where: { driverId: a.executiveId },
          // INCREMENT, don't overwrite: the engine already subtracted the executive's
          // existing load (toExecutiveInput passes `used = assignedBottles`, engine plans
          // against `capacity - used`), so `a.bottles` is only what THIS run added.
          // Overwriting discarded the prior load, so remainingCapacity() over-reported free
          // space and a driver could be loaded past their van capacity.
          data: { availability: "ASSIGNED", currentTripId: trip.id, assignedBottles: { increment: a.bottles } },
        });
        await tx.assignmentLog.createMany({
          data: a.deliveryIds.map((id) => ({
            action: "AUTO_ASSIGN" as const, deliveryId: id, driverId: a.executiveId, tripId: trip.id,
            actorId, actorRole, bottles: meta.get(id)!.bottles,
          })),
        });
        const uid = userIdByDriver.get(a.executiveId);
        if (uid) await notifyExecutive(tx, uid, EXEC_EVENT.NEW_TRIP, `New trip: ${a.stops} stops, ${a.bottles} bottles.`);
      }

      // 4) Overflow → pending queue.
      if (plan.queue.length) {
        await tx.assignmentQueue.createMany({
          data: plan.queue.map((q) => ({
            deliveryId: q.deliveryId, slot, date, bottles: q.bottles,
            area: q.area, zoneId: q.zoneId, status: "PENDING" as const, reason: q.reason, priority: q.priority,
          })),
          skipDuplicates: true,
        });
        await tx.assignmentLog.createMany({
          data: plan.queue.map((q) => ({
            action: "QUEUE" as const, deliveryId: q.deliveryId, bottles: q.bottles, actorId, actorRole, note: q.reason,
          })),
        });
      }

      // 5) Admin alerts.
      if (!drivers.length) await notifyAdmins(tx, ADMIN_EVENT.NO_EXECUTIVES, `${deliveries.length} deliveries waiting — no executives available for ${slot}.`);
      else if (plan.stats.queuedBottles >= QUEUE_ALERT_THRESHOLD) await notifyAdmins(tx, ADMIN_EVENT.QUEUE_GROWING, `${plan.stats.queuedBottles} bottles pending in the queue for ${slot}.`);

      return {
        ok: true,
        strategy,
        assigned: plan.stats.assignedDeliveries,
        assignedBottles: plan.stats.assignedBottles,
        queued: plan.stats.queuedDeliveries,
        queuedBottles: plan.stats.queuedBottles,
        executives: plan.assignments.length,
      };
    }, TX),
  );
}

// ---------- AUTOMATIC TRIGGER (sweep) ----------

/**
 * Sweep-assign TODAY's (IST) unassigned SCHEDULED deliveries across every slot
 * they use. This is the automatic trigger behind auto-assignment — fired when an
 * executive starts their shift, and (optionally) by a morning cron. Idempotent
 * (only claims SCHEDULED + unassigned deliveries) and strategy-aware (MANUAL →
 * no-op, so an admin who wants to assign by hand isn't overridden).
 */
export async function runScheduledAutoAssignment(actor: Actor = { actorRole: "system" }, dateStr?: string | null) {
  const strategy = await getAssignmentStrategy();
  if (strategy === "MANUAL") return { ok: true, strategy, slots: 0, assigned: 0, queued: 0, message: "Manual mode — auto-assignment is off." };

  // The chosen IST delivery day (default: today IST, the business timezone) →
  // sweeps every slot that day's unassigned deliveries use, regardless of the UTC
  // hour the trigger fires at. Deliveries are date-stamped for their IST day.
  const { gte: start, lt: end } = dayRange(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date());

  const pending = await db.delivery.findMany({
    where: { status: "SCHEDULED", assignment: null, queueEntry: null, date: { gte: start, lt: end } },
    select: { date: true, slot: true },
  });
  if (!pending.length) return { ok: true, strategy, slots: 0, assigned: 0, queued: 0, message: "No deliveries to assign for that day." };

  // Distinct (delivery-day, slot) pairs; runAutoAssignment day-ranges each date.
  const seen = new Set<string>();
  const combos: { date: Date; slot: string }[] = [];
  for (const d of pending) {
    const slot = d.slot || "06:00-08:00";
    const dayKey = new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate()).getTime();
    const key = dayKey + "|" + slot;
    if (!seen.has(key)) { seen.add(key); combos.push({ date: d.date, slot }); }
  }

  let assigned = 0, queued = 0;
  const results: { slot: string; assigned: number; queued: number; executives: number }[] = [];
  for (const c of combos) {
    const r = await runAutoAssignment({ date: c.date, slot: c.slot, actorRole: actor.actorRole, actorId: actor.actorId });
    assigned += r.assigned || 0; queued += r.queued || 0;
    results.push({ slot: c.slot, assigned: r.assigned || 0, queued: r.queued || 0, executives: r.executives || 0 });
  }
  return { ok: true, strategy, slots: combos.length, assigned, queued, results };
}

// ---------- RETURN-TRIP CONTINUATION ----------

export async function onExecutiveReturned(args: { driverId: string } & Actor) {
  const { driverId, actorId, actorRole } = args;

  return withRetry(() =>
    db.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: driverId }, include: driverInclude });
      if (!driver) throw new Error(`Driver ${driverId} not found`);

      // Close out the current trip and free the executive.
      if (driver.execStatus?.currentTripId) {
        await tx.tripHistory.update({
          where: { id: driver.execStatus.currentTripId },
          data: { status: "RETURNED_TO_DAIRY", returnedAt: new Date() },
        });
      }
      await tx.executiveStatus.update({
        where: { driverId },
        data: { availability: "RETURNED_TO_DAIRY", assignedBottles: 0, currentTripId: null },
      });
      await tx.assignmentLog.create({ data: { action: "RETURN_TRIP", driverId, actorId, actorRole } });

      // Pull the next batch from the pending queue (FIFO by priority).
      const pending = await tx.assignmentQueue.findMany({
        where: { status: "PENDING" },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        include: { delivery: { include: deliveryInclude } },
      });
      if (!pending.length) return { ok: true, assigned: 0, message: "Returned. Queue empty." };

      // The returned executive starts a fresh trip (full capacity). Query order
      // (priority desc, createdAt asc) is preserved by the engine's stable sort.
      const execInput: ExecutiveInput = {
        id: driverId,
        capacity: driver.capacity?.maxBottles ?? BOTTLE_CAPACITY,
        used: 0,
        zoneId: driver.zoneId ?? null,
        lat: driver.lat ?? null,
        lng: driver.lng ?? null,
        available: true,
      };
      const queuedInputs: DeliveryInput[] = pending.map((q) => ({
        id: q.deliveryId,
        bottles: q.bottles,
        area: q.area,
        zoneId: q.zoneId,
        lat: q.delivery.subscription?.address?.lat ?? null,
        lng: q.delivery.subscription?.address?.lng ?? null,
        priority: q.priority,
      }));

      const res = assignFromQueue(execInput, queuedInputs);
      if (!res.deliveryIds.length) return { ok: true, assigned: 0, message: "Returned. Nothing fit the remaining capacity." };

      const trip = await tx.tripHistory.create({
        data: { driverId, slot: pending[0].slot, date: pending[0].date, status: "ASSIGNED", totalBottles: res.bottles, stops: res.deliveryIds.length },
      });
      const bottleById = new Map(pending.map((q) => [q.deliveryId, q.bottles]));
      const areaById = new Map(pending.map((q) => [q.deliveryId, q.area]));
      const zoneById = new Map(pending.map((q) => [q.deliveryId, q.zoneId]));

      await tx.deliveryAssignment.createMany({
        data: res.deliveryIds.map((id, i) => ({
          deliveryId: id, driverId, tripId: trip.id, slot: pending[0].slot, date: pending[0].date,
          bottles: bottleById.get(id) ?? 1, status: "ASSIGNED" as const, sequence: i + 1,
          area: areaById.get(id) ?? null, zoneId: zoneById.get(id) ?? null,
        })),
        skipDuplicates: true,
      });
      await tx.delivery.updateMany({ where: { id: { in: res.deliveryIds }, driverId: null }, data: { driverId, status: "ASSIGNED" } });
      await tx.assignmentQueue.updateMany({ where: { deliveryId: { in: res.deliveryIds } }, data: { status: "ASSIGNED", assignedAt: new Date() } });
      await tx.executiveStatus.update({ where: { driverId }, data: { availability: "ASSIGNED", currentTripId: trip.id, assignedBottles: res.bottles } });
      await tx.assignmentLog.createMany({
        data: res.deliveryIds.map((id) => ({ action: "DEQUEUE" as const, deliveryId: id, driverId, tripId: trip.id, actorId, actorRole, bottles: bottleById.get(id) ?? 1 })),
      });
      if (driver.user.id) await notifyExecutive(tx, driver.user.id, EXEC_EVENT.NEW_TRIP_AFTER_RETURN, `New trip after returning: ${res.deliveryIds.length} stops, ${res.bottles} bottles.`);

      return { ok: true, assigned: res.deliveryIds.length, assignedBottles: res.bottles, tripId: trip.id };
    }, TX),
  );
}

// ---------- MANUAL OVERRIDES ----------

/** Capacity left for a driver on the current live trip. */
async function remainingCapacity(tx: Prisma.TransactionClient, driverId: string): Promise<number> {
  const [cap, status] = await Promise.all([
    tx.deliveryCapacity.findUnique({ where: { driverId } }),
    tx.executiveStatus.findUnique({ where: { driverId } }),
  ]);
  const max = cap?.maxBottles ?? BOTTLE_CAPACITY;
  return Math.max(0, max - (status?.assignedBottles ?? 0));
}

/** Assign a specific (queued or unassigned) delivery to a driver. Capacity-checked. */
export async function manualAssign(args: { deliveryId: string; driverId: string } & Actor) {
  const { deliveryId, driverId, actorId, actorRole } = args;
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
      if (!delivery) throw new Error("Delivery not found");
      const bottles = delivery.bottleCount ?? 1;
      const room = await remainingCapacity(tx, driverId);
      if (bottles > room) throw new Error(`Over capacity: needs ${bottles}, only ${room} left.`);

      const m = toDeliveryInput(delivery);
      const status = await tx.executiveStatus.findUnique({ where: { driverId } });
      await tx.deliveryAssignment.upsert({
        where: { deliveryId },
        create: { deliveryId, driverId, slot: delivery.slot ?? "", date: dayRange(delivery.date).gte, bottles, status: "ASSIGNED", area: m.area, zoneId: m.zoneId, tripId: status?.currentTripId ?? null },
        update: { driverId, bottles, status: "ASSIGNED", tripId: status?.currentTripId ?? null },
      });
      await tx.delivery.update({ where: { id: deliveryId }, data: { driverId, status: "ASSIGNED" } });
      await tx.assignmentQueue.updateMany({ where: { deliveryId, status: "PENDING" }, data: { status: "ASSIGNED", assignedAt: new Date() } });
      await tx.executiveStatus.update({ where: { driverId }, data: { assignedBottles: { increment: bottles } } });
      await tx.assignmentLog.create({ data: { action: "MANUAL_ASSIGN", deliveryId, driverId, actorId, actorRole, bottles } });

      const dr = await tx.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
      if (dr) await notifyExecutive(tx, dr.userId, EXEC_EVENT.ASSIGNMENT_UPDATED, "A delivery was added to your trip.");
      return { ok: true };
    }, TX),
  );
}

/** Move a delivery from its current driver to another. Refuses if locked (unless force). */
export async function reassignDelivery(args: { deliveryId: string; toDriverId: string; force?: boolean } & Actor) {
  const { deliveryId, toDriverId, force, actorId, actorRole } = args;
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({ where: { deliveryId } });
      if (!current) throw new Error("Delivery is not currently assigned");
      if (current.locked && !force) throw new Error("Assignment is locked — unlock or pass force to override.");
      if (current.driverId === toDriverId) return { ok: true, unchanged: true };

      const bottles = current.bottles;
      const room = await remainingCapacity(tx, toDriverId);
      if (bottles > room) throw new Error(`Over capacity: needs ${bottles}, only ${room} left.`);

      const fromDriverId = current.driverId;
      const targetStatus = await tx.executiveStatus.findUnique({ where: { driverId: toDriverId } });
      await tx.deliveryAssignment.update({ where: { deliveryId }, data: { driverId: toDriverId, status: "ASSIGNED", tripId: targetStatus?.currentTripId ?? null, acceptedAt: null, completedAt: null } });
      await tx.delivery.update({ where: { id: deliveryId }, data: { driverId: toDriverId } });
      await tx.executiveStatus.update({ where: { driverId: fromDriverId }, data: { assignedBottles: { decrement: bottles } } });
      await tx.executiveStatus.update({ where: { driverId: toDriverId }, data: { assignedBottles: { increment: bottles } } });
      await tx.assignmentLog.create({ data: { action: "REASSIGN", deliveryId, driverId: toDriverId, fromDriverId, toDriverId, actorId, actorRole, bottles } });

      const [fromDr, toDr] = await Promise.all([
        tx.driver.findUnique({ where: { id: fromDriverId }, select: { userId: true } }),
        tx.driver.findUnique({ where: { id: toDriverId }, select: { userId: true } }),
      ]);
      if (fromDr) await notifyExecutive(tx, fromDr.userId, EXEC_EVENT.ROUTE_CHANGED, "A delivery was moved off your trip.");
      if (toDr) await notifyExecutive(tx, toDr.userId, EXEC_EVENT.MANUAL_REASSIGN, "A delivery was moved to your trip.");
      return { ok: true };
    }, TX),
  );
}

/** Unassign a delivery and return it to the pending queue. */
export async function unassignDelivery(args: { deliveryId: string } & Actor) {
  const { deliveryId, actorId, actorRole } = args;
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({ where: { deliveryId } });
      if (!current) throw new Error("Delivery is not assigned");
      if (current.locked) throw new Error("Assignment is locked.");

      await tx.deliveryAssignment.delete({ where: { deliveryId } });
      await tx.delivery.update({ where: { id: deliveryId }, data: { driverId: null, status: "SCHEDULED" } });
      await tx.executiveStatus.update({ where: { driverId: current.driverId }, data: { assignedBottles: { decrement: current.bottles } } });
      await tx.assignmentQueue.upsert({
        where: { deliveryId },
        create: { deliveryId, slot: current.slot, date: current.date, bottles: current.bottles, area: current.area, zoneId: current.zoneId, status: "PENDING", reason: "manual_unassign", priority: 1 },
        update: { status: "PENDING", assignedAt: null, reason: "manual_unassign", priority: 1 },
      });
      await tx.assignmentLog.create({ data: { action: "UNASSIGN", deliveryId, fromDriverId: current.driverId, actorId, actorRole, bottles: current.bottles } });
      return { ok: true };
    }, TX),
  );
}

/** Lock / unlock an assignment so auto-assignment won't move it. */
export async function setAssignmentLock(args: { deliveryId: string; locked: boolean } & Actor) {
  const { deliveryId, locked, actorId, actorRole } = args;
  return db.$transaction(async (tx) => {
    await tx.deliveryAssignment.update({ where: { deliveryId }, data: { locked } });
    await tx.assignmentLog.create({ data: { action: locked ? "LOCK" : "UNLOCK", deliveryId, actorId, actorRole } });
    return { ok: true, locked };
  }, TX);
}

// ---------- DASHBOARD ----------

export async function getDashboard(args: { date?: Date | string; slot?: string } = {}): Promise<DashboardData> {
  const range = dayRange(args.date ?? new Date());
  const slotWhere = args.slot ? { slot: args.slot } : {};

  const [deliveryAgg, assignAgg, queueAgg, assignments, statuses, completedCount, drivers, queueItems] = await Promise.all([
    db.delivery.aggregate({ where: { date: range, ...slotWhere }, _count: true, _sum: { bottleCount: true } }),
    db.deliveryAssignment.aggregate({ where: { date: range, ...slotWhere }, _count: true, _sum: { bottles: true } }),
    db.assignmentQueue.aggregate({ where: { date: range, status: "PENDING", ...slotWhere }, _count: true, _sum: { bottles: true } }),
    db.deliveryAssignment.findMany({
      where: { date: range, ...slotWhere },
      select: { deliveryId: true, driverId: true, bottles: true, sequence: true, locked: true, status: true, area: true },
      orderBy: { sequence: "asc" },
    }),
    // Only real, on-fleet executives — a deactivated/soft-deleted driver keeps whatever
    // availability was last on file and was being counted as free capacity.
    db.executiveStatus.findMany({ where: { driver: { active: true, deletedAt: null } }, include: { driver: { include: { user: { select: { name: true } }, capacity: true } } } }),
    db.deliveryAssignment.count({ where: { date: range, status: "COMPLETED", ...slotWhere } }),
    db.driver.count({ where: { active: true } }),
    db.assignmentQueue.findMany({
      where: { date: range, status: "PENDING", ...slotWhere },
      select: { deliveryId: true, bottles: true, area: true, reason: true, priority: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const byDriver = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const arr = byDriver.get(a.driverId) ?? [];
    arr.push(a); byDriver.set(a.driverId, arr);
  }
  const executives = statuses.map((s) => {
    const cap = s.driver.capacity?.maxBottles ?? BOTTLE_CAPACITY;
    const mine = byDriver.get(s.driverId) ?? [];
    const bottles = mine.reduce((sum, a) => sum + a.bottles, 0);
    return {
      driverId: s.driverId,
      name: s.driver.user?.name ?? s.driver.employeeId ?? s.driverId,
      availability: s.availability,
      capacity: cap,
      assignedBottles: bottles,
      stops: mine.length,
      pct: cap ? Math.round((bottles / cap) * 100) : 0,
      deliveries: mine.map((a) => ({ deliveryId: a.deliveryId, bottles: a.bottles, sequence: a.sequence, locked: a.locked, status: a.status, area: a.area })),
    };
  });

  const count = (a: string) => statuses.filter((s) => s.availability === a).length;
  const assignedOrders = assignAgg._count;
  const unassignedOrders = Math.max(0, deliveryAgg._count - assignedOrders);
  return {
    date: isoOf(range.gte),
    strategy: await getAssignmentStrategy(),
    totals: {
      orders: deliveryAgg._count,
      totalBottles: deliveryAgg._sum.bottleCount ?? 0,
      assignedBottles: assignAgg._sum.bottles ?? 0,
      pendingBottles: queueAgg._sum.bottles ?? 0,
      queueCount: queueAgg._count,
      completedDeliveries: completedCount,
      totalExecutives: drivers,
      assignedOrders,
      unassignedOrders,
      completionPct: deliveryAgg._count ? Math.round((assignedOrders / deliveryAgg._count) * 100) : 0,
    },
    executiveCounts: {
      available: count("AVAILABLE"),
      onRoute: count("OUT_FOR_DELIVERY") + count("ACCEPTED") + count("ASSIGNED"),
      returned: count("RETURNED_TO_DAIRY"),
      offline: count("OFFLINE") + count("BREAK"),
    },
    executives,
    queue: queueItems,
  };
}

// ---------- ORDER-CENTRIC ASSIGNMENT VISIBILITY (admin Auto Assignment board) ----------

const VISIBILITY_ADDR = { select: { houseNo: true, buildingName: true, floor: true, line1: true, line2: true, street: true, area: true, city: true, state: true, pincode: true } } as const;
function fmtVisAddr(a: { houseNo?: string | null; buildingName?: string | null; floor?: string | null; line1?: string | null; line2?: string | null; street?: string | null; area?: string | null; city?: string | null; state?: string | null; pincode?: string | null } | null | undefined): string {
  if (!a) return "—";
  const structured = [a.houseNo, a.buildingName, a.floor, a.street].filter(Boolean);
  const base = structured.length ? structured : [a.line1, a.line2].filter(Boolean);
  const parts = [...base, a.area, a.city, a.state].filter(Boolean);
  return (parts.join(", ") + (a.pincode ? " " + a.pincode : "")) || "—";
}
const ACCEPTED_DELIVERY = ["ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "ON_THE_WAY", "REACHED"];

/** Every delivery for an IST day with its assigned executive, method, status and
    the per-day summary — the data behind the admin Auto Assignment order table. */
export async function listAssignmentOrders(dateStr?: string | null) {
  const { gte: start, lt: end } = dayRange(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date());
  const iso = isoOf(start);

  const rows = await db.delivery.findMany({
    where: { date: { gte: start, lt: end }, status: { not: "DELIVERED" } },
    orderBy: [{ slot: "asc" }, { sequence: "asc" }, { date: "asc" }],
    take: 1000,
    select: {
      id: true, orderId: true, date: true, status: true, bottleCount: true, slot: true,
      address: VISIBILITY_ADDR,
      driver: { select: { id: true, employeeId: true, user: { select: { name: true, phone: true } } } },
      assignment: { select: { status: true, assignedAt: true, acceptedAt: true, locked: true, driverId: true } },
      subscription: {
        select: {
          user: { select: { name: true, phone: true } }, address: VISIBILITY_ADDR,
          items: { select: { qty: true, variant: { select: { label: true, product: { select: { name: true } } } } } },
          order: { select: { id: true } },
        },
      },
      order: { select: { user: { select: { name: true, phone: true } }, items: { select: { productName: true, variantLabel: true, quantity: true } } } },
    },
  });

  // Latest assign-type log per delivery → assignment method + reassignment detection.
  const ids = rows.map((r) => r.id);
  const logs = ids.length
    ? await db.assignmentLog.findMany({
        where: { deliveryId: { in: ids }, action: { in: ["AUTO_ASSIGN", "MANUAL_ASSIGN", "REASSIGN", "UNASSIGN"] } },
        orderBy: { createdAt: "desc" }, select: { deliveryId: true, action: true },
      })
    : [];
  const lastAction = new Map<string, string>();
  for (const l of logs) { if (l.deliveryId && !lastAction.has(l.deliveryId)) lastAction.set(l.deliveryId, l.action); }

  const availableExecutives = await db.driver.count({ where: { active: true, execStatus: { availability: { in: ["AVAILABLE", "RETURNED_TO_DAIRY"] } } } });

  let autoAssigned = 0, manualAssignments = 0, unassigned = 0, totalBottles = 0;
  const orders = rows.map((d) => {
    const isSub = !!d.subscription;
    const user = d.subscription?.user ?? d.order?.user ?? null;
    const addr = d.address ?? d.subscription?.address ?? null;
    const oid = d.orderId ?? d.subscription?.order?.id ?? null;
    const qty = isSub
      ? (d.subscription?.items ?? []).reduce((a, i) => a + i.qty, 0)
      : (d.order?.items ?? []).reduce((a, i) => a + i.quantity, 0);
    const products = isSub
      ? (d.subscription?.items ?? []).map((i) => `${i.variant.product?.name ? i.variant.product.name + " " : ""}${i.variant.label} ×${i.qty}`.trim()).join(", ")
      : (d.order?.items ?? []).map((i) => `${i.productName}${i.variantLabel ? " " + i.variantLabel : ""} ×${i.quantity}`).join(", ");

    const asn = d.assignment;
    const la = lastAction.get(d.id);
    const method = !asn ? null : la === "MANUAL_ASSIGN" ? "Manual" : la === "REASSIGN" ? "Reassigned" : "Auto";
    let status: string;
    if (!asn || !d.driver) { status = "Pending Assignment"; unassigned++; }
    else if (asn.status === "CANCELLED" || d.status === "FAILED" || d.status === "SKIPPED") status = "Cancelled";
    else if (asn.status === "ACCEPTED" || ACCEPTED_DELIVERY.includes(d.status)) status = "Accepted by Executive";
    else if (la === "REASSIGN") { status = "Reassigned"; autoAssigned++; }
    else if (la === "MANUAL_ASSIGN") { status = "Manually Assigned"; manualAssignments++; }
    else { status = "Auto Assigned"; autoAssigned++; }
    totalBottles += d.bottleCount;

    return {
      deliveryId: d.id,
      orderRef: oid ? "DOO-" + oid.slice(-6).toUpperCase() : "—",
      customer: user?.name ?? "—",
      mobile: user?.phone ?? "—",
      address: fmtVisAddr(addr),
      pincode: addr?.pincode ?? "—",
      products: products || "—",
      qty,
      bottles: d.bottleCount,
      deliveryDate: iso,
      slot: d.slot ?? "—",
      executive: d.driver ? { driverId: d.driver.id, name: d.driver.user?.name ?? "—", employeeId: d.driver.employeeId ?? "—", mobile: d.driver.user?.phone ?? "—" } : null,
      assignedAt: asn?.assignedAt?.toISOString() ?? null,
      method,
      status,
      locked: asn?.locked ?? false,
    };
  });

  const totalOrders = orders.length;
  const assignedCount = totalOrders - unassigned;
  const summary = {
    totalOrders,
    availableExecutives,
    autoAssigned,
    manualAssignments,
    unassigned,
    completionPct: totalOrders ? Math.round((assignedCount / totalOrders) * 100) : 0,
    totalBottles,
  };
  return { date: iso, summary, orders };
}

/** Executive detail for the click-through panel (name, IDs, live load, capacity). */
export async function executiveDetail(driverId: string, dateStr?: string | null) {
  const { gte: start, lt: end } = dayRange(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date());
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    select: {
      id: true, employeeId: true, vehicleNo: true, active: true, lat: true, lng: true,
      user: { select: { name: true, phone: true } },
      capacity: { select: { maxBottles: true } },
      execStatus: { select: { availability: true, assignedBottles: true, lastChangedAt: true } },
    },
  });
  if (!driver) return null;
  const assigns = await db.deliveryAssignment.findMany({ where: { driverId, date: { gte: start, lt: end } }, select: { bottles: true } });
  const todaysOrders = assigns.length;
  const totalBottles = assigns.reduce((a, x) => a + x.bottles, 0);
  const capacity = driver.capacity?.maxBottles ?? BOTTLE_CAPACITY;
  const availability = driver.execStatus?.availability ?? "OFFLINE";
  return {
    driverId: driver.id,
    name: driver.user?.name ?? driver.employeeId ?? driver.id,
    employeeId: driver.employeeId ?? "—",
    mobile: driver.user?.phone ?? "—",
    vehicleNo: driver.vehicleNo ?? "—",
    availability,
    todaysOrders,
    totalBottles,
    capacity,
    // capacity is per-TRIP; the live trip load is execStatus.assignedBottles (reset on return
    // to the dairy). totalBottles is the whole DAY across trips, so using it here contradicted
    // remainingCapacity() and showed a returned driver as full.
    remaining: Math.max(0, capacity - (driver.execStatus?.assignedBottles ?? 0)),
    onShift: availability !== "OFFLINE" && availability !== "BREAK",
    shiftSince: driver.execStatus?.lastChangedAt?.toISOString() ?? null,
    lat: driver.lat ?? null,
    lng: driver.lng ?? null,   // live location (future-ready)
    date: isoOf(start),
  };
}

/** Full assignment history for one delivery (audit trail of every change). */
export async function assignmentHistory(deliveryId: string) {
  const logs = await db.assignmentLog.findMany({
    where: { deliveryId },
    orderBy: { createdAt: "asc" },
    select: { action: true, driverId: true, fromDriverId: true, toDriverId: true, actorRole: true, note: true, createdAt: true },
  });
  const driverIds = [...new Set(logs.flatMap((l) => [l.driverId, l.fromDriverId, l.toDriverId]).filter(Boolean) as string[])];
  const drivers = driverIds.length
    ? await db.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, employeeId: true, user: { select: { name: true } } } })
    : [];
  const nameOf = (id: string | null) => { if (!id) return null; const d = drivers.find((x) => x.id === id); return d ? (d.user?.name ?? d.employeeId ?? id.slice(-6)) : id.slice(-6); };
  return logs.map((l) => ({
    action: l.action,
    at: l.createdAt.toISOString(),
    actorRole: l.actorRole ?? "system",
    driver: nameOf(l.driverId),
    from: nameOf(l.fromDriverId),
    to: nameOf(l.toDriverId),
    note: l.note ?? null,
  }));
}
