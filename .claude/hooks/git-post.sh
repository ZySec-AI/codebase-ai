#!/bin/bash
# codebase git-post — PostToolUse hook
# Reads Claude tool input JSON from stdin. Reminds to raise PR after branch push.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

# ── Remind to raise PR after pushing a non-develop/main branch ──
if echo "$CMD" | grep -qE "git push origin [a-zA-Z0-9/_-]+"; then
  PUSHED_BRANCH=$(echo "$CMD" | grep -oE "git push origin [a-zA-Z0-9/_-]+" | awk '{print $4}')
  if [[ -n "$PUSHED_BRANCH" ]] &&      [[ "$PUSHED_BRANCH" != "main" ]] &&      [[ "$PUSHED_BRANCH" != "master" ]] &&      [[ "$PUSHED_BRANCH" != "develop" ]] &&      [[ "$PUSHED_BRANCH" != "prod" ]]; then
    echo ""
    echo "  Branch '$PUSHED_BRANCH' pushed."
    echo "  Raise a PR to develop:"
    echo "    gh pr create --base develop --head $PUSHED_BRANCH --title 'feat: <description>' --body 'Closes #<N>'"
    echo ""
  fi
fi

exit 0
