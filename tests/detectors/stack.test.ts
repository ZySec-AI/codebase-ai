import { describe, it, expect } from "vitest";
import { stackDetector } from "../../src/detectors/stack.js";
import { createMockContext } from "../helpers.js";

describe("stackDetector", () => {
  describe("version prefix regex", () => {
    it("strips ^ prefix", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { react: "^18.3.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.frameworks).toContain("react@18.3");
    });

    it("strips ~ prefix", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { react: "~18.3.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.frameworks).toContain("react@18.3");
    });

    it("strips >= prefix (multi-char)", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.tsx"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { next: ">=14.2.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.frameworks).toContain("next.js@14.2");
    });

    it("strips >=~ prefix (complex)", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { vue: ">=~3.4.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.frameworks).toContain("vue@3.4");
    });

    it("handles exact version (no prefix)", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { react: "18.3.1" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.frameworks).toContain("react@18.3");
    });
  });

  describe("framework detection", () => {
    it("detects tRPC", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/server/trpc.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { "@trpc/server": "^10.45.0", "@trpc/client": "^10.45.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.frameworks).toContain("trpc@10.45");
    });

    it("deduplicates frameworks", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.tsx"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { react: "^18.3.0", "react-dom": "^18.3.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      const reactEntries = (result.frameworks as string[]).filter((f) => f.startsWith("react@"));
      expect(reactEntries).toHaveLength(1);
    });
  });

  describe("database detection", () => {
    it("detects multiple databases (pg + redis)", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { pg: "^8.11.0", ioredis: "^5.3.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.database).toBe("postgresql + redis");
    });

    it("does not hardcode @prisma/client as postgresql", async () => {
      const ctx = createMockContext({
        files: ["package.json", "prisma/schema.prisma", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { "@prisma/client": "^5.0.0" },
            devDependencies: { prisma: "^5.0.0" },
          }),
          "prisma/schema.prisma": `
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
`,
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.database).toBe("mysql");
      expect(result.orm).toBe("prisma");
    });

    it("detects postgresql from prisma schema", async () => {
      const ctx = createMockContext({
        files: ["package.json", "prisma/schema.prisma", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { "@prisma/client": "^5.0.0" },
            devDependencies: { prisma: "^5.0.0" },
          }),
          "prisma/schema.prisma": `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`,
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.database).toBe("postgresql");
    });

    it("detects sqlite from prisma schema", async () => {
      const ctx = createMockContext({
        files: ["package.json", "prisma/schema.prisma", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { "@prisma/client": "^5.0.0" },
            devDependencies: { prisma: "^5.0.0" },
          }),
          "prisma/schema.prisma": `
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
`,
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.database).toBe("sqlite");
    });

    it("returns null when no DB markers", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { express: "^4.18.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.database).toBeNull();
    });
  });

  describe("build_tool detection", () => {
    it("detects vite", async () => {
      const ctx = createMockContext({
        files: ["package.json", "vite.config.ts", "src/main.tsx"],
        fileContents: {
          "package.json": JSON.stringify({
            devDependencies: { vite: "^5.0.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.build_tool).toBe("vite");
    });

    it("detects tsup", async () => {
      const ctx = createMockContext({
        files: ["package.json", "tsup.config.ts", "src/index.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            devDependencies: { tsup: "^8.0.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.build_tool).toBe("tsup");
    });

    it("detects webpack", async () => {
      const ctx = createMockContext({
        files: ["package.json", "webpack.config.js", "src/index.js"],
        fileContents: {
          "package.json": JSON.stringify({
            devDependencies: { webpack: "^5.90.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.build_tool).toBe("webpack");
    });

    it("returns null when no build tool found", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/index.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { express: "^4.18.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.build_tool).toBeNull();
    });
  });

  describe("package_manager detection", () => {
    it("detects npm from lock file", async () => {
      const ctx = createMockContext({
        files: ["package.json", "package-lock.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.package_manager).toBe("npm");
    });

    it("detects pnpm from lock file", async () => {
      const ctx = createMockContext({
        files: ["package.json", "pnpm-lock.yaml", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.package_manager).toBe("pnpm");
    });

    it("falls back to npm when package.json has deps but no lock file", async () => {
      const ctx = createMockContext({
        files: ["package.json", "src/app.ts"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { react: "^18.0.0" },
          }),
        },
      });
      const result = await stackDetector.detect(ctx);
      expect(result.package_manager).toBe("npm");
    });

    it("returns null when no package.json deps", async () => {
      const ctx = createMockContext({
        files: ["src/main.go"],
        fileContents: {},
      });
      const result = await stackDetector.detect(ctx);
      expect(result.package_manager).toBeNull();
    });
  });

  describe("language detection", () => {
    it("detects TypeScript and JavaScript files", async () => {
      const ctx = createMockContext({
        files: ["src/index.ts", "src/app.tsx", "src/utils.ts", "eslint.config.mjs"],
        fileContents: {},
      });
      const result = await stackDetector.detect(ctx);
      expect(result.languages).toContain("typescript");
      expect(result.languages).toContain("javascript");
      // TS should be first (more files)
      expect((result.languages as string[])[0]).toBe("typescript");
    });
  });
});
