# Infra — VPS Hostinger (Ubuntu) com Supabase self-host + Wuzapi

Estado atual:
- **VPS**: Hostinger, Ubuntu, 4 GB RAM, IP `2.24.104.155`
- **Frontend**: React+Vite (servido por Nginx em `/var/www/select-motel/dist`)
- **Backend**: Supabase self-host completo via Docker em `/opt/supabase/app`
- **WhatsApp**: Wuzapi em `/opt/wuzapi`, acessado pelas edge functions na network docker
- **CI/CD**: GitHub Actions builda no push em `main` e faz rsync via SSH

---

## Ordem de execução

### 0. Pré-requisitos locais (uma vez)

```bash
# Gere uma chave SSH dedicada pro deploy. NAO use senha (CI nao consegue digitar).
ssh-keygen -t ed25519 -f ~/.ssh/select_motel_deploy -N ""
cat ~/.ssh/select_motel_deploy.pub   # copie esta linha
```

> **Troque a senha do root da VPS agora** — ela foi exposta em chat. Depois do bootstrap o login com senha é desabilitado, mas até lá a senha está exposta.
> `ssh root@2.24.104.155` → `passwd`

### 1. Bootstrap da VPS (como root)

```bash
scp infra/vps-bootstrap.sh root@2.24.104.155:/root/
ssh root@2.24.104.155
# dentro da VPS:
export SSH_AUTHORIZED_KEY="ssh-ed25519 AAAA... cole-a-publica-aqui"
bash /root/vps-bootstrap.sh
# (instala docker/nginx/node, cria user 'deploy', firewall, desabilita senha SSH)
```

A partir daqui, todo SSH usa o usuário `deploy`:
```bash
ssh -i ~/.ssh/select_motel_deploy deploy@2.24.104.155
```

### 2. Provisionar Supabase

```bash
scp -i ~/.ssh/select_motel_deploy infra/supabase-setup.sh deploy@2.24.104.155:/tmp/
ssh -i ~/.ssh/select_motel_deploy deploy@2.24.104.155

# dentro da VPS:
# Gere os segredos:
export PUBLIC_HOST="2.24.104.155"
export POSTGRES_PASSWORD="$(openssl rand -base64 24)"
export JWT_SECRET="$(openssl rand -base64 48)"
export DASHBOARD_PASSWORD="$(openssl rand -base64 16)"

# ANON_KEY e SERVICE_ROLE_KEY: gerar no site oficial (HS256 com JWT_SECRET):
# https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
export ANON_KEY="eyJ..."
export SERVICE_ROLE_KEY="eyJ..."

# Anote tudo num gerenciador de senhas ANTES de continuar.
bash /tmp/supabase-setup.sh
```

Endpoints (apenas em localhost da VPS):
- Kong (API): `http://127.0.0.1:8000`
- Studio: `http://127.0.0.1:3000`

### 3. Nginx (reverse proxy público)

```bash
sudo cp infra/nginx/select-motel.conf /etc/nginx/sites-available/select-motel
sudo ln -sf /etc/nginx/sites-available/select-motel /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Agora `http://2.24.104.155/supabase/` chega no Kong, e `http://2.24.104.155/` serve o frontend (quando o build for enviado).

### 4. Wuzapi (WhatsApp gateway)

```bash
scp -i ~/.ssh/select_motel_deploy infra/wuzapi-setup.sh deploy@2.24.104.155:/tmp/
ssh -i ~/.ssh/select_motel_deploy deploy@2.24.104.155
export WUZAPI_ADMIN_TOKEN="$(openssl rand -hex 32)"
bash /tmp/wuzapi-setup.sh
```

Crie a instância e conecte:
```bash
# 1) criar usuario
USER_TOKEN="$(openssl rand -hex 24)"
curl -X POST http://127.0.0.1:8080/admin/users \
  -H "Authorization: $WUZAPI_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"select-motel\",\"token\":\"$USER_TOKEN\"}"

# 2) iniciar sessao
curl -X POST http://127.0.0.1:8080/session/connect -H "token: $USER_TOKEN"

# 3) pegar QR code (escanear com WhatsApp)
curl http://127.0.0.1:8080/session/qr -H "token: $USER_TOKEN"
```

### 5. Configurar secrets das Edge Functions

Edite `/opt/supabase/app/.env` e adicione:
```env
WUZAPI_URL=http://wuzapi:8080
WUZAPI_USER_TOKEN=<o USER_TOKEN gerado acima>
ABACATEPAY_WEBHOOK_SECRET=<seu secret atual>

# MotelMais PlugPlay (PMS) — ver supabase/functions/_shared/PLUGPLAY.md
PLUGPLAY_ID=252
PLUGPLAY_TOKEN=<token do integrador 252>
```

Reinicie o container de functions pra reler os envs:
```bash
cd /opt/supabase/app && docker compose restart functions
```

### 6. Migrar dados do Supabase Cloud → VPS

> O cloud `db.<ref>.supabase.co` responde só em IPv6. A VPS Hostinger tem IPv6 nativo, então rodamos o dump **dentro dela** (Docker local no Windows não tem IPv6).

```bash
scp -i ~/.ssh/select_motel_deploy infra/migrate-from-cloud.sh deploy@2.24.104.155:/tmp/
ssh -i ~/.ssh/select_motel_deploy deploy@2.24.104.155

# dentro da VPS:
export CLOUD_PROJECT_REF="trfzjleivvbogdwelfhv"
export CLOUD_DB_PASSWORD='Scuira1503!'   # troque depois!
bash /tmp/migrate-from-cloud.sh
```

O script instala `postgresql-client-16`, faz `pg_dump` via IPv6 e restaura no container `supabase-db`. Valide:
```bash
docker exec -it supabase-db psql -U postgres -d postgres -c "SELECT count(*) FROM reservations;"
```

> **Depois da migração:** vá em https://supabase.com/dashboard/project/trfzjleivvbogdwelfhv/settings/database → **Reset password** (a senha vazou no chat).

### 7. Configurar secrets no GitHub Actions

Em `github.com/luis-hsl/select-motel-reservas/settings/secrets/actions`:

| Secret | Valor |
|---|---|
| `VPS_HOST` | `2.24.104.155` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | conteúdo de `~/.ssh/select_motel_deploy` (a privada) |
| `VITE_SUPABASE_URL` | `http://2.24.104.155/supabase` |
| `VITE_SUPABASE_ANON_KEY` | o ANON_KEY gerado no passo 2 |

> Quando colocar HTTPS, basta trocar `VITE_SUPABASE_URL` pra `https://seu.dominio.com/supabase`.

### 8. Apontar AbacatePay pro novo webhook

No painel AbacatePay, atualize a URL do webhook pra:
```
http://2.24.104.155/supabase/functions/v1/abacatepay-webhook
```

### 9. Primeiro deploy

```bash
git add infra/ .github/ supabase/functions/send-reservation-whatsapp/
git commit -m "infra: setup VPS self-host (Supabase + Wuzapi + Nginx)"
git push
```

GitHub Actions vai disparar **deploy-vps** (build do frontend) e **deploy-functions** (rsync das edge functions).

---

## Operação

### Ver logs
```bash
ssh deploy@2.24.104.155
cd /opt/supabase/app && docker compose logs -f functions
docker compose logs -f kong
cd /opt/wuzapi && docker compose logs -f
```

### Restart de um serviço
```bash
cd /opt/supabase/app && docker compose restart <serviço>
```

### Backup do Postgres
```bash
docker exec supabase-db pg_dump -U postgres postgres | gzip > /opt/backups/db-$(date +%F).sql.gz
```
(Adicione ao cron: `0 3 * * * ...`)

### ⚠️ O override NÃO carrega sozinho

O `.env` da VPS define `COMPOSE_FILE=docker-compose.yml`, e isso **desliga a
descoberta automática do `docker-compose.override.yml`**. Ou seja: um
`docker compose up -d` recria os containers **sem** as envs custom — o
container `functions` perde WUZAPI, ABACATEPAY, META e PLUGPLAY de uma vez,
e as reservas param de notificar/sincronizar sem erro visível.

Sempre que for **recriar** container (`up -d`, `pull`), passe os dois:
```bash
cd /opt/supabase/app
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```
`restart` é seguro sem isso — não recria, só reinicia o processo.

**Recriar o container `functions` invalida o DNS que o Kong tem em cache**
(o container ganha IP novo), e o Kong passa a devolver 502 em
`/functions/v1/*`. Depois de recriar, reinicie o Kong:
```bash
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml restart kong
```

Teste rápido de que voltou (405 = função viva rejeitando GET):
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.selectreservas.com.br/supabase/functions/v1/abacatepay-webhook
```
Note o prefixo `/supabase/` — o Nginx serve o SPA na raiz e só proxia a API
sob esse caminho. `/functions/v1/...` direto devolve o HTML do site.

### Atualizar imagem do Supabase
```bash
cd /opt/supabase/supabase-src && git pull
cp docker/docker-compose.yml /opt/supabase/app/docker-compose.yml
cd /opt/supabase/app
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml pull
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml restart kong
```

---

## Quando migrar pra HTTPS (domínio)

1. Aponte `A` do domínio pra `2.24.104.155`.
2. `sudo apt install certbot python3-certbot-nginx`
3. Edite `infra/nginx/select-motel.conf`: troque `server_name _;` por `server_name seu.dominio.com;`.
4. `sudo certbot --nginx -d seu.dominio.com`
5. Atualize `VITE_SUPABASE_URL`, `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` e o webhook do AbacatePay pra https.
