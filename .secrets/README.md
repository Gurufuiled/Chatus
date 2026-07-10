# Local deploy secrets (gitignored)

Do not commit private keys.

For Cloud Agent deploys, prefer Cursor Cloud secret:

- `DEPLOY_SSH_KEY` — full OpenSSH private key for `cursor-cloud-chatus-deploy`

Optional local fallback for this workspace only:

- `.secrets/deploy_ssh_key`

Setup:

```bash
./scripts/cloud-agent-ssh-setup.sh
./scripts/deploy-api-prod.sh
```
