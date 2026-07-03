/* =============================================================
   DOODLY Content → Blog — service layer (Prisma). The journal
   published on the customer website. Full lifecycle (draft →
   scheduled → published ⇄ archived), SEO metadata, reading-time,
   slug generation, categories/tags, soft-delete + restore, dashboard,
   and a public published-feed for the storefront. Reuses AuditLog.
   ============================================================= */
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

interface Actor { actorId?: string; actorRole?: string }

const soD = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eoD = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
}
export function readingTime(content?: string | null): number {
  const words = (content ?? "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

type BlogRow = Prisma.BlogPostGetPayload<{}>;
/** Derived display status (respects a future scheduledFor window). */
export function blogStatus(p: { deletedAt: Date | null; status: string; scheduledFor: Date | null }, now = new Date()): "Deleted" | "Archived" | "Draft" | "Scheduled" | "Published" {
  if (p.deletedAt) return "Deleted";
  if (p.status === "ARCHIVED") return "Archived";
  if (p.status === "DRAFT") return "Draft";
  if (p.status === "SCHEDULED") return p.scheduledFor && p.scheduledFor > now ? "Scheduled" : "Published";
  return "Published";
}
function shape(p: BlogRow) {
  return {
    id: p.id, slug: p.slug, title: p.title, excerpt: p.excerpt, content: p.content, featuredImage: p.featuredImage,
    author: p.author, categoryName: p.categoryName, tags: p.tags, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoKeywords: p.seoKeywords,
    readingMinutes: p.readingMinutes, status: p.status, statusLabel: blogStatus(p), views: p.views,
    publishedAt: p.publishedAt, scheduledFor: p.scheduledFor, createdById: p.createdById, deletedAt: p.deletedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

export const BlogSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().max(90).optional().or(z.literal("")),
  excerpt: z.string().trim().max(400).optional().or(z.literal("")),
  content: z.string().max(100000).optional().or(z.literal("")),
  featuredImage: z.string().trim().max(2000).optional().or(z.literal("")),
  author: z.string().trim().max(120).optional().or(z.literal("")),
  categoryName: z.string().trim().max(80).optional().or(z.literal("")),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  seoTitle: z.string().trim().max(160).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
  seoKeywords: z.array(z.string().trim().max(60)).max(20).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"]).optional(),
  scheduledFor: z.string().nullable().optional(),
});
const clean = (v?: string | null) => { const t = (v ?? "").trim(); return t.length ? t : null; };

// ---------------------------------------------------------------- list + detail
export interface BlogFilters { q?: string; status?: string; category?: string; author?: string; from?: string; to?: string; sort?: string; page?: number; pageSize?: number; includeDeleted?: boolean }
export async function listBlogPosts(f: BlogFilters = {}) {
  const where: Prisma.BlogPostWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.category) where.categoryName = f.category;
  if (f.author) where.author = f.author;
  if (f.from || f.to) { const r: Prisma.DateTimeFilter = {}; if (f.from) r.gte = soD(new Date(f.from)); if (f.to) r.lte = eoD(new Date(f.to)); where.createdAt = r; }
  if (f.q?.trim()) { const q = f.q.trim(); where.OR = [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { excerpt: { contains: q, mode: "insensitive" } }, { author: { contains: q, mode: "insensitive" } }, { categoryName: { contains: q, mode: "insensitive" } }]; }
  const orderBy: Prisma.BlogPostOrderByWithRelationInput = f.sort === "views" ? { views: "desc" } : f.sort === "published" ? { publishedAt: "desc" } : f.sort === "title" ? { title: "asc" } : f.sort === "updated" ? { updatedAt: "desc" } : { createdAt: "desc" };
  let rows = await db.blogPost.findMany({ where, orderBy, take: 1000 });
  let list = rows.map(shape);
  if (f.status) list = list.filter((p) => p.statusLabel.toLowerCase() === f.status!.toLowerCase());
  const total = list.length; const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 100));
  return { posts: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
export async function blogDetail(idOrSlug: string) {
  const p = await db.blogPost.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
  if (!p) throw new Error("Post not found");
  return shape(p);
}

// ---------------------------------------------------------------- CRUD + lifecycle
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  let s = base || "post";
  for (let i = 2; ; i++) { const dup = await db.blogPost.findFirst({ where: { slug: s, NOT: exceptId ? { id: exceptId } : undefined }, select: { id: true } }); if (!dup) return s; s = `${base}-${i}`; }
}
export async function createBlogPost(raw: unknown, actor: Actor) {
  const d = BlogSchema.parse(raw);
  const slug = await uniqueSlug(d.slug ? slugify(d.slug) : slugify(d.title));
  const status = d.status ?? "DRAFT";
  const p = await db.blogPost.create({
    data: {
      slug, title: d.title, excerpt: clean(d.excerpt), content: d.content ?? null, featuredImage: clean(d.featuredImage), author: clean(d.author),
      categoryName: clean(d.categoryName), tags: d.tags ?? [], seoTitle: clean(d.seoTitle), seoDescription: clean(d.seoDescription), seoKeywords: d.seoKeywords ?? [],
      readingMinutes: readingTime(d.content), status, views: 0,
      publishedAt: status === "PUBLISHED" ? new Date() : null, scheduledFor: d.scheduledFor ? new Date(d.scheduledFor) : null, createdById: actor.actorId ?? null,
    },
  });
  return shape(p);
}
export async function updateBlogPost(id: string, raw: unknown) {
  const d = BlogSchema.partial().parse(raw);
  const data: Prisma.BlogPostUpdateInput = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.slug !== undefined && d.slug) data.slug = await uniqueSlug(slugify(d.slug), id);
  for (const k of ["excerpt", "featuredImage", "author", "categoryName", "seoTitle", "seoDescription"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = clean(d[k] as string);
  if (d.content !== undefined) { data.content = d.content ?? null; data.readingMinutes = readingTime(d.content); }
  for (const k of ["tags", "seoKeywords"] as const) if (d[k] !== undefined) (data as Record<string, unknown>)[k] = d[k];
  if (d.scheduledFor !== undefined) data.scheduledFor = d.scheduledFor ? new Date(d.scheduledFor) : null;
  if (d.status !== undefined) { data.status = d.status; if (d.status === "PUBLISHED") data.publishedAt = new Date(); }
  const p = await db.blogPost.update({ where: { id }, data });
  return shape(p);
}
const setStatus = async (id: string, status: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED", extra: Prisma.BlogPostUpdateInput = {}) => shape(await db.blogPost.update({ where: { id }, data: { status, ...extra } }));
export const publishBlogPost = (id: string) => setStatus(id, "PUBLISHED", { publishedAt: new Date() });
export const unpublishBlogPost = (id: string) => setStatus(id, "DRAFT");
export const archiveBlogPost = (id: string) => setStatus(id, "ARCHIVED");
export const scheduleBlogPost = (id: string, whenISO: string) => setStatus(id, "SCHEDULED", { scheduledFor: new Date(whenISO) });
export const softDeleteBlogPost = async (id: string) => shape(await db.blogPost.update({ where: { id }, data: { deletedAt: new Date() } }));
export const restoreBlogPost = async (id: string) => shape(await db.blogPost.update({ where: { id }, data: { deletedAt: null } }));
export async function duplicateBlogPost(id: string, actor: Actor) {
  const p = await db.blogPost.findUnique({ where: { id } });
  if (!p) throw new Error("Post not found");
  const slug = await uniqueSlug(`${p.slug}-copy`);
  const { id: _i, createdAt: _c, updatedAt: _u, views: _v, ...rest } = p;
  return shape(await db.blogPost.create({ data: { ...rest, title: `${p.title} (copy)`, slug, status: "DRAFT", publishedAt: null, views: 0, createdById: actor.actorId ?? null } }));
}
export async function bulkBlog(action: string, ids: string[]) {
  const map: Record<string, Prisma.BlogPostUpdateManyMutationInput> = { publish: { status: "PUBLISHED", publishedAt: new Date() }, unpublish: { status: "DRAFT" }, archive: { status: "ARCHIVED" }, delete: { deletedAt: new Date() }, restore: { deletedAt: null } };
  if (!map[action]) throw new Error("Unknown bulk action");
  return db.blogPost.updateMany({ where: { id: { in: ids } }, data: map[action] }).then((r) => ({ count: r.count }));
}

// ---------------------------------------------------------------- dashboard + public feed
export async function blogDashboard() {
  const now = new Date();
  const [all, viewsAgg, topRows] = await Promise.all([
    db.blogPost.findMany({ where: { deletedAt: null }, select: { status: true, scheduledFor: true, deletedAt: true } }),
    db.blogPost.aggregate({ where: { deletedAt: null }, _sum: { views: true } }),
    db.blogPost.findMany({ where: { deletedAt: null }, orderBy: { views: "desc" }, take: 1, select: { title: true, views: true } }),
  ]);
  const st = all.map((p) => blogStatus(p, now));
  const count = (s: string) => st.filter((x) => x === s).length;
  return {
    kpis: {
      totalPosts: all.length, published: count("Published"), drafts: count("Draft"), scheduled: count("Scheduled"), archived: count("Archived"),
      totalViews: viewsAgg._sum.views ?? 0, topPost: topRows[0]?.title ?? null, topPostViews: topRows[0]?.views ?? 0,
    },
  };
}
/** Public: published posts for the customer website (also serves scheduled posts whose time has arrived). */
export async function publicBlogFeed(limit = 30) {
  const now = new Date();
  const posts = await db.blogPost.findMany({
    where: { deletedAt: null, OR: [{ status: "PUBLISHED" }, { status: "SCHEDULED", scheduledFor: { lte: now } }] },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], take: limit,
    select: { slug: true, title: true, excerpt: true, featuredImage: true, author: true, categoryName: true, tags: true, readingMinutes: true, publishedAt: true, createdAt: true },
  });
  return posts;
}
export async function incrementBlogView(slug: string) {
  await db.blogPost.updateMany({ where: { slug, deletedAt: null }, data: { views: { increment: 1 } } });
}
