<#
.SYNOPSIS
  Деплой API на прод по SSH (как .github/workflows/deploy-server.yml).

.DESCRIPTION
  Требуется запись Host в ~/.ssh/config (например chatus-prod → root@VPS с IdentityFile).
  На сервере: репозиторий ~/chatus, compose в ~/chatus/server, server/.env уже на месте.

.PARAMETER SshHost
  Имя Host из SSH config (по умолчанию chatus-prod).

.PARAMETER Strategy
  PullMain — git pull origin main (как CI).
  MergeOriginMaster — после fetch: checkout main и git merge origin/master (см. memory-bank/server-deploy.md).

.PARAMETER NoCache
  docker compose build --no-cache api

.EXAMPLE
  .\scripts\deploy-chatus-prod.ps1
.EXAMPLE
  .\scripts\deploy-chatus-prod.ps1 -Strategy MergeOriginMaster -NoCache
#>
[CmdletBinding()]
param(
    [string] $SshHost = "chatus-prod",
    [ValidateSet("PullMain", "MergeOriginMaster")]
    [string] $Strategy = "PullMain",
    [switch] $NoCache
)

$ErrorActionPreference = "Stop"

$gitBlock = if ($Strategy -eq "MergeOriginMaster") {
    @"
git fetch origin
git checkout main
git merge origin/master
"@
} else {
    @"
git fetch origin
git checkout main
git pull origin main
"@
}

$dockerBuild = if ($NoCache) { "docker compose build --no-cache api" } else { "docker compose build api" }

$remote = @"
set -euo pipefail
cd ~/chatus
$gitBlock
cd server
$dockerBuild
docker compose up -d api
docker compose ps api
docker compose logs api --tail 40
"@

Write-Host "SSH: $SshHost | strategy: $Strategy" -ForegroundColor Cyan
$remote | ssh $SshHost bash -s
