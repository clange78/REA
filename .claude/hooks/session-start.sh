#!/bin/bash
# Installs the REA CLI and registers it with Claude Code in cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v rea >/dev/null 2>&1; then
  npm install --global rea-agents --no-fund --no-audit
fi

# Register the MCP server and install the reverse-engineer-anything skill.
rea setup --client claude_code --skill-client claude_code --yes --json >/dev/null

rea doctor --client claude_code --skill --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(!d.healthy){console.error("REA doctor reports unhealthy setup");process.exit(1)}})'
