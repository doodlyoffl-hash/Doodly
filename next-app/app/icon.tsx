import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// DOODLY favicon — a white milk drop on the brand gradient (code-generated, no asset file).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #1FAE66, #0F3D2E)", borderRadius: 7,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
          <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
