import { resolve, join } from "node:path";
import { existsSync, rmSync, unlinkSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import type { CLIOptions } from "../types.js";
import { claudeIntegration } from "../integrations/claude.js";
import { log, success, info, heading } from "../utils/output.js";

export async function runUninstall(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const force = options.force;

  heading("codebase uninstall");

  if (!force) {
    log("This will remove all codebase artifacts from your project:");
    log("  .codebase.json, .claude/ hooks/skills/commands, .mcp.json, git hooks,");
    log("  CLAUDE.md injection block, .vibekit/, HANDOFF.md, PLAN.md");
    log("");
    log("Run with --force to skip this confirmation.");
    log("");
    log("  Aborting. Use: codebase uninstall --force");
    return;
  }

  let removed = 0;

  // ── 1. Remove .codebase.json ───────────────────────────────────
  const manifestPath = join(root, ".codebase.json");
  if (existsSync(manifestPath)) {
    unlinkSync(manifestPath);
    success(".codebase.json removed");
    removed++;
  } else {
    info(".codebase.json not found");
  }

  // ── 2. Remove CLAUDE.md injection block ─────────────────────────
  const claudePath = join(root, "CLAUDE.md");
  if (existsSync(claudePath)) {
    claudeIntegration.remove(root);
    success("CLAUDE.md injection block removed");
    removed++;
  } else {
    info("CLAUDE.md not found");
  }

  // ── 3. Remove .claude/hooks/ ────────────────────────────────────
  const hooksDir = join(root, ".claude", "hooks");
  if (existsSync(hooksDir)) {
    rmSync(hooksDir, { recursive: true, force: true });
    success(".claude/hooks/ removed");
    removed++;
  }

  // ── 4. Remove .claude/skills/ (project-local only) ─────────────
  const skillsDir = join(root, ".claude", "skills");
  if (existsSync(skillsDir)) {
    rmSync(skillsDir, { recursive: true, force: true });
    success(".claude/skills/ removed (project-local)");
    removed++;
  }

  // ── 5. Remove .claude/commands/ (project-local only) ────────────
  const commandsDir = join(root, ".claude", "commands");
  if (existsSync(commandsDir)) {
    // Only remove files that look like codebase commands
    const codebaseCommands = readdirSync(commandsDir).filter((f) =>
      [
        "setup.md",
        "simulate.md",
        "build.md",
        "launch.md",
        "review.md",
        "vibeloop.md",
        "produce.md",
      ].includes(f)
    );
    for (const f of codebaseCommands) {
      unlinkSync(join(commandsDir, f));
    }
    if (codebaseCommands.length > 0) {
      success(`.claude/commands/ — ${codebaseCommands.length} codebase commands removed`);
      removed++;
    }
    // Remove dir if empty
    const remaining = readdirSync(commandsDir);
    if (remaining.length === 0) {
      rmSync(commandsDir, { recursive: true, force: true });
    }
  }

  // ── 6. Remove .claude/settings.json ─────────────────────────────
  const settingsPath = join(root, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      if (settings.hooks) {
        // Remove codebase hooks but preserve any other hooks
        for (const event of Object.keys(settings.hooks)) {
          const hooks = settings.hooks[event] as unknown[];
          settings.hooks[event] = hooks.filter((h: unknown) => {
            const str = JSON.stringify(h);
            return (
              !str.includes("git-guard") &&
              !str.includes("git-post") &&
              !str.includes("session-start") &&
              !str.includes("context-inject")
            );
          });
          // Clean up empty arrays
          if ((settings.hooks[event] as unknown[]).length === 0) {
            delete settings.hooks[event];
          }
        }
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
        success(".claude/settings.json — codebase hooks removed");
        removed++;

        // Remove settings.json if empty (no hooks left)
        const cleanSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
        if (Object.keys(cleanSettings).length === 0) {
          unlinkSync(settingsPath);
        }
      }
    } catch {
      // If we can't parse it, leave it alone
    }
  }

  // ── 7. Remove .claude/ dir if empty ─────────────────────────────
  const claudeDir = join(root, ".claude");
  if (existsSync(claudeDir)) {
    const remaining = readdirSync(claudeDir);
    if (remaining.length === 0) {
      rmSync(claudeDir, { recursive: true, force: true });
      success(".claude/ directory removed (was empty)");
    }
  }

  // ── 8. Remove .mcp.json ────────────────────────────────────────
  const mcpPath = join(root, ".mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, "utf-8"));
      if (mcp.mcpServers?.codebase) {
        delete mcp.mcpServers.codebase;
        if (Object.keys(mcp.mcpServers).length === 0) {
          delete mcp.mcpServers;
        }
        if (Object.keys(mcp).length === 0) {
          unlinkSync(mcpPath);
        } else {
          writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n", "utf-8");
        }
        success(".mcp.json — codebase server removed");
        removed++;
      }
    } catch {
      // Can't parse — leave alone
    }
  }

  // ── 9. Remove git hooks ────────────────────────────────────────
  const gitDir = join(root, ".git");
  if (existsSync(gitDir)) {
    const hookFiles = ["post-commit", "pre-commit", "post-checkout"];
    for (const hook of hookFiles) {
      const hookPath = join(gitDir, "hooks", hook);
      if (existsSync(hookPath)) {
        const content = readFileSync(hookPath, "utf-8");
        if (content.includes("codebase")) {
          unlinkSync(hookPath);
          success(`git hook ${hook} removed`);
          removed++;
        }
      }
    }

    // Remove commit-msg hook if it has our marker
    const commitMsgPath = join(gitDir, "hooks", "commit-msg");
    if (existsSync(commitMsgPath)) {
      const content = readFileSync(commitMsgPath, "utf-8");
      if (content.includes("codebase-branch-check")) {
        // Remove just our block, not the whole file
        const cleaned = content
          .split("\n")
          .filter((line: string) => !line.includes("codebase-branch-check"))
          .join("\n")
          .replace(/#\s*Direct commits to.*\n/g, "")
          .replace(/#\s*Switch to develop.*\n/g, "")
          .replace(/#\s*Release via.*\n/g, "")
          .replace(/BRANCH=\$\(git rev-parse.*\n/g, "")
          .replace(/if \[ "\$BRANCH".*\n/g, "")
          .replace(/\s*echo ""\n/g, "")
          .replace(/\s*echo "  Direct commits.*\n/g, "")
          .replace(/\s*echo "  Switch to.*\n/g, "")
          .replace(/\s*echo "  Release via.*\n/g, "")
          .replace(/\s*exit 1\n/g, "")
          .replace(/\s*fi\n/g, "")
          .trim();

        if (cleaned.length > 10) {
          writeFileSync(commitMsgPath, cleaned + "\n", "utf-8");
        } else {
          unlinkSync(commitMsgPath);
        }
        success("commit-msg hook — codebase block removed");
        removed++;
      }
    }
  }

  // ── 10. Remove .vibekit/ ────────────────────────────────────────
  const vibekitDir = join(root, ".vibekit");
  if (existsSync(vibekitDir)) {
    rmSync(vibekitDir, { recursive: true, force: true });
    success(".vibekit/ removed");
    removed++;
  }

  // ── 11. Remove HANDOFF.md, PLAN.md ─────────────────────────────
  for (const file of ["HANDOFF.md", "PLAN.md"]) {
    const filePath = join(root, file);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      success(`${file} removed`);
      removed++;
    }
  }

  // ── 12. Clean .gitignore entries ────────────────────────────────
  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    const linesToRemove = [
      ".codebase.json",
      ".codebase.cache",
      ".vibekit/daemon.lock",
      ".vibekit/daemon.log",
      ".vibekit/build.lock",
      ".vibekit/milestone.env",
      ".mcp.json",
    ];
    const cleaned = content
      .split("\n")
      .filter((line: string) => !linesToRemove.includes(line.trim()))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    writeFileSync(gitignorePath, cleaned + "\n", "utf-8");
    success(".gitignore — codebase entries removed");
    removed++;
  }

  log("");
  if (removed > 0) {
    success(`Uninstall complete — ${removed} items removed`);
    info(
      "Note: Global skills in ~/.claude/skills/ were NOT removed (may be shared with other projects)"
    );
    info(
      "Note: Global commands in ~/.claude/commands/ were NOT removed (may be shared with other projects)"
    );
    info(
      "To remove global artifacts: rm -rf ~/.claude/skills/*.skill ~/.claude/skills/*/ ~/.claude/commands/*.md"
    );
  } else {
    info("No codebase artifacts found — project is already clean");
  }
}
