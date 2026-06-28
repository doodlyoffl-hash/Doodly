import { describe, it, expect } from "vitest";
import {
  mapDeliveryStatus, stageIndexOf, statusMessage, actionsFor, ACTION_META,
  daysRemaining, whenLabel, etaFromSequence, isEnRoute, isExceptionStatus, isTerminalStatus,
  STAGES, LIVE_STATUSES,
} from "@/lib/order-status/engine";

describe("delivery → live status mapping", () => {
  it("maps every operational status onto a customer-facing one", () => {
    expect(mapDeliveryStatus("SCHEDULED")).toBe("SCHEDULED");
    expect(mapDeliveryStatus("ASSIGNED")).toBe("ASSIGNED");
    expect(mapDeliveryStatus("ACCEPTED")).toBe("ASSIGNED");
    expect(mapDeliveryStatus("PACKED")).toBe("PACKED");
    expect(mapDeliveryStatus("OUT_FOR_DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(mapDeliveryStatus("ON_THE_WAY")).toBe("OUT_FOR_DELIVERY");
    expect(mapDeliveryStatus("REACHED")).toBe("NEAR_DESTINATION");
    expect(mapDeliveryStatus("DELIVERED")).toBe("DELIVERED");
    expect(mapDeliveryStatus("FAILED")).toBe("FAILED");
    expect(mapDeliveryStatus("SKIPPED")).toBe("RESCHEDULED");
  });
  it("falls back to CONFIRMED for unknown values", () => {
    expect(mapDeliveryStatus("WHATEVER")).toBe("CONFIRMED");
  });
});

describe("timeline stages", () => {
  it("orders the six visual stages", () => {
    expect(STAGES).toEqual(["CONFIRMED", "PREPARING", "QUALITY_CHECK", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });
  it("places each status on the right stage", () => {
    expect(stageIndexOf("CONFIRMED")).toBe(0);
    expect(stageIndexOf("PREPARING")).toBe(1);
    expect(stageIndexOf("QUALITY_CHECK")).toBe(2);
    expect(stageIndexOf("PACKED")).toBe(3);
    expect(stageIndexOf("ASSIGNED")).toBe(3);
    expect(stageIndexOf("OUT_FOR_DELIVERY")).toBe(4);
    expect(stageIndexOf("NEAR_DESTINATION")).toBe(4);
    expect(stageIndexOf("DELIVERED")).toBe(5);
  });
  it("marks exception states off-timeline (-1)", () => {
    for (const s of ["FAILED", "RESCHEDULED", "CANCELLED"] as const) expect(stageIndexOf(s)).toBe(-1);
  });
});

describe("status messages (templated, not hardcoded in UI)", () => {
  it("produces a message for every status", () => {
    for (const s of LIVE_STATUSES) {
      const m = statusMessage(s);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.emoji.length).toBeGreaterThan(0);
      expect(["info", "active", "success", "warning"]).toContain(m.tone);
    }
  });
  it("injects ETA / slot context", () => {
    expect(statusMessage("OUT_FOR_DELIVERY", { etaMinutes: 35 }).subtitle).toContain("35 minutes");
    expect(statusMessage("SCHEDULED", { whenLabel: "tomorrow morning", slot: "6:00 AM – 8:00 AM" }).title).toContain("tomorrow morning");
    expect(statusMessage("SCHEDULED", { slot: "6:00 AM – 8:00 AM" }).subtitle).toContain("6:00 AM");
  });
  it("names the driver when assigned / nearby", () => {
    expect(statusMessage("ASSIGNED", { driverName: "Ravi Kumar" }).subtitle).toContain("Ravi Kumar");
    expect(statusMessage("NEAR_DESTINATION", { driverName: "Ravi Kumar" }).subtitle).toContain("Ravi Kumar");
  });
  it("flags delivered as success and failures as warning", () => {
    expect(statusMessage("DELIVERED").tone).toBe("success");
    expect(statusMessage("FAILED").tone).toBe("warning");
  });
});

describe("contextual actions", () => {
  it("offers rate/reorder/view after delivery", () => {
    expect(actionsFor("DELIVERED")).toEqual(["RATE", "REORDER", "VIEW"]);
  });
  it("offers tracking + contact executive en route", () => {
    expect(actionsFor("OUT_FOR_DELIVERY")).toContain("TRACK");
    expect(actionsFor("OUT_FOR_DELIVERY")).toContain("CONTACT_EXEC");
  });
  it("every action key has metadata with a link", () => {
    for (const s of LIVE_STATUSES) for (const k of actionsFor(s)) {
      expect(ACTION_META[k].href).toMatch(/^\//);
      expect(ACTION_META[k].label.length).toBeGreaterThan(0);
    }
  });
});

describe("helpers", () => {
  it("flags en-route and exception/terminal states", () => {
    expect(isEnRoute("OUT_FOR_DELIVERY")).toBe(true);
    expect(isEnRoute("NEAR_DESTINATION")).toBe(true);
    expect(isEnRoute("PACKED")).toBe(false);
    expect(isExceptionStatus("CANCELLED")).toBe(true);
    expect(isTerminalStatus("DELIVERED")).toBe(true);
    expect(isTerminalStatus("PREPARING")).toBe(false);
  });
  it("computes inclusive days remaining", () => {
    const now = new Date("2026-07-01T10:00:00");
    expect(daysRemaining("2026-07-08", now)).toBe(7);
    expect(daysRemaining("2026-06-30", now)).toBe(0);
    expect(daysRemaining(null, now)).toBe(0);
  });
  it("labels delivery dates relative to today", () => {
    const now = new Date("2026-07-01T10:00:00");
    expect(whenLabel("2026-07-01T06:00:00", now)).toBe("today");
    expect(whenLabel("2026-07-02T06:00:00", now)).toBe("tomorrow morning");
    expect(whenLabel("2026-07-05T06:00:00", now)).toMatch(/^on /);
  });
  it("derives a bounded ETA from the stop sequence", () => {
    expect(etaFromSequence(4)).toBe(20);
    expect(etaFromSequence(0)).toBe(5);
    expect(etaFromSequence(100)).toBe(75);
    expect(etaFromSequence(null)).toBeUndefined();
  });
});
