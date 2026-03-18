/**
 * Simple dot-path query for objects.
 * queryPath({ a: { b: [1, 2] } }, "a.b") → [1, 2]
 * queryPath({ a: { b: "hi" } }, "a.b") → "hi"
 * queryPath({ a: 1 }, "a.b.c") → undefined
 */
export function queryPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {return undefined;}
    if (typeof current !== "object") {return undefined;}
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Deep diff two objects. Returns list of changes.
 */
export interface DiffEntry {
  type: "added" | "removed" | "changed";
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export function deepDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix = ""
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (!(key in oldObj)) {
      diffs.push({ type: "added", path, newValue: newVal });
    } else if (!(key in newObj)) {
      diffs.push({ type: "removed", path, oldValue: oldVal });
    } else if (isObject(oldVal) && isObject(newVal)) {
      diffs.push(...deepDiff(oldVal as Record<string, unknown>, newVal as Record<string, unknown>, path));
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ type: "changed", path, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}
