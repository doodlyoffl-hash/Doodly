/* Client-safe Live Order Status payload (no server imports). Dates are ISO
   strings; money is integer paise. The banner renders entirely from this. */
import type { LiveStatus } from "./engine";

export interface DriverInfo { name: string | null; rating: number; vehicleNo: string | null }

export interface DeliveryInfo {
  date: string;
  slot: string | null;
  rawStatus: string;          // operational DeliveryStatus
  driver: DriverInfo | null;
}

export interface SubscriptionInfo {
  productLabel: string;       // "A2 Buffalo Milk"
  sizeLabel: string;          // "1000 ml"
  qty: number;
  slot: string | null;
  nextDeliveryAt: string | null;
  daysRemaining: number;
  status: string;             // SubStatus
  canPause: boolean;
}

export interface LiveStatusActive {
  active: true;
  status: LiveStatus;
  stageIndex: number;
  whenLabel: string | null;
  eta: { minutes: number | null; arriving: boolean } | null;
  delivery: DeliveryInfo | null;
  subscription: SubscriptionInfo | null;
  lastDelivered: { date: string } | null;
  order: { id: string; totalPaise: number } | null;
  updatedAt: string;
}
export interface LiveStatusInactive { active: false }
export type LiveStatusResponse = LiveStatusActive | LiveStatusInactive;
