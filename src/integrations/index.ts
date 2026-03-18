import type { Integration } from "../types.js";
import { claudeIntegration } from "./claude.js";
import { cursorIntegration } from "./cursor.js";
import { windsurfIntegration } from "./windsurf.js";
import { copilotIntegration } from "./copilot.js";
import { aiderIntegration } from "./aider.js";
import { clineIntegration } from "./cline.js";
import { continueIntegration } from "./continue.js";
import { vscodeIntegration } from "./vscode.js";
import { webstormIntegration } from "./webstorm.js";
import { neovimIntegration } from "./neovim.js";
import { copilotEnterpriseIntegration } from "./copilot-enterprise.js";

export const integrations: Integration[] = [
  claudeIntegration,
  cursorIntegration,
  windsurfIntegration,
  copilotIntegration,
  aiderIntegration,
  clineIntegration,
  continueIntegration,
  vscodeIntegration,
  webstormIntegration,
  neovimIntegration,
  copilotEnterpriseIntegration,
];

export function detectTools(root: string): Integration[] {
  return integrations.filter(i => i.detect(root));
}
