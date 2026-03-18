---
description: Install, uninstall, start, stop, and monitor the codebase autonomous daemon (polls GitHub every 3 min, runs /build --once automatically).
argument-hint: [install|uninstall|start|stop|status|logs]
model: sonnet
allowed-tools: Bash(gh:*), Bash(git:*), Bash(launchctl:*), Bash(chmod:*), Bash(mkdir:*), Bash(crontab:*), Bash(node:*), Bash(npx:*), Read, Write, Edit
---

# /daemon

Manages the codebase autonomous daemon — a background process that polls GitHub issues every 3 minutes and runs `/build --once` automatically. No Claude session needs to stay open.

## Arguments

```
$ARGUMENTS
```

- `install` — install the daemon (launchd on macOS, cron on Linux) and start it
- `uninstall` — stop and remove the daemon
- `start` — start a previously installed daemon
- `stop` — stop the running daemon
- `status` — show daemon status, last run time, recent log lines
- `logs` — tail the last 50 log lines
- *(no args)* — show status

---

## Detect project

```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
VIBEKIT_DIR="$PROJECT_ROOT/.vibekit"
REPO_NAME="$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')"
GH_REMOTE="$(git remote get-url origin 2>/dev/null | sed 's|.*github.com[:/]||;s|\.git$||;s|/|-|g' | tr '[:upper:]' '[:lower:]' || echo "")"
DAEMON_ID="${GH_REMOTE:-$REPO_NAME}"
DAEMON_LABEL="com.codebase.${DAEMON_ID}.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/${DAEMON_LABEL}.plist"
DAEMON_SCRIPT="$VIBEKIT_DIR/daemon.sh"
LOG_FILE="$VIBEKIT_DIR/daemon.log"
PLATFORM="$(uname -s)"
```

---

## `install`

1. Check that `.vibekit/daemon.sh` exists:
```bash
[ -f "$DAEMON_SCRIPT" ] || { echo "ERROR: $DAEMON_SCRIPT not found. Run /setup first."; exit 1; }
```

2. Resolve full paths (launchd runs without $PATH):
```bash
CLAUDE_BIN="$(which claude 2>/dev/null || echo "/usr/local/bin/claude")"
GH_BIN="$(which gh 2>/dev/null || echo "/usr/local/bin/gh")"
NODE_BIN="$(which node 2>/dev/null || echo "/usr/local/bin/node")"
NPX_BIN="$(which npx 2>/dev/null || echo "/usr/local/bin/npx")"
```

### macOS (launchd)

Write plist to `~/Library/LaunchAgents/`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${DAEMON_SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>StartInterval</key>
  <integer>180</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:[dir of claude]:[dir of gh]:[dir of node]</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
  <key>ThrottleInterval</key>
  <integer>60</integer>
</dict>
</plist>
```

Replace all `${}` placeholders with actual resolved values before writing.

```bash
launchctl load "$PLIST_PATH"
launchctl start "$DAEMON_LABEL"
```

Print:
```
Daemon installed: $DAEMON_LABEL
Polls every: 3 minutes
Log: $LOG_FILE
Run /daemon status to verify.
```

### Linux (cron)

```bash
CRON_LINE="*/3 * * * * cd $PROJECT_ROOT && bash $DAEMON_SCRIPT >> $LOG_FILE 2>&1"
( crontab -l 2>/dev/null | grep -v "com.codebase.${DAEMON_ID}"; echo "# com.codebase.${DAEMON_ID}"; echo "$CRON_LINE" ) | crontab -
```

---

## `uninstall`

### macOS:
```bash
launchctl stop "$DAEMON_LABEL" 2>/dev/null || true
launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH" "$VIBEKIT_DIR/daemon.lock"
```

### Linux:
```bash
( crontab -l 2>/dev/null | grep -v "com.codebase.${DAEMON_ID}" ) | crontab -
```

---

## `start`

```bash
[ -f "$PLIST_PATH" ] || { echo "Daemon not installed. Run /daemon install first."; exit 1; }
launchctl start "$DAEMON_LABEL"
```

---

## `stop`

```bash
launchctl stop "$DAEMON_LABEL" 2>/dev/null || true
rm -f "$VIBEKIT_DIR/daemon.lock"
```

---

## `status` (default)

Show daemon state + project state from codebase:

```bash
echo "=== codebase daemon — ${REPO_NAME} ==="
echo "Label:   $DAEMON_LABEL"
echo "Script:  $DAEMON_SCRIPT"
echo "Log:     $LOG_FILE"
echo ""

# Installed?
[ -f "$PLIST_PATH" ] && echo "Installed: yes" || echo "Installed: no — run /daemon install"

# Running?
launchctl list 2>/dev/null | grep -q "$DAEMON_LABEL" \
  && echo "Status: running" || echo "Status: not running"

# Lock?
[ -f "$VIBEKIT_DIR/daemon.lock" ] && echo "Lock: held by pid $(cat "$VIBEKIT_DIR/daemon.lock")"

# codebase project state
echo ""
echo "Open issues (vibekit+arch):"
gh issue list --label "arch,vibekit" --state open --limit 100 --json number,title \
  --jq '.[] | "  #\(.number) \(.title)"' 2>/dev/null || true

# Last 5 log lines
[ -f "$LOG_FILE" ] && echo "" && echo "Last 5 log lines:" && tail -5 "$LOG_FILE"
echo "======================================="
```

---

## `logs`

```bash
[ -f "$LOG_FILE" ] || { echo "No log file yet at $LOG_FILE"; exit 0; }
tail -50 "$LOG_FILE"
```

---

## Notes

- Lock file (`$VIBEKIT_DIR/daemon.lock`) prevents overlapping runs
- Logs rotate at 2000 lines automatically
- When all bugs resolve and no arch issues remain, daemon auto-triggers `/launch`
- On macOS, launchd survives reboots — daemon restarts automatically
- The daemon uses `claude --print` (non-interactive, exits after task)
- `/setup` writes the daemon.sh script to `.vibekit/daemon.sh`
