import type { Integration } from "../types.js";
import { fileExistsAt, injectPlaintext, removePlaintext } from "./shared.js";

export const cursorIntegration: Integration = {
  name: "cursor",
  detect: (root) => fileExistsAt(root, ".cursorrules"),
  inject: (root) => injectPlaintext(root, ".cursorrules"),
  remove: (root) => removePlaintext(root, ".cursorrules"),
};
