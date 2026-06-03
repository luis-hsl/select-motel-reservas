# Select Motel — Reservas

Sistema de reserva online do **Select Motel** em Ivaiporã/PR.
Frontend em React + Vite hospedado no Vercel; backend Supabase auto-hospedado
em VPS própria. Pagamentos via AbacatePay (PIX + Cartão). Confirmação automática
no WhatsApp do cliente e do motel via Wuzapi (whatsmeow).

🌐 Produção: <https://www.selectreservas.com.br>
🔧 API self-host: <https://api.selectreservas.com.br>

---

## Stack

**Frontend**
- React 19, TypeScript, Vite 8, Tailwind CSS 3
- Zustand (estado global do checkout)
- `@supabase/supabase-js` v2
- `qrcode.react` (QR Code PIX no checkout)
- `tus-js-client` (uploads grandes pra Storage)

**Backend** (Supabase self-host em Docker)
- PostgreSQL 15
- GoTrue (Auth)
- PostgREST
- Realtime
- Storage + imgproxy
- Edge Runtime (Deno) — 5 edge functions

**Pagamentos** — AbacatePay v2 (PIX transparente + Checkout cartão)
**WhatsApp** — Wuzapi (cliente HTTP do whatsmeow) na mesma rede Docker

**Infra**
- VPS Hostinger 4 GB, Ubuntu 24.04
- Nginx + Certbot (Let's Encrypt)
- Domínio: Vercel DNS (`selectreservas.com.br`, `api.*` aponta pra VPS)
- CI/CD via GitHub Actions

**Analytics & SEO**
- Google Tag Manager (`GTM-T7V27N8D`)
- Google Ads gtag (`AW-18204610844`) com 5 conversions de funnel
- Google Search Console (verificação por TXT DNS)
- Schema JSON-LD: Motel / LocalBusiness / FAQPage / WebSite

---

## Estrutura

```
.
├─ src/
│  ├─ pages/           Steps do checkout (Pacote→Pagamento) + retorno do cartão
│  ├─ admin/           Painel admin (Reservas, Suítes, Pacotes, Cardápio, WhatsApp, Config)
│  ├─ components/      ProgressBar, ReservaSidebar, Faq, CardPaymentReturn
│  ├─ store/           Zustand store do checkout
│  ├─ lib/             Cliente Supabase + tipos do banco gerados
│  └─ data/            Catálogo seed de pacotes + suítes
├─ supabase/
│  ├─ functions/       Edge functions Deno (TS)
│  │  ├─ abacatepay-create-charge   gera PIX ou checkout cartão
│  │  ├─ abacatepay-webhook         confirma pagamento, dispara WhatsApp
│  │  ├─ verify-payment             fallback do retorno do cartão
│  │  ├─ send-reservation-whatsapp  envia confirmação ao cliente + motel
│  │  └─ wuzapi-admin               proxy autenticado pro admin gerenciar a sessão
│  └─ migrations/      SQL migrations
├─ infra/
│  ├─ vps-bootstrap.sh             docker/nginx/UFW/fail2ban/user deploy
│  ├─ supabase-setup.sh            sobe stack self-host
│  ├─ supabase-override.yml        docker-compose override (envs + ports localhost)
│  ├─ wuzapi-setup.sh              sobe Wuzapi na network do Supabase
│  ├─ nginx/select-motel.conf      template HTTP→HTTPS reverse proxy
│  ├─ nginx-cache-block.conf       cache 24h pro Storage
│  ├─ migrate-from-cloud.sh        pg_dump cloud → self-host (IPv6 nativo)
│  ├─ gen-secrets.mjs              gera JWT/ANON/SERVICE + tokens
│  └─ README.md                    runbook completo da infra
├─ public/
│  ├─ robots.txt, sitemap.xml      SEO técnico
│  ├─ manifest.webmanifest         PWA básico
│  └─ logo.webp, logo-header.webp  marca
├─ .github/workflows/
│  ├─ deploy-vps.yml               build Vite + rsync → /var/www/...
│  └─ deploy-functions.yml         rsync edge functions → /opt/supabase/...
├─ vercel.json                     redirect bare→www, headers HSTS, cache
└─ index.html                      meta tags, OG, JSON-LD, GTM, gtag
```

---

## Setup local

Pré-requisitos: Node 20+, npm 10+

```bash
git clone https://github.com/luis-hsl/select-motel-reservas.git
cd select-motel-reservas
npm ci
```

Crie `.env.local` com as duas variáveis:

```env
VITE_SUPABASE_URL=https://api.selectreservas.com.br/supabase
VITE_SUPABASE_ANON_KEY=<ANON_KEY do .env do Supabase self-host>
```

```bash
npm run dev      # vite dev em http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint
```

---

## Fluxo do checkout (9 steps)

```
Pacote → Tipo → Data → Suíte → Refeição → Bebida → Presente → Dados → Pagamento
```

No `StepDados` o CPF é validado pelo dígito verificador (MOD-11) antes de
enviar pro AbacatePay, evitando o `Invalid taxId` em produção.

No `StepPagamento`:
- PIX: cria charge em `/transparents/create`, mostra QR + brCode, faz polling
  na tabela `reservations` a cada 3 s até `status = 'paid'`.
- Cartão: cria customer + product + checkout em `/checkouts/create` com
  `card.maxInstallments = 3` (até 3x), redireciona pra `app.abacatepay.com/pay/<id>`.

Após pagamento confirmado → `send-reservation-whatsapp`:
1. envia mensagem rica pro cliente (saudação, código, suíte, datas, pacote, extras, total)
2. se `settings.motel_notification_phone` está preenchido, envia 2ª mensagem
   pro motel com nome/telefone/observações do cliente.

---

## Banco — schema principal

| Tabela | Função |
|---|---|
| `packages` | Catálogo de pacotes (Bronze/Prata/Ouro) com preço e itens inclusos |
| `suites` | Suítes com categoria, foto, vídeo, número, buffer de limpeza |
| `suite_photos` | Galeria extra por suíte |
| `reservations` | Reservas com customer, datas, status, payment, extras (jsonb) |
| `settings` | Key-value pra config dinâmica (WhatsApp, telefone notif, URLs de assets) |
| `auth.users` | Login do admin (selectmotel@gmail.com) |

Triggers em `reservations`:
- `check_reservation_conflict` — bloqueia overlap na mesma suíte
- `check_suite_availability` — valida suite ativa
- `set_updated_at` — auto-atualiza timestamp

Function RPC `get_occupied_suite_ids(check_in, check_out)` — usada no
`StepSuite` pra esconder suítes já reservadas no slot escolhido.

---

## Edge Functions

### `abacatepay-create-charge`
**POST** com `packageId, type, suiteId, checkIn, checkOut, customerName, customerPhone, customerEmail, customerTaxId, totalAmount, appOrigin, paymentMethod, extras`

- Reusa reserva pending na mesma suíte + email (hold de 5 min) ou cria nova
- PIX: customer só vai se `taxId` (Abacate v2 exige todos os campos quando customer presente)
- Cartão: cria customer → product (externalId único com timestamp) → checkout com `maxInstallments`

### `abacatepay-webhook`
Recebe `event` + payload do AbacatePay. Aceita o secret em `?webhookSecret=` (formato oficial) ou `Authorization: Bearer` (legado). Lista de eventos paid + lista de status paid → marca reservation como `paid` e chama `send-reservation-whatsapp`.

### `verify-payment`
Chamado pelo frontend ao voltar do checkout cartão. Consulta a AbacatePay direto, confirma status e atualiza banco. Fallback caso o webhook demore.

### `send-reservation-whatsapp`
Busca a reserva + suíte. Monta mensagem rica em pt-BR com bold/emojis (Wuzapi suporta WhatsApp formatting). Envia pro `customer_phone`. Se `settings.motel_notification_phone` definido, envia 2ª mensagem com detalhes operacionais.

### `wuzapi-admin`
Proxy autenticado pra Wuzapi. Endpoints via querystring `?action=status|connect|qr|pair|disconnect|logout`. Valida JWT do user via `supabase.auth.getUser(token)` antes de chamar Wuzapi com o token interno.

---

## Infra na VPS

Detalhes completos em [`infra/README.md`](infra/README.md).

Comandos comuns:

```bash
# logs em tempo real
ssh -i ~/.ssh/select_motel_deploy deploy@2.24.104.155 \
  "docker logs -f supabase-edge-functions 2>&1 | grep -iE 'abacate|webhook|whatsapp'"

# restart functions + kong (Kong cacheia IP do upstream após recreate)
ssh deploy@... "cd /opt/supabase/app && docker compose -f docker-compose.yml \
  -f docker-compose.override.yml restart functions kong"

# manutenção: parar opcionais pra economizar RAM
docker compose stop analytics vector imgproxy
```

### Quirks importantes
- **Compose precisa de -f explícito** nas operações após o stack ter iniciado uma vez sem o override.
- **Kong cacheia IP do container** — sempre restart Kong após recrear o functions.
- **postgresql-client-17** (não 16) — Supabase Cloud é PG 17.
- **`--delete` no rsync das functions** deve excluir `/main` e `/hello` (router padrão).

---

## CI/CD

Dois workflows em `.github/workflows/`:

### `deploy-vps.yml`
Disparado em push na `main` (com paths-ignore pra `supabase/functions/**` e `infra/**`).
1. `npm ci && npm run build` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` injetados.
2. `rsync dist/` pra `/var/www/select-motel/dist/` na VPS via SSH.
3. `sudo systemctl reload nginx`.

### `deploy-functions.yml`
Disparado em push que toca `supabase/functions/**`.
1. `rsync supabase/functions/` pra `/opt/supabase/app/volumes/functions/` (exclui `/main` e `/hello`).
2. `docker compose restart functions` na VPS.

**Secrets do GH** necessários: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

> **Vercel deploya o frontend em paralelo** (push na `main` → build automático apontando pras envs do Vercel). Vercel é o que serve o domínio público `www.selectreservas.com.br`; a VPS serve `api.selectreservas.com.br` (REST/Auth/Storage/Functions).

---

## Analytics & SEO

### Google Tag Manager
Container `GTM-T7V27N8D` no `<head>` + iframe no `<body>` pra noscript.

### Google Ads — 5 conversions de funnel
| Step | Conversion ID | Quando dispara |
|---|---|---|
| `StepPacote` | `rZVECNHc_LccEJyi0ehD` | escolha de pacote |
| `StepSuite`  | `RBcCCJH5krgcEJyi0ehD` | escolha de suíte |
| `StepDados`  | `RO0FCNWRkrgcEJyi0ehD` | preencheu dados |
| `StepPagamento` (mount) | `B1gpCIyhv7ccEJyi0ehD` | iniciar finalização |
| `paid` (PIX + Cartão) | `tNRrCK-4kbgcEJyi0ehD` | compra confirmada |

Cada uma passa `transaction_id` (id da reserva ou email) pra dedup do Ads.

### SEO técnico
- `lang="pt-BR"` + `translate="no"` + meta `notranslate` (Safari iOS para de oferecer tradução)
- 4 blocos JSON-LD: Motel, LodgingBusiness, LocalBusiness, FAQPage, WebSite, Organization
- Geo meta tags (Ivaiporã/PR, -24.2475, -51.6739)
- Open Graph + Twitter Cards
- `robots.txt` + `sitemap.xml`
- HSTS preload-eligible (2 anos) via `vercel.json`
- Redirect 301 `selectreservas.com.br` → `www.selectreservas.com.br`
- Cache imutável de 1 ano pra `/assets/*` do Vite
- Cache 24h pra Storage da VPS (`/supabase/storage/v1/`) com `stale-while-revalidate`

### SEO de conteúdo
- Seção **Sobre o motel** com texto crawlable rico em palavras-chave
- **FAQ** com 8 perguntas (texto visível + schema `FAQPage`)
- Alt text descritivo nas fotos de suíte
- H1 com palavra-chave principal

---

## Próximos passos / Roadmap

- [ ] Google Business Profile (Maps + Local Pack) — **maior impacto pra SEO local**
- [ ] Bing Webmaster Tools
- [ ] Imagem OG dedicada (1200×630)
- [ ] Favicons PNG multi-tamanho (16/32/192/512)
- [ ] Remarketing audience no Google Ads pra abandono de checkout
- [ ] Cron de backup automático do Postgres (`pg_dump` agendado)
- [ ] Cron de renovação Let's Encrypt (já vem via certbot.timer; confirmar)
- [ ] Painel de métricas no admin (taxa de conversão, ticket médio)

---

## Suporte

- Issues: <https://github.com/luis-hsl/select-motel-reservas/issues>
- Endereço: Rodovia Celso Fumiu Makita, Parque Industrial, Ivaiporã – PR, 86870-000
- Telefone: (43) 99909-7482
