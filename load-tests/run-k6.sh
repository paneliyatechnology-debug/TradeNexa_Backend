#!/usr/bin/env bash
# Wrapper to run k6 with env from load-tests/k6.env (optional).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/load-tests/k6.env"
SCRIPT="${1:-load}"
shift || true

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is not installed."
  echo "Install: https://grafana.com/docs/k6/latest/set-up/install-k6/"
  echo "  # Debian/Ubuntu example:"
  echo "  sudo gpg -k"
  echo "  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E52627"
  echo "  echo \"deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main\" | sudo tee /etc/apt/sources.list.d/k6.list"
  echo "  sudo apt-get update && sudo apt-get install k6"
  exit 1
fi

ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  # Export KEY=VALUE lines (ignore comments / blanks)
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed 's/\r$//')
  set +a
fi

case "$SCRIPT" in
  smoke)
    exec k6 run "${ROOT}/load-tests/k6/smoke.js" "$@"
    ;;
  load|500)
    exec k6 run --vus "${VUS:-50}" --iterations "${TOTAL_REQUESTS:-500}" "${ROOT}/load-tests/k6/load.js" "$@"
    ;;
  1000)
    exec k6 run --vus "${VUS:-100}" --iterations "${TOTAL_REQUESTS:-1000}" "${ROOT}/load-tests/k6/load.js" "$@"
    ;;
  *)
    if [[ -f "$SCRIPT" ]]; then
      exec k6 run "$SCRIPT" "$@"
    fi
    echo "Usage: $0 [smoke|load|500|1000|path/to/script.js] [extra k6 args...]"
    exit 1
    ;;
esac
