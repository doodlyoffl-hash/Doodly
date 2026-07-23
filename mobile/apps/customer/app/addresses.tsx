/* =============================================================
   DOODLY Customer — delivery addresses.
   Serviceability is checked BEFORE saving: DOODLY only delivers to
   specific pincodes, and letting someone save an unserviceable address
   just moves the disappointment to checkout — after they've chosen a
   plan. The server re-checks on save regardless; this is the friendly
   half of the same rule.

   `line1` has a 4-character minimum server-side, which "A1" trips.
   ============================================================= */
import React, { useCallback, useEffect, useState } from "react";
import { View, TextInput, Pressable, Alert, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Text, Button, Badge, useTheme } from "@doodly/ui";
import {
  listAddresses, createAddress, deleteAddress, checkServiceable, ApiError,
  type Address,
} from "@doodly/core";

export default function AddressesScreen() {
  const { colors, space, radius } = useTheme();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setAddresses(await listAddresses()); }
    catch { /* empty state covers it */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function confirmDelete(a: Address) {
    Alert.alert("Remove address?", `${a.label ?? "This address"} will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await deleteAddress(a.id); await load(); }
          catch (e) { Alert.alert("Couldn't remove", e instanceof Error ? e.message : "Please try again."); }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Addresses" }} />
      <Screen scroll onRefresh={load} refreshing={loading}>
        {adding ? (
          <AddressForm
            onCancel={() => setAdding(false)}
            onSaved={async () => { setAdding(false); await load(); }}
          />
        ) : (
          <Button label="Add a new address" onPress={() => setAdding(true)} fullWidth style={{ marginBottom: space.lg }} />
        )}

        <View style={{ gap: space.md }}>
          {addresses.map((a) => (
            <Card key={a.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
                <View style={{ flex: 1, gap: space.xs }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Text variant="bodyMed">{a.label ?? "Address"}</Text>
                    {a.isDefault ? <Badge label="Default" intent="brand" /> : null}
                  </View>
                  <Text variant="small" tone="muted">
                    {[a.houseNo, a.line1, a.line2, a.area, a.city, a.pincode].filter(Boolean).join(", ")}
                  </Text>
                  {a.landmark ? <Text variant="caption" tone="subtle">Near {a.landmark}</Text> : null}
                  {a.deliveryNote ? <Text variant="caption" tone="subtle">“{a.deliveryNote}”</Text> : null}
                </View>
                <Pressable onPress={() => confirmDelete(a)} hitSlop={10} accessibilityLabel="Remove address">
                  <Ionicons name="trash-outline" size={18} color={colors.ink3} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>

        {!loading && !addresses.length && !adding ? (
          <Card>
            <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
              <Ionicons name="location-outline" size={26} color={colors.ink3} />
              <Text variant="h3" center>No addresses yet</Text>
              <Text variant="small" tone="muted" center>Add one so we know where to deliver.</Text>
            </View>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function AddressForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const { colors, space, radius } = useTheme();
  const [f, setF] = useState({
    label: "Home", line1: "", area: "", city: "", pincode: "",
    landmark: "", deliveryNote: "", contactName: "", contactPhone: "",
  });
  const [checking, setChecking] = useState(false);
  const [serviceable, setServiceable] = useState<null | { ok: boolean; msg: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (v: string) => { setF((p) => ({ ...p, [k]: v })); if (k === "pincode") setServiceable(null); };

  async function verifyPincode(pin: string) {
    if (pin.length !== 6) return;
    setChecking(true);
    try {
      const r = await checkServiceable(pin);
      setServiceable({
        ok: !!r.serviceable,
        msg: r.serviceable ? "We deliver here" : (r.message ?? "We don't deliver to this pincode yet."),
      });
    } catch { setServiceable(null); }
    finally { setChecking(false); }
  }

  async function save() {
    setError(null);
    if (f.line1.trim().length < 4) { setError("Address line must be at least 4 characters."); return; }
    if (f.pincode.length !== 6) { setError("Enter a valid 6-digit pincode."); return; }
    if (serviceable && !serviceable.ok) { setError(serviceable.msg); return; }

    setBusy(true);
    try {
      await createAddress({
        label: f.label.trim() || "Home",
        line1: f.line1.trim(),
        area: f.area.trim() || null,
        city: f.city.trim(),
        pincode: f.pincode,
        landmark: f.landmark.trim() || null,
        deliveryNote: f.deliveryNote.trim() || null,
        contactName: f.contactName.trim() || null,
        contactPhone: f.contactPhone.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save this address.");
    } finally { setBusy(false); }
  }

  const input = {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.sm, paddingHorizontal: space.base, paddingVertical: 12,
    color: colors.ink, fontFamily: "HankenGrotesk_400Regular", fontSize: 15,
  } as const;

  return (
    <Card style={{ marginBottom: space.lg }}>
      <Text variant="h3" style={{ marginBottom: space.base }}>New address</Text>
      <View style={{ gap: space.md }}>
        <Field label="Label"><TextInput value={f.label} onChangeText={set("label")} style={input} placeholder="Home, Office…" placeholderTextColor={colors.ink3} /></Field>
        <Field label="Flat / house & building"><TextInput value={f.line1} onChangeText={set("line1")} style={input} placeholder="12B, Green Residency" placeholderTextColor={colors.ink3} /></Field>
        <Field label="Area"><TextInput value={f.area} onChangeText={set("area")} style={input} placeholder="Madhapur" placeholderTextColor={colors.ink3} /></Field>
        <Field label="City"><TextInput value={f.city} onChangeText={set("city")} style={input} placeholder="Hyderabad" placeholderTextColor={colors.ink3} /></Field>

        <Field label="Pincode">
          <TextInput
            value={f.pincode}
            onChangeText={(t) => { const v = t.replace(/\D/g, "").slice(0, 6); set("pincode")(v); if (v.length === 6) void verifyPincode(v); }}
            style={input} placeholder="500081" placeholderTextColor={colors.ink3}
            keyboardType="number-pad" maxLength={6}
          />
          {checking ? <Text variant="caption" tone="subtle">Checking…</Text> : null}
          {serviceable ? (
            <Text variant="caption" tone={serviceable.ok ? "success" : "danger"}>{serviceable.msg}</Text>
          ) : null}
        </Field>

        <Field label="Landmark (optional)"><TextInput value={f.landmark} onChangeText={set("landmark")} style={input} placeholder="Opposite the park" placeholderTextColor={colors.ink3} /></Field>
        <Field label="Delivery note (optional)">
          <TextInput value={f.deliveryNote} onChangeText={set("deliveryNote")} style={input} placeholder="Leave at the door, don't ring the bell" placeholderTextColor={colors.ink3} />
        </Field>

        {error ? <Text variant="small" tone="danger">{error}</Text> : null}

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
          <Button label="Save address" onPress={save} loading={busy} disabled={busy || (serviceable ? !serviceable.ok : false)} style={{ flex: 1 }} />
        </View>
      </View>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="muted">{label}</Text>
      {children}
    </View>
  );
}
