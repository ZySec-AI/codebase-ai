import type { Integration } from "../types.js";
import { claudeIntegration } from "./claude.js";
import { cursorIntegration } from "./cursor.js";
import { windsurfIntegration } from "./windsurf.js";
import { copilotIntegration } from "./copilot.js";
import { aiderIntegration } from "./aider.js";
import { clineIntegration } from "./cline.js";
import { continueIntegration } from "./continue.js";

export const integrations: Integration[] = [
  claudeIntegration,
  cursorIntegration,
  windsurfIntegration,
  copilotIntegration,
  aiderIntegration,
  clineIntegration,
  continueIntegration,
];

export function detectTools(root: string): Integration[] {
  return integrations.filter(i => i.detect(root));
}
