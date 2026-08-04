#!/usr/bin/env bash
# Ingest do movimento do PMS (MotelMais PlugPlay) para o Postgres do site.
# Chama a edge function `plugplay-ingest`; toda a lógica mora lá.
#
# Existe como script, e não como um curl solto no crontab, por causa da chave:
# `plugplay-ingest` exige service_role, e a chave vive no .env do Supabase.
# Sourcing com `set -a` mantém o segredo fora do crontab e fora do log.
#
# Instalação:
#   sudo cp /opt/scripts/pms-ingest.sh /usr/local/bin/
#   sudo chmod +x /usr/local/bin/pms-ingest.sh
#   sudo crontab -e   # ver bloco abaixo
#
# Cron (root) — sem redirecionar: o script escreve e rotaciona /var/log/pms-ingest.log
#   */15 * * * * /usr/local/bin/pms-ingest.sh incremental
#   20 4 * * *   /usr/local/bin/pms-ingest.sh snapshots
#   40 4 * * 1   /usr/local/bin/pms-ingest.sh manutencao   # relê 60 dias
#   50 4 1 * *   /usr/local/bin/pms-ingest.sh catalogo     # produtos mudam devagar
#
# Backfill na mão (ex.: repuxar desde maio):
#   /usr/local/bin/pms-ingest.sh backfill 2026-05-01
#
# Conferir o que rodou — o log é secundário, a verdade está na tabela:
#   docker exec supabase-db psql -U postgres -d postgres -c \
#     "SELECT * FROM pms_ingest_runs ORDER BY criado_em DESC LIMIT 10;"

set -euo pipefail

ENV_FILE="/opt/supabase/app/.env"
BASE="http://127.0.0.1:8000/functions/v1/plugplay-ingest"
LOG_FILE="/var/log/pms-ingest.log"
LOG_MAX_LINHAS=5000

ACTION="${1:-incremental}"
INICIO="${2:-}"

if [ ! -r "$ENV_FILE" ]; then
  echo "$(date -Is) ERRO: $ENV_FILE não legível (rodar como root)"
  exit 1
fi

# Extrai só a chave, em vez de dar `source` no arquivo inteiro. Dois motivos:
# o .env é formato Docker e aceita valor com espaço sem aspas (a linha 138 tem
# um), o que faz o bash abortar; e não há razão para carregar a senha do
# Postgres no ambiente de um script que só chama HTTP.
SERVICE_ROLE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$ENV_FILE" | head -1 | tr -d '"'"'" )

if [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  echo "$(date -Is) ERRO: SERVICE_ROLE_KEY ausente em $ENV_FILE"
  exit 1
fi

case "$ACTION" in
  incremental|snapshots|catalogo) PAYLOAD="{\"action\":\"$ACTION\"}" ;;
  backfill)
    if [ -z "$INICIO" ]; then
      echo "$(date -Is) ERRO: backfill exige data inicial (YYYY-MM-DD)"
      exit 1
    fi
    PAYLOAD="{\"action\":\"backfill\",\"inicio\":\"$INICIO\"}"
    ;;
  manutencao)
    # Rede de segurança semanal. O `incremental` só olha 3 dias, então correção
    # que a recepção (ou a Oxpi) faça numa estadia antiga nunca chegaria aqui.
    # 60 dias cobre com folga o prazo em que uma conta ainda é reaberta, e o
    # upsert torna o retrabalho inofensivo.
    PAYLOAD="{\"action\":\"backfill\",\"inicio\":\"$(date -d '60 days ago' +%F)\"}"
    ;;
  *)
    echo "$(date -Is) ERRO: ação inválida '$ACTION' (incremental|snapshots|backfill|manutencao|catalogo)"
    exit 1
    ;;
esac

# --max-time generoso: o backfill de 3 meses levou 1,5s, mas a função tem
# orçamento interno de 50s e pode devolver `parouEm` em vez de terminar.
RESP=$(curl -s --max-time 120 -X POST "$BASE" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" || echo '{"erro":"curl falhou"}')

echo "$(date -Is) $ACTION $RESP" >> "$LOG_FILE"

# Log de cron cresce para sempre e ninguém lembra de rotacionar. O script cuida
# do próprio log (por isso o cron não redireciona) — a VPS tem 4GB.
LINHAS=$(wc -l < "$LOG_FILE")
if [ "$LINHAS" -gt "$LOG_MAX_LINHAS" ]; then
  tail -n "$((LOG_MAX_LINHAS / 2))" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
