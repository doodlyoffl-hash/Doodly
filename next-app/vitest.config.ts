import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` is a build-time guard with no runtime behaviour and is
      // not installed as a real package (Next resolves it internally). Stub it
      // so server modules that correctly mark themselves can still be tested.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Several suites exercise the real (remote) Postgres, where a single
    // round-trip can take seconds. The 5s default fails those as "timeouts"
    // when nothing is actually wrong.
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
