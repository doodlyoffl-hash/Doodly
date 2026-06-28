import { describe, it, expect } from "vitest";
import {
  formatBusinessCode, formatOrderCode, formatInvoiceNumber,
  computeOrderTotals, lineTotalPaise, derivePaymentStatus,
  canTransitionStatus, allowedNextStatus, isTerminalStatus,
  PRODUCT_UNITS, BUSINESS_TYPES, PAYMENT_TERMS,
} from "@/lib/b2b/engine";

describe("sequential identifiers", () => {
  it("formats business codes as DOO-B2B-NNNNNN (6-digit, never reused)", () => {
    expect(formatBusinessCode(1)).toBe("DOO-B2B-000001");
    expect(formatBusinessCode(125)).toBe("DOO-B2B-000125");
    expect(formatBusinessCode(999999)).toBe("DOO-B2B-999999");
  });
  it("formats order codes as B2B-ORD-YEAR-NNNNNN", () => {
    expect(formatOrderCode(2026, 125)).toBe("B2B-ORD-2026-000125");
    expect(formatOrderCode(2026, 1)).toBe("B2B-ORD-2026-000001");
  });
  it("formats invoice numbers as DOODLY/B2B/YEAR/NNNNN", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("DOODLY/B2B/2026/00001");
  });
});

describe("order totals", () => {
  it("sums line items into the subtotal (paise)", () => {
    const t = computeOrderTotals([
      { unitPricePaise: 6600, quantity: 10 }, // ₹660
      { unitPricePaise: 12000, quantity: 5 }, // ₹600
    ]);
    expect(t.subtotalPaise).toBe(126000);
    expect(t.discountPaise).toBe(0);
    expect(t.taxPaise).toBe(0);
    expect(t.totalPaise).toBe(126000);
  });
  it("applies discount, then tax on the post-discount subtotal", () => {
    const t = computeOrderTotals([{ unitPricePaise: 10000, quantity: 10 }], { discountBps: 1000, taxBps: 500 });
    // subtotal 100000, discount 10% = 10000, taxable 90000, tax 5% = 4500
    expect(t).toEqual({ subtotalPaise: 100000, discountPaise: 10000, taxPaise: 4500, totalPaise: 94500 });
  });
  it("rounds fractional quantities to integer paise", () => {
    expect(lineTotalPaise(6600, 2.5)).toBe(16500);
    expect(lineTotalPaise(333, 3)).toBe(999);
  });
  it("handles an empty order", () => {
    expect(computeOrderTotals([])).toEqual({ subtotalPaise: 0, discountPaise: 0, taxPaise: 0, totalPaise: 0 });
  });
});

describe("status workflow", () => {
  it("follows the documented happy path", () => {
    expect(canTransitionStatus("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionStatus("CONFIRMED", "PREPARING")).toBe(true);
    expect(canTransitionStatus("PREPARING", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransitionStatus("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
    expect(canTransitionStatus("DELIVERED", "COMPLETED")).toBe(true);
  });
  it("allows cancellation only before delivery", () => {
    expect(canTransitionStatus("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionStatus("OUT_FOR_DELIVERY", "CANCELLED")).toBe(true);
    expect(canTransitionStatus("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionStatus("COMPLETED", "CANCELLED")).toBe(false);
  });
  it("rejects skips and backward moves", () => {
    expect(canTransitionStatus("PENDING", "DELIVERED")).toBe(false);
    expect(canTransitionStatus("CONFIRMED", "PENDING")).toBe(false);
  });
  it("marks COMPLETED and CANCELLED as terminal", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
    expect(isTerminalStatus("PENDING")).toBe(false);
    expect(allowedNextStatus("PENDING")).toEqual(["CONFIRMED", "CANCELLED"]);
  });
});

describe("payment status derivation", () => {
  it("reads PAID when fully settled", () => {
    expect(derivePaymentStatus(10000, 10000, "CASH")).toBe("PAID");
    expect(derivePaymentStatus(10000, 12000, "CREDIT")).toBe("PAID");
  });
  it("reads PARTIAL when something is paid but not all", () => {
    expect(derivePaymentStatus(10000, 4000, "CASH")).toBe("PARTIAL");
    expect(derivePaymentStatus(10000, 4000, "MONTHLY")).toBe("PARTIAL");
  });
  it("reads CREDIT for unpaid credit/weekly/monthly terms", () => {
    expect(derivePaymentStatus(10000, 0, "CREDIT")).toBe("CREDIT");
    expect(derivePaymentStatus(10000, 0, "WEEKLY")).toBe("CREDIT");
    expect(derivePaymentStatus(10000, 0, "MONTHLY")).toBe("CREDIT");
  });
  it("reads PENDING for unpaid cash/advance terms", () => {
    expect(derivePaymentStatus(10000, 0, "CASH")).toBe("PENDING");
    expect(derivePaymentStatus(10000, 0, "ADVANCE")).toBe("PENDING");
  });
});

describe("constants", () => {
  it("exposes 11 business types and 5 payment terms", () => {
    expect(BUSINESS_TYPES).toHaveLength(11);
    expect(PAYMENT_TERMS).toHaveLength(5);
  });
  it("defines product-specific units for every catalogue product", () => {
    for (const slug of ["milk", "curd", "paneer", "kova", "ghee"]) {
      expect(PRODUCT_UNITS[slug].length).toBeGreaterThan(0);
    }
  });
});
