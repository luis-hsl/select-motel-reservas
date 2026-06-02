#!/usr/bin/env bash
# Provisiona Supabase self-host em /opt/supabase usando o docker-compose oficial.
# Rodar como usuario 'deploy' (no grupo docker). Idempotente: se ja existir, so atualiza.
#
# Variaveis que voce DEVE exportar antes (ou editar abaixo):
#   PUBLIC_HOST        Hostname/IP publico (ex: 2.24.104.155 ou seu dominio)
#   POSTGRES_PASSWORD  Senha do superuser do Postgres (gere forte)
#   JWT_SECRET         Segredo HS256 com >= 40 chars
#   ANON_KEY           JWT do role 'anon'      (assinado com JWT_SECRET)
#   SERVICE_ROLE_KEY   JWT do role 'service_role' (assinado com JWT_SECRET)
#   DASHBOARD_USERNAME / DASHBOARD_PASSWORD  Login do Studio
#
# Gere JWT_SECRET:  openssl rand -base64 48
# Gere ANON_KEY / SERVICE_ROLE_KEY em: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
# (ou use o gerador local em https://jwt.io com payload {"role":"anon","iss":"supabase"} / {"role":"service_role","iss":"supabase"})

set -euo pipefail

: "${PUBLIC_HOST:?defina PUBLIC_HOST}"
: "${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD}"
: "${JWT_SECRET:?defina JWT_SECRET}"
: "${ANON_KEY:?defina ANON_KEY}"
: "${SERVICE_ROLE_KEY:?defina SERVICE_ROLE_KEY}"
: "${DASHBOARD_USERNAME:=supabase}"
: "${DASHBOARD_PASSWORD:?defina DASHBOARD_PASSWORD}"

TARGET_DIR="/opt/supabase"
REPO_DIR="$TARGET_DIR/supabase-src"

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> Clonando repo oficial supabase/supabase (sparse: docker)"
  git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase "$REPO_DIR"
  git -C "$REPO_DIR" sparse-checkout set docker
else
  echo "==> Atualizando repo supabase/supabase"
  git -C "$REPO_DIR" pull --ff-only
fi

DOCKER_DIR="$REPO_DIR/docker"
APP_DIR="$TARGET_DIR/app"
mkdir -p "$APP_DIR"

echo "==> Copiando arquivos para $APP_DIR (compose, volumes seed)"
cp -n "$DOCKER_DIR/docker-compose.yml"            "$APP_DIR/docker-compose.yml"
cp -rn "$DOCKER_DIR/volumes"                       "$APP_DIR/" 2>/dev/null || true
cp -n "$DOCKER_DIR/.env.example"                  "$APP_DIR/.env"

ENV_FILE="$APP_DIR/.env"
echo "==> Aplicando variaveis no $ENV_FILE"
python3 - "$ENV_FILE" <<PY
import os, re, sys
path = sys.argv[1]
overrides = {
  "POSTGRES_PASSWORD":   os.environ["POSTGRES_PASSWORD"],
  "JWT_SECRET":          os.environ["JWT_SECRET"],
  "ANON_KEY":            os.environ["ANON_KEY"],
  "SERVICE_ROLE_KEY":    os.environ["SERVICE_ROLE_KEY"],
  "DASHBOARD_USERNAME":  os.environ["DASHBOARD_USERNAME"],
  "DASHBOARD_PASSWORD":  os.environ["DASHBOARD_PASSWORD"],
  "SITE_URL":            f"http://{os.environ['PUBLIC_HOST']}",
  "API_EXTERNAL_URL":    f"http://{os.environ['PUBLIC_HOST']}",
  "SUPABASE_PUBLIC_URL": f"http://{os.environ['PUBLIC_HOST']}",
  "STUDIO_DEFAULT_ORGANIZATION": "Select Motel",
  "STUDIO_DEFAULT_PROJECT":      "select-motel",
  # Bind interno: so o Nginx do host acessa o Kong.
  "KONG_HTTP_PORT":  "8000",
  "KONG_HTTPS_PORT": "8443",
}
with open(path) as f: lines = f.readlines()
seen = set()
out = []
for l in lines:
  m = re.match(r'^([A-Z0-9_]+)=', l)
  if m and m.group(1) in overrides:
    out.append(f"{m.group(1)}={overrides[m.group(1)]}\n")
    seen.add(m.group(1))
  else:
    out.append(l)
for k, v in overrides.items():
  if k not in seen:
    out.append(f"{k}={v}\n")
with open(path, "w") as f: f.writelines(out)
print("OK")
PY

# Override pra economizar RAM em VPS 4GB:
#   - Analytics (Logflare) e Vector consomem >500MB. Desabilitamos.
#   - Imgproxy so e necessario se usar transformacoes de imagem do Storage.
cat > "$APP_DIR/docker-compose.override.yml" <<'YAML'
# Override para VPS 4GB: desabilita servicos opcionais pesados.
services:
  analytics:
    profiles: ["disabled"]
  vector:
    profiles: ["disabled"]
  imgproxy:
    profiles: ["disabled"]
  # Bind do Kong somente em localhost — frente exposta pelo Nginx do host.
  kong:
    ports: !override
      - "127.0.0.1:8000:8000/tcp"
      - "127.0.0.1:8443:8443/tcp"
  studio:
    ports: !override
      - "127.0.0.1:3000:3000/tcp"
YAML

echo "==> Subindo Supabase"
cd "$APP_DIR"
docker compose pull
docker compose up -d

echo
echo "==> Status:"
docker compose ps
echo
echo "==> Pronto. Endpoints internos:"
echo "    API/REST/Auth/Storage:  http://127.0.0.1:8000  (via Kong)"
echo "    Studio (admin UI):      http://127.0.0.1:3000"
echo "    Exponha via Nginx (ver infra/nginx/select-motel.conf)."
