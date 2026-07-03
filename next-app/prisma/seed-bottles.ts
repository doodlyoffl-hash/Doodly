/* Opening bottle-fleet stock-take (idempotent).
   Seeds BottleStock counts by capacity × stage + a provenance BottleMovement
   for each, ONLY if the fleet is empty. These are opening balances (a real
   physical count), not UI mock data — every value is mutable via movements.
   Run:  npx tsx prisma/seed-bottles.ts
*/
import { PrismaClient, type BottleStage } from "@prisma/client";
const db = new PrismaClient();

// capacityMl -> stage -> opening qty  (available totals 1,280; awaiting = 418)
const OPENING: Record<number, Partial<Record<BottleStage, number>>> = {
  1000: { AVAILABLE: 620, IN_CIRCULATION: 3400, AWAITING_COLLECTION: 240, CLEANING: 300, DAMAGED: 18, LOST: 40 },
  500:  { AVAILABLE: 460, IN_CIRCULATION: 2100, AWAITING_COLLECTION: 150, CLEANING: 220, DAMAGED: 12, LOST: 26 },
  300:  { AVAILABLE: 200, IN_CIRCULATION: 640,  AWAITING_COLLECTION: 28,  CLEANING: 90,  DAMAGED: 6,  LOST: 14 },
};

async function main() {
  const existing = await db.bottleStock.count();
  if (existing > 0) {
    console.log(`BottleStock already has ${existing} rows — skipping opening seed (idempotent).`);
    return;
  }
  let stockRows = 0, moveRows = 0, total = 0;
  for (const [capStr, stages] of Object.entries(OPENING)) {
    const capacityMl = Number(capStr);
    for (const [stage, qty] of Object.entries(stages) as [BottleStage, number][]) {
      if (!qty) continue;
      await db.bottleStock.create({ data: { capacityMl, stage, qty } });
      await db.bottleMovement.create({
        data: {
          capacityMl, fromStage: null, toStage: stage, qty,
          reason: "Opening stock-take", note: "Fleet initialisation (2026-07-01)",
          actorRole: "super_admin",
        },
      });
      stockRows++; moveRows++; total += qty;
    }
  }
  console.log(`Seeded ${stockRows} BottleStock rows + ${moveRows} opening movements (${total} bottles).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
