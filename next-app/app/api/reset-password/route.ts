/* POST /api/reset-password — CORS-reachable alias of /api/auth/reset-password
   for the cross-origin storefront (the /api/auth/* namespace gets no CORS
   headers). Mirrors /api/register + /api/forgot-password. */
export { POST, runtime, dynamic } from "../auth/reset-password/route";
