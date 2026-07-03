/* Auto-assignment operational data (idempotent).
   The engine needs a DeliveryCapacity (bottles/trip) + a live ExecutiveStatus
   (availability) row per driver — without them every delivery is queued and
   the dashboard shows 0 executives. Seeds AVAILABLE + 45-bottle capacity for
   each active driver, from the platform default (DeliveryConfig).
   Run:  npx tsx prisma/seed-assignment.ts
*/
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const cfg = await db.deliveryConfig.findUnique({ where: { id: "singleton" } });
  const maxBottles = cfg?.maxBottleCapacity ?? 45;

  const drivers = await db.driver.findMany({ where: { active: true }, select: { id: true } });
  let cap = 0, status = 0;
  for (const d of drivers) {
    await db.deliveryCapacity.upsert({
      where: { driverId: d.id },
      create: { driverId: d.id, maxBottles, active: true },
      update: { maxBottles, active: true },
    });
    cap++;
    await db.executiveStatus.upsert({
      where: { driverId: d.id },
      create: { driverId: d.id, availability: "AVAILABLE", assignedBottles: 0 },
      update: {}, // don't clobber a live trip's availability
    });
    status++;
  }
  console.log(`Seeded capacity=${cap} executiveStatus=${status} for ${drivers.length} active driver(s) @ ${maxBottles} bottles/trip.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
