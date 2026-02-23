import type { Integration } from "../types.js";
import { fileExistsAt, injectMarkdown, removeMarkdown } from "./shared.js";

export const vscodeIntegration: Integration = {
  name: "vscode",
  detect: (root) => fileExistsAt(root, ".vscode/settings.json"),
  inject: (root) => {
    const path = `${root}/.vscode/settings.json`;
    const { existsSync, readFileSync, writeFileSync } = require("node:fs");

    if (!existsSync(path)) return;

    let content = readFileSync(path, "utf-8");
    const startMarker = "// codebase:start";
    const endMarker = "// codebase:end";

    if (content.includes(startMarker)) {
      const startIdx = content.indexOf(startMarker);
      const endIdx = content.indexOf(endMarker);
      if (startIdx !== -1 && endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
        content = content.replace(/\n{3,}/g, "\n\n").trimEnd();
      }
    }

    const injectBlock = `

${startMarker}
// This project uses codebase for AI context.
// Run 'npx codebase brief' to get full project context.
${endMarker}`;

    writeFileSync(path, content.trimEnd() + injectBlock + "\n", "utf-8");
  },
  remove: (root) => {
    const path = `${root}/.vscode/settings.json`;
    const { existsSync, readFileSync, writeFileSync } = require("node:fs");

    if (!existsSync(path)) return;

    let content = readFileSync(path, "utf-8");
    const startMarker = "// codebase:start";
    const endMarker = "// codebase:end";

    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
      content = content.replace(/\n{3,}/g, "\n\n").trim() + "\n";
      writeFileSync(path, content, "utf-8");
    }
  },
};
