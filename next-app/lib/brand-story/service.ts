/* Brand-story CMS persistence (server-only). Reads/writes the singleton
   override and returns the merged story. All reads are failure-tolerant: if
   the DB is unavailable (e.g. at build time), defaults are used so the page
   still renders. */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { mergeBrandStory, parseOverride, type BrandStoryOverride } from "./merge";
import type { BrandStory } from "@/config/brand-story";

const ID = "default";

export async function getBrandStoryOverride(): Promise<BrandStoryOverride> {
  try {
    const row = await db.brandStoryConfig.findUnique({ where: { id: ID } });
    return parseOverride(row?.data ?? {});
  } catch {
    return {}; // no DB (build time) → defaults
  }
}

/** Merged story for the public page. Never throws. */
export async function getBrandStory(): Promise<BrandStory> {
  return mergeBrandStory(await getBrandStoryOverride());
}

export async function setBrandStoryOverride(raw: unknown): Promise<BrandStoryOverride> {
  const data = parseOverride(raw);
  const json = data as Prisma.InputJsonValue;
  await db.brandStoryConfig.upsert({
    where: { id: ID },
    create: { id: ID, data: json },
    update: { data: json },
  });
  return data;
}
