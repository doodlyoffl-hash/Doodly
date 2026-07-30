/* =============================================================
   DOODLY mobile — device GPS capture (expo-location).
   Used by the delivery-executive "Verify / Update Geo Location" flow to read
   the phone's precise current position (with accuracy) while standing at the
   customer's door. High accuracy is requested; the accuracy radius is surfaced
   so a weak fix can be rejected server-side.
   ============================================================= */
import * as Location from "expo-location";

export interface DeviceFix {
  lat: number;
  lng: number;
  /** Reported accuracy radius in metres (null when the platform omits it). */
  accuracyM: number | null;
  /** ISO timestamp of the fix. */
  capturedAt: string;
}

/** Request permission (if needed) and read one high-accuracy position.
 *  Throws a user-facing Error when permission is denied or no fix is available. */
export async function getDeviceLocation(): Promise<DeviceFix> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission is off. Enable it in Settings to update the delivery pin.");
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: pos.coords.accuracy ?? null,
    capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}
