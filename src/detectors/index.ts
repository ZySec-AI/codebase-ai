import type { Detector } from "../types.js";
import { projectDetector } from "./project.js";
import { repoDetector } from "./repo.js";
import { structureDetector } from "./structure.js";
import { stackDetector } from "./stack.js";
import { commandsDetector } from "./commands.js";
import { dependenciesDetector } from "./dependencies.js";
import { configDetector } from "./config.js";
import { gitDetector } from "./git.js";
import { qualityDetector } from "./quality.js";
import { patternsDetector } from "./patterns.js";
import { apiDocsDetector } from "./api-docs.js";
import { graphDetector } from "./graph.js";

export const detectors: Detector[] = [
  projectDetector,
  repoDetector,
  structureDetector,
  stackDetector,
  commandsDetector,
  dependenciesDetector,
  configDetector,
  gitDetector,
  qualityDetector,
  patternsDetector,
  apiDocsDetector,
  graphDetector,
];
