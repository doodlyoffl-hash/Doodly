"use client";

// Catches errors in the root layout itself (must render its own <html>/<body>).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FBFCFA", color: "#0B1F17" }}>
        <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 40 }} aria-hidden="true">⚠️</div>
            <h1 style={{ fontSize: 28, color: "#0F3D2E", margin: "8px 0" }}>Something went wrong</h1>
            <p style={{ color: "#3A4D44" }}>We&apos;re fixing it. Please try again.</p>
            <button onClick={reset} style={{ marginTop: 20, border: 0, borderRadius: 999, background: "#1FAE66", color: "#fff", padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
