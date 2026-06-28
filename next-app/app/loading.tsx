// Route-level loading UI (streamed instantly while the page loads).
// A branded milk-ripple — respects prefers-reduced-motion via globals.css.
export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <span className="absolute inset-0 animate-ping rounded-full bg-leaf/40" />
          <span className="absolute inset-2 rounded-full bg-leaf" />
        </div>
        <p className="font-display text-lg text-forest">Pouring something fresh…</p>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
