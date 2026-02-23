import type { Integration } from "../types.js";
import { fileExistsAt, injectMarkdown, removeMarkdown } from "./shared.js";

// GitHub Copilot Enterprise uses org-level instructions
export const copilotEnterpriseIntegration: Integration = {
  name: "copilot-enterprise",
  detect: (root) => fileExistsAt(root, ".github/copilot-instructions.md"),
  inject: (root) => {
    // Copilot Enterprise uses the same file as regular Copilot
    // We inject the same markdown block
    injectMarkdown(root, ".github/copilot-instructions.md");
  },
  remove: (root) => {
    removeMarkdown(root, ".github/copilot-instructions.md");
  },
};
