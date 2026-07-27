#!/bin/sh
set -eu

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "ENCRYPTION_KEY is required." >&2
  echo "Generate one with:  openssl rand -hex 32" >&2
  echo "Then set it in docker/.env or pass -e ENCRYPTION_KEY=..." >&2
  exit 1
fi

# The API listens on loopback only; nginx is the single public entry point.
node /app/dist/node.js &
API_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

shutdown() {
  kill "$API_PID" "$NGINX_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# Poll rather than `wait -n`, which busybox ash does not support. If either process
# exits the container goes down with it, so the restart policy can do its job.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 5
done

echo "a supervised process exited; shutting down" >&2
shutdown
exit 1
