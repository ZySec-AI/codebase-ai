import type { Integration, InjectResult } from "../types.js";
import { fileExistsAt, injectMarkdown, removeMarkdown } from "./shared.js";

export const claudeIntegration: Integration = {
  name: "claude",
  detect: (root) => fileExistsAt(root, "CLAUDE.md"),
  async inject(root): Promise<InjectResult> {
    try {
      injectMarkdown(root, "CLAUDE.md");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },
  remove: (root) => removeMarkdown(root, "CLAUDE.md"),
};
