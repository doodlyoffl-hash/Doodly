/* Client-safe shapes for the admin Bulk Orders board (no server-only imports).
   Dates arrive as ISO strings over JSON. */

export interface BulkRow {
  id: string;
  code: string;
  fullName: string;
  mobile: string;
  email: string | null;
  eventType: string;
  eventDate: string;
  deliveryTime: string;
  deliveryAddress: string;
  city: string;
  pincode: string;
  quantity: number;
  unit: string;
  additionalRequirements: string | null;
  preferredContact: string;
  specialInstructions: string | null;
  status: string;
  createdAt: string;
  assignedToId: string | null;
  assignedTo: { name: string | null } | null;
}

export interface BulkStatsData {
  total: number;
  new: number;
  contacted: number;
  quotationSent: number;
  confirmed: number;
  scheduled: number;
  delivered: number;
  cancelled: number;
}

export interface BulkListResponse {
  requests: BulkRow[];
  stats: BulkStatsData;
}
