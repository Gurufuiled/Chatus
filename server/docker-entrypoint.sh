#!/bin/sh
set -e

mkdir -p /app/uploads
chown -R node:node /app/uploads

exec gosu node "$@"
