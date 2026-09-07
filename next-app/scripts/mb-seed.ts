/* Seed the ISOLATED dev DB with minimal data to exercise the private
   Milk-Business Control Centre. Uses the REAL engine (createTanker, config).
   HARD SAFETY GUARD: refuses to run against anything but the local dev DB. */
import { db } from "../lib/db";
import { setMilkConfig } from "../lib/milk/config";
import { createTanker } from "../lib/milk/tanker";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) {
    throw new Error("REFUSING to seed — DATABASE_URL is not the local dev DB: " + url);
  }

  // 1) milk cost config (conversion 1.03, seasonal rates)
  await setMilkConfig(
    { conversionFactor: 1.03, milkRatePaise: 450, fatRatePaise: 82000, transportPaise: 950000 },
    { actorRole: "super_admin" },
  );

  // 2) a category + one approved expense today (proves the expense→net path)
  const cat = await db.expenseCategory.upsert({
    where: { slug: "electricity" },
    update: {},
    create: { name: "Electricity", slug: "electricity" },
  });
  const today = new Date();
  const code = "EXP-" + today.toISOString().slice(0, 10).replace(/-/g, "") + "-DEV1";
  await db.expense.upsert({
    where: { code },
    update: {},
    create: { code, date: today, title: "Electricity (dev)", categoryId: cat.id, amountPaise: 50000, totalPaise: 50000, status: "APPROVED", paymentMode: "CASH" },
  });

  // 3) one tanker today via the REAL engine
  const t = await createTanker(
    { tankerNo: "DEV-" + Date.now(), supplier: "Dev Supplier", quantityKg: 1000, fatPct: 6.5 },
    { actorRole: "super_admin" },
  );

  console.log(JSON.stringify({
    ok: true,
    tanker: t.code, litres: t.litres, remainingLitres: t.remainingLitres,
    totalCostPaise: t.totalCostPaise, costPerLitrePaise: t.costPerLitrePaise,
  }, null, 2));
}

main()
  .catch((e) => { console.error("SEED FAILED:", e?.message || e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
