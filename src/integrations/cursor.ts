import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Integration, InjectResult } from "../types.js";

export const cursorIntegration: Integration = {
  name: "cursor",

  detect(root: string): boolean {
    return existsSync(join(root, ".cursor"));
  },

  async inject(root: string): Promise<InjectResult> {
    try {
      const rulesDir = join(root, ".cursor", "rules");
      mkdirSync(rulesDir, { recursive: true });
      const rulesFile = join(rulesDir, "codebase.mdc");
      if (existsSync(rulesFile)) {
        return { ok: true, message: "already injected" };
      }

      let manifestSummary = "";
      try {
        const m = JSON.parse(readFileSync(join(root, ".codebase.json"), "utf-8")) as {
          project?: { name?: string };
          stack?: { languages?: string[] };
          commands?: { build?: string; test?: string; dev?: string };
        };
        manifestSummary = `Project: ${m.project?.name ?? "unknown"}\nStack: ${m.stack?.languages?.join(", ") ?? "unknown"}\nCommands: build=${m.commands?.build ?? "?"}, test=${m.commands?.test ?? "?"}, dev=${m.commands?.dev ?? "?"}`;
      } catch {
        manifestSummary = "Run `codebase scan` to generate project context.";
      }

      const content = `---\ndescription: codebase project context\nglobs: ["**/*"]\nalwaysApply: true\n---\n\n# Project Context\n\n${manifestSummary}\n\nFull context: \`codebase brief\`\n`;
      writeFileSync(rulesFile, content, "utf-8");
      return { ok: true, message: `Injected into ${rulesFile}` };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  },

  remove(root: string): void {
    const rulesFile = join(root, ".cursor", "rules", "codebase.mdc");
    try {
      unlinkSync(rulesFile);
    } catch {
      /* ignore */
    }
  },
};
