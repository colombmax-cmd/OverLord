#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[alpha-first-run] Root: $ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[alpha-first-run] ERROR: node is not installed or not in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[alpha-first-run] ERROR: npm is not installed or not in PATH" >&2
  exit 1
fi

echo "[alpha-first-run] Installing dependencies..."
npm ci

echo "[alpha-first-run] Running health check..."
OVERLORD_USE_LOCAL_SMOOS=1 node src/index.ts intent health

echo "[alpha-first-run] Running cognitive-only smoke..."
OVERLORD_USE_LOCAL_SMOOS=1 node src/index.ts intent run \
  --title "alpha bootstrap smoke" \
  --cognitive-only true \
  --show-timeline true

echo "[alpha-first-run] Done."
echo "[alpha-first-run] Next: try 'node src/index.ts intent run --title \"my first task\" --output pretty'"
