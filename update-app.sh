#!/usr/bin/env bash
# update-app.sh — Actualiza el código y reinicia el servicio en la VM
# Uso: sudo bash update-app.sh

set -euo pipefail

APP_DIR="/opt/bingo-chat"
SERVICE_USER="bingo"
BUN_BIN="/home/${SERVICE_USER}/.bun/bin/bun"

cd "$APP_DIR"
echo "==> Haciendo pull de la rama principal..."
sudo -u "$SERVICE_USER" git pull

if [ -f package.json ]; then
  echo "==> Instalando dependencias si es necesario..."
  sudo -u "$SERVICE_USER" "$BUN_BIN" install --frozen-lockfile --production
fi

echo "==> Reiniciando servicio..."
sudo systemctl restart bingo-chat

echo "==> Estado del servicio:"
systemctl status bingo-chat --no-pager
