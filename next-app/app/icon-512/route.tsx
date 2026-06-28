import { ImageResponse } from "next/og";

export const runtime = "edge";

/* 512×512 maskable PWA icon — generous safe-zone padding so the milk drop
   survives the circular/rounded mask used by Android/iOS launchers.
   ImageResponse sets Content-Type: image/png automatically. */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #1FAE66, #0F3D2E)",
        }}
      >
        <svg width="280" height="280" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
          <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
