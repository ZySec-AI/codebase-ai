import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCircuitBreaker, resetAllBreakers } from "../../src/utils/circuit-breaker.js";

describe("circuit breaker", () => {
  beforeEach(() => {
    resetAllBreakers();
  });

  it("should start in closed state", () => {
    const breaker = createCircuitBreaker("test");
    expect(breaker.getState()).toBe("closed");
  });

  it("should execute the primary function when closed", async () => {
    const breaker = createCircuitBreaker("test");
    const result = await breaker.execute(async () => "ok");
    expect(result).toBe("ok");
  });

  it("should open after threshold failures", async () => {
    const breaker = createCircuitBreaker("test", { threshold: 3 });
    const fail = async () => {
      throw new Error("fail");
    };

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }

    expect(breaker.getState()).toBe("open");
  });

  it("should use fallback when open", async () => {
    const breaker = createCircuitBreaker("test", { threshold: 2 });

    // Fail to open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    expect(breaker.getState()).toBe("open");

    // Should use fallback
    const result = await breaker.execute(
      async () => "primary",
      async () => "fallback"
    );
    expect(result).toBe("fallback");
  });

  it("should throw when open with no fallback", async () => {
    const breaker = createCircuitBreaker("test", { threshold: 2 });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    await expect(breaker.execute(async () => "primary")).rejects.toThrow(
      "Circuit breaker [test] is open"
    );
  });

  it("should transition to half-open after reset timeout", async () => {
    vi.useFakeTimers();
    const breaker = createCircuitBreaker("test", {
      threshold: 2,
      resetTimeoutMs: 1000,
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }
    expect(breaker.getState()).toBe("open");

    // Wait for reset timeout
    vi.advanceTimersByTime(1001);

    expect(breaker.getState()).toBe("half-open");
    vi.useRealTimers();
  });

  it("should close circuit on success in half-open state", async () => {
    vi.useFakeTimers();
    const breaker = createCircuitBreaker("test", {
      threshold: 2,
      resetTimeoutMs: 1000,
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    // Advance past cooldown
    vi.advanceTimersByTime(1001);
    expect(breaker.getState()).toBe("half-open");

    // Succeed — should close circuit
    const result = await breaker.execute(async () => "ok");
    expect(result).toBe("ok");
    expect(breaker.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("should reopen circuit on failure in half-open state", async () => {
    vi.useFakeTimers();
    const breaker = createCircuitBreaker("test", {
      threshold: 2,
      resetTimeoutMs: 1000,
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    // Advance past cooldown
    vi.advanceTimersByTime(1001);
    expect(breaker.getState()).toBe("half-open");

    // Fail — should reopen circuit
    await breaker
      .execute(async () => {
        throw new Error("fail");
      })
      .catch(() => {});
    expect(breaker.getState()).toBe("open");

    vi.useRealTimers();
  });

  it("should reset manually", async () => {
    const breaker = createCircuitBreaker("test", { threshold: 2 });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }
    expect(breaker.getState()).toBe("open");

    // Manual reset
    breaker.reset();
    expect(breaker.getState()).toBe("closed");

    const stats = breaker.stats();
    expect(stats.failures).toBe(0);
    expect(stats.successes).toBe(0);
  });

  it("should track stats", async () => {
    const breaker = createCircuitBreaker("test", { threshold: 5 });

    await breaker.execute(async () => "ok");
    await breaker.execute(async () => "ok");

    const stats = breaker.stats();
    expect(stats.successes).toBe(2);
    expect(stats.failures).toBe(0);
    expect(stats.state).toBe("closed");
  });

  it("should call onStateChange callback", async () => {
    const onStateChange = vi.fn();
    const breaker = createCircuitBreaker("test", {
      threshold: 2,
      onStateChange,
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await breaker
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    expect(onStateChange).toHaveBeenCalledWith("test", "closed", "open");
  });

  it("should handle independent breakers for different services", async () => {
    const github = createCircuitBreaker("github", { threshold: 2 });
    const openai = createCircuitBreaker("openai", { threshold: 2 });

    // Open github breaker
    for (let i = 0; i < 2; i++) {
      await github
        .execute(async () => {
          throw new Error("fail");
        })
        .catch(() => {});
    }

    expect(github.getState()).toBe("open");
    expect(openai.getState()).toBe("closed");
  });
});
