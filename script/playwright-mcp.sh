#!/usr/bin/env bash
# Starts the Playwright MCP server for Claude Code to connect to.
# Run this on your HOST machine (not inside Docker).
# Claude Code connects via http://172.17.0.1:3100/sse

set -euo pipefail

PORT="${1:-3100}"

echo "Starting Playwright MCP server on port $PORT..."
echo "Claude Code will connect via http://172.17.0.1:$PORT/sse"
echo ""

npx @playwright/mcp  --host '0.0.0.0' --port "$PORT" --allowed-hosts '*' --no-sandbox 
