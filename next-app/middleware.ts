/* =============================================================
   DOODLY — Route gating (surface boundary)
   Enforces who may reach each dashboard surface BY URL, so changing
   the address bar can't expose a surface to the wrong audience:
       /account -> any authenticated user (doodly-uid present)
       /driver  -> delivery executive (or super-admin impersonation)
       /admin   -> any staff role (NOT customer / delivery executive)
   Fine-grained, per-module access is additionally enforced inside
   every API route (the data layer). The `doodly-role` / `doodly-uid`
   cookies are the dev/demo stand-in; production swaps in the signed
   Supabase session here without changing the rules below.
   ============================================================= */
import { NextResponse, type NextRequest } from "next/server";

const STAFF = new Set([
  "support", "operations", "procurement", "accountant",
  "inventory", "quality", "marketing", "admin", "super_admin",
]);

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const role = req.cookies.get("doodly-role")?.value ?? "customer";
  const signedIn = Boolean(req.cookies.get("doodly-uid")?.value);

  const denyTo = (pathname: string) => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    url.search = `?from=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  };

  if (path.startsWith("/admin")) {
    if (!STAFF.has(role)) return denyTo("/login");
  } else if (path.startsWith("/driver")) {
    if (role !== "delivery_executive" && role !== "super_admin") return denyTo("/login");
  } else if (path.startsWith("/account")) {
    if (!signedIn) return denyTo("/login");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/driver/:path*", "/admin/:path*"],
};
