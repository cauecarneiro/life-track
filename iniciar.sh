#!/usr/bin/env bash
# Sobe o Life Track em http://127.0.0.1:8765 (mude a porta com PORT=9000 ./iniciar.sh).
set -euo pipefail
cd "$(dirname "$0")/app"

PORT="${PORT:-8765}"
URL="http://127.0.0.1:${PORT}"

if [ ! -x ../.venv/bin/uvicorn ]; then
  echo "Ambiente não encontrado. Rode primeiro os passos de instalação do README." >&2
  exit 1
fi

# Abre o navegador quando possível (macOS: open, Linux: xdg-open).
(command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true

exec ../.venv/bin/uvicorn server:app --host 127.0.0.1 --port "$PORT"
