import type { Integration } from "../types.js";
import { claudeIntegration } from "./claude.js";

export const integrations: Integration[] = [claudeIntegration];

export function detectTools(root: string): Integration[] {
  return integrations.filter((i) => i.detect(root));
}
