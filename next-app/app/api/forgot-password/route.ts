/* POST /api/forgot-password — CORS-reachable alias of /api/auth/forgot-password
   for the cross-origin storefront. The /api/auth/* namespace is excluded from
   the middleware (reserved for Auth.js) so it never gets CORS headers; this
   alias sits inside the middleware matcher and therefore does. */
export { POST, runtime, dynamic } from "../auth/forgot-password/route";
