import { describe, it, expect } from "vitest";
import {
  planAssignments, assignFromQueue, orderByNearestNeighbor, groupByLocality, haversineKm, computeStats,
} from "@/lib/assignment/engine";
import { BOTTLE_CAPACITY, QUEUE_REASON } from "@/lib/assignment/constants";
import type { DeliveryInput, ExecutiveInput } from "@/lib/assignment/types";

// ---- builders ----
const mk = (id: string, bottles = 1, extra: Partial<DeliveryInput> = {}): DeliveryInput => ({ id, bottles, ...extra });
const exec = (id: string, extra: Partial<ExecutiveInput> = {}): ExecutiveInput =>
  ({ id, capacity: BOTTLE_CAPACITY, available: true, ...extra });
const many = (n: number, bottles = 1, prefix = "d", extra: Partial<DeliveryInput> = {}) =>
  Array.from({ length: n }, (_, i) => mk(`${prefix}${i}`, bottles, extra));

// Invariant helper: no id is ever assigned twice or both assigned + queued.
function assertNoDuplicates(plan: ReturnType<typeof planAssignments>) {
  const ids = [...plan.assignments.flatMap((a) => a.deliveryIds), ...plan.queue.map((q) => q.deliveryId)];
  expect(new Set(ids).size).toBe(ids.length);
}

describe("capacity rules", () => {
  it("never exceeds 45 bottles per executive", () => {
    const plan = planAssignments(many(100), [exec("a"), exec("b")]);
    for (const a of plan.assignments) expect(a.bottles).toBeLessThanOrEqual(BOTTLE_CAPACITY);
  });

  it("fills each executive to exactly 45, then the next (45/45/45/5)", () => {
    const plan = planAssignments(many(140), [exec("a"), exec("b"), exec("c"), exec("d")]);
    const loads = plan.assignments.map((a) => a.bottles).sort((x, y) => y - x);
    expect(loads).toEqual([45, 45, 45, 5]);
    expect(plan.queue).toHaveLength(0);
  });

  it("handles an exact 45-bottle fit with mixed sizes", () => {
    const plan = planAssignments([mk("a", 2), mk("b", 1), mk("c", 5), mk("d", 37)], [exec("e")]);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].bottles).toBe(45);
    expect(plan.queue).toHaveLength(0);
  });

  it("assigns everything when under capacity", () => {
    const plan = planAssignments(many(10, 2), [exec("e")]);
    expect(plan.assignments[0].bottles).toBe(20);
    expect(plan.assignments[0].stops).toBe(10);
    expect(plan.queue).toHaveLength(0);
  });
});

describe("overflow queue", () => {
  it("queues the remainder when all executives are full (210 → 30 queued)", () => {
    const plan = planAssignments(many(210), [exec("a"), exec("b"), exec("c"), exec("d")]);
    expect(plan.stats.assignedBottles).toBe(180);
    expect(plan.stats.queuedBottles).toBe(30);
    expect(plan.queue.every((q) => q.reason === QUEUE_REASON.CAPACITY_FULL)).toBe(true);
    assertNoDuplicates(plan);
  });

  it("queues all deliveries when there are no executives", () => {
    const plan = planAssignments(many(5), []);
    expect(plan.assignments).toHaveLength(0);
    expect(plan.queue).toHaveLength(5);
    expect(plan.queue.every((q) => q.reason === QUEUE_REASON.NO_EXECUTIVE)).toBe(true);
  });

  it("queues an oversize delivery that can never fit a trip", () => {
    const plan = planAssignments([mk("big", 50), mk("ok", 3)], [exec("a")]);
    const big = plan.queue.find((q) => q.deliveryId === "big");
    expect(big?.reason).toBe(QUEUE_REASON.OVERSIZE);
    expect(plan.assignments[0].deliveryIds).toEqual(["ok"]);
  });

  it("nothing is ever dropped: assigned + queued = total", () => {
    const plan = planAssignments(many(123, 2), [exec("a"), exec("b")]);
    expect(plan.stats.assignedDeliveries + plan.stats.queuedDeliveries).toBe(123);
    assertNoDuplicates(plan);
  });
});

describe("duplicate & integrity", () => {
  it("de-duplicates repeated delivery ids", () => {
    const plan = planAssignments([mk("x", 2), mk("x", 2), mk("y", 1)], [exec("a")]);
    expect(plan.stats.totalDeliveries).toBe(2);
    assertNoDuplicates(plan);
  });

  it("is deterministic — identical inputs produce identical plans", () => {
    const ds = many(77, 2, "d", { area: "Z" });
    const es = [exec("a"), exec("b"), exec("c")];
    expect(planAssignments(ds, es)).toEqual(planAssignments(ds, es));
  });
});

describe("locked (manual) assignments", () => {
  it("honours lockedTo even when another executive would be first-fit", () => {
    const plan = planAssignments([mk("d1", 5, { lockedTo: "b" })], [exec("a"), exec("b")]);
    expect(plan.assignments.find((a) => a.executiveId === "b")?.deliveryIds).toContain("d1");
  });

  it("queues a locked delivery when its executive has no room", () => {
    const plan = planAssignments(
      [mk("d1", 10, { lockedTo: "b" })],
      [exec("a"), exec("b", { used: BOTTLE_CAPACITY })],
    );
    expect(plan.queue.find((q) => q.deliveryId === "d1")?.reason).toBe(QUEUE_REASON.LOCKED_CAPACITY);
  });
});

describe("smart assignment (locality + zone affinity)", () => {
  it("keeps a neighbourhood together on one executive", () => {
    const ds = [...many(45, 1, "x", { area: "AreaX" }), ...many(45, 1, "y", { area: "AreaY" })];
    const plan = planAssignments(ds, [exec("a"), exec("b")]);
    for (const a of plan.assignments) {
      const areas = new Set(a.deliveryIds.map((id) => (id.startsWith("x") ? "AreaX" : "AreaY")));
      expect(areas.size).toBe(1); // no mixing opposite localities in one trip
    }
  });

  it("routes zone-matched deliveries to the matching executive", () => {
    const ds = many(10, 1, "z", { zoneId: "Z1" });
    // 'a' sorts before 'b' so first-fit would pick 'a'; affinity must override to 'b'.
    const plan = planAssignments(ds, [exec("a"), exec("b", { zoneId: "Z1" })]);
    const b = plan.assignments.find((x) => x.executiveId === "b");
    expect(b?.stops).toBe(10);
  });
});

describe("return-trip continuation (assignFromQueue)", () => {
  it("fills a returned executive up to remaining capacity and leaves the rest queued", () => {
    const queued = many(60, 1, "q");
    const res = assignFromQueue(exec("a"), queued);
    expect(res.bottles).toBe(45);
    expect(res.deliveryIds).toHaveLength(45);
    expect(res.leftover).toHaveLength(15);
  });

  it("respects partial remaining capacity after a re-load", () => {
    const res = assignFromQueue(exec("a", { used: 40 }), many(20, 1, "q"));
    expect(res.bottles).toBe(5);
    expect(res.leftover).toHaveLength(15);
  });

  it("prefers same-zone deliveries first", () => {
    const queued = [
      ...many(20, 1, "other", { zoneId: "OTHER" }),
      ...many(20, 1, "z", { zoneId: "Z1" }),
    ];
    const res = assignFromQueue(exec("a", { zoneId: "Z1" }), queued);
    expect(res.deliveryIds.filter((id) => id.startsWith("z")).length).toBe(20);
  });

  it("assigns nothing when the executive is unavailable or full", () => {
    expect(assignFromQueue(exec("a", { available: false }), many(5)).bottles).toBe(0);
    expect(assignFromQueue(exec("a", { used: BOTTLE_CAPACITY }), many(5)).bottles).toBe(0);
  });
});

describe("route optimization", () => {
  it("orders stops nearest-neighbour from a start point", () => {
    const pts = [
      mk("far", 1, { lat: 0, lng: 3 }),
      mk("mid", 1, { lat: 0, lng: 2 }),
      mk("near", 1, { lat: 0, lng: 1 }),
    ];
    const ordered = orderByNearestNeighbor(pts, { lat: 0, lng: 0 });
    expect(ordered.map((d) => d.id)).toEqual(["near", "mid", "far"]);
  });

  it("keeps coordinate-less deliveries at the tail", () => {
    const ordered = orderByNearestNeighbor([mk("a", 1), mk("b", 1, { lat: 1, lng: 1 })]);
    expect(ordered[ordered.length - 1].id).toBe("a");
  });

  it("groups deliveries by locality", () => {
    const g = groupByLocality([mk("a", 1, { area: "X" }), mk("b", 1, { area: "X" }), mk("c", 1, { area: "Y" })]);
    expect(g.get("X")).toHaveLength(2);
    expect(g.get("Y")).toHaveLength(1);
  });

  it("computes haversine distance sanely", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(haversineKm({ lat: 16.5, lng: 80.6 }, { lat: 16.6, lng: 80.7 })).toBeGreaterThan(10);
    expect(haversineKm({ lat: null, lng: 0 }, { lat: 0, lng: 0 })).toBe(Infinity);
  });
});

describe("stats", () => {
  it("reports accurate totals", () => {
    const plan = planAssignments(many(50, 1), [exec("a")]);
    expect(plan.stats.totalDeliveries).toBe(50);
    expect(plan.stats.totalBottles).toBe(50);
    expect(plan.stats.assignedBottles).toBe(45);
    expect(plan.stats.queuedBottles).toBe(5);
    expect(plan.stats.executivesUsed).toBe(1);
  });

  it("computeStats is consistent with the plan", () => {
    const plan = planAssignments(many(30, 2), [exec("a"), exec("b")]);
    const s = computeStats(many(30, 2), plan.assignments, plan.queue);
    expect(s.totalBottles).toBe(60);
  });
});
