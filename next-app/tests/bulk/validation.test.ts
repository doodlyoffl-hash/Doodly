import { describe, it, expect } from "vitest";
import { BulkRequestSchema, normalizeBulkRequest } from "@/lib/bulk/validation";

const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const base = {
  fullName: "Ravi Kumar", mobile: "9876543210", email: "", eventType: "WEDDING",
  eventDate: future, deliveryTime: "7:00 AM", deliveryAddress: "12 Main Road, Benz Circle",
  city: "Vijayawada", pincode: "520010", quantity: "100", unit: "LITRES",
  additionalRequirements: "", preferredContact: "PHONE", specialInstructions: "", company: "",
};
const field = (data: Record<string, unknown>, key: string) => {
  const r = BulkRequestSchema.safeParse(data);
  return r.success ? undefined : r.error.flatten().fieldErrors[key]?.[0];
};

describe("bulk request validation", () => {
  it("accepts a complete, valid payload", () => {
    expect(BulkRequestSchema.safeParse(base).success).toBe(true);
  });

  it("requires name, address, city", () => {
    expect(field({ ...base, fullName: "" }, "fullName")).toBeTruthy();
    expect(field({ ...base, deliveryAddress: "" }, "deliveryAddress")).toBeTruthy();
    expect(field({ ...base, city: "" }, "city")).toBeTruthy();
  });

  it("validates mobile number", () => {
    expect(field({ ...base, mobile: "12345" }, "mobile")).toBeTruthy();
    expect(field({ ...base, mobile: "1234567890" }, "mobile")).toBeTruthy(); // can't start with 1
    expect(BulkRequestSchema.safeParse({ ...base, mobile: "9876543210" }).success).toBe(true);
    expect(BulkRequestSchema.safeParse({ ...base, mobile: "+91-9876543210" }).success).toBe(true);
  });

  it("validates email only when provided", () => {
    expect(field({ ...base, email: "not-an-email" }, "email")).toBeTruthy();
    expect(BulkRequestSchema.safeParse({ ...base, email: "" }).success).toBe(true);
    expect(BulkRequestSchema.safeParse({ ...base, email: "a@b.com" }).success).toBe(true);
  });

  it("requires quantity greater than zero (whole number)", () => {
    expect(field({ ...base, quantity: "0" }, "quantity")).toMatch(/greater than zero/i);
    expect(field({ ...base, quantity: "-5" }, "quantity")).toBeTruthy();
    expect(field({ ...base, quantity: "2.5" }, "quantity")).toBeTruthy();
    expect(BulkRequestSchema.safeParse({ ...base, quantity: "50" }).success).toBe(true);
  });

  it("rejects event dates in the past", () => {
    expect(field({ ...base, eventDate: "2020-01-01" }, "eventDate")).toMatch(/past/i);
    expect(BulkRequestSchema.safeParse({ ...base, eventDate: future }).success).toBe(true);
  });

  it("validates pincode", () => {
    expect(field({ ...base, pincode: "12" }, "pincode")).toBeTruthy();
    expect(field({ ...base, pincode: "020010" }, "pincode")).toBeTruthy(); // can't start with 0
    expect(BulkRequestSchema.safeParse({ ...base, pincode: "520010" }).success).toBe(true);
  });

  it("accepts the honeypot field at the schema level (the API/service drop it silently)", () => {
    // The honeypot is enforced at the route/service layer (silent 200), not as a
    // hard validation error — so a filled honeypot still parses cleanly here.
    expect(BulkRequestSchema.safeParse({ ...base, company: "spam" }).success).toBe(true);
  });

  it("normalizes optional empties and mobile separators", () => {
    const parsed = BulkRequestSchema.parse({ ...base, mobile: "+91-9876543210", email: "", specialInstructions: "" });
    const n = normalizeBulkRequest(parsed);
    expect(n.mobile).toBe("+919876543210");
    expect(n.email).toBeUndefined();
    expect(n.specialInstructions).toBeUndefined();
  });
});
