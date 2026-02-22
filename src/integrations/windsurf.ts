import type { Integration } from "../types.js";
import { fileExistsAt, injectPlaintext, removePlaintext } from "./shared.js";

export const windsurfIntegration: Integration = {
  name: "windsurf",
  detect: (root) => fileExistsAt(root, ".windsurfrules"),
  inject: (root) => injectPlaintext(root, ".windsurfrules"),
  remove: (root) => removePlaintext(root, ".windsurfrules"),
};
