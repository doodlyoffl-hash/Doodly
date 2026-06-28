/* Seed the catalogue from config/catalogue.ts (mirror of the static data.js). */
import { PrismaClient } from "@prisma/client";
import { products, variants, plans } from "../config/catalogue";

const db = new PrismaClient();

async function main() {
  for (const p of products) {
    await db.product.upsert({
      where: { slug: p.slug },
      update: { name: p.name, status: p.status === "AVAILABLE" ? "AVAILABLE" : "COMING_SOON", description: p.description },
      create: { slug: p.slug, name: p.name, status: p.status === "AVAILABLE" ? "AVAILABLE" : "COMING_SOON", description: p.description },
    });
  }
  for (const v of variants) {
    const product = await db.product.findUnique({ where: { slug: v.productSlug } });
    if (!product) continue;
    await db.variant.create({
      data: {
        productId: product.id, label: v.label, ml: v.ml, type: v.type,
        dailyPaise: v.dailyPaise ?? null, fixedPaise: v.fixedPaise ?? null, fixedDays: v.fixedDays ?? null,
      },
    });
  }
  for (const pl of plans) {
    await db.plan.upsert({
      where: { slug: pl.slug },
      update: { name: pl.name, days: pl.days, discountBps: pl.discountBps },
      create: { slug: pl.slug, name: pl.name, days: pl.days, discountBps: pl.discountBps },
    });
  }
  console.log("Seeded products, variants and plans.");
}

main().finally(() => db.$disconnect());
