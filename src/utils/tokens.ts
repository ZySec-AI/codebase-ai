/**
 * Token estimation utilities.
 *
 * Uses a character-based heuristic (~3.8 chars per token for mixed English/code).
 * Accurate within ~15% — sufficient for budget warnings without any dependencies.
 */

/**
 * Rough token estimate for any text string.
 * Uses the ~3.8 chars/token heuristic standard for English/code content.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

/**
 * Token estimate for a JSON-serializable object.
 */
export function estimateJsonTokens(obj: unknown): number {
  return estimateTokens(JSON.stringify(obj) ?? "");
}

/**
 * Grade a token count against budget thresholds.
 * Returns 'A', 'B', 'C', or 'D'.
 *
 * @param tokens   The token count to grade
 * @param thresholds  { a: max for A, b: max for B, c: max for C }
 */
export function gradeTokenBudget(
  tokens: number,
  thresholds: { a: number; b: number; c: number }
): string {
  if (tokens <= thresholds.a) {
    return "A";
  }
  if (tokens <= thresholds.b) {
    return "B";
  }
  if (tokens <= thresholds.c) {
    return "C";
  }
  return "D";
}
