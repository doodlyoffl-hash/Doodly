/* =============================================================
   DOODLY Customer — product detail.

   The price shown here is an ESTIMATE and is labelled as one. The
   server prices the order for real at checkout from config/catalogue.ts
   + lib/pricing.ts; showing a number the client computed as if it were
   final is how a customer ends up disputing their bill. The estimate
   exists so nobody has to reach checkout to learn roughly what it costs.

   Units, per the DOODLY conventions:
   • dailyPrice is per ONE bottle, per delivery day
   • bottles is per DELIVERY, not the total across the plan
   ============================================================= */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Card, Text, Money, Button, Badge, useTheme } from "@doodly/ui";
import {
  getCatalogue, variantsFor, variantPricePaise, isBuyable, isTrial,
  type Catalogue, type CatalogueVariant, type CataloguePlan,
} from "@doodly/core";

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, space, radius } = useTheme();
  const router = useRouter();

  const [cat, setCat] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [bottles, setBottles] = useState(1);

  const load = useCallback(async () => {
    try { setCat(await getCatalogue()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const product = cat?.products.find((p) => p.slug === slug) ?? null;
  const variants = useMemo(
    () => (cat && product ? variantsFor(cat, product.slug).filter((v) => isBuyable(v, product)) : []),
    [cat, product],
  );
  const variant = variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
  const plans = useMemo(() => (cat?.plans ?? []).filter((p) => p.active), [cat]);
  const plan = plans.find((p) => p.id === planId) ?? null;

  // Trial packs are a fixed one-off — no plan, no bottle count.
  const trial = variant ? isTrial(variant) : false;

  const estimatePaise = useMemo(() => {
    if (!variant) return 0;
    if (isTrial(variant)) return variantPricePaise(variant);
    const perBottlePerDay = variantPricePaise(variant);
    const days = plan?.days ?? 1;
    const gross = perBottlePerDay * bottles * days;
    return Math.round(gross * (1 - (plan?.discount ?? 0)));
  }, [variant, plan, bottles]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "" }} />
        <Screen><Text tone="muted">Loading…</Text></Screen>
      </>
    );
  }

  if (!product || !variant) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "" }} />
        <Screen>
          <Card>
            <Text variant="h3">Not available</Text>
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>
              This product isn&apos;t available right now.
            </Text>
            <Button label="Back to shop" onPress={() => router.back()} style={{ marginTop: space.base }} />
          </Card>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: product.name }} />
      <Screen
        scroll
        footer={
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.base }}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="subtle">Estimated total</Text>
              <Money paise={estimatePaise} variant="h2" />
            </View>
            <Button
              label="Continue"
              onPress={() => router.push({
                pathname: "/checkout",
                params: {
                  variantId: variant.id,
                  planId: trial ? "" : (plan?.id ?? ""),
                  bottles: String(trial ? 1 : bottles),
                },
              })}
            />
          </View>
        }
      >
        <View style={{ gap: space.xs, marginBottom: space.lg }}>
          <Text variant="h1">{product.name}</Text>
          <Text variant="small" tone="muted">
            {trial
              ? `${(variant as { fixedDays: number }).fixedDays}-day trial pack — try DOODLY with no commitment.`
              : "Fresh A2 milk delivered to your door every morning."}
          </Text>
        </View>

        {/* size */}
        <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Choose a size</Text>
        <View style={{ gap: space.sm, marginBottom: space.lg }}>
          {variants.map((v) => (
            <Selectable
              key={v.id}
              selected={v.id === variant.id}
              onPress={() => { setVariantId(v.id); if (isTrial(v)) setPlanId(null); }}
              title={v.label}
              subtitle={isTrial(v) ? `${v.fixedDays}-day pack` : "per bottle, per day"}
              right={<Money paise={variantPricePaise(v)} variant="bodyMed" />}
              note={v.stock !== null && v.stock <= 5 ? `Only ${v.stock} left` : undefined}
            />
          ))}
        </View>

        {/* plan + quantity only apply to subscriptions */}
        {!trial ? (
          <>
            <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Choose a plan</Text>
            <View style={{ gap: space.sm, marginBottom: space.lg }}>
              {plans.map((p) => (
                <Selectable
                  key={p.id}
                  selected={p.id === plan?.id}
                  onPress={() => setPlanId(p.id)}
                  title={p.name}
                  subtitle={`${p.days} deliveries`}
                  right={p.discount > 0 ? <Badge label={`${Math.round(p.discount * 100)}% off`} intent="brand" /> : undefined}
                  note={p.tag ?? undefined}
                />
              ))}
            </View>

            <Text variant="label" tone="muted" style={{ marginBottom: space.sm }}>Bottles per delivery</Text>
            <Card style={{ marginBottom: space.lg }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="small" tone="muted">How many each day?</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.base }}>
                  <Stepper value={bottles} min={1} max={20} onChange={setBottles} />
                </View>
              </View>
            </Card>
          </>
        ) : null}

        {/* deposit — a real, refundable charge customers must not be surprised by */}
        {cat && cat.bottleDepositPaise > 0 ? (
          <Card elevated={false} style={{ backgroundColor: colors.goldSoft, borderColor: colors.gold, marginBottom: space.md }}>
            <Text variant="small" tone="muted">
              A refundable bottle deposit of{" "}
              <Money paise={cat.bottleDepositPaise} variant="small" tone="default" />{" "}
              is added to your first order. You get it back when you return the bottles.
            </Text>
          </Card>
        ) : null}

        <Text variant="caption" tone="subtle">
          The final price, including any coupon, wallet credit and deposit, is confirmed at checkout.
        </Text>
      </Screen>
    </>
  );
}

function Selectable({
  selected, onPress, title, subtitle, right, note,
}: {
  selected: boolean; onPress: () => void;
  title: string; subtitle?: string; right?: React.ReactNode; note?: string;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: space.md,
        padding: space.base, borderRadius: radius.md,
        backgroundColor: selected ? colors.mintSoft : colors.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.leaf : colors.line,
      }}>
        <View style={{
          width: 20, height: 20, borderRadius: 10,
          borderWidth: 2, borderColor: selected ? colors.leaf : colors.line,
          alignItems: "center", justifyContent: "center",
        }}>
          {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.leaf }} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyMed">{title}</Text>
          {subtitle ? <Text variant="caption" tone="subtle">{subtitle}</Text> : null}
          {note ? <Text variant="caption" tone="warning">{note}</Text> : null}
        </View>
        {right}
      </View>
    </Pressable>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const { colors, radius, space } = useTheme();
  const btn = {
    width: 40, height: 40, borderRadius: radius.sm,
    backgroundColor: colors.mintSoft,
    alignItems: "center" as const, justifyContent: "center" as const,
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={btn} accessibilityLabel="Fewer bottles">
        <Text variant="h3" tone="brand">−</Text>
      </Pressable>
      <Text variant="h3" style={{ minWidth: 28, textAlign: "center" }}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={btn} accessibilityLabel="More bottles">
        <Text variant="h3" tone="brand">+</Text>
      </Pressable>
    </View>
  );
}
