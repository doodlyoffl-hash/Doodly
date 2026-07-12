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

// ======================================================================
// Reverse geocoding + place search — powers the Swiggy-style pin picker.
// Provider-abstracted + fallback-safe: uses Google Geocoding when
// GOOGLE_MAPS_API_KEY is set (server-side; key never reaches the browser),
// else keyless OpenStreetMap Nominatim. Never throws → null on any failure.
// ======================================================================

const GKEY = () => { const v = process.env.GOOGLE_MAPS_API_KEY; return v && v.trim() ? v.trim() : undefined; };
const NOMINATIM_HEADERS = { "User-Agent": "DOODLY-Delivery/1.0 (https://doodly.in; support@doodly.in)", "Accept-Language": "en" };

/** Structured address resolved from coordinates (or a search hit). */
export interface ResolvedAddress {
  lat: number; lng: number;
  houseNo?: string; street?: string; area?: string; landmark?: string;
  city?: string; district?: string; state?: string; country?: string; pincode?: string;
  formatted?: string;
}

async function timedFetch(url: string, headers?: Record<string, string>, ms = 5000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { headers, signal: ctrl.signal, cache: "no-store" }); }
  catch { return null; }
  finally { clearTimeout(timer); }
}

const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** Normalise a postal code to a clean 6-digit Indian pincode (or undefined).
    Geocoders return codes like "520 010" / "520010, India" — the space/format
    used to break the serviceability lookup (a false "not serviceable"). This is
    the single place every reverse/search result gets its pincode cleaned. */
export function cleanPincode(raw?: string | null): string | undefined {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 6);
  return /^[1-9]\d{5}$/.test(d) ? d : undefined;
}

// ---- Nominatim (keyless) ----
type NomAddr = Record<string, string | undefined>;
function fromNominatim(lat: number, lng: number, a: NomAddr, display?: string): ResolvedAddress {
  return {
    lat, lng,
    houseNo: a.house_number,
    street: a.road || a.pedestrian || a.footway,
    area: a.neighbourhood || a.suburb || a.quarter || a.city_district || a.residential || a.hamlet || a.village,
    city: a.city || a.town || a.municipality || a.village || a.county,
    district: a.state_district || a.county,
    state: a.state,
    country: a.country,
    pincode: cleanPincode(a.postcode),
    formatted: display,
  };
}

// ---- Google (keyed) ----
type GComp = { long_name: string; short_name: string; types: string[] };
function fromGoogle(lat: number, lng: number, comps: GComp[], formatted?: string): ResolvedAddress {
  const get = (t: string) => comps.find((c) => c.types.includes(t))?.long_name;
  return {
    lat, lng,
    houseNo: get("street_number"),
    street: get("route"),
    area: get("neighborhood") || get("sublocality_level_1") || get("sublocality") || get("political"),
    city: get("locality") || get("administrative_area_level_2"),
    district: get("administrative_area_level_2"),
    state: get("administrative_area_level_1"),
    country: get("country"),
    pincode: cleanPincode(get("postal_code")),
    formatted,
  };
}

/** Coordinates → structured address. Google when keyed, else Nominatim. Null-safe. */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedAddress | null> {
  if (!validLatLng(lat, lng)) return null;
  const key = GKEY();
  if (key) {
    const res = await timedFetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=in&key=${key}`);
    const j = res && res.ok ? await res.json().catch(() => null) as { status?: string; results?: { address_components: GComp[]; formatted_address: string }[] } : null;
    const hit = j?.status === "OK" ? j.results?.[0] : null;
    if (hit) return fromGoogle(lat, lng, hit.address_components, hit.formatted_address);
    // fall through to Nominatim on any Google hiccup
  }
  const res = await timedFetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`, NOMINATIM_HEADERS);
  const j = res && res.ok ? await res.json().catch(() => null) as { address?: NomAddr; display_name?: string } : null;
  if (j?.address) return fromNominatim(lat, lng, j.address, j.display_name);
  return null;
}

export interface PlaceHit { label: string; lat: number; lng: number; pincode?: string; area?: string; city?: string; state?: string }

/** Free-text place search (India-scoped) → ranked suggestions with coords. Null-safe → []. */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = (query || "").trim();
  if (q.length < 3) return [];
  const key = GKEY();
  if (key) {
    const res = await timedFetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=in&components=country:IN&key=${key}`);
    const j = res && res.ok ? await res.json().catch(() => null) as { status?: string; results?: { geometry: { location: { lat: number; lng: number } }; formatted_address: string; address_components: GComp[] }[] } : null;
    if (j?.status === "OK" && j.results?.length) {
      return j.results.slice(0, 6).map((r) => {
        const g = fromGoogle(r.geometry.location.lat, r.geometry.location.lng, r.address_components, r.formatted_address);
        return { label: r.formatted_address, lat: g.lat, lng: g.lng, pincode: g.pincode, area: g.area, city: g.city, state: g.state };
      });
    }
  }
  const res = await timedFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`, NOMINATIM_HEADERS);
  const j = res && res.ok ? await res.json().catch(() => null) as { lat: string; lon: string; display_name: string; address?: NomAddr }[] : null;
  if (!Array.isArray(j)) return [];
  return j.map((h) => {
    const lat = parseFloat(h.lat), lng = parseFloat(h.lon);
    if (!validLatLng(lat, lng)) return null;
    const a = h.address || {};
    return { label: h.display_name, lat, lng, pincode: a.postcode, area: a.neighbourhood || a.suburb || a.city_district, city: a.city || a.town || a.village || a.county, state: a.state };
  }).filter(Boolean) as PlaceHit[];
}

/** Which geocoding provider is active (for admin/status surfaces). Never the key itself. */
export function geoProvider(): "google" | "osm" {
  return GKEY() ? "google" : "osm";
}
