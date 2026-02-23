import type { Integration } from "../types.js";
import { fileExistsAt, injectPlaintext, removePlaintext } from "./shared.js";

export const neovimIntegration: Integration = {
  name: "neovim",
  detect: (root) => fileExistsAt(root, ".nvimrc") || fileExistsAt(root, "init.lua") || fileExistsAt(root, ".config/nvim/init.lua"),
  inject: (root) => {
    const { existsSync } = require("node:fs");

    // Try to find and inject into the most common Neovim config file
    const files = [
      "init.lua",
      ".nvimrc",
      ".config/nvim/init.lua"
    ];

    for (const file of files) {
      const path = `${root}/${file}`;
      if (existsSync(path)) {
        // For .nvimrc, use plaintext injection
        if (file.endsWith(".nvimrc")) {
          injectPlaintext(root, file);
        }
        // For init.lua, we need Lua-style comments
        else if (file.endsWith("init.lua")) {
          const { readFileSync, writeFileSync } = require("node:fs");
          let content = readFileSync(path, "utf-8");

          const startMarker = "-- codebase:start";
          const endMarker = "-- codebase:end";

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
-- This project uses codebase for AI context.
-- Run 'npx codebase brief' to get full project context.
${endMarker}`;

          writeFileSync(path, content.trimEnd() + injectBlock + "\n", "utf-8");
        }
        return;
      }
    }

    // If no config file exists, create init.lua
    const { writeFileSync } = require("node:fs");
    const luaPath = `${root}/init.lua`;
    const content = `-- codebase:start
-- This project uses codebase for AI context.
-- Run 'npx codebase brief' to get full project context.
-- codebase:end
`;
    writeFileSync(luaPath, content, "utf-8");
  },
  remove: (root) => {
    const { existsSync } = require("node:fs");
    const files = [
      "init.lua",
      ".nvimrc",
      ".config/nvim/init.lua"
    ];

    for (const file of files) {
      const path = `${root}/${file}`;
      if (!existsSync(path)) continue;

      if (file.endsWith(".nvimrc")) {
        removePlaintext(root, file);
      } else if (file.endsWith("init.lua")) {
        const { readFileSync, writeFileSync } = require("node:fs");
        let content = readFileSync(path, "utf-8");

        const startMarker = "-- codebase:start";
        const endMarker = "-- codebase:end";

        const startIdx = content.indexOf(startMarker);
        const endIdx = content.indexOf(endMarker);

        if (startIdx !== -1 && endIdx !== -1) {
          content = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
          content = content.replace(/\n{3,}/g, "\n\n").trim() + "\n";
          writeFileSync(path, content, "utf-8");
        }
      }
    }
  },
};
