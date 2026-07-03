/* Shared response shapes for the admin Products (PIM) module. */

export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  status: string;
  visible: boolean;
  featured: boolean;
  variantCount: number;
  sku: string | null;            // first variant's SKU (representative)
  mrpPaise: number | null;
  sellingPaise: number | null;
  discountBps: number;
  taxBps: number;
  stock: number;                 // sum across variants
  reservedStock: number;
  availableStock: number;
  lowStockThreshold: number;
  lowStock: boolean;
  outOfStock: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ProductFacets {
  categories: { id: string; name: string }[];
}

export interface ProductListResponse {
  products: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: ProductFacets;
}

export interface ProductStats {
  total: number;
  active: number;       // AVAILABLE
  inactive: number;     // HIDDEN/DISCONTINUED
  draft: number;
  comingSoon: number;
  featured: number;
  outOfStock: number;
  lowStock: number;
  totalStockValuePaise: number;  // Σ sellingPaise × stock
}

export interface ProductEventRow { id: string; type: string; summary: string; detail: unknown; byRole: string | null; createdAt: string }

export interface VariantRow {
  id: string; label: string; displayName: string | null; sku: string | null; ml: number; type: string;
  dailyPaise: number | null; fixedPaise: number | null; fixedDays: number | null;
  stock: number; reservedStock: number; availableStock: number; lowStockThreshold: number; weightG: number | null; barcode: string | null; active: boolean;
}
export interface ImageRow { id: string; url: string; alt: string | null; sortOrder: number; isFeatured: boolean }

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDesc: string | null;
  story: string | null;
  usage: string | null;
  storage: string | null;
  ingredients: string | null;
  allergens: string | null;
  status: string;
  visible: boolean;
  featured: boolean;
  category: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  tags: string[];
  lowStockThreshold: number;
  restockDate: string | null;
  launchDate: string | null;
  ratingValue: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  deletedAt: string | null;
  pricing: { mrpPaise: number; sellingPaise: number; costPaise: number | null; offerPaise: number | null; discountBps: number; taxBps: number; depositPaise: number; deliveryPaise: number } | null;
  variants: VariantRow[];
  images: ImageRow[];
  seo: { metaTitle: string | null; metaDescription: string | null; ogImageUrl: string | null; canonicalUrl: string | null; keywords: string[] } | null;
  nutrition: { fat: string | null; snf: string | null; protein: string | null; calcium: string | null; energy: string | null; carbs: string | null; sugar: string | null } | null;
  quality: { fatPct: string | null; snf: string | null; lactometer: string | null; storageTemp: string | null; milkType: string | null; animalType: string | null; expiry: string | null } | null;
  inventory: { stock: number; reserved: number; available: number; lowStock: boolean; outOfStock: boolean };
  events: ProductEventRow[];
}

export interface ProductReports {
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number; stock: number }[];
  lowStock: { id: string; name: string; variant: string; stock: number; threshold: number }[];
  outOfStock: { id: string; name: string }[];
  performance: { id: string; name: string; units: number; revenuePaise: number }[];
  availability: { available: number; comingSoon: number; outOfStock: number; total: number };
  stockValuePaise: number;
  rows: { slug: string; name: string; category: string; status: string; sku: string; stock: number; reserved: number; available: number; mrpRupees: number; sellingRupees: number; discountPct: number; gstPct: number; featured: string; updated: string }[];
}
