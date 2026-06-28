/* =============================================================
   DOODLY — Google Maps JS API loader (client)
   Single, memoised loader for the Maps JS API + the libraries we use
   (places, marker, routes). Mirrors the static DOODLY_MAPS surface so
   the same callers (AddressPicker / RouteMap) work against the real API.
   The browser key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) must be referrer-
   restricted in the Google Cloud console.
   ============================================================= */
let promise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps load attempted on the server"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (promise) return promise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  promise = new Promise((resolve, reject) => {
    if (!key) { reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set")); return; }
    const cb = "__doodlyMapsReady";
    (window as any)[cb] = () => resolve((window as any).google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,marker,routes&loading=async&callback=${cb}`;
    s.async = true; s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return promise;
}

/** Vijayawada default centre + the serviceable bounding box (tighten per launch city). */
export const MAP_DEFAULT = { lat: 16.5062, lng: 80.648 };

export type PickedAddress = {
  lat: number; lng: number;
  line1?: string; street?: string; landmark?: string;
  area?: string; city?: string; state?: string; pincode?: string;
  formatted: string;
};

/** Reverse-geocode a LatLng into DOODLY's address fields. */
export async function reverseGeocode(lat: number, lng: number): Promise<PickedAddress> {
  const g = await loadGoogleMaps();
  const geocoder = new g.maps.Geocoder();
  const { results } = await geocoder.geocode({ location: { lat, lng } });
  const r = results[0];
  const get = (type: string) => r?.address_components.find((c) => c.types.includes(type))?.long_name;
  return {
    lat, lng,
    street: get("route"),
    area: get("sublocality") || get("neighborhood") || get("locality"),
    city: get("locality") || get("administrative_area_level_2"),
    state: get("administrative_area_level_1"),
    pincode: get("postal_code"),
    formatted: r?.formatted_address ?? "",
  };
}
