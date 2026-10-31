#!/usr/bin/env bash
# Provision a fresh Ubuntu EC2 instance to serve the API over HTTPS. Idempotent: re-run to update.
#
#   curl -fsSL https://raw.githubusercontent.com/Pascal-Ahmadu/weather-aware-truck-routing/main/infra/aws/ec2-setup.sh \
#     | sudo bash -s -- <public-ip> [frontend-origin] [nominatim-contact-email]
#
# Security group must allow inbound 80 and 443 from 0.0.0.0/0 (Caddy needs 80 for the Let's Encrypt challenge).
set -euo pipefail

PUBLIC_IP="${1:?usage: ec2-setup.sh <public-ip> [frontend-origin] [contact-email]}"
FRONTEND_ORIGIN="${2:-http://localhost:5173}"
CONTACT="${3:-set-your-email@example.com}"
HOST="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
REPO="https://github.com/Pascal-Ahmadu/weather-aware-truck-routing.git"
APP_DIR=/opt/weather-routing
ENV_FILE=/etc/weather-routing.env

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

log "Installing Docker, git and Caddy"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! command -v docker >/dev/null; then
  apt-get install -y -qq docker.io >/dev/null
  systemctl enable --now docker
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

log "Fetching the app"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull -q --ff-only
else
  git clone -q "$REPO" "$APP_DIR"
fi

log "Writing ${ENV_FILE} (kept across re-runs; edit it to change settings)"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
DEBUG=False
ALLOWED_HOSTS=${HOST},${PUBLIC_IP}
CORS_ALLOWED_ORIGINS=${FRONTEND_ORIGIN}
CORS_ALLOWED_ORIGIN_REGEXES=^https://weather-aware-truck-routing.*\.vercel\.app$
NOMINATIM_USER_AGENT=weather-routing (${CONTACT})
EOF
  chmod 600 "$ENV_FILE"
fi

log "Building and (re)starting the API container"
docker build -q -t weather-routing-api:latest "$APP_DIR/backend" >/dev/null
docker rm -f weather-routing-api >/dev/null 2>&1 || true
docker run -d --name weather-routing-api --restart unless-stopped \
  --env-file "$ENV_FILE" -p 127.0.0.1:8000:8000 weather-routing-api:latest >/dev/null

log "Configuring Caddy for https://${HOST}"
cat > /etc/caddy/Caddyfile <<EOF
${HOST} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8000
}
EOF
systemctl reload caddy || systemctl restart caddy

log "Waiting for the API"
for _ in $(seq 1 30); do
  curl -fsS -H "Host: ${HOST}" http://127.0.0.1:8000/api/health/ >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS -H "Host: ${HOST}" http://127.0.0.1:8000/api/health/ && echo

log "Done. API: https://${HOST}/api/health/  (certificate is issued on the first HTTPS request; allow ~30 s)"
echo "To update later: sudo bash ${APP_DIR}/infra/aws/ec2-setup.sh ${PUBLIC_IP}"
