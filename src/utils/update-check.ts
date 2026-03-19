import { get } from "https";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";

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
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(__dirname, "../../package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [lMaj, lMin, lPatch] = parse(latest);
  const [cMaj, cMin, cPatch] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
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
    if (npmGlobal && readFileSync(`${npmGlobal}/${NPM_PACKAGE}/package.json`, "utf8")) {
      return `npm install -g ${NPM_PACKAGE}@latest`;
    }
  } catch { /* fall through */ }

  try {
    execSync("pnpm --version 2>/dev/null", { encoding: "utf8" });
    const pnpmGlobal = execSync("pnpm root -g 2>/dev/null", { encoding: "utf8" }).trim();
    if (pnpmGlobal && readFileSync(`${pnpmGlobal}/${NPM_PACKAGE}/package.json`, "utf8")) {
      return `pnpm add -g ${NPM_PACKAGE}@latest`;
    }
  } catch { /* fall through */ }

  try {
    execSync("yarn --version 2>/dev/null", { encoding: "utf8" });
    return `yarn global add ${NPM_PACKAGE}@latest`;
  } catch { /* fall through */ }

  return `npm install -g ${NPM_PACKAGE}@latest`;
}

function runUpgrade(cmd: string): boolean {
  const [bin, ...args] = cmd.split(" ");
  const result = spawnSync(bin, args, { stdio: "inherit" });
  return result.status === 0;
}

/** Read a single keypress from stdin without requiring Enter. */
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasTTY = stdin.isTTY;

    if (wasTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (key: string) => {
      if (wasTTY) stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      resolve(key);
    };

    stdin.on("data", onData);

    // Timeout after 10s — treat as skip
    setTimeout(() => {
      if (wasTTY) stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      resolve("n");
    }, 10_000);
  });
}

export async function checkForUpdate(): Promise<void> {
  // Skip in CI, piped output, or explicitly disabled
  if (process.env.CI || process.env.NO_UPDATE_CHECK) return;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return;

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

  if (!isNewer(latest, current)) return;

  const installCmd = detectInstallCommand();

  // Banner
  console.log(`\n  ${c.yellow}┌─────────────────────────────────────────────────┐${c.reset}`);
  console.log(
    `  ${c.yellow}│${c.reset}  ${c.bold}Update available${c.reset}  ` +
      `${c.dim}${current}${c.reset} ${c.yellow}→${c.reset} ${c.bold}${c.cyan}${latest}${c.reset}`
  );
  console.log(`  ${c.yellow}│${c.reset}  Press ${c.bold}Y${c.reset} to update now, any other key to skip`);
  console.log(`  ${c.yellow}└─────────────────────────────────────────────────┘${c.reset}`);
  process.stdout.write(`\n  > `);

  const key = await readKey();
  const accepted = key.toLowerCase() === "y";

  console.log(accepted ? "Updating…" : "Skipped.\n");

  if (!accepted) return;

  console.log(`\n  ${c.dim}$ ${installCmd}${c.reset}\n`);
  const ok = runUpgrade(installCmd);

  if (ok) {
    console.log(`\n  ${c.green}✓${c.reset} ${c.bold}Updated to ${latest}!${c.reset} Restart codebase to use the new version.\n`);
  } else {
    console.log(`\n  ${c.yellow}!${c.reset} Update failed. Run manually: ${c.bold}${installCmd}${c.reset}\n`);
  }

  // Exit so the old binary doesn't continue running after upgrade
  process.exit(0);
}
