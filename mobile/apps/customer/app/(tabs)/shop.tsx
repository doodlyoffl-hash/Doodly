/* =============================================================
   DOODLY Customer — shop.
   Prices come from GET /api/catalogue, which is DB-authoritative: an
   admin price change reaches the app with no release. Nothing here
   hardcodes a price.

   Out-of-stock and coming-soon variants stay VISIBLE but unbuyable —
   hiding them makes the range look thinner than it is, and a customer
   who came looking for Kova should see that it exists.
   ============================================================= */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Money, Badge, useTheme } from "@doodly/ui";
import {
  getCatalogue, variantsFor, variantPricePaise, isBuyable, isTrial, ApiError,
  type Catalogue, type CatalogueProduct,
} from "@doodly/core";

export default function ShopScreen() {
  const { colors, space, radius } = useTheme();
  const router = useRouter();

  const [cat, setCat] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try { setCat(await getCatalogue()); }
    catch (e) {
      setError(e instanceof ApiError && e.code === "offline"
        ? "You're offline. Showing what we last loaded."
        : "Couldn't load the catalogue.");
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const products = useMemo(() => {
    const all = (cat?.products ?? []).filter((p) => p.visible);
    const needle = q.trim().toLowerCase();
    const matched = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
    // Featured first, then available before coming-soon.
    return matched.sort((a, b) =>
      Number(b.featured) - Number(a.featured) ||
      Number(a.status !== "available") - Number(b.status !== "available"));
  }, [cat, q]);

  return (
    <Screen scroll onRefresh={load} refreshing={loading && !!cat}>
      <Text variant="h1" style={{ marginBottom: space.base }}>Shop</Text>

      <View style={{ marginBottom: space.lg }}>
        <View style={{
          flexDirection: "row", alignItems: "center", gap: space.sm,
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
          borderRadius: radius.pill, paddingHorizontal: space.base,
        }}>
          <Ionicons name="search" size={18} color={colors.ink3} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Milk, paneer, ghee, curd, kova"
            placeholderTextColor={colors.ink3}
            style={{ flex: 1, paddingVertical: 12, color: colors.ink, fontFamily: "HankenGrotesk_400Regular", fontSize: 15 }}
            returnKeyType="search"
            autoCorrect={false}
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.ink3} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <Card elevated={false} style={{ marginBottom: space.md, backgroundColor: colors.goldSoft, borderColor: colors.gold }}>
          <Text variant="small" tone="muted">{error}</Text>
        </Card>
      ) : null}

      <View style={{ gap: space.md }}>
        {products.map((p) => (
          <ProductCard key={p.slug} product={p} cat={cat!} onPress={() => router.push(`/product/${p.slug}`)} />
        ))}
      </View>

      {!loading && !products.length ? (
        <Card>
          <Text variant="h3" center>Nothing found</Text>
          <Text variant="small" tone="muted" center style={{ marginTop: space.xs }}>
            {q ? `No products match “${q}”.` : "The catalogue is empty right now."}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function ProductCard({ product, cat, onPress }: { product: CatalogueProduct; cat: Catalogue; onPress: () => void }) {
  const { colors, space } = useTheme();
  const variants = variantsFor(cat, product.slug);
  const buyable = variants.filter((v) => isBuyable(v, product));
  const cheapest = buyable[0];
  const comingSoon = product.status !== "available";
  const outOfStock = !comingSoon && !buyable.length && variants.length > 0;

  return (
    <Pressable onPress={comingSoon ? undefined : onPress} disabled={comingSoon}>
      <Card style={comingSoon ? { opacity: 0.65 } : undefined}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text variant="h3">{product.name}</Text>
              {product.featured && !comingSoon ? <Badge label="Popular" intent="brand" /> : null}
            </View>

            {comingSoon ? (
              <Text variant="small" tone="muted">Coming soon</Text>
            ) : outOfStock ? (
              <Text variant="small" tone="danger">Out of stock</Text>
            ) : cheapest ? (
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Text variant="small" tone="muted">from</Text>
                <Money paise={variantPricePaise(cheapest)} variant="bodyMed" />
                <Text variant="caption" tone="subtle">
                  {isTrial(cheapest) ? `· ${cheapest.fixedDays}-day trial` : "· per bottle / day"}
                </Text>
              </View>
            ) : (
              <Text variant="small" tone="muted">Currently unavailable</Text>
            )}

            {buyable.length > 1 ? (
              <Text variant="caption" tone="subtle">{buyable.length} sizes available</Text>
            ) : null}
          </View>

          {!comingSoon ? <Ionicons name="chevron-forward" size={18} color={colors.ink3} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}
