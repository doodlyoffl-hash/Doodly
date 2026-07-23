/* =============================================================
   DOODLY mobile — customer account APIs.
   Typed against the real handlers. Note the envelope inconsistency the
   client already absorbs: /api/account/* wraps in {ok,data} while
   /api/wallet returns its payload raw.

   All money is PAISE (the catalogue is the one exception — see
   catalogue.ts).
   ============================================================= */
import { api } from "./client";

/* ------------------------------------------------------------- dashboard */

export interface AccountSummary {
  name: string | null;
  walletPaise: number;
  loyaltyPoints: number;
  bottlesPending: number;
  nextDelivery: { date: string; status: string; slot: string | null } | null;
  activeSubscription: {
    id: string;
    planName: string;
    status: string;
    nextDeliveryAt: string | null;
    items: { qty: number; label: string; product: string }[];
  } | null;
  counts: { orders: number; deliveries: number; invoices: number };
}

export async function getSummary(): Promise<AccountSummary> {
  const r = await api.get<{ summary: AccountSummary }>("/api/account/summary");
  return r.summary;
}

/* --------------------------------------------------------------- profile */

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  dob?: string | null;
  role: string;
  walletPaise?: number;
  loyaltyPoints?: number;
  referralCode?: string | null;
}

export async function getProfile(): Promise<Profile> {
  return api.get<Profile>("/api/account/profile");
}

export async function updateProfile(patch: Partial<Pick<Profile, "name" | "email" | "phone" | "dob">>): Promise<Profile> {
  return api.patch<Profile>("/api/account/profile", patch);
}

/* ------------------------------------------------------------- settings */

export interface NotificationSettings {
  emailOptIn: boolean;
  smsOptIn: boolean;
  whatsappOptIn: boolean;
  pushOptIn: boolean;
  marketingOptIn: boolean;
  language: string;
  preferredSlot: string | null;
}

export async function getSettings(): Promise<NotificationSettings> {
  const r = await api.get<{ settings: NotificationSettings }>("/api/account/settings");
  return r.settings;
}

export async function updateSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const r = await api.patch<{ settings: NotificationSettings }>("/api/account/settings", patch);
  return r.settings;
}

/* ------------------------------------------------------------- addresses */

export interface Address {
  id: string;
  label: string | null;
  contactName: string | null;
  contactPhone: string | null;
  line1: string;
  line2: string | null;
  houseNo: string | null;
  buildingName: string | null;
  street: string | null;
  landmark: string | null;
  area: string | null;
  city: string;
  state: string | null;
  pincode: string;
  lat: number | null;
  lng: number | null;
  deliveryNote: string | null;
  isDefault?: boolean;
}

export async function listAddresses(): Promise<Address[]> {
  const r = await api.get<{ addresses: Address[] } | Address[]>("/api/addresses");
  return Array.isArray(r) ? r : r.addresses;
}

/** line1 has a minimum length server-side (lib/b2b/validation.ts min 4) —
 *  a 2-character line is rejected, which is easy to hit with "A1". */
export async function createAddress(input: Partial<Address>): Promise<Address> {
  return api.post<Address>("/api/addresses", input);
}

export async function updateAddress(id: string, patch: Partial<Address>): Promise<Address> {
  return api.patch<Address>(`/api/addresses/${encodeURIComponent(id)}`, patch);
}

export async function deleteAddress(id: string): Promise<void> {
  await api.del(`/api/addresses/${encodeURIComponent(id)}`);
}

/** Serviceability gate — checkout is blocked for a pincode we don't deliver to. */
export async function checkServiceable(pincode: string): Promise<{ serviceable: boolean; message?: string }> {
  return api.get<{ serviceable: boolean; message?: string }>(
    `/api/delivery/check?pincode=${encodeURIComponent(pincode)}`,
    { anonymous: true },
  );
}

/* ---------------------------------------------------------------- wallet */

export interface WalletTxn {
  id: string;
  type: string;
  amountPaise: number;
  note: string | null;
  createdAt: string;
}

export interface Wallet {
  balancePaise: number;
  transactions: WalletTxn[];
}

/** NB: /api/wallet returns its payload RAW (no {ok,data} envelope) and uses
 *  a differently-named identity guard. The client tolerates both shapes. */
export async function getWallet(): Promise<Wallet> {
  return api.get<Wallet>("/api/wallet");
}

/* -------------------------------------------------------------- rewards */

export interface Rewards {
  points: number;
  tier: string;
  redeemableValuePaise: number;
  history: { id: string; points: number; reason: string; createdAt: string }[];
}

export async function getRewards(): Promise<Rewards> {
  return api.get<Rewards>("/api/account/rewards");
}

/* ------------------------------------------------------------- referrals */

export interface Referrals {
  code: string;
  shareUrl: string;
  referred: { name: string | null; status: string; rewardPaise: number; createdAt: string }[];
  rewardPolicy?: { amountPaise: number; note?: string };
}

export async function getReferrals(): Promise<Referrals> {
  return api.get<Referrals>("/api/account/referrals");
}

/* -------------------------------------------------------- notifications */

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  channel: string;
  readAt: string | null;
  createdAt: string;
}

export async function getInbox(): Promise<{ notifications: InboxItem[]; unread: number }> {
  return api.get<{ notifications: InboxItem[]; unread: number }>("/api/notifications");
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await api.patch("/api/notifications", ids?.length ? { ids } : { all: true });
}

/* ------------------------------------------------------ push registration */

export interface RegisteredDevice {
  id: string;
  platform: string;
  app: string;
  deviceName: string | null;
  lastSeenAt: string;
}

/** Called on every launch after permission is granted — the provider can
 *  rotate a token at any time and a stale one silently stops delivering. */
export async function registerDevice(input: {
  token: string;
  platform: "ios" | "android";
  app: "customer" | "driver";
  deviceName?: string | null;
  appVersion?: string | null;
}): Promise<{ device: RegisteredDevice }> {
  return api.post<{ device: RegisteredDevice }>("/api/devices", input);
}

/** Called on sign-out so a handed-over phone stops receiving this user's
 *  notifications. Best-effort: never block sign-out on it. */
export async function unregisterDevice(token: string): Promise<void> {
  await api.del("/api/devices", { token });
}
