#!/bin/bash
# codebase git-guard — PreToolUse hook
# Reads Claude tool input JSON from stdin, enforces git safety rules.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

# ── Rule 1: No commits to protected branches ──────────────────
if echo "$CMD" | grep -qE "^git commit|&& git commit| git commit"; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [[ "$BRANCH" == "main" || "$BRANCH" == "master" || "$BRANCH" == "prod" || "$BRANCH" == "production" ]]; then
    echo ""
    echo "  BLOCKED: Direct commits to '$BRANCH' are not allowed."
    echo ""
    echo "  Branch naming convention:"
    echo "    feat/<slug>     new features"
    echo "    fix/<slug>      bug fixes"
    echo "    chore/<slug>    maintenance"
    echo "    hotfix/<slug>   urgent prod fixes"
    echo "    docs/<slug>     documentation"
    echo "    test/<slug>     test additions"
    echo ""
    echo "  Switch to develop first:"
    echo "    git checkout develop && git pull origin develop"
    echo "    git checkout -b feat/<your-feature>"
    echo ""
    exit 2
  fi
fi

# ── Rule 2: No direct push to protected branches ──────────────
if echo "$CMD" | grep -qE "git push.*(origin )?(main|master|prod|production)(s|$|"|')"; then
  echo ""
  echo "  BLOCKED: Direct push to protected branch is not allowed."
  echo "  Use /launch to release to main."
  echo ""
  exit 2
fi

# ── Rule 3: No force push ever ────────────────────────────────
if echo "$CMD" | grep -qE "git push.*(--force|-f)( |$)"; then
  echo ""
  echo "  BLOCKED: Force push is not allowed."
  echo "  If you need to undo a commit, use: git revert <sha>"
  echo ""
  exit 2
fi

# ── Rule 4: Pull before commit if behind remote ───────────────
if echo "$CMD" | grep -qE "^git commit|&& git commit| git commit"; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -n "$BRANCH" ] && [ "$BRANCH" != "HEAD" ]; then
    git fetch origin "$BRANCH" --quiet 2>/dev/null || true
    BEHIND=$(git rev-list HEAD..origin/"$BRANCH" --count 2>/dev/null || echo "0")
    if [[ "$BEHIND" -gt 0 ]]; then
      echo ""
      echo "  BLOCKED: Branch '$BRANCH' is $BEHIND commit(s) behind origin/$BRANCH."
      echo "  Pull first:  git pull origin $BRANCH"
      echo ""
      exit 2
    fi
  fi
fi

exit 0
