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
  /** Active auto-assignment strategy (EQUAL = Startup Mode, CAPACITY, AREA, MANUAL). */
  strategy: string;
  totals: {
    orders: number;
    totalBottles: number;
    assignedBottles: number;
    pendingBottles: number;
    queueCount: number;
    completedDeliveries: number;
    totalExecutives: number;
    /** Order-count view for the admin dashboard (Startup Mode KPIs). */
    assignedOrders: number;
    unassignedOrders: number;
    completionPct: number;
  };
  executiveCounts: { available: number; onRoute: number; returned: number; offline: number };
  executives: ExecCardData[];
  queue: QueueChip[];
}
