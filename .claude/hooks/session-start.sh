#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environment
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PORT=8080

# Kill any existing server on the port
fuser -k ${PORT}/tcp 2>/dev/null || true

# Start Python HTTP server in background from project root
cd "$CLAUDE_PROJECT_DIR"
nohup python3 -m http.server ${PORT} &>/tmp/http-server.log &

echo "HTTP server started on port ${PORT}"
