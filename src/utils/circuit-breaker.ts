/**
 * Circuit breaker — prevents hammering dead external services.
 *
 * Tracks consecutive failures for a named service. After `threshold` failures,
 * the circuit "opens" and all calls short-circuit to a fallback or throw.
 * After `resetTimeoutMs`, the circuit enters "half-open" state and allows one
 * probe call. If it succeeds, the circuit closes. If it fails, it stays open.
 *
 * Zero dependencies. All state is in-process (no persistence).
 *
 * @example
 * ```ts
 * const githubBreaker = createCircuitBreaker('github-api', {
 *   threshold: 5,
 *   resetTimeoutMs: 60_000,
 * });
 *
 * const data = await githubBreaker.execute(
 *   () => fetchGitHubData(),    // primary
 *   () => getCachedData(),      // fallback (optional)
 * );
 * ```
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Failures before opening. Default: 5 */
  threshold?: number;
  /** Time in ms before trying again (half-open). Default: 60000 (1 min) */
  resetTimeoutMs?: number;
  /** Called on state changes for logging/monitoring */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successCount: number;
}

const breakers = new Map<string, CircuitBreakerState>();

function getOrCreate(name: string): CircuitBreakerState {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = { state: "closed", failures: 0, lastFailureTime: 0, successCount: 0 };
    breakers.set(name, breaker);
  }
  return breaker;
}

export interface CircuitBreaker {
  /** Current state of the circuit */
  getState(): CircuitState;
  /** Execute a function through the circuit breaker */
  execute<T>(primary: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
  /** Manually reset the circuit to closed */
  reset(): void;
  /** Get stats: failures, successes, state */
  stats(): { state: CircuitState; failures: number; successes: number };
}

export function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const { threshold = 5, resetTimeoutMs = 60_000, onStateChange } = options;

  function transition(breaker: CircuitBreakerState, newState: CircuitState): void {
    if (breaker.state !== newState) {
      const oldState = breaker.state;
      breaker.state = newState;
      onStateChange?.(name, oldState, newState);
    }
  }

  return {
    getState(): CircuitState {
      const breaker = getOrCreate(name);

      // Auto-transition from open → half-open after cooldown
      if (breaker.state === "open" && Date.now() - breaker.lastFailureTime >= resetTimeoutMs) {
        transition(breaker, "half-open");
      }

      return breaker.state;
    },

    async execute<T>(primary: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
      const breaker = getOrCreate(name);

      // Check if circuit should transition to half-open
      if (breaker.state === "open" && Date.now() - breaker.lastFailureTime >= resetTimeoutMs) {
        transition(breaker, "half-open");
      }

      // If open, reject immediately
      if (breaker.state === "open") {
        if (fallback) {
          return fallback();
        }
        throw new Error(
          `Circuit breaker [${name}] is open — service unavailable. Retry after ${Math.round((resetTimeoutMs - (Date.now() - breaker.lastFailureTime)) / 1000)}s.`
        );
      }

      try {
        const result = await primary();

        // Success: reset failure count, close circuit
        breaker.failures = 0;
        breaker.successCount++;
        transition(breaker, "closed");

        return result;
      } catch (err) {
        breaker.failures++;
        breaker.lastFailureTime = Date.now();

        // In half-open: one failure reopens the circuit
        if (breaker.state === "half-open") {
          transition(breaker, "open");
        } else if (breaker.failures >= threshold) {
          transition(breaker, "open");
        }

        // Try fallback if available
        if (fallback) {
          return fallback();
        }

        throw err;
      }
    },

    reset(): void {
      const breaker = getOrCreate(name);
      breaker.failures = 0;
      breaker.successCount = 0;
      breaker.lastFailureTime = 0;
      transition(breaker, "closed");
    },

    stats(): { state: CircuitState; failures: number; successes: number } {
      const breaker = getOrCreate(name);
      return {
        state: this.getState(),
        failures: breaker.failures,
        successes: breaker.successCount,
      };
    },
  };
}

/**
 * Reset all circuit breakers. Useful for testing.
 */
export function resetAllBreakers(): void {
  breakers.clear();
}
