#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export OPS_CLI_HOME="${OPS_CLI_HOME:-$ROOT/iterations/v1/sessions/home}"
PY="${PYTHON:-python3}"
SCRIPT="$ROOT/operations/panel_ops.py"
"$PY" "$SCRIPT" sample --agregador uber
"$PY" "$SCRIPT" sample --agregador pedidosya
