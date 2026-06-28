"use client";

import { useEffect } from "react";

// Segment-level error boundary. Catches render/runtime errors and offers a
// graceful retry. Never leaks the raw error/stack to the user.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Hook your logger here (Sentry, etc). digest is safe to surface for support.
    // eslint-disable-next-line no-console
    console.error("App error:", error?.digest ?? error?.message);
  }, [error]);

  return (
    <main id="main-content" className="grid min-h-[70vh] place-items-center px-6 py-20 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-[#fde6e2] text-3xl" aria-hidden="true">⚠️</div>
        <h1 className="font-display text-3xl font-semibold text-forest">Something went wrong.</h1>
        <p className="mt-3 text-ink-2">We hit a snag on our end. Please try again — nothing was lost.</p>
        {error?.digest && <p className="mt-2 text-xs text-ink-3">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-full bg-leaf px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5">Try again</button>
          <a href="/" className="rounded-full border border-line px-6 py-3 font-semibold text-forest transition hover:border-mint">Back to home</a>
        </div>
      </div>
    </main>
  );
}
