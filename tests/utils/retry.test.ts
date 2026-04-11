import { describe, it, expect, vi } from "vitest";
import { retry, isTransientError, isGitHubRateLimit } from "../../src/utils/retry.js";

describe("retry", () => {
  it("should return the result on first attempt if successful", async () => {
    const result = await retry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("should retry on failure and succeed on second attempt", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("fail");
        }
        return "ok";
      },
      { baseDelayMs: 1 }
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("should throw after exhausting all attempts", async () => {
    await expect(
      retry(
        async () => {
          throw new Error("always fails");
        },
        { maxAttempts: 2, baseDelayMs: 1 }
      )
    ).rejects.toThrow("always fails");
  });

  it("should respect retryable predicate", async () => {
    const fn = vi.fn(async () => {
      throw new Error("permanent-failure");
    });

    await expect(
      retry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        retryable: (err) => err.message.includes("RETRY_ME"),
      })
    ).rejects.toThrow("permanent-failure");

    // Should only try once since error is not retryable
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should call onRetry callback", async () => {
    let attempts = 0;
    const onRetry = vi.fn();

    await retry(
      async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error("fail");
        }
        return "ok";
      },
      { maxAttempts: 4, baseDelayMs: 1, onRetry }
    );

    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("should use exponential backoff for delays", async () => {
    const delays: number[] = [];

    await retry(
      async () => {
        throw new Error("fail");
      },
      {
        maxAttempts: 4,
        baseDelayMs: 10,
        jitter: 0,
        onRetry: (_err, _attempt, delayMs) => {
          delays.push(delayMs);
        },
      }
    ).catch(() => {});

    // Delays should be: 10, 20, 40
    expect(delays[0]).toBe(10);
    expect(delays[1]).toBe(20);
    expect(delays[2]).toBe(40);
  });

  it("should cap delays at maxDelayMs", async () => {
    const delays: number[] = [];

    await retry(
      async () => {
        throw new Error("fail");
      },
      {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 200,
        jitter: 0,
        onRetry: (_err, _attempt, delayMs) => {
          delays.push(delayMs);
        },
      }
    ).catch(() => {});

    // All delays should be capped at 200
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(200);
    }
  });
});

describe("isTransientError", () => {
  it("should detect rate limit errors", () => {
    expect(isTransientError(new Error("API rate limit exceeded"))).toBe(true);
  });

  it("should detect connection errors", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("should detect server errors", () => {
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
  });

  it("should not flag non-transient errors", () => {
    expect(isTransientError(new Error("Not Found"))).toBe(false);
    expect(isTransientError(new Error("Permission denied"))).toBe(false);
  });
});

describe("isGitHubRateLimit", () => {
  it("should detect GitHub rate limit errors", () => {
    expect(isGitHubRateLimit(new Error("API rate limit exceeded"))).toBe(true);
    expect(isGitHubRateLimit(new Error("rate limit"))).toBe(true);
  });

  it("should not flag non-rate-limit errors", () => {
    expect(isGitHubRateLimit(new Error("Not Found"))).toBe(false);
  });
});
