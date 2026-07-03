/* Shape returned by GET /api/deliveries — shared by the Deliveries,
   Tracking and Calendar views. */
export interface Delivery {
  id: string;
  date: string;
  status: string;
  slot: string | null;
  sequence: number | null;
  deliveredAt: string | null;
  bottlesOut: number;
  bottlesIn: number;
  customerRemark: string | null;
  driver: { name: string | null } | null;
}
