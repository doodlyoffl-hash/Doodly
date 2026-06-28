import { describe, it, expect } from "vitest";
import { planAssignments, assignFromQueue } from "@/lib/assignment/engine";
import { BOTTLE_CAPACITY } from "@/lib/assignment/constants";
import type { DeliveryInput, ExecutiveInput } from "@/lib/assignment/types";

const mk = (id: string, bottles = 1, extra: Partial<DeliveryInput> = {}): DeliveryInput => ({ id, bottles, ...extra });
const exec = (id: string, extra: Partial<ExecutiveInput> = {}): ExecutiveInput =>
  ({ id, capacity: BOTTLE_CAPACITY, available: true, ...extra });
const many = (n: number, bottles = 1) => Array.from({ length: n }, (_, i) => mk(`d${i}`, bottles));

describe("end-to-end lifecycle: auto-assign → return → drain queue", () => {
  it("eventually assigns every delivery exactly once via return trips", () => {
    const deliveries = many(300, 1); // 300 bottles, 3 execs × 45 = 135/round
    const execIds = ["e1", "e2", "e3"];

    // Round 1: initial auto-assignment.
    const plan = planAssignments(deliveries, execIds.map((id) => exec(id)));
    const assigned = new Set<string>();
    const claim = (ids: string[]) => ids.forEach((d) => {
      expect(assigned.has(d)).toBe(false); // never assigned twice across the whole run
      assigned.add(d);
    });
    for (const a of plan.assignments) { expect(a.bottles).toBeLessThanOrEqual(BOTTLE_CAPACITY); claim(a.deliveryIds); }

    let queue: DeliveryInput[] = plan.queue.map((q) => mk(q.deliveryId, q.bottles, { area: q.area, zoneId: q.zoneId, priority: q.priority }));
    expect(assigned.size).toBe(135);
    expect(queue.length).toBe(165);

    // Subsequent rounds: each executive returns and pulls the next batch until the queue drains.
    let guard = 0;
    while (queue.length && guard++ < 100) {
      let progressed = false;
      for (const id of execIds) {
        if (!queue.length) break;
        const res = assignFromQueue(exec(id), queue); // returns with a fresh full trip
        expect(res.bottles).toBeLessThanOrEqual(BOTTLE_CAPACITY);
        claim(res.deliveryIds);
        queue = res.leftover;
        if (res.deliveryIds.length) progressed = true;
      }
      expect(progressed).toBe(true); // must always make progress (no stuck queue)
    }

    expect(queue.length).toBe(0);
    expect(assigned.size).toBe(300); // all delivered, nothing dropped or duplicated
  });

  it("drains a queue with mixed bottle sizes without exceeding capacity", () => {
    const sizes = [5, 3, 8, 1, 12, 2, 7, 4, 9, 6];
    const deliveries = Array.from({ length: 200 }, (_, i) => mk(`m${i}`, sizes[i % sizes.length]));
    const execIds = ["a", "b", "c", "d"];
    const total = deliveries.reduce((s, d) => s + d.bottles, 0);

    let queue = [...deliveries];
    const assigned = new Set<string>();
    let assignedBottles = 0;
    let guard = 0;
    // First fill, then keep returning execs until empty.
    let first = true;
    while (queue.length && guard++ < 500) {
      if (first) {
        const plan = planAssignments(queue, execIds.map((id) => exec(id)));
        first = false;
        for (const a of plan.assignments) { expect(a.bottles).toBeLessThanOrEqual(45); a.deliveryIds.forEach((d) => assigned.add(d)); assignedBottles += a.bottles; }
        queue = plan.queue.map((q) => mk(q.deliveryId, q.bottles));
      } else {
        let progressed = false;
        for (const id of execIds) {
          if (!queue.length) break;
          const res = assignFromQueue(exec(id), queue);
          expect(res.bottles).toBeLessThanOrEqual(45);
          res.deliveryIds.forEach((d) => assigned.add(d));
          assignedBottles += res.bottles;
          queue = res.leftover;
          if (res.deliveryIds.length) progressed = true;
        }
        expect(progressed).toBe(true);
      }
    }
    expect(queue.length).toBe(0);
    expect(assigned.size).toBe(200);
    expect(assignedBottles).toBe(total);
  });
});

describe("performance", () => {
  it("plans 1,000 deliveries in well under 3 seconds", () => {
    const deliveries = many(1000, 1);
    const execs = Array.from({ length: 30 }, (_, i) => exec(`e${i}`)); // 30 × 45 = 1350 capacity
    const t0 = performance.now();
    const plan = planAssignments(deliveries, execs);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
    expect(plan.stats.assignedDeliveries).toBe(1000);
    expect(plan.queue.length).toBe(0);
  });

  it("handles 1,000 mixed-size deliveries across 50 zoned executives quickly", () => {
    const deliveries = Array.from({ length: 1000 }, (_, i) =>
      mk(`d${i}`, (i % 5) + 1, { area: `area-${i % 20}`, zoneId: `Z${i % 50}`, lat: 16.5 + (i % 20) / 100, lng: 80.6 + (i % 20) / 100 }));
    const execs = Array.from({ length: 50 }, (_, i) => exec(`e${i}`, { zoneId: `Z${i}` }));
    const t0 = performance.now();
    const plan = planAssignments(deliveries, execs);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
    expect(plan.stats.assignedDeliveries + plan.stats.queuedDeliveries).toBe(1000);
  });
});

describe("multiple slots are independent", () => {
  it("planning one slot never borrows another slot's capacity", () => {
    // Caller scopes deliveries per slot; the engine just packs what it is given.
    const morning = planAssignments(many(50, 1), [exec("a")]);
    const evening = planAssignments(many(50, 1), [exec("a", { used: 0 })]);
    expect(morning.assignments[0].bottles).toBe(45);
    expect(evening.assignments[0].bottles).toBe(45); // fresh capacity per slot/run
  });
});
