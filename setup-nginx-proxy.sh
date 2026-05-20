#!/usr/bin/env bash
# setup-nginx-proxy.sh — Instala y configura Nginx como proxy para Bun en 3000
# Uso: sudo bash setup-nginx-proxy.sh

set -euo pipefail

DOMAIN="chat.bingopagomovil.com"
UPSTREAM_PORT=3000

# 1. Instalar Nginx
apt-get update -qq
apt-get install -y -qq nginx

# 2. Configurar Nginx como proxy
cat > /etc/nginx/sites-available/bingo-chat <<'EOF'
server {
    listen 80;
    server_name chat.bingopagomovil.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 3600s;
        # Disable gzip for SSE streams — compression buffers data and breaks streaming
        gzip off;
    }
}
EOF

# 3. Activar config y reiniciar Nginx
ln -sf /etc/nginx/sites-available/bingo-chat /etc/nginx/sites-enabled/bingo-chat
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# 4. Verificar estado
systemctl status nginx --no-pager
