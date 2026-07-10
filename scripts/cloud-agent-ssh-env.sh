#!/usr/bin/env bash
# Shared SSH setup for Cloud Agent deploy scripts. Never commit private keys.
set -euo pipefail

CHATUS_DEPLOY_KEY_NAME="${CHATUS_DEPLOY_KEY_NAME:-id_ed25519_cursor_cloud_chatus}"
CHATUS_DEPLOY_KEY_PATH="${CHATUS_DEPLOY_KEY_PATH:-$HOME/.ssh/${CHATUS_DEPLOY_KEY_NAME}}"
CHATUS_DEPLOY_HOST="${CHATUS_DEPLOY_HOST:-45.11.93.210}"
CHATUS_DEPLOY_USER="${CHATUS_DEPLOY_USER:-root}"
CHATUS_DEPLOY_SSH_TARGET="${CHATUS_DEPLOY_SSH_TARGET:-chatus-cloud-deploy}"

ensure_deploy_ssh_key() {
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"

  if [[ -f "$CHATUS_DEPLOY_KEY_PATH" ]]; then
    chmod 600 "$CHATUS_DEPLOY_KEY_PATH"
    return 0
  fi

  if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
    printf '%s\n' "$DEPLOY_SSH_KEY" > "$CHATUS_DEPLOY_KEY_PATH"
    chmod 600 "$CHATUS_DEPLOY_KEY_PATH"
    return 0
  fi

  local workspace_key
  workspace_key="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.secrets/deploy_ssh_key"
  if [[ -f "$workspace_key" ]]; then
    cp "$workspace_key" "$CHATUS_DEPLOY_KEY_PATH"
    chmod 600 "$CHATUS_DEPLOY_KEY_PATH"
    return 0
  fi

  echo "Deploy SSH key not found. Set DEPLOY_SSH_KEY, create .secrets/deploy_ssh_key, or run scripts/cloud-agent-ssh-setup.sh." >&2
  return 1
}

ensure_deploy_ssh_config() {
  ensure_deploy_ssh_key

  local config_path="$HOME/.ssh/config"
  touch "$config_path"
  chmod 600 "$config_path"

  if ! grep -q "Host ${CHATUS_DEPLOY_SSH_TARGET}" "$config_path" 2>/dev/null; then
    cat >> "$config_path" <<EOF

Host ${CHATUS_DEPLOY_SSH_TARGET}
  HostName ${CHATUS_DEPLOY_HOST}
  User ${CHATUS_DEPLOY_USER}
  IdentityFile ${CHATUS_DEPLOY_KEY_PATH}
  IdentitiesOnly yes
EOF
  fi

  if ! ssh-keygen -F "${CHATUS_DEPLOY_HOST}" >/dev/null 2>&1; then
    ssh-keyscan -H "${CHATUS_DEPLOY_HOST}" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
  fi
}

ensure_deploy_ssh_config
