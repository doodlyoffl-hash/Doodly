import { describe, it, expect } from "vitest";
import {
  formatExpenseCode, toYmd, computeExpenseTotal, deriveExpensePaymentStatus,
  canTransitionExpenseStatus, allowedNextExpenseStatus, isTerminalExpenseStatus,
  resolveDatePreset, slugifyCategory, DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_MODES, EXPENSE_STATUSES,
} from "@/lib/expenses/engine";

describe("expense identifiers", () => {
  it("formats EXP-YYYYMMDD-NNNN (4-digit per-day sequence)", () => {
    expect(formatExpenseCode("20260701", 1)).toBe("EXP-20260701-0001");
    expect(formatExpenseCode("20260701", 125)).toBe("EXP-20260701-0125");
    expect(formatExpenseCode("20261231", 9999)).toBe("EXP-20261231-9999");
  });
  it("derives YYYYMMDD from a date string", () => {
    expect(toYmd("2026-07-01")).toBe("20260701");
    expect(toYmd("2026-12-09")).toBe("20261209");
  });
});

describe("GST / total maths", () => {
  it("adds GST on top when not included", () => {
    expect(computeExpenseTotal({ amountPaise: 100000, gstIncluded: false, gstPaise: 18000 }))
      .toEqual({ amountPaise: 100000, gstPaise: 18000, totalPaise: 118000 });
  });
  it("keeps total = amount when GST is already included", () => {
    expect(computeExpenseTotal({ amountPaise: 118000, gstIncluded: true, gstPaise: 18000 }))
      .toEqual({ amountPaise: 118000, gstPaise: 18000, totalPaise: 118000 });
  });
  it("handles zero / missing GST", () => {
    expect(computeExpenseTotal({ amountPaise: 50000, gstIncluded: false }))
      .toEqual({ amountPaise: 50000, gstPaise: 0, totalPaise: 50000 });
  });
  it("never produces negative values", () => {
    expect(computeExpenseTotal({ amountPaise: -100, gstIncluded: false, gstPaise: -50 }))
      .toEqual({ amountPaise: 0, gstPaise: 0, totalPaise: 0 });
  });
});

describe("status workflow", () => {
  it("follows Pending → Approved → Paid", () => {
    expect(canTransitionExpenseStatus("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(canTransitionExpenseStatus("APPROVED", "PAID")).toBe(true);
    expect(canTransitionExpenseStatus("APPROVED", "PARTIALLY_PAID")).toBe(true);
    expect(canTransitionExpenseStatus("PARTIALLY_PAID", "PAID")).toBe(true);
  });
  it("allows reject/cancel only from open states", () => {
    expect(canTransitionExpenseStatus("PENDING_APPROVAL", "REJECTED")).toBe(true);
    expect(canTransitionExpenseStatus("APPROVED", "CANCELLED")).toBe(true);
    expect(canTransitionExpenseStatus("PAID", "CANCELLED")).toBe(false);
    expect(canTransitionExpenseStatus("REJECTED", "APPROVED")).toBe(false);
  });
  it("rejects skips (cannot pay before approval)", () => {
    expect(canTransitionExpenseStatus("PENDING_APPROVAL", "PAID")).toBe(false);
  });
  it("marks PAID/REJECTED/CANCELLED terminal", () => {
    expect(isTerminalExpenseStatus("PAID")).toBe(true);
    expect(isTerminalExpenseStatus("REJECTED")).toBe(true);
    expect(isTerminalExpenseStatus("CANCELLED")).toBe(true);
    expect(isTerminalExpenseStatus("PENDING_APPROVAL")).toBe(false);
    expect(allowedNextExpenseStatus("PENDING_APPROVAL")).toEqual(["APPROVED", "REJECTED", "CANCELLED"]);
  });
});

describe("payment-status derivation", () => {
  it("reads PAID when settled in full", () => {
    expect(deriveExpensePaymentStatus(100000, 100000)).toBe("PAID");
    expect(deriveExpensePaymentStatus(100000, 120000)).toBe("PAID");
  });
  it("reads PARTIALLY_PAID when some is paid", () => {
    expect(deriveExpensePaymentStatus(100000, 40000)).toBe("PARTIALLY_PAID");
  });
  it("stays APPROVED when nothing is paid", () => {
    expect(deriveExpensePaymentStatus(100000, 0)).toBe("APPROVED");
  });
});

describe("date presets", () => {
  const now = new Date("2026-07-15T10:00:00");
  it("today / yesterday are single-day ranges", () => {
    expect(resolveDatePreset("today", now)).toEqual({ from: "2026-07-15", to: "2026-07-15" });
    expect(resolveDatePreset("yesterday", now)).toEqual({ from: "2026-07-14", to: "2026-07-14" });
  });
  it("last7 / last30 are inclusive windows ending today", () => {
    expect(resolveDatePreset("last7", now)).toEqual({ from: "2026-07-09", to: "2026-07-15" });
    expect(resolveDatePreset("last30", now)).toEqual({ from: "2026-06-16", to: "2026-07-15" });
  });
  it("this / last month span the calendar month", () => {
    expect(resolveDatePreset("thisMonth", now)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(resolveDatePreset("lastMonth", now)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });
  it("all clears the range", () => {
    expect(resolveDatePreset("all", now)).toEqual({});
  });
});

describe("categories & constants", () => {
  it("slugifies category names", () => {
    expect(slugifyCategory("Milk Procurement")).toBe("milk-procurement");
    expect(slugifyCategory("Internet & Mobile")).toBe("internet-and-mobile");
    expect(slugifyCategory("  Printing & Stationery  ")).toBe("printing-and-stationery");
  });
  it("ships 21 default categories, 8 payment modes, 6 statuses", () => {
    expect(DEFAULT_EXPENSE_CATEGORIES).toHaveLength(21);
    expect(EXPENSE_PAYMENT_MODES).toHaveLength(8);
    expect(EXPENSE_STATUSES).toHaveLength(6);
  });
});
