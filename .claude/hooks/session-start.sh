#!/bin/bash
# codebase session-start — fires once per Claude Code session
# Keeps .codebase.json fresh without blocking Claude startup.
npx --yes codebase scan-only --quiet 2>/dev/null || true
