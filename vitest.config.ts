import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "dist/**"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      },
    },
  },
});
