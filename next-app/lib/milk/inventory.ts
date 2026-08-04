/* =============================================================
   DOODLY — Milk Inventory (single source of truth = tanker procurement).

   Milk enters the warehouse ONLY through tanker procurement + freshout, and leaves ONLY
   through DELIVERED retail/B2B draws + approved wastage. So inventory is never entered by
   hand — it is a DERIVED, read-only calculation over the FIFO ledger:

     Available = Σ(tanker opening litres) + Σ(freshout litres)
               − Σ(retail delivered) − Σ(B2B delivered) − Σ(wastage)

   which, by construction, equals Σ(open lots' remainingLitres) — i.e. getInventory(). This
   module turns those same rows into a chronological Inventory Ledger + a daily dashboard so
   every litre movement is traceable and Inventory ⇄ Tanker always reconcile. Pure reads.
   ============================================================= */
import "server-only";
import { db } from "@/lib/db";
import { istDayWindow, istISO } from "@/lib/delivery/stats";
import { getInventory } from "@/lib/milk/tanker";

export type MovementType = "PROCUREMENT" | "FRESHOUT" | "RETAIL" | "B2B" | "WASTAGE";
const TYPE_ORDER: Record<MovementType, number> = { PROCUREMENT: 0, FRESHOUT: 1, RETAIL: 2, B2B: 3, WASTAGE: 4 };
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const IST = 5.5 * 3600e3;
const dayMillis = (d: Date) => { const iso = new Date(d.getTime() + IST).toISOString().slice(0, 10); return new Date(`${iso}T00:00:00.000Z`).getTime(); };

export interface MilkMovement {
  at: string;              // ISO — the day it is attributed to (procurement/consumption are day-attributed)
  realAt: string;          // ISO — the actual record timestamp (createdAt / entryAt)
  type: MovementType;
  in: boolean;             // true = increases inventory
  litres: number;          // signed (+in / −out)
  tankerId: string | null;
  tankerCode: string | null;
  note: string | null;
  balanceAfter: number;    // running available-litres after this movement
}

interface RawMove { day: number; real: Date; type: MovementType; litres: number; tankerId: string | null; tankerCode: string | null; note: string | null }

/** All milk movements up to `to` (default now), chronological, with a running balance. */
async function allMovements(toEnd?: Date): Promise<RawMove[]> {
  const tWhere = toEnd ? { deletedAt: null, procurementDate: { lte: toEnd } } : { deletedAt: null };
  const [tankers, freshouts, cons] = await Promise.all([
    db.milkTanker.findMany({ where: tWhere, select: { id: true, code: true, litres: true, procurementDate: true, createdAt: true } }),
    db.milkTankerFreshout.findMany({ where: toEnd ? { entryAt: { lte: toEnd } } : {}, select: { litres: true, quantityKg: true, entryAt: true, tankerId: true, tanker: { select: { code: true } } } }),
    db.tankerConsumption.findMany({ where: toEnd ? { date: { lte: toEnd } } : {}, select: { litres: true, date: true, channel: true, createdAt: true, note: true, tankerId: true, tanker: { select: { code: true } } } }),
  ]);
  const moves: RawMove[] = [];
  for (const t of tankers) moves.push({ day: dayMillis(t.procurementDate), real: t.createdAt, type: "PROCUREMENT", litres: t.litres, tankerId: t.id, tankerCode: t.code, note: null });
  for (const f of freshouts) moves.push({ day: dayMillis(f.entryAt), real: f.entryAt, type: "FRESHOUT", litres: f.litres, tankerId: f.tankerId, tankerCode: f.tanker.code, note: `${r2(f.quantityKg)} kg residue` });
  for (const c of cons) {
    const type: MovementType = c.channel === "RETAIL" ? "RETAIL" : c.channel === "B2B" ? "B2B" : "WASTAGE";
    moves.push({ day: dayMillis(c.date), real: c.createdAt, type, litres: -c.litres, tankerId: c.tankerId, tankerCode: c.tanker.code, note: c.note });
  }
  // Daily ledger order: by attributed day, then receipts before issues, then real time.
  moves.sort((a, b) => a.day - b.day || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.real.getTime() - b.real.getTime());
  return moves;
}

/** The Inventory Ledger (Step 9): every stock movement in [from,to] with a running balance,
    plus the opening balance carried in and totals. Balance reconciles with getInventory(). */
export async function milkInventoryLedger(args: { from?: string; to?: string } = {}): Promise<{
  from: string | null; to: string | null; openingBalance: number; closingBalance: number;
  totals: { procurement: number; freshout: number; retail: number; b2b: number; wastage: number };
  movements: MilkMovement[];
}> {
  const toEnd = args.to ? istDayWindow(args.to).end : undefined;
  const fromStart = args.from ? istDayWindow(args.from).start : undefined;
  const raw = await allMovements(toEnd);

  let bal = 0, opening = 0;
  const out: MilkMovement[] = [];
  const totals = { procurement: 0, freshout: 0, retail: 0, b2b: 0, wastage: 0 };
  for (const m of raw) {
    bal += m.litres;
    const beforeFrom = fromStart ? m.day < dayMillis(fromStart) : false;
    if (beforeFrom) { opening = bal; continue; }   // carried into the opening balance, not listed
    if (m.type === "PROCUREMENT") totals.procurement += m.litres;
    else if (m.type === "FRESHOUT") totals.freshout += m.litres;
    else if (m.type === "RETAIL") totals.retail += -m.litres;
    else if (m.type === "B2B") totals.b2b += -m.litres;
    else totals.wastage += -m.litres;
    out.push({ at: new Date(m.day).toISOString(), realAt: m.real.toISOString(), type: m.type, in: m.litres > 0, litres: r2(m.litres), tankerId: m.tankerId, tankerCode: m.tankerCode, note: m.note, balanceAfter: r2(bal) });
  }
  return {
    from: args.from ?? null, to: args.to ?? null,
    openingBalance: r2(opening), closingBalance: r2(bal),
    totals: { procurement: r2(totals.procurement), freshout: r2(totals.freshout), retail: r2(totals.retail), b2b: r2(totals.b2b), wastage: r2(totals.wastage) },
    movements: out,
  };
}

/** Inventory Dashboard (Step 7) for one IST day: opening + procurement + freshout − retail − b2b
    − wastage = closing, plus the live available (= getInventory, the tanker source of truth). */
export async function milkInventorySummary(dateIso?: string) {
  const { iso } = istDayWindow(dateIso);
  const [led, inv] = await Promise.all([milkInventoryLedger({ from: iso, to: iso }), getInventory()]);
  const t = led.totals;
  return {
    date: iso,
    openingBalance: led.openingBalance,
    procurement: t.procurement, freshout: t.freshout,
    retailConsumed: t.retail, b2bConsumed: t.b2b, wastage: t.wastage,
    closingBalance: led.closingBalance,
    currentAvailable: inv.remainingLitres,      // Σ open lots' remaining — the single source of truth
    inventoryValuePaise: inv.remainingValuePaise,
    openLots: inv.openCount,
    // Inventory ⇄ Tanker reconcile when the day is today (closing == live available).
    reconciled: Math.abs(led.closingBalance - inv.remainingLitres) < 0.5 || iso !== istISO(new Date()),
  };
}

// ---------- MilkReport builders (Step 10 — drive PDF/Excel/CSV/Print exports) ----------
import type { MilkReport } from "@/lib/milk/reports";
const nL = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString("en-IN") + " L";
const TYPE_LABEL: Record<MovementType, string> = { PROCUREMENT: "Tanker received", FRESHOUT: "Freshout added", RETAIL: "Retail delivered", B2B: "B2B delivered", WASTAGE: "Wastage" };

/** Inventory Ledger report — every movement + running balance. */
export async function milkInventoryLedgerReport(args: { from?: string; to?: string } = {}): Promise<MilkReport> {
  const led = await milkInventoryLedger(args);
  const rows = led.movements.map((m) => [m.at.slice(0, 10), TYPE_LABEL[m.type], m.tankerCode ?? "—", m.in ? nL(m.litres) : "", !m.in ? nL(-m.litres) : "", nL(m.balanceAfter)]);
  const t = led.totals;
  return {
    type: "milkInventoryLedger" as unknown as MilkReport["type"], title: "Milk Inventory Ledger",
    subtitle: `${args.from ?? "…"} → ${args.to ?? "…"} · opening ${nL(led.openingBalance)} + procurement ${nL(t.procurement)} + freshout ${nL(t.freshout)} − retail ${nL(t.retail)} − B2B ${nL(t.b2b)} − wastage ${nL(t.wastage)} = closing ${nL(led.closingBalance)}`,
    rowCount: rows.length,
    columns: [{ label: "Date" }, { label: "Movement" }, { label: "Tanker" }, { label: "In", right: true }, { label: "Out", right: true }, { label: "Balance", right: true }],
    rows, totalRow: ["TOTAL", `${led.movements.length} moves`, "", nL(t.procurement + t.freshout), nL(t.retail + t.b2b + t.wastage), nL(led.closingBalance)],
  };
}

/** Daily Stock report — the day's opening → closing breakdown (the inventory formula). */
export async function milkDailyStockReport(dateIso?: string): Promise<MilkReport> {
  const s = await milkInventorySummary(dateIso);
  const rows: string[][] = [
    ["Opening balance", nL(s.openingBalance)],
    ["+ Tanker procurement", nL(s.procurement)],
    ["+ Freshout", nL(s.freshout)],
    ["− Retail delivered", nL(s.retailConsumed)],
    ["− B2B delivered", nL(s.b2bConsumed)],
    ["− Wastage", nL(s.wastage)],
    ["= Closing balance", nL(s.closingBalance)],
    ["Live available (tankers)", nL(s.currentAvailable)],
  ];
  return {
    type: "milkDailyStock" as unknown as MilkReport["type"], title: `Milk Daily Stock — ${s.date}`,
    subtitle: `Available ${nL(s.currentAvailable)} across ${s.openLots} open lot(s)${s.reconciled ? " · reconciled ✓" : " · ⚠ not reconciled"}`,
    rowCount: rows.length, columns: [{ label: "Line" }, { label: "Litres", right: true }], rows,
  };
}
