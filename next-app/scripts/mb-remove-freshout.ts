/* Undo Fresh-out entries on a tanker in the DEV DB — e.g. a test fresh-out added
   while verifying the private module's + Fresh-out action. Deletes the tanker's
   MilkTankerFreshout rows and restores freshoutKg/freshoutLitres to 0, remaining to
   (litres − consumed), and the cost/L + cost/kg back to their pre-fresh-out values.

   ONLY safe when the tanker has NO consumption drawing on the diluted cost (which is
   the case for a freshly-seeded test tanker); it REFUSES if consumedLitres > 0 so it
   can never silently corrupt a tanker whose COGS already used the diluted rate.

   Usage: --tanker=CODE (default TNK-20260908-0001); mutates only with --confirm.
   DEV DB ONLY. */
import { db } from "../lib/db";

const tankerArg = (process.argv.find((a) => a.startsWith("--tanker=")) || "").split("=")[1];
const CODE = tankerArg || "TNK-20260908-0001";
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) throw new Error("REFUSING — not the dev DB: " + url);

  const t = await db.milkTanker.findFirst({ where: { code: CODE }, select: { id: true, code: true, quantityKg: true, litres: true, freshoutKg: true, freshoutLitres: true, consumedLitres: true, remainingLitres: true, totalCostPaise: true, costPerLitrePaise: true, costPerKgPaise: true } });
  if (!t) throw new Error("Tanker not found: " + CODE);
  const entries = await db.milkTankerFreshout.findMany({ where: { tankerId: t.id }, select: { id: true, quantityKg: true, litres: true } });
  console.log(`Tanker ${t.code}: freshout ${t.freshoutLitres}L (${t.freshoutKg}kg) from ${entries.length} entr(y/ies) · consumed ${t.consumedLitres}L · remaining ${t.remainingLitres}L · cost/L ${t.costPerLitrePaise}p`);
  if ((t.consumedLitres ?? 0) > 1e-6) throw new Error(`REFUSING — ${t.code} has ${t.consumedLitres}L consumed; reversing fresh-out would misstate the COGS already drawn at the diluted rate.`);
  if (!entries.length) { console.log("Nothing to remove (no fresh-out entries)."); return; }

  const restoredRemaining = Math.round((t.litres - (t.consumedLitres ?? 0)) * 1000) / 1000;
  const restoredCostL = t.litres > 0 ? Math.round(t.totalCostPaise / t.litres) : t.costPerLitrePaise;
  const restoredCostKg = t.quantityKg > 0 ? Math.round(t.totalCostPaise / t.quantityKg) : t.costPerKgPaise;
  console.log(`Will restore → freshout 0, remaining ${restoredRemaining}L, cost/L ${restoredCostL}p, cost/kg ${restoredCostKg}p.`);

  if (!CONFIRM) { console.log("\n(dry run) — re-run with --confirm to apply."); return; }

  await db.$transaction(async (tx) => {
    await tx.milkTankerFreshout.deleteMany({ where: { tankerId: t.id } });
    await tx.milkTanker.update({ where: { id: t.id }, data: { freshoutKg: 0, freshoutLitres: 0, remainingLitres: restoredRemaining, costPerLitrePaise: restoredCostL, costPerKgPaise: restoredCostKg } });
  });

  const after = await db.milkTanker.findUniqueOrThrow({ where: { id: t.id }, select: { code: true, freshoutLitres: true, remainingLitres: true, consumedLitres: true, costPerLitrePaise: true } });
  console.log(`✅ ${after.code}: freshout ${after.freshoutLitres}L · remaining ${after.remainingLitres}L · consumed ${after.consumedLitres}L · cost/L ${after.costPerLitrePaise}p.`);
}
main().catch((e) => { console.error(e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
