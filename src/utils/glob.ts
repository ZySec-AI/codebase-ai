/**
 * Minimal glob matcher — zero dependencies.
 * Supports: * (any chars except /), ** (any chars including /), ? (single char)
 */
export function globMatch(pattern: string, filepath: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filepath);
}

export function globFilter(files: string[], pattern: string): string[] {
  const regex = globToRegex(pattern);
  return files.filter(f => regex.test(f));
}

function globToRegex(pattern: string): RegExp {
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
  return new RegExp(result);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
