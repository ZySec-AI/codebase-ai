import type { Integration } from "../types.js";
import { claudeIntegration } from "./claude.js";
import { cursorIntegration } from "./cursor.js";
import { windsurfIntegration } from "./windsurf.js";
import { aiderIntegration } from "./aider.js";

export const integrations: Integration[] = [
  claudeIntegration,
  cursorIntegration,
  windsurfIntegration,
  aiderIntegration,
];

export function detectTools(root: string): Integration[] {
  return integrations.filter((i) => i.detect(root));
}
