import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_ENTRY = ".codebase.json";
const CACHE_ENTRY = ".codebase.cache.json";
const PROMPTS_ENTRY = ".codebase/prompts.jsonl";

export function updateGitignore(root: string): void {
  const path = join(root, ".gitignore");
  const content = existsSync(path) ? readFileSync(path, "utf-8") : "";

  const needsManifest = !content.includes(MANIFEST_ENTRY);
  const needsCache = !content.includes(CACHE_ENTRY);
  const needsPrompts = !content.includes(PROMPTS_ENTRY);

  if (!needsManifest && !needsCache && !needsPrompts) {
    return;
  }

  let addition = "";
  if (needsManifest || needsCache) {
    addition += "\n# AI context manifest\n";
    if (needsManifest) {
      addition += `${MANIFEST_ENTRY}\n`;
    }
    if (needsCache) {
      addition += `${CACHE_ENTRY}\n`;
    }
  }
  if (needsPrompts) {
    addition += "\n# Prompt audit log (local only — may contain sensitive context)\n";
    addition += `${PROMPTS_ENTRY}\n`;
    addition += `${PROMPTS_ENTRY}.*\n`;
  }

  writeFileSync(path, content.trimEnd() + addition, "utf-8");
}
