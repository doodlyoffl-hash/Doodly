import { describe, it, expect } from "vitest";
import { canTransition, allowedNext, isTerminal, generateRequestCode, BULK_STATUSES } from "@/lib/bulk/workflow";

describe("bulk status workflow", () => {
  it("follows the happy path NEW → … → DELIVERED", () => {
    expect(canTransition("NEW", "CONTACTED")).toBe(true);
    expect(canTransition("CONTACTED", "QUOTATION_SENT")).toBe(true);
    expect(canTransition("QUOTATION_SENT", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "SCHEDULED")).toBe(true);
    expect(canTransition("SCHEDULED", "DELIVERED")).toBe(true);
  });

  it("forbids skipping and going backwards", () => {
    expect(canTransition("NEW", "DELIVERED")).toBe(false);
    expect(canTransition("NEW", "QUOTATION_SENT")).toBe(false);
    expect(canTransition("CONFIRMED", "NEW")).toBe(false);
    expect(canTransition("DELIVERED", "CONTACTED")).toBe(false);
  });

  it("allows cancelling from any non-terminal state", () => {
    for (const s of BULK_STATUSES) {
      if (s === "DELIVERED" || s === "CANCELLED") continue;
      expect(canTransition(s, "CANCELLED")).toBe(true);
    }
  });

  it("marks DELIVERED and CANCELLED as terminal", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("NEW")).toBe(false);
    expect(allowedNext("DELIVERED")).toHaveLength(0);
  });

  it("generates readable, prefixed, unambiguous request codes", () => {
    const code = generateRequestCode(() => 0.5);
    expect(code).toMatch(/^BULK-[2-9A-HJ-NP-Z]{6}$/); // no 0/1/I/O
    const a = generateRequestCode(); const b = generateRequestCode();
    expect(a).not.toBe(b); // effectively unique
  });
});
