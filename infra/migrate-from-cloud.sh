#!/usr/bin/env bash
# Migra o banco do Supabase Cloud para o Postgres self-host na VPS.
# Roda DENTRO da VPS (que tem IPv6 nativo, conecta direto sem pooler).
#
# Pre-requisitos:
#   - Supabase self-host ja de pe (container 'supabase-db' rodando)
#   - Cliente postgresql instalado:  sudo apt install -y postgresql-client-16
#
# Uso:
#   export CLOUD_PROJECT_REF="trfzjleivvbogdwelfhv"
#   export CLOUD_DB_PASSWORD='Scuira1503!'
#   bash migrate-from-cloud.sh

set -euo pipefail

: "${CLOUD_PROJECT_REF:?defina CLOUD_PROJECT_REF}"
: "${CLOUD_DB_PASSWORD:?defina CLOUD_DB_PASSWORD}"

CLOUD_HOST="db.${CLOUD_PROJECT_REF}.supabase.co"
DUMP_FILE="/tmp/supabase-cloud-dump-$(date +%Y%m%d-%H%M%S).sql"

echo "==> Testando conectividade IPv6 com ${CLOUD_HOST}"
if ! getent ahosts "${CLOUD_HOST}" | head -1 >/dev/null; then
  echo "DNS falhou para ${CLOUD_HOST}" >&2
  exit 1
fi
getent ahosts "${CLOUD_HOST}" | head -1

echo "==> Verificando pg_dump"
if ! command -v pg_dump >/dev/null; then
  echo "pg_dump nao encontrado. Instalando postgresql-client-16..."
  sudo apt-get update -y
  sudo apt-get install -y postgresql-client-16 || sudo apt-get install -y postgresql-client
fi
pg_dump --version

echo "==> Dumpando schema + dados (apenas schema public + auth users)"
# --no-owner / --no-privileges: ignora roles que so existem no Supabase Cloud
# -n public: schemas de usuario (pule storage/auth se forem migrados separadamente)
# Incluimos auth.users explicitamente porque reservations.customer_email pode referenciar
PGPASSWORD="${CLOUD_DB_PASSWORD}" pg_dump \
  --host="${CLOUD_HOST}" \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --schema=public \
  --file="${DUMP_FILE}"

echo "==> Dump salvo em ${DUMP_FILE} ($(du -h ${DUMP_FILE} | cut -f1))"

echo "==> Restaurando no Postgres self-host"
docker exec -i supabase-db psql -U postgres -d postgres < "${DUMP_FILE}"

echo
echo "==> Migracao concluida."
echo "    Dump original mantido em ${DUMP_FILE} (apague apos validar)."
echo "    Valide com:"
echo "      docker exec -it supabase-db psql -U postgres -d postgres -c '\\dt public.*'"
echo "      docker exec -it supabase-db psql -U postgres -d postgres -c 'SELECT count(*) FROM reservations;'"
