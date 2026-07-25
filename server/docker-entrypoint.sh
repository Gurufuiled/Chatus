#!/bin/sh
set -e

mkdir -p /app/uploads /app/logs/client

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/uploads /app/logs/client
  exec gosu node "$@"
fi

exec "$@"
