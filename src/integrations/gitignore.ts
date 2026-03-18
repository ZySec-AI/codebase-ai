import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function updateGitignore(root: string): void {
  const path = join(root, ".gitignore");
  const content = existsSync(path) ? readFileSync(path, "utf-8") : "";

  if (content.includes(".codebase.json")) {
    return;
  }

  const addition = "\n# AI context manifest\n.codebase.json\n.codebase.cache.json\n";
  writeFileSync(path, content.trimEnd() + addition, "utf-8");
}
