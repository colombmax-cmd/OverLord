#!/usr/bin/env bash
set -euo pipefail

OVERLORD_DIR="/workspaces/OverLord"
SMOOS_DIR="/workspaces/Smo.OS"

# Ajuste ces commandes selon les scripts réels
SMOOS_CMD="${SMOOS_CMD:-npm run core}"
OVERLORD_CMD="${OVERLORD_CMD:-echo 'OverLord runtime not implemented yet; docs-only repo'}"

cleanup() {
  echo "Stopping services..."
  [[ -n "${SMOOS_PID:-}" ]] && kill "$SMOOS_PID" 2>/dev/null || true
  [[ -n "${OVERLORD_PID:-}" ]] && kill "$OVERLORD_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[check] Smo.OS dir: $SMOOS_DIR"
test -d "$SMOOS_DIR" || { echo "Missing Smo.OS repo"; exit 1; }

echo "[check] OverLord dir: $OVERLORD_DIR"
test -d "$OVERLORD_DIR" || { echo "Missing OverLord repo"; exit 1; }

echo "[1/4] Starting Smo.OS..."
(
  cd "$SMOOS_DIR"
  test -f package.json || { echo "Smo.OS: package.json missing"; exit 1; }
  [ -d node_modules ] || npm install
  eval "$SMOOS_CMD"
) &
SMOOS_PID=$!

sleep 2

echo "[2/4] Starting OverLord..."
(
  cd "$OVERLORD_DIR"
  if [ -f package.json ]; then
    [ -d node_modules ] || npm install
    eval "$OVERLORD_CMD"
  else
    echo "OverLord has no package.json (currently docs/spec repo)."
    tail -f /dev/null
  fi
) &
OVERLORD_PID=$!

echo "[3/4] Services running"
echo "Smo.OS PID: $SMOOS_PID"
echo "OverLord PID: $OVERLORD_PID"

echo "[4/4] Waiting... (Ctrl+C to stop both)"
wait