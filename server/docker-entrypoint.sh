#!/bin/sh
set -e

mkdir -p /app/uploads

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/uploads
  exec gosu node "$@"
fi

exec "$@"
