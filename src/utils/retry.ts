/**
 * Retry with exponential backoff — zero dependencies.
 *
 * Wraps an async operation with configurable retries, jitter, and backoff.
 * Used by GitHub API calls, network requests, and file operations.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms. Doubled each retry. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Jitter factor (0-1). Adds randomness to avoid thundering herd. Default: 0.2 */
  jitter?: number;
  /** Predicate to decide if an error is retryable. Default: always true */
  retryable?: (err: Error, attempt: number) => boolean;
  /** Called before each retry with attempt number and delay. Useful for logging. */
  onRetry?: (err: Error, attempt: number, delayMs: number) => void;
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * @example
 * ```ts
 * const data = await retry(() => fetch(url), {
 *   maxAttempts: 3,
 *   retryable: (err) => err.message.includes('rate limit'),
 *   onRetry: (err, n, delay) => warn(`Retry #${n} in ${delay}ms: ${err.message}`),
 * });
 * ```
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    jitter = 0.2,
    retryable = () => true,
    onRetry,
  } = options;

  let lastError: Error = new Error("retry: no attempts made");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt >= maxAttempts || !retryable(lastError, attempt)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterAmount = exponentialDelay * jitter * Math.random();
      const delayMs = Math.min(exponentialDelay + jitterAmount, maxDelayMs);

      onRetry?.(lastError, attempt, Math.round(delayMs));

      // Non-blocking sleep
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Check if an error looks like a transient network/rate-limit issue.
 * Useful as a default `retryable` predicate.
 */
export function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("fetch failed")
  );
}

/**
 * Check if an error looks like a GitHub API rate limit.
 */
export function isGitHubRateLimit(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return msg.includes("rate limit") || msg.includes("api rate limit exceeded");
}
