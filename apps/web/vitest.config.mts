import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig `paths` so tests can import `@/…` without mocking every
    // module in the graph.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` is only vendored inside next; in vitest it is a no-op.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
