/* Premium line-icon set (inline SVG, currentColor). No icon-font, tree-shaken. */
const P: Record<string, string> = {
  drop: '<path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z"/>',
  snow: '<path d="M12 2v20M4 6l16 12M20 6 4 18M2 12h20"/>',
  muscle: '<path d="M4 14c2-1 3-3 5-3s4 2 7 2c2 0 4-1 4-3M5 14v5a2 2 0 0 0 2 2h3"/>',
  bottle: '<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/><path d="M8 13h8"/>',
  truck: '<path d="M3 5h11v11H3zM14 9h4l3 3v4h-7"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
  farmer: '<circle cx="12" cy="7" r="3"/><path d="M5 21c1-4 4-6 7-6s6 2 7 6"/><path d="M7 5c1.5-2 8.5-2 10 0"/>',
  can: '<rect x="6" y="6" width="12" height="14" rx="2"/><path d="M9 6V4h6v2M6 11h12"/>',
  shield: '<path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  star: '<path d="M12 3l2.5 6.5L21 10l-5 4.5L17.5 21 12 17l-5.5 4L8 14.5 3 10l6.5-.5L12 3Z" fill="currentColor" stroke="none"/>',
};

export function Icon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: P[name] || "" }}
    />
  );
}
