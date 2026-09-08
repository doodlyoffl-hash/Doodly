/* Backfill continuity metadata onto EXISTING tankers (spec §46). Conservative:
   a tanker is CONTINUITY only where the CURRENT state proves it — i.e. an earlier
   tanker is still OPEN with remaining stock (they provably coexisted). Everything
   else is PRIMARY with its own chain. Never invents historical continuity; never
   touches quantity/FAT/cost. Idempotent — only fills rows missing a chain id.
   DEV DB by default; pass --prod-confirm to allow a non-dev DB (used at deploy). */
import { db } from "../lib/db";

const EPS = 1e-6;

async function nextChain(year: number): Promise<string> {
  const key = `continuityChain:${year}`;
  const row = await db.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `CHAIN-${year}-${String(row.value).padStart(4, "0")}`;
}
const istYear = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).getUTCFullYear();

async function main() {
  const url = process.env.DATABASE_URL || "";
  const prodOk = process.argv.includes("--prod-confirm");
  if (!/localhost:5433|doodly_dev/.test(url) && !prodOk) throw new Error("REFUSING — not the dev DB (pass --prod-confirm to run against " + url.replace(/:[^:@]+@/, ":***@") + ")");

  const tankers = await db.milkTanker.findMany({
    where: { deletedAt: null, continuityChainId: null },   // idempotent: only un-assigned rows
    orderBy: [{ procurementDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, code: true, procurementDate: true, status: true, remainingLitres: true },
  });
  if (!tankers.length) { console.log("nothing to backfill (all tankers already have a chain)"); return; }

  // processed list to find the active predecessor from current state
  const processed: Array<{ id: string; chainId: string; sequence: number; open: boolean }> = [];
  let primaries = 0, continuities = 0;
  for (const t of tankers) {
    // newest already-processed tanker that is OPEN with remaining stock = active predecessor
    const pred = [...processed].reverse().find((p) => p.open);
    if (pred) {
      const seq = pred.sequence + 1;
      await db.milkTanker.update({ where: { id: t.id }, data: { continuityType: "CONTINUITY", continuityChainId: pred.chainId, continuitySequence: seq, parentTankerId: pred.id } });
      processed.push({ id: t.id, chainId: pred.chainId, sequence: seq, open: t.status === "OPEN" && t.remainingLitres > EPS });
      continuities++;
    } else {
      const chainId = await nextChain(istYear(t.procurementDate));
      await db.milkTanker.update({ where: { id: t.id }, data: { continuityType: "PRIMARY", continuityChainId: chainId, continuitySequence: 1, parentTankerId: null } });
      processed.push({ id: t.id, chainId, sequence: 1, open: t.status === "OPEN" && t.remainingLitres > EPS });
      primaries++;
    }
  }
  console.log(`backfilled ${tankers.length} tanker(s): ${primaries} PRIMARY, ${continuities} CONTINUITY`);
}
main().catch((e) => { console.error("BACKFILL FAILED:", e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
