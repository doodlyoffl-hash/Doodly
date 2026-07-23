/* No-op stand-in for Next.js's `server-only` guard.
   That package exists purely to make a build FAIL when server code is pulled
   into a client bundle. Under vitest there is no client bundle, so importing
   it would just fail to resolve — this stub lets us unit-test modules that
   correctly mark themselves server-only. */
export {};
