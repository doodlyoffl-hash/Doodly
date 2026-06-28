import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #1FAE66, #0F3D2E)", color: "#ffffff",
        }}
      >
        <svg width="92" height="92" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
          <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" />
        </svg>
        <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>DOODLY</div>
      </div>
    ),
    { ...size },
  );
}
