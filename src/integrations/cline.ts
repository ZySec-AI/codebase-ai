import type { Integration } from "../types.js";
import { fileExistsAt, injectPlaintext, removePlaintext } from "./shared.js";

export const clineIntegration: Integration = {
  name: "cline",
  detect: (root) => fileExistsAt(root, ".clinerules"),
  inject: (root) => injectPlaintext(root, ".clinerules"),
  remove: (root) => removePlaintext(root, ".clinerules"),
};
