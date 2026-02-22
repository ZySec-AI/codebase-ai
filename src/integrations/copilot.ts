import type { Integration } from "../types.js";
import { fileExistsAt, injectMarkdown, removeMarkdown } from "./shared.js";

export const copilotIntegration: Integration = {
  name: "copilot",
  detect: (root) => fileExistsAt(root, ".github/copilot-instructions.md"),
  inject: (root) => injectMarkdown(root, ".github/copilot-instructions.md"),
  remove: (root) => removeMarkdown(root, ".github/copilot-instructions.md"),
};
