#!/usr/bin/env bash
# Sobe Wuzapi (gateway HTTP do whatsmeow) em /opt/wuzapi.
# Compartilha a network docker do Supabase para que as edge functions o alcancem
# como http://wuzapi:8080 (sem expor publicamente).
#
# Pre-requisito: o stack do Supabase ja deve estar de pe (cria a network).
#
# Variaveis:
#   WUZAPI_ADMIN_TOKEN  Token de administracao usado pra criar usuarios via API.
#                       Gere com: openssl rand -hex 32

set -euo pipefail

: "${WUZAPI_ADMIN_TOKEN:?defina WUZAPI_ADMIN_TOKEN (openssl rand -hex 32)}"

TARGET_DIR="/opt/wuzapi"
mkdir -p "$TARGET_DIR/dbdata" "$TARGET_DIR/files"
cd "$TARGET_DIR"

# Descobre a network do Supabase (criada pelo docker compose dele).
SUPA_NET="$(docker network ls --format '{{.Name}}' | grep -E 'supabase' | head -n1 || true)"
if [[ -z "$SUPA_NET" ]]; then
  echo "Network do Supabase nao encontrada. Suba o Supabase primeiro." >&2
  exit 1
fi
echo "==> Usando network docker externa: $SUPA_NET"

cat > "$TARGET_DIR/docker-compose.yml" <<YAML
services:
  wuzapi:
    image: asternic/wuzapi:latest
    container_name: wuzapi
    restart: unless-stopped
    environment:
      WUZAPI_ADMIN_TOKEN: "\${WUZAPI_ADMIN_TOKEN}"
      TZ: America/Sao_Paulo
    volumes:
      - ./dbdata:/app/dbdata
      - ./files:/app/files
    # bind apenas em localhost — acesso publico nao e exposto;
    # as edge functions chamam via http://wuzapi:8080 na network do Supabase.
    ports:
      - "127.0.0.1:8080:8080"
    networks:
      - supabase
      - default

networks:
  supabase:
    name: ${SUPA_NET}
    external: true
YAML

cat > "$TARGET_DIR/.env" <<EOF
WUZAPI_ADMIN_TOKEN=${WUZAPI_ADMIN_TOKEN}
EOF
chmod 600 "$TARGET_DIR/.env"

echo "==> Subindo Wuzapi"
docker compose pull
docker compose up -d

echo
echo "==> Wuzapi de pe. Proximos passos:"
echo "    1) Criar usuario (instancia) via API admin:"
echo "       curl -X POST http://127.0.0.1:8080/admin/users \\"
echo "            -H 'Authorization: \$WUZAPI_ADMIN_TOKEN' \\"
echo "            -H 'Content-Type: application/json' \\"
echo "            -d '{\"name\":\"select-motel\",\"token\":\"GERE_UM_TOKEN_DE_USUARIO\"}'"
echo
echo "    2) Conectar sessao (gera QR code):"
echo "       curl -X POST http://127.0.0.1:8080/session/connect \\"
echo "            -H 'token: GERE_UM_TOKEN_DE_USUARIO'"
echo "       curl http://127.0.0.1:8080/session/qr -H 'token: GERE_UM_TOKEN_DE_USUARIO'"
echo
echo "    3) Guardar o user-token como secret WUZAPI_USER_TOKEN no Supabase:"
echo "       (Studio > Edge Functions > Secrets, ou)"
echo "       supabase secrets set WUZAPI_USER_TOKEN=... --workdir /opt/supabase/app"
