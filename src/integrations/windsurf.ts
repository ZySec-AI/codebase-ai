import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Integration, InjectResult } from "../types.js";

export const windsurfIntegration: Integration = {
  name: "windsurf",

  detect(root: string): boolean {
    return existsSync(join(root, ".windsurf"));
  },

  async inject(root: string): Promise<InjectResult> {
    try {
      const rulesDir = join(root, ".windsurf", "rules");
      mkdirSync(rulesDir, { recursive: true });
      const rulesFile = join(rulesDir, "codebase.md");
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

      const content = `# Project Context (codebase)\n\n${manifestSummary}\n\nFull context: \`codebase brief\`\n`;
      writeFileSync(rulesFile, content, "utf-8");
      return { ok: true, message: `Injected into ${rulesFile}` };
    } catch (err) {
      return { ok: false, message: String(err) };
    }
  },

  remove(root: string): void {
    const rulesFile = join(root, ".windsurf", "rules", "codebase.md");
    try {
      unlinkSync(rulesFile);
    } catch {
      /* ignore */
    }
  },
};
