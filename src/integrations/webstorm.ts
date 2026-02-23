import type { Integration } from "../types.js";
import { fileExistsAt } from "./shared.js";

export const webstormIntegration: Integration = {
  name: "webstorm",
  detect: (root) => fileExistsAt(root, ".idea"),
  inject: (root) => {
    const path = `${root}/.idea/codebase-project.xml`;
    const { existsSync, writeFileSync, mkdirSync } = require("node:fs");

    // Ensure .idea directory exists
    if (!existsSync(`${root}/.idea`)) {
      mkdirSync(`${root}/.idea`, { recursive: true });
    }

    const injectContent = `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectProperties">
    <!-- codebase:start -->
    <notice>
      This project uses codebase for AI context.
      Run 'npx codebase brief' to get full project context.
    </notice>
    <!-- codebase:end -->
  </component>
</project>
`;

    writeFileSync(path, injectContent, "utf-8");
  },
  remove: (root) => {
    const path = `${root}/.idea/codebase-project.xml`;
    const { existsSync, unlinkSync } = require("node:fs");

    if (existsSync(path)) {
      unlinkSync(path);
    }
  },
};
