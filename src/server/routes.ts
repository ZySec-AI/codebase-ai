import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scan } from "../scanner/engine.js";
import { queryPath } from "../utils/json-path.js";

interface RouteResult {
  status: number;
  body: unknown;
}

export async function handleRoute(url: string, method: string, root: string): Promise<RouteResult> {
  const parsed = new URL(url, "http://localhost");
  const path = parsed.pathname;

  // Health check
  if (path === "/health") {
    return { status: 200, body: { status: "ok", version: "0.1.0" } };
  }

  // Query endpoint
  if (path === "/codebase/query" && method === "GET") {
    const queryStr = parsed.searchParams.get("path");
    if (!queryStr) {
      return { status: 400, body: { error: "Missing 'path' query parameter" } };
    }
    const manifest = await loadManifest(root);
    if (!manifest) return { status: 404, body: { error: "No manifest. POST /codebase/scan first." } };
    const value = queryPath(manifest, queryStr);
    return { status: 200, body: value ?? null };
  }

  // Trigger scan
  if (path === "/codebase/scan" && method === "POST") {
    const manifest = await scan(root, { quiet: true });
    await writeFile(join(root, ".codebase.json"), JSON.stringify(manifest, null, 2), "utf-8");
    return { status: 200, body: manifest };
  }

  // Full manifest
  if (path === "/codebase" && method === "GET") {
    const manifest = await loadManifest(root);
    if (!manifest) return { status: 404, body: { error: "No manifest. POST /codebase/scan first." } };
    return { status: 200, body: manifest };
  }

  // Category endpoint
  if (path.startsWith("/codebase/") && method === "GET") {
    const category = path.split("/")[2];
    const manifest = await loadManifest(root);
    if (!manifest) return { status: 404, body: { error: "No manifest." } };
    const data = (manifest as Record<string, unknown>)[category];
    if (data === undefined) return { status: 404, body: { error: `Category '${category}' not found.` } };
    return { status: 200, body: data };
  }

  return { status: 404, body: { error: "Not found" } };
}

async function loadManifest(root: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(join(root, ".codebase.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
