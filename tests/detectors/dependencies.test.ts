import { describe, it, expect } from "vitest";
import { dependenciesDetector } from "../../src/detectors/dependencies.js";
import { createMockContext } from "../helpers.js";

describe("dependenciesDetector", () => {
  it("counts direct and dev dependencies separately", async () => {
    const ctx = createMockContext({
      files: ["package.json"],
      fileContents: {
        "package.json": JSON.stringify({
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
          devDependencies: { typescript: "^5.4.0", vitest: "^1.6.0", tsup: "^8.0.0" },
        }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(2);
    expect(result.dev_count).toBe(3);
  });

  it("detects notable packages from both deps and devDeps", async () => {
    const ctx = createMockContext({
      files: ["package.json"],
      fileContents: {
        "package.json": JSON.stringify({
          dependencies: { react: "^18.0.0", zustand: "^4.0.0" },
          devDependencies: { vitest: "^1.6.0", tsup: "^8.0.0" },
        }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    const notable = result.notable as string[];
    expect(notable).toContain("react");
    expect(notable).toContain("zustand");
    expect(notable).toContain("vitest");
    expect(notable).toContain("tsup");
  });

  it("detects lock file", async () => {
    const ctx = createMockContext({
      files: ["package.json", "yarn.lock"],
      fileContents: {
        "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.lock_file).toBe("yarn.lock");
  });

  it("returns empty when no package.json", async () => {
    const ctx = createMockContext({ files: ["src/main.go"] });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(0);
    expect(result.notable).toEqual([]);
  });
});
