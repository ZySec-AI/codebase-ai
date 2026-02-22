import type { Integration } from "../types.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const continueIntegration: Integration = {
  name: "continue",

  detect(root) {
    return existsSync(join(root, ".continuerc.json"));
  },

  inject(root) {
    const path = join(root, ".continuerc.json");
    const content = readFileSync(path, "utf-8");

    if (content.includes(".codebase.json")) return;

    try {
      const config = JSON.parse(content);
      if (!config.docs) config.docs = [];
      config.docs.push({ path: ".codebase.json", name: "Project Context" });
      writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
    } catch {
      // If JSON parse fails, don't modify
    }
  },

  remove(root) {
    const path = join(root, ".continuerc.json");
    if (!existsSync(path)) return;

    try {
      const config = JSON.parse(readFileSync(path, "utf-8"));
      if (config.docs) {
        config.docs = config.docs.filter(
          (d: { path?: string }) => d.path !== ".codebase.json"
        );
      }
      writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
    } catch {}
  },
};
