/* Refuse to run any seed script when NODE_ENV=production. Seeds create demo /
   test data (demo customers, farmers, B2B businesses, @doodly.test accounts) and
   must NEVER touch the production database. Local dev (NODE_ENV unset) is allowed.
   Override only with an explicit, deliberate ALLOW_PROD_SEED=1. */
export function assertNotProd(name: string): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    throw new Error(
      `Refusing to run ${name}: NODE_ENV=production. Seed scripts create demo/test data and must not run against the production database. ` +
      `If you truly intend to (you almost never do), set ALLOW_PROD_SEED=1.`,
    );
  }
}
