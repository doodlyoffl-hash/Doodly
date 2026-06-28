import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/site/PageHeader";
import { Stagger, StaggerItem } from "@/components/motion/Motion";
import { products } from "@/config/catalogue";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Our Products",
  description: "Fresh A2 buffalo milk in glass bottles, plus curd, paneer, kova and ghee made from the same single-source milk. Farm fresh, no preservatives.",
  alternates: { canonical: "/products" },
};

export default function ProductsPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }])} />
      <PageHeader
        eyebrow="Our products"
        title="Made from one honest source."
        sub="Everything starts with our single-source A2 buffalo milk — chilled within minutes and bottled in glass."
      />
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const available = p.status === "AVAILABLE";
            return (
              <StaggerItem key={p.slug}>
                <Link
                  href={`/products/${p.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-mint-soft bg-white transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative grid h-52 place-items-center overflow-hidden bg-gradient-to-b from-mint-soft to-white">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} width={160} height={300} className="h-40 w-auto drop-shadow-xl transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <span className="text-6xl" aria-hidden>{p.emoji}</span>
                    )}
                    <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold ${available ? "bg-leaf text-white" : "bg-gold-soft text-gold"}`}>
                      {available ? "Available now" : "Coming soon"}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="font-display text-xl font-semibold text-forest">{p.name}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{p.description}</p>
                    <span className="mt-4 text-sm font-semibold text-leaf-600 group-hover:underline">
                      {available ? "View & subscribe →" : "Notify me →"}
                    </span>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>
    </>
  );
}
