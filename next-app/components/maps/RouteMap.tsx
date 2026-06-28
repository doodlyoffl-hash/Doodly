"use client";
/* =============================================================
   DOODLY — Delivery route map (real Google Maps Directions)
   Plots the executive's current location + numbered customer stops
   and draws the optimised driving route via the Directions service,
   returning total distance + ETA. Drop-in for the static
   DOODLY_MAPS.routeMap (delivery portal).
   ============================================================= */
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, MAP_DEFAULT } from "@/lib/maps";

export type Stop = { lat: number; lng: number; name: string; done?: boolean };
type Props = { stops: Stop[]; current?: { lat: number; lng: number }; className?: string; onStop?: (i: number) => void };

export function RouteMap({ stops, current, className, onStop }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<{ km: number; min: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      const origin = current ?? MAP_DEFAULT;
      const map = new g.maps.Map(mapEl.current!, { center: origin, zoom: 13, disableDefaultUI: true, zoomControl: true });

      new g.maps.Marker({ position: origin, map, title: "You", icon: { path: g.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#1FAE66", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } });
      stops.forEach((s, i) => {
        const m = new g.maps.Marker({ position: s, map, label: { text: String(i + 1), color: "#fff", fontWeight: "700" }, icon: { path: g.maps.SymbolPath.CIRCLE, scale: 13, fillColor: s.done ? "#1FAE66" : "#0F3D2E", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } });
        if (onStop) m.addListener("click", () => onStop(i));
      });

      if (stops.length) {
        const ds = new g.maps.DirectionsService();
        const dr = new g.maps.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: "#1FAE66", strokeWeight: 5 } });
        const waypoints = stops.slice(0, -1).map((s) => ({ location: s, stopover: true }));
        ds.route({
          origin, destination: stops[stops.length - 1], waypoints, optimizeWaypoints: true,
          travelMode: g.maps.TravelMode.DRIVING,
        }, (res, status) => {
          if (status === "OK" && res) {
            dr.setDirections(res);
            const legs = res.routes[0].legs;
            const km = legs.reduce((n, l) => n + (l.distance?.value ?? 0), 0) / 1000;
            const min = Math.round(legs.reduce((n, l) => n + (l.duration?.value ?? 0), 0) / 60);
            setMeta({ km: +km.toFixed(1), min });
          }
        });
      }
    }).catch((e) => setError(e.message));
  }, [stops, current, onStop]);

  if (error) return <div className={className}><p className="text-sm text-red-600">Route map unavailable: {error}</p></div>;
  return (
    <div className={className}>
      <div ref={mapEl} className="h-72 w-full overflow-hidden rounded-2xl border border-line" />
      {meta && <div className="mt-2 flex gap-3 text-xs font-semibold text-ink-2"><span>{stops.length} stops</span><span>{meta.km} km</span><span>~{meta.min} min</span></div>}
    </div>
  );
}

/** Build a REAL Google Maps turn-by-turn navigation URL for a stop. */
export function navUrl(lat: number, lng: number, mode: "walking" | "bicycling" | "two-wheeler" | "driving" = "driving") {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode}`;
}
