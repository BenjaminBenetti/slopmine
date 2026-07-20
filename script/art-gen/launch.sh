#!/usr/bin/env bash
# MCP stdio launcher for the art-gen server.
#
# Why this exists: GEMINI_API_KEY is exported near the bottom of ~/.bashrc,
# but ~/.bashrc opens with an interactivity guard (`case $- in *i*)...return`)
# that bails out of non-interactive shells BEFORE the export line runs. MCP
# servers are spawned non-interactively, so both `${GEMINI_API_KEY}` expansion
# in .mcp.json and a naive `source ~/.bashrc` here see an empty key whenever
# the Claude Code launch terminal didn't already have it.
#
# Fix: run a throwaway INTERACTIVE bash (-i), which sources ~/.bashrc past the
# guard, and read the exports out of that shell's environment. stderr is
# discarded because tty-less interactive bash whines about job control.

if [ -z "$GEMINI_API_KEY" ]; then
  GEMINI_API_KEY="$(bash -ic 'printf %s "$GEMINI_API_KEY"' 2>/dev/null)"
  export GEMINI_API_KEY
fi

if [ -z "$GEMINI_IMAGE_MODEL" ]; then
  GEMINI_IMAGE_MODEL="$(bash -ic 'printf %s "$GEMINI_IMAGE_MODEL"' 2>/dev/null)"
fi
export GEMINI_IMAGE_MODEL="${GEMINI_IMAGE_MODEL:-gemini-3.1-flash-image}"

if [ -z "$GEMINI_API_KEY" ]; then
  echo "art-gen launch.sh: GEMINI_API_KEY not found in environment or ~/.bashrc" >&2
fi

exec npx tsx "$(dirname "$0")/server.ts"
