#!/bin/bash
# context-inject.sh — UserPromptSubmit hook
# Outputs project slim brief as system-reminder on the FIRST prompt of each
# Claude Code session only. Re-injects if the manifest is refreshed mid-session.

MANIFEST=".codebase.json"

# Read session_id from stdin JSON (Claude Code passes hook data as JSON)
# Fall back to a hash of cwd if jq/python unavailable
STDIN_DATA=$(cat)
SESSION_ID=$(echo "$STDIN_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null || true)

if [ -z "$SESSION_ID" ]; then
  # Fallback: use stable hash of cwd (one injection per directory per day)
  SESSION_ID=$(echo "$(pwd)$(date +%Y%m%d)" | md5sum 2>/dev/null | cut -c1-12 || echo "$(pwd)$(date +%Y%m%d)" | md5 2>/dev/null | cut -c1-12 || echo "default")
fi

HASH=$(echo "$(pwd)" | md5sum 2>/dev/null | cut -c1-8 || echo "$(pwd)" | md5 2>/dev/null | cut -c1-8 || echo "proj")
SENTINEL="/tmp/.codebase-ctx-${HASH}-${SESSION_ID}"

# Not first prompt of this session — check if manifest was refreshed
if [ -f "$SENTINEL" ]; then
  if [ -f "$MANIFEST" ] && [ "$MANIFEST" -nt "$SENTINEL" ]; then
    echo "--- codebase context refreshed ---"
    npx --yes codebase context --quiet 2>/dev/null || true
    touch "$SENTINEL"
  fi
  exit 0
fi

# First prompt of this session — create sentinel and output slim brief
touch "$SENTINEL"

if [ -f "$MANIFEST" ]; then
  # Re-scan if manifest is older than CODEBASE_HOOK_TTL_MINUTES (default 30)
  TTL_MINUTES=${CODEBASE_HOOK_TTL_MINUTES:-30}
  AGE_SECONDS=$(( $(date +%s) - $(stat -f %m "$MANIFEST" 2>/dev/null || stat -c %Y "$MANIFEST" 2>/dev/null || echo 0) ))
  if [ "$AGE_SECONDS" -gt $(( TTL_MINUTES * 60 )) ]; then
    npx --yes codebase scan-only --quiet 2>/dev/null || true
  fi
fi

npx --yes codebase context --quiet 2>/dev/null || true
