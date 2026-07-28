-- Road-following route geometry: the Google-encoded overview polyline of the
-- optimised round trip, so the map can draw the actual streets (not straight
-- segments). Fully additive, nullable, idempotent.

ALTER TABLE "TripHistory"
  ADD COLUMN IF NOT EXISTS "routePolyline" TEXT;
