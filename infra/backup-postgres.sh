#!/usr/bin/env bash
# Backup diário do Postgres self-host. Rotaciona localmente (7 dias) e
# opcionalmente sincroniza pra storage offsite (rclone — comentado abaixo).
#
# Instalação:
#   sudo cp /opt/scripts/backup-postgres.sh /usr/local/bin/
#   sudo chmod +x /usr/local/bin/backup-postgres.sh
#   sudo crontab -e   # ver bloco abaixo
#
# Cron (root) — todo dia às 03:30 hora local:
#   30 3 * * * /usr/local/bin/backup-postgres.sh >> /var/log/select-motel-backup.log 2>&1
#
# Restore:
#   gunzip -c /opt/backups/postgres/select-motel-YYYY-MM-DD.sql.gz | \
#     docker exec -i supabase-db psql -U postgres -d postgres

set -euo pipefail

BACKUP_DIR="/opt/backups/postgres"
RETENTION_DAYS=7
DATE_TAG="$(date +%Y-%m-%d_%H%M)"
TARGET="${BACKUP_DIR}/select-motel-${DATE_TAG}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] === backup start → ${TARGET} ==="

# pg_dump rodando dentro do container; gzip no host. Schema + dados.
# --no-owner --no-privileges: facilita restaurar em outra instância.
docker exec supabase-db pg_dump \
    -U postgres \
    -d postgres \
    --no-owner --no-privileges \
  | gzip -9 \
  > "${TARGET}"

# valida que o arquivo não está vazio / corrompido (gzip OK + tem texto)
if ! gzip -t "${TARGET}" 2>/dev/null || [ "$(stat -c%s "${TARGET}")" -lt 10000 ]; then
  echo "[$(date -Iseconds)] !!! backup INVÁLIDO/MUITO PEQUENO, abortando rotação"
  exit 2
fi

SIZE_HUMAN="$(du -h "${TARGET}" | cut -f1)"
echo "[$(date -Iseconds)] ok: ${SIZE_HUMAN}"

# Rotação local: apaga arquivos mais antigos que RETENTION_DAYS
find "${BACKUP_DIR}" -name 'select-motel-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "${BACKUP_DIR}" -name 'select-motel-*.sql.gz' | wc -l)
echo "[$(date -Iseconds)] arquivos retidos: ${REMAINING}"

# --- Offsite opcional (descomentar quando configurar rclone) ---
# rclone copy "${TARGET}" remote:select-motel-backups/postgres/ \
#   --quiet --transfers=2 --checkers=4
# rclone --min-age "${RETENTION_DAYS}d" delete remote:select-motel-backups/postgres/ --quiet

echo "[$(date -Iseconds)] === backup done ==="
