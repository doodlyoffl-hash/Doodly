/* Auth.js (NextAuth v5) catch-all: sign-in, sign-out, session, csrf, callbacks. */
import { handlers } from "@/auth";

export const runtime = "nodejs";

export const { GET, POST } = handlers;
