import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const HOOK_MARKER = "# codebase-auto-update";

/**
 * Install BOTH post-commit and post-checkout hooks.
 * If ghSync is true, the hooks also refresh GitHub data.
 * Also installs a pre-commit hook that runs typecheck + lint if available.
 */
export function installHooks(root: string, ghSync = false): boolean {
  if (!existsSync(join(root, ".git"))) {
    return false;
  }

  const syncFlag = ghSync ? " --sync" : "";
  const hookCmd = `npx --yes codebase scan-only --incremental --quiet${syncFlag}`;

  installSingleHook(root, "post-commit", hookCmd);
  installSingleHook(root, "post-checkout", hookCmd);
  installPreCommitHook(root);

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

const PRE_COMMIT_MARKER = "# codebase-pre-commit";

function installPreCommitHook(root: string): void {
  const hooksDir = join(root, ".git", "hooks");
  const hookPath = join(hooksDir, "pre-commit");

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Only install if there's a package.json with a check or typecheck script
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    return;
  }

  let hasCheck = false;
  let hasTypecheck = false;
  let hasLint = false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    hasCheck = !!pkg.scripts?.check;
    hasTypecheck = !!pkg.scripts?.typecheck;
    hasLint = !!pkg.scripts?.lint;
  } catch {
    return;
  }

  if (!hasCheck && !hasTypecheck && !hasLint) {
    return;
  }

  // Build the check command: prefer `check` (runs both), else typecheck + lint separately
  let checkCmd: string;
  if (hasCheck) {
    checkCmd = `npm run check --silent`;
  } else {
    const parts: string[] = [];
    if (hasTypecheck) {
      parts.push(`npm run typecheck --silent`);
    }
    if (hasLint) {
      parts.push(`npm run lint --silent`);
    }
    checkCmd = parts.join(" && ");
  }

  const script = `#!/bin/sh
${PRE_COMMIT_MARKER}
# Run typecheck + lint before every commit. Fix errors before committing.
if [ -f package.json ]; then
  ${checkCmd} || {
    echo ""
    echo "  Pre-commit check failed. Fix the errors above before committing."
    echo "  To skip (not recommended): git commit --no-verify"
    echo ""
    exit 1
  }
fi
`;

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (!existing.includes(PRE_COMMIT_MARKER)) {
      writeFileSync(hookPath, existing.trimEnd() + "\n\n" + script, "utf-8");
    }
  } else {
    writeFileSync(hookPath, script, "utf-8");
  }
  chmodSync(hookPath, 0o755);
}

function installSingleHook(root: string, hookName: string, command: string): void {
  const hooksDir = join(root, ".git", "hooks");
  const hookPath = join(hooksDir, hookName);

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

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
    writeFileSync(hookPath, content.trimEnd() + `\n\n${HOOK_MARKER}\n${command}\n`, "utf-8");
  } else {
    writeFileSync(hookPath, `#!/bin/sh\n\n${HOOK_MARKER}\n${command}\n`, "utf-8");
  }

  chmodSync(hookPath, 0o755);
}

function removeSingleHook(root: string, hookName: string): boolean {
  const hookPath = join(root, ".git", "hooks", hookName);
  if (!existsSync(hookPath)) {
    return false;
  }

  let content = readFileSync(hookPath, "utf-8");
  if (!content.includes(HOOK_MARKER)) {
    return false;
  }

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
