/**
 * Minimal glob matcher — zero dependencies.
 * Supports: * (any chars except /), ** (any chars including /), ? (single char)
 */

const regexCache = new Map<string, RegExp>();

export function globMatch(pattern: string, filepath: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filepath);
}

export function globFilter(files: string[], pattern: string): string[] {
  const regex = globToRegex(pattern);
  return files.filter((f) => regex.test(f));
}

export function globToRegex(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached) {
    return cached;
  }
  let result = "^";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // ** matches everything including /
        if (pattern[i + 2] === "/") {
          result += "(?:.*/)?";
          i += 3;
        } else {
          result += ".*";
          i += 2;
        }
      } else {
        // * matches everything except /
        result += "[^/]*";
        i++;
      }
    } else if (char === "?") {
      result += "[^/]";
      i++;
    } else if (char === "{") {
      // {a,b,c} alternation
      const close = pattern.indexOf("}", i);
      if (close !== -1) {
        const alternatives = pattern.slice(i + 1, close).split(",");
        result += "(?:" + alternatives.map(escapeRegex).join("|") + ")";
        i = close + 1;
      } else {
        result += escapeRegex(char);
        i++;
      }
    } else {
      result += escapeRegex(char);
      i++;
    }
  }

  result += "$";
  const regex = new RegExp(result);
  regexCache.set(pattern, regex);
  return regex;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
