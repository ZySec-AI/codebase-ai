import { get } from "https";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const CACHE_DIR = join(homedir(), ".codebase");
const CACHE_FILE = join(CACHE_DIR, "update-check.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NPM_PACKAGE = "codebase-ai";

const NO_COLOR = !!process.env.NO_COLOR;
const c = {
  yellow: NO_COLOR ? "" : "\x1b[33m",
  cyan: NO_COLOR ? "" : "\x1b[36m",
  green: NO_COLOR ? "" : "\x1b[32m",
  bold: NO_COLOR ? "" : "\x1b[1m",
  dim: NO_COLOR ? "" : "\x1b[2m",
  reset: NO_COLOR ? "" : "\x1b[0m",
};

function getCurrentVersion(): string {
  // __VERSION__ is injected at build time by tsup — works regardless of bundling
  if (typeof __VERSION__ !== "undefined") {
    return __VERSION__;
  }
  return "0.0.0";
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [lMaj, lMin, lPatch] = parse(latest);
  const [cMaj, cMin, cPatch] = parse(current);
  if (lMaj !== cMaj) {
    return lMaj > cMaj;
  }
  if (lMin !== cMin) {
    return lMin > cMin;
  }
  return lPatch > cPatch;
}

function readCache(): { version: string; checkedAt: number } | null {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as {
      version: string;
      checkedAt: number;
    };
  } catch {
    return null;
  }
}

function writeCache(version: string): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ version, checkedAt: Date.now() }));
  } catch {
    // ignore
  }
}

function fetchLatestVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(
      `https://registry.npmjs.org/${NPM_PACKAGE}/latest`,
      { headers: { accept: "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            resolve((JSON.parse(data) as { version: string }).version);
          } catch {
            reject(new Error("parse error"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/** Detect how codebase was installed so we use the right upgrade command. */
function detectInstallCommand(): string {
  try {
    // If installed via npm global, npm root -g will contain the package
    const npmGlobal = execSync("npm root -g 2>/dev/null", { encoding: "utf8" }).trim();
    const found = npmGlobal && readFileSync(`${npmGlobal}/${NPM_PACKAGE}/package.json`, "utf8");
    if (found) {
      return `npm install -g ${NPM_PACKAGE}@latest`;
    }
  } catch {
    /* fall through */
  }

  try {
    execSync("pnpm --version 2>/dev/null", { encoding: "utf8" });
    const pnpmGlobal = execSync("pnpm root -g 2>/dev/null", { encoding: "utf8" }).trim();
    const found = pnpmGlobal && readFileSync(`${pnpmGlobal}/${NPM_PACKAGE}/package.json`, "utf8");
    if (found) {
      return `pnpm add -g ${NPM_PACKAGE}@latest`;
    }
  } catch {
    /* fall through */
  }

  try {
    execSync("yarn --version 2>/dev/null", { encoding: "utf8" });
    return `yarn global add ${NPM_PACKAGE}@latest`;
  } catch {
    /* fall through */
  }

  return `npm install -g ${NPM_PACKAGE}@latest`;
}

export async function checkForUpdate(): Promise<void> {
  // Skip in CI, piped output, or explicitly disabled
  if (process.env.CI || process.env.NO_UPDATE_CHECK || process.env.CODEBASE_NO_UPDATE_CHECK) {
    return;
  }
  if (!process.stdout.isTTY) {
    return;
  }

  const current = getCurrentVersion();

  const cache = readCache();
  let latest: string;

  if (cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
    latest = cache.version;
  } else {
    try {
      latest = await fetchLatestVersion();
      writeCache(latest);
    } catch {
      return;
    }
  }

  if (!isNewer(latest, current)) {
    return;
  }

  const installCmd = detectInstallCommand();

  // Non-blocking banner — just inform, never block stdin
  console.error(`\n  ${c.yellow}┌─────────────────────────────────────────────────┐${c.reset}`);
  console.error(
    `  ${c.yellow}│${c.reset}  ${c.bold}Update available${c.reset}  ` +
      `${c.dim}${current}${c.reset} ${c.yellow}→${c.reset} ${c.bold}${c.cyan}${latest}${c.reset}`
  );
  console.error(`  ${c.yellow}│${c.reset}  Run: ${c.bold}${installCmd}${c.reset}`);
  console.error(`  ${c.yellow}└─────────────────────────────────────────────────┘${c.reset}\n`);
}
