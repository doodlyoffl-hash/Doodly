import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "DOODLY — Fresh A2 Buffalo Milk, Delivered Daily";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default social-share card (1200×630). Per-page cards can override by adding
// their own opengraph-image.tsx in the route folder.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80,
          background: "linear-gradient(135deg, #0F3D2E 0%, #169A57 55%, #2bc77a 100%)", color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700, opacity: 0.9 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" /></svg>
          DOODLY
        </div>
        <div style={{ marginTop: 28, fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>
          Fresh A2 Buffalo Milk,
          <br />
          delivered daily.
        </div>
        <div style={{ marginTop: 26, fontSize: 32, opacity: 0.92 }}>
          Glass bottles · No preservatives · At your door by 7 AM
        </div>
      </div>
    ),
    { ...size },
  );
}
