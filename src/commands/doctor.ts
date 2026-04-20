import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { checkGhDetailed } from "./init.js";
import { setQuiet, log, success, heading, dim, bold } from "../utils/output.js";
import { estimateTokens } from "../utils/tokens.js";

const HOOK_MARKER = "# codebase-auto-update";

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * `codebase doctor` — health check for project intelligence setup.
 *
 * Runs all checks and prints a diagnostic report. No mutations.
 * Exit code 0 if all pass, 1 if any issues.
 */
export async function runDoctor(options: CLIOptions): Promise<void> {
  const _start = Date.now();
  setQuiet(options.quiet);
  const root = resolve(options.path);
  const results: CheckResult[] = [];

  heading("codebase doctor\n");

  // ─── 1. Manifest exists ──────────────────────────────────────
  const manifestPath = join(root, ".codebase.json");
  let manifest: Manifest | null = null;

  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      manifest = JSON.parse(raw) as Manifest;
      const stat = statSync(manifestPath);
      const sizeKB = (stat.size / 1024).toFixed(1);
      const ageMs = Date.now() - stat.mtimeMs;
      const age = formatAge(ageMs);
      const manifestTokens = estimateTokens(raw);
      results.push({
        label: "Manifest",
        ok: true,
        detail: `.codebase.json (${sizeKB} KB, ~${manifestTokens} tokens, ${age})`,
      });
    } catch {
      results.push({ label: "Manifest", ok: false, detail: "Corrupted — run `codebase fix`" });
    }
  } else {
    results.push({ label: "Manifest", ok: false, detail: "Missing — run `codebase fix`" });
  }

  // ─── 2. Manifest freshness ──────────────────────────────────
  if (manifest) {
    const generatedAt = manifest.generated_at ? new Date(manifest.generated_at).getTime() : 0;
    const ageHours = (Date.now() - generatedAt) / (1000 * 60 * 60);

    // Check if any key project paths are newer than the manifest
    const freshnessCheckPaths = ["src", "lib", "app", "docs", "package.json", "tsconfig.json"];
    let stalePath: string | null = null;
    for (const p of freshnessCheckPaths) {
      const full = join(root, p);
      if (existsSync(full)) {
        try {
          const s = statSync(full);
          if (s.mtimeMs > generatedAt) {
            stalePath = p;
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (stalePath) {
      results.push({
        label: "Freshness",
        ok: false,
        detail: `Stale — ${stalePath} changed since last scan (${Math.round(ageHours)}h ago)`,
      });
    } else {
      results.push({ label: "Freshness", ok: true, detail: "Up to date" });
    }

    // ─── 3. Detector categories ──────────────────────────────
    const expectedCategories = [
      "project",
      "repo",
      "structure",
      "stack",
      "commands",
      "dependencies",
      "config",
      "git",
      "quality",
      "patterns",
      "api_docs",
    ];
    const presentCategories = expectedCategories.filter((c) => c in manifest!);
    if (presentCategories.length === expectedCategories.length) {
      results.push({ label: "Detectors", ok: true, detail: "11/11 categories present" });
    } else {
      const missing = expectedCategories.filter((c) => !presentCategories.includes(c));
      results.push({ label: "Detectors", ok: false, detail: `Missing: ${missing.join(", ")}` });
    }

    // ─── 3b. Detector warnings ───────────────────────────────
    const warnings = (manifest as unknown as Record<string, unknown>)._warnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
      for (const w of warnings) {
        const detail =
          typeof w === "object" && w !== null
            ? `(non-fatal) [${(w as { detector: string }).detector}] ${(w as { category: string }).category}: ${(w as { error: string }).error}`
            : `(non-fatal) ${w}`;
        results.push({ label: "Detector Warning", ok: false, detail });
      }
    }
  }

  // ─── 4. GitHub CLI ──────────────────────────────────────────
  const ghStatus = await checkGhDetailed();
  const ghAvailable = ghStatus === "authenticated";

  if (ghStatus === "authenticated") {
    results.push({ label: "GitHub CLI", ok: true, detail: "Authenticated" });
  } else if (ghStatus === "not-authenticated") {
    results.push({
      label: "GitHub CLI",
      ok: false,
      detail: "Not authenticated — run `gh auth login`",
    });
  } else {
    results.push({ label: "GitHub CLI", ok: false, detail: "Not installed — brew install gh" });
  }

  // ─── 5. GitHub consistency ─────────────────────────────────
  if (manifest) {
    const repoUrl = manifest.repo?.url;
    const githubAvailable = manifest.status?.github_available;
    const hasGithubRemote = repoUrl?.includes("github.com");

    if (hasGithubRemote && githubAvailable === false) {
      results.push({
        label: "GitHub Sync",
        ok: false,
        detail: "Repo has GitHub remote but github_available is false",
      });
    } else if (!hasGithubRemote && githubAvailable === true) {
      results.push({
        label: "GitHub Sync",
        ok: false,
        detail: "No GitHub remote but github_available is true",
      });
    } else {
      results.push({ label: "GitHub Sync", ok: true, detail: "Consistent" });
    }
  }

  // ─── 6. Claude Code injection ──────────────────────────────
  const claudeInjected = checkInjection(root);
  results.push({
    label: "Claude Code",
    ok: claudeInjected,
    detail: claudeInjected
      ? "CLAUDE.md injected"
      : "CLAUDE.md injection missing — run `codebase fix`",
  });

  // ─── 7. MCP ────────────────────────────────────────────────
  const mcpOk = checkMcpConfig(root);
  results.push({
    label: "MCP",
    ok: mcpOk,
    detail: mcpOk ? ".mcp.json configured" : ".mcp.json missing — run `codebase fix`",
  });

  // ─── 9. Git hooks ─────────────────────────────────────────
  if (existsSync(join(root, ".git"))) {
    const postCommitOk = checkHook(root, "post-commit");
    const postCheckoutOk = checkHook(root, "post-checkout");
    const hookHasSync = checkHookSync(root);

    if (postCommitOk && postCheckoutOk) {
      const syncDetail = ghAvailable ? (hookHasSync ? " (with --sync)" : "") : "";
      results.push({
        label: "Git Hooks",
        ok: true,
        detail: `post-commit + post-checkout${syncDetail}`,
      });
    } else {
      const missing: string[] = [];
      if (!postCommitOk) {
        missing.push("post-commit");
      }
      if (!postCheckoutOk) {
        missing.push("post-checkout");
      }
      results.push({ label: "Git Hooks", ok: false, detail: `${missing.join(" + ")} missing` });
    }

    // ─── 10. Hook sync flag ─────────────────────────────────
    if (ghAvailable && postCommitOk && !hookHasSync) {
      results.push({ label: "Hook Sync", ok: false, detail: "Missing --sync flag" });
    }
  } else {
    results.push({ label: "Git Hooks", ok: true, detail: "Not a git repo — skipped" });
  }

  // ─── 10b. commit-msg hook (branch enforcement) ────────────
  if (existsSync(join(root, ".git"))) {
    const commitMsgOk = checkCommitMsgHook(root);
    if (commitMsgOk) {
      results.push({
        label: "Branch Hook",
        ok: true,
        detail: "commit-msg blocks direct commits to main/master",
      });
    } else {
      results.push({
        label: "Branch Hook",
        ok: false,
        detail: "commit-msg hook missing — run `codebase fix`",
      });
    }
  }

  // ─── 10e. pre-commit hook (lint + typecheck) ───────────────
  if (existsSync(join(root, ".git"))) {
    const preCommitOk = checkPreCommitHook(root);
    const hasPkgScripts = (() => {
      try {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
        return !!(pkg.scripts?.check || pkg.scripts?.typecheck || pkg.scripts?.lint);
      } catch {
        return false;
      }
    })();
    if (!hasPkgScripts) {
      results.push({
        label: "Pre-commit",
        ok: true,
        detail: "No lint/typecheck scripts — skipped",
      });
    } else if (preCommitOk) {
      results.push({
        label: "Pre-commit",
        ok: true,
        detail: "Runs lint + typecheck before every commit",
      });
    } else {
      results.push({
        label: "Pre-commit",
        ok: false,
        detail: "pre-commit hook missing — run `codebase fix`",
      });
    }
  }

  // ─── 10c. Claude commands ──────────────────────────────────
  const claudeCommandsDir = join(root, ".claude", "commands");
  if (existsSync(claudeCommandsDir)) {
    const cmdFiles = readdirSync(claudeCommandsDir).filter((f) => f.endsWith(".md"));
    results.push({
      label: "Claude Commands",
      ok: cmdFiles.length > 0,
      detail: `${cmdFiles.length} commands in .claude/commands/`,
    });
  } else {
    results.push({
      label: "Claude Commands",
      ok: false,
      detail: ".claude/commands/ missing — run `codebase setup`",
    });
  }

  // ─── 10c-ii. Claude Skills (per-skill integrity check) ────
  {
    const globalSkillsDir = join(homedir(), ".claude", "skills");
    const projectSkillsDir = join(root, ".claude", "skills");

    // Try to load skills/manifest.json from the npm package
    let skillManifest: Array<{
      name: string;
      sha256: string;
      depends_on: string[];
    }> | null = null;
    try {
      const manifestUrl = new URL("../../../skills/manifest.json", import.meta.url);
      skillManifest = JSON.parse(readFileSync(manifestUrl, "utf-8")).skills;
    } catch {
      /* manifest not available in dev mode — fall back to simple check */
    }

    if (skillManifest) {
      const failures: string[] = [];
      const missingDeps: string[] = [];
      let verified = 0;

      for (const skill of skillManifest) {
        const globalInstalled = existsSync(join(globalSkillsDir, `${skill.name}.skill`));
        const projectInstalled = existsSync(join(projectSkillsDir, `${skill.name}.skill`));
        const installed = globalInstalled || projectInstalled;

        if (!installed) {
          failures.push(`${skill.name} (not installed)`);
          continue;
        }

        // SHA-256 integrity check against whichever location is present
        const installedPath = globalInstalled
          ? join(globalSkillsDir, `${skill.name}.skill`)
          : join(projectSkillsDir, `${skill.name}.skill`);
        try {
          const buf = readFileSync(installedPath);
          const hash = createHash("sha256").update(buf).digest("hex");
          if (hash !== skill.sha256) {
            failures.push(`${skill.name} (stale — run \`codebase fix --skills\`)`);
            continue;
          }
        } catch {
          failures.push(`${skill.name} (unreadable)`);
          continue;
        }

        // Check depends_on binaries
        for (const dep of skill.depends_on) {
          try {
            execFileSync("which", [dep], { timeout: 3_000, stdio: "ignore" });
          } catch {
            missingDeps.push(`${dep} (required by ${skill.name})`);
          }
        }

        verified++;
      }

      const total = skillManifest.length;
      if (failures.length === 0 && missingDeps.length === 0) {
        results.push({
          label: "Claude Skills",
          ok: true,
          detail: `${verified}/${total} verified`,
        });
      } else {
        const parts: string[] = [];
        if (failures.length > 0) {
          parts.push(`failures: ${failures.join(", ")}`);
        }
        if (missingDeps.length > 0) {
          parts.push(`missing deps: ${missingDeps.join(", ")}`);
        }
        results.push({
          label: "Claude Skills",
          ok: false,
          detail: `${verified}/${total} verified — ${parts.join("; ")} — run \`codebase fix\``,
        });
      }
    } else {
      // Fallback: simple existence check when manifest unavailable
      const skillsDir = existsSync(globalSkillsDir) ? globalSkillsDir : projectSkillsDir;
      if (existsSync(skillsDir)) {
        const skillFiles = readdirSync(skillsDir).filter((f) => f.endsWith(".skill"));
        if (skillFiles.length > 0) {
          const names = skillFiles.map((f) => f.replace(/\.skill$/, "")).join(", ");
          results.push({
            label: "Claude Skills",
            ok: true,
            detail: `${skillFiles.length} skill${skillFiles.length > 1 ? "s" : ""} installed: ${names}`,
          });
        } else {
          results.push({
            label: "Claude Skills",
            ok: false,
            detail: "No skills installed — run: codebase setup",
          });
        }
      } else {
        results.push({
          label: "Claude Skills",
          ok: false,
          detail: "No skills installed — run: codebase setup",
        });
      }
    }
  }

  // ─── 10d. Claude Code hooks ────────────────────────────────
  const settingsFile = join(root, ".claude", "settings.json");
  const guardHook = join(root, ".claude", "hooks", "git-guard.sh");
  const postHook = join(root, ".claude", "hooks", "git-post.sh");
  const hooksInstalled = existsSync(guardHook) && existsSync(postHook);
  const settingsOk = (() => {
    if (!existsSync(settingsFile)) {
      return false;
    }
    try {
      const s = JSON.parse(readFileSync(settingsFile, "utf-8"));
      const pre = JSON.stringify(s.hooks?.PreToolUse ?? "");
      const post = JSON.stringify(s.hooks?.PostToolUse ?? "");
      return pre.includes("git-guard") && post.includes("git-post");
    } catch {
      return false;
    }
  })();
  if (hooksInstalled && settingsOk) {
    results.push({
      label: "Claude Hooks",
      ok: true,
      detail: "git-guard + git-post wired in settings.json",
    });
  } else {
    const missing: string[] = [];
    if (!hooksInstalled) {
      missing.push("hook scripts");
    }
    if (!settingsOk) {
      missing.push("settings.json wiring");
    }
    results.push({
      label: "Claude Hooks",
      ok: false,
      detail: `Missing: ${missing.join(", ")} — run \`codebase setup\``,
    });
  }

  // ─── TOKEN HEALTH ─────────────────────────────────────────

  // T1. CLAUDE.md size
  const claudeMdPath = join(root, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    const claudeContent = readFileSync(claudeMdPath, "utf-8");
    const claudeLines = claudeContent.split("\n").length;
    const claudeTokens = estimateTokens(claudeContent);
    if (claudeLines > 500) {
      results.push({
        label: "CLAUDE.md Size",
        ok: false,
        detail: `${claudeLines} lines, ~${claudeTokens} tokens — trim to under 300 lines`,
      });
    } else if (claudeLines > 300) {
      results.push({
        label: "CLAUDE.md Size",
        ok: true,
        detail: `${claudeLines} lines, ~${claudeTokens} tokens — consider trimming`,
      });
    } else {
      results.push({
        label: "CLAUDE.md Size",
        ok: true,
        detail: `${claudeLines} lines, ~${claudeTokens} tokens`,
      });
    }

    // T2. Injection block size
    const injStart = claudeContent.indexOf("<!-- codebase:start -->");
    const injEnd = claudeContent.indexOf("<!-- codebase:end -->");
    if (injStart !== -1 && injEnd !== -1) {
      const injBlock = claudeContent.slice(injStart, injEnd + "<!-- codebase:end -->".length);
      const injLines = injBlock.split("\n").length;
      if (injLines > 80) {
        results.push({
          label: "Injection Block",
          ok: false,
          detail: `${injLines} lines — bloated, run \`codebase fix\` to re-inject`,
        });
      } else {
        results.push({ label: "Injection Block", ok: true, detail: `${injLines} lines` });
      }
    }
  }

  // T3. MCP server count
  const mcpPath = join(root, ".mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const mcpConfig = JSON.parse(readFileSync(mcpPath, "utf-8"));
      const serverNames = Object.keys(mcpConfig.mcpServers ?? {});
      const count = serverNames.length;
      if (count > 5) {
        results.push({
          label: "MCP Servers",
          ok: false,
          detail: `${count} servers — each adds ~10k tokens; remove unused ones`,
        });
      } else if (count > 3) {
        results.push({
          label: "MCP Servers",
          ok: true,
          detail: `${count} servers — ${serverNames.join(", ")} (consider trimming)`,
        });
      } else {
        results.push({
          label: "MCP Servers",
          ok: true,
          detail: `${count} server${count !== 1 ? "s" : ""}: ${serverNames.join(", ") || "none"}`,
        });
      }
    } catch {
      /* already flagged by check #7 */
    }
  }

  // T4. Session-start hook
  const sessionHookPath = join(root, ".claude", "hooks", "session-start.sh");
  const sessionHookInstalled = existsSync(sessionHookPath);
  const sessionHookExecutable = sessionHookInstalled
    ? !!(statSync(sessionHookPath).mode & 0o111)
    : false;
  const sessionHookWired = (() => {
    if (!existsSync(settingsFile)) {
      return false;
    }
    try {
      const s = JSON.parse(readFileSync(settingsFile, "utf-8"));
      return JSON.stringify(s.hooks?.PreToolUse ?? "").includes("session-start");
    } catch {
      return false;
    }
  })();
  if (sessionHookInstalled && sessionHookWired && sessionHookExecutable) {
    results.push({ label: "Session Hook", ok: true, detail: "session-start.sh installed + wired" });
  } else {
    const missing: string[] = [];
    if (!sessionHookInstalled) {
      missing.push("script");
    } else if (!sessionHookExecutable) {
      missing.push("not executable (chmod +x)");
    }
    if (!sessionHookWired) {
      missing.push("settings.json wiring");
    }
    results.push({
      label: "Session Hook",
      ok: false,
      detail: `Missing: ${missing.join(", ")} — run \`codebase fix\``,
    });
  }

  // T5. Context inject hook (UserPromptSubmit)
  const contextHookPath = join(root, ".claude", "hooks", "context-inject.sh");
  const contextHookInstalled = existsSync(contextHookPath);
  const contextHookExecutable = contextHookInstalled
    ? !!(statSync(contextHookPath).mode & 0o111)
    : false;
  const contextHookWired = (() => {
    if (!existsSync(settingsFile)) {
      return false;
    }
    try {
      const s = JSON.parse(readFileSync(settingsFile, "utf-8"));
      return JSON.stringify(s.hooks?.UserPromptSubmit ?? "").includes("context-inject");
    } catch {
      return false;
    }
  })();
  if (contextHookInstalled && contextHookWired && contextHookExecutable) {
    // Show manifest age next to context hook status for quick staleness signal
    const manifestAgeSec = (() => {
      try {
        return Math.floor((Date.now() - statSync(join(root, ".codebase.json")).mtimeMs) / 1000);
      } catch {
        return -1;
      }
    })();
    const ageLabel =
      manifestAgeSec < 0
        ? "no manifest"
        : manifestAgeSec < 60
          ? `${manifestAgeSec}s ago`
          : manifestAgeSec < 3600
            ? `${Math.floor(manifestAgeSec / 60)}m ago`
            : `${Math.floor(manifestAgeSec / 3600)}h ago`;
    results.push({
      label: "Context Hook",
      ok: true,
      detail: `context-inject.sh installed + wired — manifest ${ageLabel}`,
    });
  } else {
    const missing: string[] = [];
    if (!contextHookInstalled) {
      missing.push("script");
    } else if (!contextHookExecutable) {
      missing.push("not executable (chmod +x)");
    }
    if (!contextHookWired) {
      missing.push("UserPromptSubmit wiring");
    }
    results.push({
      label: "Context Hook",
      ok: false,
      detail: `Missing: ${missing.join(", ")} — run \`codebase fix\``,
    });
  }

  // ─── 11. Gitignore ────────────────────────────────────────
  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(".codebase.json")) {
      results.push({ label: "Gitignore", ok: true, detail: ".codebase.json in .gitignore" });
    } else {
      results.push({ label: "Gitignore", ok: false, detail: ".codebase.json not in .gitignore" });
    }
  } else {
    results.push({ label: "Gitignore", ok: false, detail: ".gitignore missing" });
  }

  // ─── Print results ────────────────────────────────────────
  const NO_COLOR = !!process.env.NO_COLOR;
  const green = NO_COLOR ? "" : "\x1b[32m";
  const red = NO_COLOR ? "" : "\x1b[31m";
  const reset = NO_COLOR ? "" : "\x1b[0m";

  const LABEL_WIDTH = 20;

  type Section = "MANIFEST" | "GITHUB" | "AI TOOLS" | "TOKEN HEALTH" | "GIT";

  function sectionFor(label: string): Section {
    if (["Manifest", "Freshness", "Detectors", "Detector Warning"].includes(label)) {
      return "MANIFEST";
    }
    if (["GitHub CLI", "GitHub Sync"].includes(label)) {
      return "GITHUB";
    }
    if (
      ["Claude Code", "MCP", "Claude Commands", "Claude Skills", "Claude Hooks"].includes(label)
    ) {
      return "AI TOOLS";
    }
    if (["CLAUDE.md Size", "Injection Block", "MCP Servers", "Session Hook"].includes(label)) {
      return "TOKEN HEALTH";
    }
    return "GIT";
  }

  let lastSection: Section | null = null;

  for (const r of results) {
    const section = sectionFor(r.label.trimStart());
    if (section !== lastSection) {
      log("");
      dim(`  ${section}`);
      lastSection = section;
    }
    const icon = r.ok ? `${green}\u2713${reset}` : `${red}\u2717${reset}`;
    log(`  ${r.label.trimStart().padEnd(LABEL_WIDTH)} ${icon} ${r.detail}`);
  }

  const issues = results.filter((r) => !r.ok);
  const total = results.length;
  const passing = total - issues.length;

  log("");
  if (issues.length === 0) {
    log(`  ${bold(`Health: ${passing}/${total}`)}  — All checks passed.`);
  } else {
    log(
      `  ${bold(`Health: ${passing}/${total}`)}  — ${issues.length} issue${issues.length > 1 ? "s" : ""} found. Run \`codebase fix\` to repair.`
    );
  }
  log("");
  const elapsed = ((Date.now() - _start) / 1000).toFixed(1);
  success(`Done  (${elapsed}s)`);

  if (issues.length > 0) {
    process.exit(1);
  }
}

// ─── Check helpers ──────────────────────────────────────────────

export function checkInjection(root: string): boolean {
  const filePath = join(root, "CLAUDE.md");
  if (!existsSync(filePath)) {
    return false;
  }
  const content = readFileSync(filePath, "utf-8");
  return content.includes("<!-- codebase:start -->");
}

function checkMcpConfig(root: string): boolean {
  const mcpPath = join(root, ".mcp.json");
  if (!existsSync(mcpPath)) {
    return false;
  }
  try {
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    return !!config.mcpServers?.codebase;
  } catch {
    return false;
  }
}

export function checkHook(root: string, hookName: string): boolean {
  const hookPath = join(root, ".git", "hooks", hookName);
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes(HOOK_MARKER);
}

function checkCommitMsgHook(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "commit-msg");
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("codebase-branch-check");
}

export function checkPreCommitHook(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "pre-commit");
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("codebase-pre-commit");
}

export function checkHookSync(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "post-commit");
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("--sync");
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds} sec ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
