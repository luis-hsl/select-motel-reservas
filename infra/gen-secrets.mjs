#!/usr/bin/env node
// Gera todos os secrets do self-host e grava em infra/secrets.local.env (gitignored).
// Uso: node infra/gen-secrets.mjs [PUBLIC_HOST]
//   PUBLIC_HOST padrao: 2.24.104.155

import { createHmac, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_HOST = process.argv[2] ?? '2.24.104.155'
const __dirname   = dirname(fileURLToPath(import.meta.url))

const b64url = (buf) =>
  buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

function makeJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const h = b64url(Buffer.from(JSON.stringify(header)))
  const p = b64url(Buffer.from(JSON.stringify(payload)))
  const data = `${h}.${p}`
  const sig = b64url(createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}

// --- Secrets ---
const JWT_SECRET             = randomBytes(48).toString('base64')
const POSTGRES_PASSWORD      = randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 28)
const DASHBOARD_PASSWORD     = randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
const WUZAPI_ADMIN_TOKEN     = randomBytes(32).toString('hex')
const WUZAPI_USER_TOKEN      = randomBytes(24).toString('hex')
const ABACATEPAY_WEBHOOK_SECRET = randomBytes(24).toString('hex')

// JWTs validos por ~10 anos (padrao Supabase).
const now = Math.floor(Date.now() / 1000)
const exp = now + 60 * 60 * 24 * 365 * 10

const ANON_KEY = makeJwt(
  { role: 'anon', iss: 'supabase', iat: now, exp },
  JWT_SECRET,
)
const SERVICE_ROLE_KEY = makeJwt(
  { role: 'service_role', iss: 'supabase', iat: now, exp },
  JWT_SECRET,
)

// --- Output ---
const env = `# Secrets do self-host Supabase + Wuzapi — gerados em ${new Date().toISOString()}
# NUNCA COMMITAR. Guarde uma copia em gerenciador de senhas.

# Host publico (IP ou dominio)
PUBLIC_HOST=${PUBLIC_HOST}

# Supabase: banco
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Supabase: JWT (assina ANON_KEY e SERVICE_ROLE_KEY)
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# Supabase Studio (UI admin em /studio/)
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}

# Wuzapi
WUZAPI_ADMIN_TOKEN=${WUZAPI_ADMIN_TOKEN}
WUZAPI_USER_TOKEN=${WUZAPI_USER_TOKEN}

# AbacatePay (atualize no painel deles tambem)
ABACATEPAY_WEBHOOK_SECRET=${ABACATEPAY_WEBHOOK_SECRET}

# ------- Para o frontend (.env do Vite / secret no GitHub) -------
VITE_SUPABASE_URL=http://${PUBLIC_HOST}/supabase
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
`

const out = resolve(__dirname, 'secrets.local.env')
writeFileSync(out, env, { mode: 0o600 })
console.log(`✓ Gravado: ${out}`)
console.log()
console.log('Resumo (NAO compartilhe):')
console.log(`  JWT_SECRET           ${JWT_SECRET.slice(0, 12)}...`)
console.log(`  ANON_KEY             ${ANON_KEY.slice(0, 24)}...`)
console.log(`  SERVICE_ROLE_KEY     ${SERVICE_ROLE_KEY.slice(0, 24)}...`)
console.log(`  POSTGRES_PASSWORD    ${POSTGRES_PASSWORD.slice(0, 6)}...`)
console.log(`  DASHBOARD_PASSWORD   ${DASHBOARD_PASSWORD.slice(0, 6)}...`)
console.log(`  WUZAPI_ADMIN_TOKEN   ${WUZAPI_ADMIN_TOKEN.slice(0, 12)}...`)
console.log(`  WUZAPI_USER_TOKEN    ${WUZAPI_USER_TOKEN.slice(0, 12)}...`)
console.log()
console.log('Proximos passos:')
console.log('  1) Backup do arquivo em gerenciador de senhas.')
console.log('  2) Copie pra VPS: scp infra/secrets.local.env deploy@HOST:/tmp/')
console.log('  3) Na VPS, exporte e rode os setup scripts:')
console.log('     set -a; source /tmp/secrets.local.env; set +a')
console.log('     bash /tmp/supabase-setup.sh')
