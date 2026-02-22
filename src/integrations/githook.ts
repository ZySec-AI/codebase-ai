import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const HOOK_MARKER = "# codebase-auto-update";

/**
 * Install BOTH post-commit and post-checkout hooks.
 * If ghSync is true, the hooks also refresh GitHub data.
 */
export function installHooks(root: string, ghSync = false): boolean {
  if (!existsSync(join(root, ".git"))) return false;

  const syncFlag = ghSync ? " --sync" : "";
  const hookCmd = `npx --yes codebase scan-only --incremental --quiet${syncFlag}`;

  installSingleHook(root, "post-commit", hookCmd);
  installSingleHook(root, "post-checkout", hookCmd);

  return true;
}

/**
 * Legacy function — install only post-commit hook.
 */
export function installHook(root: string): boolean {
  return installHooks(root, false);
}

export function uninstallHook(root: string): boolean {
  const removed1 = removeSingleHook(root, "post-commit");
  const removed2 = removeSingleHook(root, "post-checkout");
  return removed1 || removed2;
}

// ─── Internal ────────────────────────────────────────────────────

function installSingleHook(root: string, hookName: string, command: string): void {
  const hooksDir = join(root, ".git", "hooks");
  const hookPath = join(hooksDir, hookName);

  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

  if (existsSync(hookPath)) {
    const content = readFileSync(hookPath, "utf-8");
    if (content.includes(HOOK_MARKER)) {
      // Already installed — update the command in case flags changed
      const updated = content.replace(
        new RegExp(`${HOOK_MARKER}\\n.*`, "m"),
        `${HOOK_MARKER}\n${command}`
      );
      writeFileSync(hookPath, updated, "utf-8");
      return;
    }
    // Append to existing hook
    writeFileSync(
      hookPath,
      content.trimEnd() + `\n\n${HOOK_MARKER}\n${command}\n`,
      "utf-8"
    );
  } else {
    writeFileSync(
      hookPath,
      `#!/bin/sh\n\n${HOOK_MARKER}\n${command}\n`,
      "utf-8"
    );
  }

  chmodSync(hookPath, 0o755);
}

function removeSingleHook(root: string, hookName: string): boolean {
  const hookPath = join(root, ".git", "hooks", hookName);
  if (!existsSync(hookPath)) return false;

  let content = readFileSync(hookPath, "utf-8");
  if (!content.includes(HOOK_MARKER)) return false;

  // Remove the marker and the line after it
  const lines = content.split("\n");
  const filtered: string[] = [];
  let skipNext = false;

  for (const line of lines) {
    if (line.includes(HOOK_MARKER)) {
      skipNext = true;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    filtered.push(line);
  }

  content = filtered.join("\n");

  const trimmed = content.replace(/^#!.*\n?/, "").trim();
  if (!trimmed) {
    unlinkSync(hookPath);
  } else {
    writeFileSync(hookPath, content, "utf-8");
  }

  return true;
}
