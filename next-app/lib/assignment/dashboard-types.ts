/* Shared dashboard shapes (no server-only imports) so client components can
   type the API response without pulling the service/Prisma into the bundle. */

export interface DeliveryChip {
  deliveryId: string;
  bottles: number;
  sequence: number | null;
  locked: boolean;
  status: string;
  area: string | null;
}

export interface ExecCardData {
  driverId: string;
  name: string;
  availability: string;
  capacity: number;
  assignedBottles: number;
  stops: number;
  pct: number;
  deliveries: DeliveryChip[];
}

export interface QueueChip {
  deliveryId: string;
  bottles: number;
  area: string | null;
  reason: string | null;
  priority: number;
}

export interface DashboardData {
  totals: {
    orders: number;
    totalBottles: number;
    assignedBottles: number;
    pendingBottles: number;
    queueCount: number;
    completedDeliveries: number;
    totalExecutives: number;
  };
  executiveCounts: { available: number; onRoute: number; returned: number; offline: number };
  executives: ExecCardData[];
  queue: QueueChip[];
}
