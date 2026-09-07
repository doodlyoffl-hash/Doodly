/* Remove warehouse walk-in test data from the DEV DB and re-settle affected
   days so the WAREHOUSE FIFO draws are reversed. DEV DB ONLY. */
import { db } from "../lib/db";
import { settleDay } from "../lib/milk/settle";
import { istISO } from "../lib/delivery/stats";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost:5433|doodly_dev/.test(url)) throw new Error("REFUSING — not the dev DB: " + url);
  const sales = await db.warehouseSale.findMany({ select: { id: true, saleDate: true } });
  const days = [...new Set(sales.map((s) => istISO(s.saleDate)))];
  await db.warehouseSale.deleteMany({});
  await db.warehouseCustomerPricing.deleteMany({});
  await db.warehouseCustomer.deleteMany({});
  for (const d of days) await settleDay(d, { actorRole: "super_admin", quiet: true }).catch(() => {});
  console.log("cleaned warehouse test data; re-settled:", days);
}
main().catch((e) => { console.error(e?.message || e); process.exitCode = 1; }).finally(() => db.$disconnect());
