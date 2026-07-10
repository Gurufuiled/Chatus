#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT_DIR/scripts/cloud-agent-ssh-env.sh"

SSH_TARGET="${CHATUS_DEPLOY_SSH_TARGET:-chatus-cloud-deploy}"
REMOTE_CMD="${CHATUS_DEPLOY_REMOTE_CMD:-cd /root/chatus && git pull origin main && cd server && docker compose build api && docker compose up -d api}"

echo "Deploying API to production via ${SSH_TARGET}..."
ssh "$SSH_TARGET" "$REMOTE_CMD"
echo "Done. Health: https://messenger.startapus.com/api/health"
