#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
exec python3 -m uvicorn app.web:app --host 0.0.0.0 --port "${PORT:-8096}" --log-level info
