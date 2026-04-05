import { describe, it, expect } from "vitest";
import { estimateTokens, estimateJsonTokens, gradeTokenBudget } from "../../src/utils/tokens.js";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates tokens as ceil(length / 3.8)", () => {
    const text = "Hello world"; // 11 chars -> ceil(11/3.8) = 3
    expect(estimateTokens(text)).toBe(Math.ceil(11 / 3.8));
  });

  it("is always positive for non-empty string", () => {
    expect(estimateTokens("a")).toBeGreaterThan(0);
  });

  it("scales with length", () => {
    const short = estimateTokens("abc");
    const long = estimateTokens("abcdefghijklmnopqrstuvwxyz");
    expect(long).toBeGreaterThan(short);
  });
});

describe("estimateJsonTokens", () => {
  it("returns 0 for empty object", () => {
    // "{}" is 2 chars -> ceil(2/3.8) = 1
    expect(estimateJsonTokens({})).toBe(Math.ceil(2 / 3.8));
  });

  it("estimates tokens from serialized JSON", () => {
    const obj = { a: 1, b: "hello" };
    const json = JSON.stringify(obj); // compact, no indent
    expect(estimateJsonTokens(obj)).toBe(Math.ceil(json.length / 3.8));
  });

  it("works with arrays", () => {
    expect(estimateJsonTokens([1, 2, 3])).toBeGreaterThan(0);
  });
});

describe("gradeTokenBudget", () => {
  const thresholds = { a: 15_000, b: 30_000, c: 60_000 };

  it("returns A for tokens under a threshold", () => {
    expect(gradeTokenBudget(5_000, thresholds)).toBe("A");
  });

  it("returns A at exactly the a threshold", () => {
    expect(gradeTokenBudget(15_000, thresholds)).toBe("A");
  });

  it("returns B for tokens between a and b thresholds", () => {
    expect(gradeTokenBudget(20_000, thresholds)).toBe("B");
  });

  it("returns C for tokens between b and c thresholds", () => {
    expect(gradeTokenBudget(45_000, thresholds)).toBe("C");
  });

  it("returns D for tokens above c threshold", () => {
    expect(gradeTokenBudget(100_000, thresholds)).toBe("D");
  });

  it("returns A for 0 tokens", () => {
    expect(gradeTokenBudget(0, thresholds)).toBe("A");
  });
});
