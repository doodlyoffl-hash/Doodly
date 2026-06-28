import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { products, variants } from "@/config/catalogue";
import { inr } from "@/lib/pricing";
import { JsonLd } from "@/components/seo/JsonLd";
import { productLd, breadcrumbLd } from "@/lib/seo";

// Pre-render every known product at build time; 404 anything else.
export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = products.find((p) => p.slug === params.slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const title = `${product.name} — Fresh A2 Buffalo Milk`;
  const description = `${product.description} ${product.status === "AVAILABLE" ? "Order in returnable glass bottles, delivered by 7 AM." : "Launching soon — made from the same A2 milk."}`;
  const canonical = `/products/${product.slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = products.find((p) => p.slug === params.slug);
  if (!product) notFound();

  const firstSub = variants.find((v) => v.productSlug === product.slug && v.dailyPaise != null);
  const schema = [
    breadcrumbLd([
      { name: "Home", path: "/" },
      { name: "Products", path: "/products" },
      { name: product.name, path: `/products/${product.slug}` },
    ]),
    productLd({
      name: product.name, description: product.description, slug: product.slug,
      image: product.image, available: product.status === "AVAILABLE", pricePaise: firstSub?.dailyPaise,
    }),
  ];

  if (product.status !== "AVAILABLE") {
    return (
      <section className="mx-auto max-w-2xl px-5 py-24 text-center">
        <JsonLd data={schema} />
        <div className="text-6xl">{product.emoji}</div>
        <span className="mt-4 inline-block rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">Coming soon</span>
        <h1 className="mt-4 font-display text-3xl text-forest">{product.name} is on the way</h1>
        <p className="mt-3 text-ink-2">{product.description} Made from the same A2 milk. We&apos;ll tell you the moment it launches.</p>
        <p className="mt-6 text-sm text-ink-3">Admins flip <code>status → AVAILABLE</code> and this page becomes orderable. Zero code change.</p>
      </section>
    );
  }

  const milkVariants = variants.filter((v) => v.productSlug === product.slug);
  return (
    <section className="mx-auto grid max-w-[1200px] gap-10 px-5 py-16 md:grid-cols-2">
      <JsonLd data={schema} />
      <div className="grid place-items-center rounded-[36px] bg-gradient-to-b from-[#Dff3e6] to-white p-8">
        <Image src={product.image || "/products/milk-bottle.png"} alt={product.name} width={400} height={763} priority className="h-[420px] w-auto drop-shadow-2xl" />
      </div>
      <div>
        <h1 className="font-display text-4xl text-forest">{product.name}</h1>
        <p className="mt-2 text-amber-600">★★★★★ 4.9 · 312 reviews</p>
        <p className="mt-4 text-lg text-ink-2">{product.description}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {milkVariants.map((v) => (
            <div key={v.id} className="rounded-[20px] border border-mint-soft p-4 text-center">
              <div className="font-semibold text-forest">{v.label}</div>
              <div className="mt-1 text-sm font-bold text-leaf-600">
                {v.type === "TRIAL" ? `${inr(v.fixedPaise!)} fixed` : `${inr(v.dailyPaise!)}/day`}
              </div>
            </div>
          ))}
        </div>
        <Link href="/subscriptions" className="mt-6 inline-block rounded-full bg-leaf px-6 py-3 font-semibold text-white">Subscribe &amp; save</Link>
      </div>
    </section>
  );
}
