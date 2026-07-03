import Image from "next/image";

/* Shared premium split-screen shell for the auth pages (signup / forgot /
   reset), matching the existing login design. Server component — wraps the
   client form passed as children. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-forest to-[#0a2e22] p-12 text-white md:flex">
        <Image src="/logo.png" alt="DOODLY home" width={150} height={55} className="h-11 w-auto" priority />
        <div>
          <h2 className="font-display text-3xl">Fresh milk,<br />delivered daily.</h2>
          <ul className="mt-6 space-y-3 text-white/90">
            <li>A2 buffalo milk, no preservatives</li>
            <li>Returnable glass bottles</li>
            <li>At your door by 7 AM</li>
          </ul>
        </div>
        <span className="text-sm text-white/60">© {new Date().getFullYear()} DOODLY</span>
      </aside>

      <main id="main-content" className="grid place-items-center p-8">
        <div className="w-full max-w-sm">
          <Image src="/logo.png" alt="DOODLY" width={150} height={55} className="h-11 w-auto md:hidden" priority />
          <h1 className="mt-6 font-display text-2xl text-forest">{title}</h1>
          <p className="mt-1 text-ink-2">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

/* Shared input classes so every auth field looks identical to the login form. */
export const authInputClass =
  "w-full rounded-xl border border-mint-soft px-4 py-3 outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30";
export const authButtonClass =
  "block w-full rounded-full bg-leaf py-3 text-center font-semibold text-white transition disabled:opacity-60";
