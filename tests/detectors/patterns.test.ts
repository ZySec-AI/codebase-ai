import { describe, it, expect } from "vitest";
import { patternsDetector } from "../../src/detectors/patterns.js";
import { createMockContext } from "../helpers.js";

describe("patternsDetector", () => {
  describe("architecture detection", () => {
    it("detects Next.js app router", async () => {
      const ctx = createMockContext({
        files: ["src/app/layout.tsx", "src/app/page.tsx"],
        fileContents: { "package.json": JSON.stringify({ dependencies: { next: "^14.0.0" } }) },
      });
      const result = await patternsDetector.detect(ctx);
      expect(result.architecture).toBe("app-router");
    });

    it("detects command-based architecture", async () => {
      const ctx = createMockContext({
        files: ["src/commands/init.ts", "src/commands/scan.ts", "src/index.ts"],
        fileContents: { "package.json": JSON.stringify({ dependencies: {} }) },
      });
      const result = await patternsDetector.detect(ctx);
      expect(result.architecture).toBe("command-based");
    });

    it("detects MVC", async () => {
      const ctx = createMockContext({
        files: ["src/controllers/user.ts", "src/models/user.ts", "src/routes/user.ts"],
        fileContents: { "package.json": JSON.stringify({ dependencies: {} }) },
      });
      const result = await patternsDetector.detect(ctx);
      expect(result.architecture).toBe("mvc");
    });
  });

  describe("state management detection", () => {
    it("detects zustand + react-query combo", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/store/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { zustand: "^4.0.0", "@tanstack/react-query": "^5.0.0" },
          }),
        },
      });
      const result = await patternsDetector.detect(ctx);
      expect(result.state_management).toBe("zustand + react-query");
    });
  });

  describe("API style detection", () => {
    it("detects tRPC", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/server/trpc.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { "@trpc/server": "^10.0.0" },
          }),
        },
      });
      const result = await patternsDetector.detect(ctx);
      expect(result.api_style).toContain("trpc");
    });
  });

  describe("key_modules detection", () => {
    it("maps known src directories", async () => {
      const ctx = createMockContext({
        files: [
          "src/components/Button.tsx",
          "src/lib/utils.ts",
          "src/hooks/useAuth.ts",
          "src/store/app.ts",
        ],
        fileContents: { "package.json": JSON.stringify({ dependencies: {} }) },
      });
      const result = await patternsDetector.detect(ctx);
      const modules = result.key_modules as Record<string, string>;
      expect(modules["src/components/"]).toBe("reusable UI components");
      expect(modules["src/lib/"]).toBe("shared utilities");
      expect(modules["src/hooks/"]).toBe("React hooks");
      expect(modules["src/store/"]).toBe("state management");
    });
  });
});
