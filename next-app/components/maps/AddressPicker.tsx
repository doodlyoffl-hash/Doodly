"use client";
/* =============================================================
   DOODLY — Address picker (real Google Maps + Places)
   Places Autocomplete + a draggable marker that reverse-geocodes to
   House/Street/Landmark/Area/City/State/Pincode + lat/lng. Emits the
   resolved address via onChange so the form + serviceable check can
   use it. Drop-in replacement for the static DOODLY_MAPS.mountPicker.
   ============================================================= */
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, reverseGeocode, MAP_DEFAULT, type PickedAddress } from "@/lib/maps";

type Props = {
  value?: { lat: number; lng: number };
  onChange?: (a: PickedAddress) => void;
  className?: string;
};

export function AddressPicker({ value, onChange, className }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let map: google.maps.Map, marker: google.maps.Marker, cleanup = () => {};
    loadGoogleMaps().then((g) => {
      const center = value ?? MAP_DEFAULT;
      map = new g.maps.Map(mapEl.current!, { center, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" });
      marker = new g.maps.Marker({ position: center, map, draggable: true });

      const emit = async (lat: number, lng: number) => {
        try { onChange?.(await reverseGeocode(lat, lng)); } catch { /* keep the pin; geocode is best-effort */ }
      };

      // Places Autocomplete bound to the input
      const ac = new g.maps.places.Autocomplete(inputEl.current!, { fields: ["geometry", "address_components", "formatted_address"], componentRestrictions: { country: "in" } });
      ac.bindTo("bounds", map);
      const acL = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        const loc = place.geometry.location;
        map.panTo(loc); map.setZoom(17); marker.setPosition(loc);
        emit(loc.lat(), loc.lng());
      });

      const dragL = marker.addListener("dragend", () => {
        const p = marker.getPosition(); if (p) emit(p.lat(), p.lng());
      });

      emit(center.lat, center.lng);   // initial
      cleanup = () => { g.maps.event.removeListener(acL); g.maps.event.removeListener(dragL); };
    }).catch((e) => setError(e.message));

    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className={className}><p className="text-sm text-red-600">Map unavailable: {error}. You can still enter the address manually.</p></div>;

  return (
    <div className={className}>
      <input ref={inputEl} placeholder="Search your area, street or landmark" aria-label="Search address"
        className="mb-2 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-leaf" />
      <div ref={mapEl} className="h-64 w-full overflow-hidden rounded-2xl border border-line" />
      <p className="mt-2 text-xs text-ink-3">Drag the pin to your exact doorstep.</p>
    </div>
  );
}
