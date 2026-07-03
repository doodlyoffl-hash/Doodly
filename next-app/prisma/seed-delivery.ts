/* Delivery Settings seed (idempotent).
   - Ensures the DeliveryConfig singleton exists (defaults).
   - Upserts the 12 serviceable pincodes grouped into delivery zones.
   Run:  npx tsx prisma/seed-delivery.ts
*/
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const ZONES: { name: string; executive: string; pins: [string, string][] }[] = [
  { name: "Central Vijayawada", executive: "Ramesh Kumar", pins: [
    ["520001", "One Town"], ["520002", "Governorpet"], ["520003", "Gandhi Nagar"],
    ["520010", "Benz Circle / Patamata / Labbipet"], ["520011", "Kaleswara Rao Market Area"],
  ] },
  { name: "East Vijayawada", executive: "Suresh Babu", pins: [
    ["520013", "Krishnalanka"], ["520004", "Gunadala"],
    ["520007", "Kanuru / Yanamalakuduru / Auto Nagar"], ["520008", "Ramavarappadu"],
  ] },
  { name: "West Vijayawada", executive: "Anil Teja", pins: [
    ["520012", "Bhavanipuram / Vidyadharapuram"], ["520015", "Ajit Singh Nagar / Payakapuram"],
  ] },
  { name: "Tadepalli", executive: "Kiran Rao", pins: [
    ["522501", "Tadepalli"],
  ] },
];

async function main() {
  await db.deliveryConfig.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  console.log("DeliveryConfig singleton ensured.");

  let zoneCount = 0, pinCount = 0;
  for (const z of ZONES) {
    let zone = await db.deliveryZone.findFirst({ where: { name: z.name } });
    if (!zone) { zone = await db.deliveryZone.create({ data: { name: z.name, executive: z.executive } }); zoneCount++; }
    const city = z.name === "Tadepalli" ? "Tadepalli" : "Vijayawada";
    for (const [pincode, area] of z.pins) {
      await db.serviceablePincode.upsert({
        where: { pincode },
        create: { pincode, area, city, state: "Andhra Pradesh", zoneId: zone.id, charge: 0, slot: "6:00–8:00 AM", eta: "By 8:00 AM", enabled: true },
        update: { area, city, zoneId: zone.id },
      });
      pinCount++;
    }
  }
  console.log(`Zones ensured (+${zoneCount} new) · ${pinCount} serviceable pincodes upserted.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
