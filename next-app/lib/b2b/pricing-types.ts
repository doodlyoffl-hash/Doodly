/* Client-safe B2B-pricing types. Money is integer paise; bps = basis points. */

export interface PricingRow {
  id: string;
  code: string;
  businessId: string;
  businessCode: string;
  businessName: string;
  businessActive: boolean;
  productSlug: string;
  productName: string;
  variantLabel: string | null;
  unit: string;
  minQty: number;
  basePricePaise: number;
  b2bPricePaise: number;
  gstBps: number;
  discountBps: number;
  effectivePaise: number;
  effectiveWithGstPaise: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  active: boolean;
  deleted: boolean;
  updatedAt: string;
  updatedById: string | null;
}

export interface PricingListResponse {
  pricing: PricingRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface PricingHistoryRow {
  id: string;
  action: string;
  oldB2bPaise: number | null;
  newB2bPaise: number;
  oldGstBps: number | null;
  newGstBps: number;
  reason: string | null;
  byRole: string | null;
  createdAt: string;
}

export interface PricingDetailResponse {
  pricing: PricingRow & { history: PricingHistoryRow[] };
}

export interface PricingProduct {
  slug: string;
  name: string;
  units: string[];
  primaryUnit: string;
  basePricePaise: number;
}

export interface PricingReports {
  totalRules: number;
  activeRules: number;
  businessesCovered: number;
  avgDiscountBps: number;
  byBusiness: { code?: string; name?: string; rules: number; avgB2bPaise: number }[];
  byProduct: { name: string; rules: number; avgB2bPaise: number; avgBasePaise: number }[];
}
