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
import { planAssignments, assignFromQueue } from "./engine";
import { BOTTLE_CAPACITY, QUEUE_REASON } from "./constants";
import type { DeliveryInput, ExecutiveInput } from "./types";
import type { DashboardData } from "./dashboard-types";
import { notifyExecutive, notifyAdmins, EXEC_EVENT, ADMIN_EVENT } from "./notify";

export interface Actor { actorId?: string; actorRole?: string }
export interface SlotArgs extends Actor { date: Date | string; slot: string }

const QUEUE_ALERT_THRESHOLD = 50; // bottles in queue that trigger an admin alert

// ---------- helpers ----------

function dayRange(date: Date | string) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
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
const deliveryInclude = { subscription: { include: { address: true } } } as const;
type DeliveryWithAddr = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

function toDeliveryInput(d: DeliveryWithAddr): DeliveryInput {
  const addr = d.subscription?.address;
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
  const { slot, actorId, actorRole } = args;
  const range = dayRange(args.date);
  const date = range.gte;

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

      const plan = planAssignments(dInputs, eInputs);

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
          data: { availability: "ASSIGNED", currentTripId: trip.id, assignedBottles: a.bottles },
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
        assigned: plan.stats.assignedDeliveries,
        assignedBottles: plan.stats.assignedBottles,
        queued: plan.stats.queuedDeliveries,
        queuedBottles: plan.stats.queuedBottles,
        executives: plan.assignments.length,
      };
    }, TX),
  );
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
    db.executiveStatus.findMany({ include: { driver: { include: { user: { select: { name: true } }, capacity: true } } } }),
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
  return {
    totals: {
      orders: deliveryAgg._count,
      totalBottles: deliveryAgg._sum.bottleCount ?? 0,
      assignedBottles: assignAgg._sum.bottles ?? 0,
      pendingBottles: queueAgg._sum.bottles ?? 0,
      queueCount: queueAgg._count,
      completedDeliveries: completedCount,
      totalExecutives: drivers,
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
