import type { Integration } from "../types.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const aiderIntegration: Integration = {
  name: "aider",

  detect(root) {
    return existsSync(join(root, ".aider.conf.yml"));
  },

  inject(root) {
    const path = join(root, ".aider.conf.yml");
    const content = readFileSync(path, "utf-8");

    if (content.includes(".codebase.json")) return;

    // Check if `read:` key exists
    if (content.includes("read:")) {
      // Append to existing read list
      const updated = content.replace(
        /^(read:\s*\[?)/m,
        '$1".codebase.json", '
      );
      writeFileSync(path, updated, "utf-8");
    } else {
      // Add read key
      writeFileSync(
        path,
        content.trimEnd() + '\n\n# codebase:start\nread: [".codebase.json"]\n# codebase:end\n',
        "utf-8"
      );
    }
  },

  remove(root) {
    const path = join(root, ".aider.conf.yml");
    if (!existsSync(path)) return;

    let content = readFileSync(path, "utf-8");
    // Remove the codebase block
    content = content.replace(/\n# codebase:start\n.*?\n# codebase:end\n/s, "\n");
    // Remove .codebase.json from read arrays
    content = content.replace(/"\s*\.codebase\.json\s*",?\s*/g, "");
    writeFileSync(path, content, "utf-8");
  },
};
