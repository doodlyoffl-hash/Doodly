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

/* =============================================================
   Shift GPS tracker — continuous foreground distance capture.
   watchPositionAsync streams high-accuracy fixes; we buffer them and hand
   BATCHES to onBatch (wire this to driver.postTrack, which queues offline and
   dedups server-side by clientId). The SERVER computes the fraud-filtered
   travelled km — the tracker only samples. Background tracking (screen off) is a
   separate expo-location background task; this is the foreground-parity slice.
   ============================================================= */
export interface TrackerFix {
  lat: number; lng: number; accuracyM: number | null; speed: number | null; capturedAt: string; clientId: string;
}
export interface ShiftTrackerOptions {
  sampleIntervalS?: number;   // min seconds between fixes (default 6)
  minMoveM?: number;          // min metres between fixes (default 8)
  batchSize?: number;         // flush after N buffered fixes (default 12)
  onBatch: (points: TrackerFix[]) => Promise<unknown>;
}

let _seq = 0;
function trackClientId(): string { _seq += 1; return `gps-${Date.now().toString(36)}-${_seq.toString(36)}`; }

export class ShiftGpsTracker {
  private sub: Location.LocationSubscription | null = null;
  private buf: TrackerFix[] = [];
  private readonly sampleIntervalS: number;
  private readonly minMoveM: number;
  private readonly batchSize: number;
  private readonly onBatch: (points: TrackerFix[]) => Promise<unknown>;

  constructor(opts: ShiftTrackerOptions) {
    this.sampleIntervalS = opts.sampleIntervalS ?? 6;
    this.minMoveM = opts.minMoveM ?? 8;
    this.batchSize = opts.batchSize ?? 12;
    this.onBatch = opts.onBatch;
  }

  /** Begin tracking. Returns false when foreground permission is denied. */
  async start(): Promise<boolean> {
    if (this.sub) return true;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return false;
    this.sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: this.sampleIntervalS * 1000, distanceInterval: this.minMoveM },
      (pos) => this.onFix(pos),
    );
    return true;
  }

  private onFix(pos: Location.LocationObject) {
    const c = pos.coords;
    this.buf.push({ lat: c.latitude, lng: c.longitude, accuracyM: c.accuracy ?? null, speed: c.speed ?? null, capturedAt: new Date(pos.timestamp || Date.now()).toISOString(), clientId: trackClientId() });
    if (this.buf.length >= this.batchSize) void this.flush();
  }

  /** Send the buffered fixes. onBatch already queues offline, so this only re-buffers on a hard error. */
  async flush(): Promise<void> {
    if (!this.buf.length) return;
    const batch = this.buf.splice(0, 500);
    try { await this.onBatch(batch); }
    catch { this.buf.unshift(...batch); }
  }

  /** Stop tracking and final-flush so the shift distance is complete. */
  async stop(): Promise<void> {
    if (this.sub) { this.sub.remove(); this.sub = null; }
    await this.flush();
  }
}
