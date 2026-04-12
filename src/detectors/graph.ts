import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Detector, ScanContext } from "../types.js";

export const graphDetector: Detector = {
  name: "graph",
  category: "graph",

  async detect(ctx: ScanContext): Promise<Record<string, unknown>> {
    const graphPath = join(ctx.root, ".codebase", "graph.json");

    if (!existsSync(graphPath)) {
      return {
        available: false,
        path: ".codebase/graph.json",
        hint: "Run `codebase graph build` to build the call/import graph.",
      };
    }

    try {
      const stat = statSync(graphPath);
      const content = await ctx.readFile(".codebase/graph.json");
      if (!content) {
        return { available: false, path: ".codebase/graph.json" };
      }

      const graph = JSON.parse(content) as {
        version: number;
        built_at: string;
        nodes: Array<{ language: string }>;
        edges: Array<unknown>;
      };

      // Aggregate node counts per language
      const langCounts: Record<string, number> = {};
      for (const node of graph.nodes ?? []) {
        const lang = node.language ?? "unknown";
        langCounts[lang] = (langCounts[lang] ?? 0) + 1;
      }
      const languages = Object.keys(langCounts);

      const ageMs = Date.now() - new Date(graph.built_at).getTime();
      const stale = ageMs > 24 * 60 * 60 * 1000; // >24h

      return {
        available: true,
        nodes: graph.nodes?.length ?? 0,
        edges: graph.edges?.length ?? 0,
        languages,
        built_at: graph.built_at,
        stale,
        size_bytes: stat.size,
        path: ".codebase/graph.json",
      };
    } catch {
      return { available: false, path: ".codebase/graph.json" };
    }
  },
};
