import type { Integration } from "../types.js";
import { fileExistsAt, injectMarkdown, removeMarkdown } from "./shared.js";

export const claudeIntegration: Integration = {
  name: "claude",
  detect: (root) => fileExistsAt(root, "CLAUDE.md"),
  inject: (root) => injectMarkdown(root, "CLAUDE.md"),
  remove: (root) => removeMarkdown(root, "CLAUDE.md"),
};
