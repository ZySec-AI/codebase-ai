import { describe, it, expect } from "vitest";
import { dependenciesDetector } from "../../src/detectors/dependencies.js";
import { createMockContext } from "../helpers.js";

describe("dependenciesDetector error paths", () => {
  it("returns dev_count: 0 when no package.json", async () => {
    const ctx = createMockContext({ files: ["src/main.go"] });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.dev_count).toBe(0);
    expect(result.direct_count).toBe(0);
  });

  it("returns dev_count: 0 on malformed package.json", async () => {
    const ctx = createMockContext({
      files: ["package.json"],
      fileContents: { "package.json": "{ invalid json ..." },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.dev_count).toBe(0);
    expect(result.direct_count).toBe(0);
  });

  it("detects bun.lock text lockfile", async () => {
    const ctx = createMockContext({
      files: ["package.json", "bun.lock"],
      fileContents: {
        "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.lock_file).toBe("bun.lockb");
  });
});
