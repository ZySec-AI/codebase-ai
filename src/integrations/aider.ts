import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Integration, InjectResult } from "../types.js";

const MARKER = "# codebase-injected";

export const aiderIntegration: Integration = {
  name: "aider",

  detect(root: string): boolean {
    return existsSync(join(root, ".aider.conf.yml")) || existsSync(join(root, ".aider.conf.yaml"));
  },

  async inject(root: string): Promise<InjectResult> {
    try {
      const confPath = existsSync(join(root, ".aider.conf.yml"))
        ? join(root, ".aider.conf.yml")
        : join(root, ".aider.conf.yaml");

      const existing = existsSync(confPath) ? readFileSync(confPath, "utf-8") : "";
      if (existing.includes(MARKER)) {
        return { ok: true, message: "already injected" };
      }

      // Append read section pointing at .codebase.json
      const addition = `\n${MARKER}\nread:\n  - .codebase.json\n`;
      writeFileSync(confPath, existing.trimEnd() + addition, "utf-8");
      return { ok: true, message: `Injected into ${confPath}` };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  },

  remove(root: string): void {
    const confPath = existsSync(join(root, ".aider.conf.yml"))
      ? join(root, ".aider.conf.yml")
      : existsSync(join(root, ".aider.conf.yaml"))
        ? join(root, ".aider.conf.yaml")
        : null;

    if (!confPath) {
      return;
    }

    try {
      const content = readFileSync(confPath, "utf-8");
      // Remove the injected block
      const cleaned = content.replace(/\n# codebase-injected\nread:\n  - \.codebase\.json\n?/, "");
      writeFileSync(confPath, cleaned, "utf-8");
    } catch {
      /* ignore */
    }
  },
};
