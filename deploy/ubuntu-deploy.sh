#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vocab-coach}"
SITE_ADDRESS="${SITE_ADDRESS:-${1:-:80}}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo SITE_ADDRESS=your-domain.com bash deploy/ubuntu-deploy.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl python3 rsync ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude ".git" \
  --exclude ".env" \
  --exclude "node_modules" \
  --exclude "tools/ngrok.exe" \
  --exclude "tools/*.log" \
  "$SOURCE_DIR/" "$APP_DIR/"

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

python3 - "$APP_DIR/.env" "$SITE_ADDRESS" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
site = sys.argv[2]
lines = env_path.read_text(encoding="utf-8").splitlines()
updated = False
next_lines = []
for line in lines:
    if line.startswith("SITE_ADDRESS="):
        next_lines.append(f"SITE_ADDRESS={site}")
        updated = True
    else:
        next_lines.append(line)
if not updated:
    next_lines.append(f"SITE_ADDRESS={site}")
env_path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")
PY

cd "$APP_DIR"
docker compose up -d --build

ufw allow 80/tcp || true
ufw allow 443/tcp || true

echo
echo "Vocab Coach is deployed."
if [[ "$SITE_ADDRESS" == ":80" ]]; then
  IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  echo "Open: http://$IP"
else
  echo "Open: https://$SITE_ADDRESS"
fi
