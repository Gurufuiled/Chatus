#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_FILE="${ROOT_DIR}/.secrets/deploy_ssh_key"

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  mkdir -p "${ROOT_DIR}/.secrets"
  printf '%s\n' "$DEPLOY_SSH_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
elif [[ ! -f "$KEY_FILE" ]]; then
  echo "No DEPLOY_SSH_KEY env and no ${KEY_FILE}. Add the deploy key to Cursor Cloud secrets as DEPLOY_SSH_KEY." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/cloud-agent-ssh-env.sh"
ensure_deploy_ssh_config

echo "SSH ready: ssh ${CHATUS_DEPLOY_SSH_TARGET} hostname"
