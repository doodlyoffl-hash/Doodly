/* /api/admin/customers/[id] — one customer, admin CRM view.
   GET   — full profile (customers:view).
   PATCH — action dispatch (customers:edit): update | status | reset-password |
           wallet | note | preferences | assign-exec | add-address |
           update-address | delete-address | default-address. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, route, Errors } from "@/lib/http";
import { requirePermission } from "@/lib/auth/authorize";
import { readUserId } from "@/lib/auth/identity";
import { reqIp } from "@/lib/customers/req";
import { audit } from "@/lib/auth/audit";
import { reqContext } from "@/lib/auth/request";
import {
  getCustomerProfile, updateCustomer, setStatus, resetPassword, walletAdjust, addNote,
  setPreferences, assignExecutive, addAddress, updateAddress, deleteAddress, setDefaultAddress, type Actor,
} from "@/lib/customers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = route("admin.customers.profile", async (req: NextRequest, { params }: Ctx) => {
  requirePermission(req, "customers", "view");
  const profile = await getCustomerProfile(params.id);
  if (!profile) throw Errors.notFound("Customer not found.");
  return ok({ customer: profile });
});

const addr = { label: z.string().max(40).optional(), line1: z.string().min(1).max(120), line2: z.string().max(120).optional(), city: z.string().min(1).max(60), pincode: z.string().min(4).max(10), lat: z.number().optional(), lng: z.number().optional(), deliveryNote: z.string().max(200).optional(), isDefault: z.boolean().optional() };

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().max(80).optional(), email: z.string().email().or(z.literal("")).optional(), phone: z.string().max(20).optional(), tags: z.array(z.string().max(30)).max(20).optional() }),
  z.object({ action: z.literal("status"), op: z.enum(["activate", "deactivate", "suspend", "delete"]), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("reset-password") }),
  z.object({ action: z.literal("wallet"), direction: z.enum(["credit", "debit"]), amountPaise: z.number().int().min(1).max(100_000_00), reason: z.string().max(200) }),
  z.object({ action: z.literal("note"), body: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("preferences"), emailOptIn: z.boolean().optional(), smsOptIn: z.boolean().optional(), whatsappOptIn: z.boolean().optional(), pushOptIn: z.boolean().optional(), marketingOptIn: z.boolean().optional(), language: z.string().max(10).optional(), preferredSlot: z.string().max(40).nullable().optional() }),
  z.object({ action: z.literal("assign-exec"), executive: z.string().min(1).max(60) }),
  z.object({ action: z.literal("add-address"), ...addr }),
  z.object({ action: z.literal("update-address"), addressId: z.string().min(1), label: z.string().max(40).optional(), line1: z.string().max(120).optional(), line2: z.string().max(120).optional(), city: z.string().max(60).optional(), pincode: z.string().max(10).optional(), lat: z.number().optional(), lng: z.number().optional(), deliveryNote: z.string().max(200).optional(), isDefault: z.boolean().optional() }),
  z.object({ action: z.literal("delete-address"), addressId: z.string().min(1) }),
  z.object({ action: z.literal("default-address"), addressId: z.string().min(1) }),
]);

export const PATCH = route("admin.customers.action", async (req: NextRequest, { params }: Ctx) => {
  const role = requirePermission(req, "customers", "edit");
  const body = await parseBody(req, patchSchema);
  const id = params.id;
  const actor: Actor = { actorId: readUserId(req) ?? undefined, actorRole: role, ip: reqIp(req) };

  let result: unknown;
  switch (body.action) {
    case "update": result = await updateCustomer(id, { name: body.name, email: body.email, phone: body.phone, tags: body.tags }, actor); break;
    case "status": result = await setStatus(id, body.op, body.reason, actor); break;
    case "reset-password": result = await resetPassword(id, actor); break;
    case "wallet": result = await walletAdjust(id, { direction: body.direction, amountPaise: body.amountPaise, reason: body.reason }, actor); break;
    case "note": result = await addNote(id, body.body, actor); break;
    case "preferences": { const { action, ...prefs } = body; result = await setPreferences(id, prefs, actor); break; }
    case "assign-exec": result = await assignExecutive(id, body.executive, actor); break;
    case "add-address": result = await addAddress(id, body, actor); break;
    case "update-address": { const { action, addressId, ...rest } = body; result = await updateAddress(id, addressId, rest, actor); break; }
    case "delete-address": result = await deleteAddress(id, body.addressId, actor); break;
    case "default-address": result = await setDefaultAddress(id, body.addressId, actor); break;
  }

  await audit({ actorRole: role, action: `customer.${body.action}`, target: id, ctx: reqContext(req) });
  return ok({ result });
});
