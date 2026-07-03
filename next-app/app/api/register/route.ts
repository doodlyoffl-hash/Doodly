/* POST /api/register — CORS-reachable alias of /api/auth/register for the
   cross-origin storefront. The /api/auth/* namespace is excluded from the
   middleware (reserved for Auth.js), so it never receives CORS headers;
   this alias sits inside the middleware matcher and therefore does. */
export { POST, runtime, dynamic } from "../auth/register/route";
