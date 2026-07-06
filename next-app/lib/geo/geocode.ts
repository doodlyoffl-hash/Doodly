/* =============================================================
   DOODLY — server-side geocoding (keyless).
   Turns a delivery address into { lat, lng } so the customer's live
   tracking map has a destination even when no Google Maps key is set.
   Uses OpenStreetMap Nominatim (free, no key) — best-effort: returns
   null on any failure/timeout, never throws. If a Google Maps JS key
   is present the browser picker already supplies precise coords, so
   this is only the no-key fallback. Respect Nominatim's usage policy:
   descriptive User-Agent, India-scoped, one lookup per address (cached
   to Address.lat/lng by callers so it never repeats).
   ============================================================= */
import "server-only";

export interface Geo { lat: number; lng: number }

export interface AddrParts {
  houseNo?: string | null; buildingName?: string | null; street?: string | null;
  area?: string | null; landmark?: string | null; city?: string | null;
  pincode?: string | null; line1?: string | null; line2?: string | null;
}

/** Build a geocoder-friendly query from an address (skip flat/house no — too granular for OSM). */
export function addressQuery(a: AddrParts): string {
  return [a.buildingName, a.street, a.area, a.landmark, a.city, a.pincode, "India"]
    .map((s) => (s ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
}

export async function geocode(query: string): Promise<Geo | null> {
  const q = (query || "").trim();
  if (q.length < 5) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=" + encodeURIComponent(q);
    const res = await fetch(url, {
      headers: { "User-Agent": "DOODLY-Delivery/1.0 (https://doodly.in; support@doodly.in)", "Accept-Language": "en" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = Array.isArray(j) ? j[0] : null;
    if (hit && hit.lat && hit.lon) {
      const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
  } catch {
    return null; // network/abort → best-effort null
  } finally {
    clearTimeout(timer);
  }
}

/** Geocode straight from address parts (convenience). */
export function geocodeAddress(a: AddrParts): Promise<Geo | null> {
  return geocode(addressQuery(a));
}
