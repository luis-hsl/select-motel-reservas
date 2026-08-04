import { createClient } from 'jsr:@supabase/supabase-js@2'

// Guarda de autenticação para as funções que expõem operação interna.
//
// **Por que existe, e por que `config.toml` não basta.** O `verify_jwt = true`
// implícito do `supabase/config.toml` só vale no Supabase Cloud e no CLI local.
// Este projeto roda self-host: quem serve as functions é o container
// `edge-runtime`, que lê `VERIFY_JWT` do compose — **uma flag global, não por
// função** (o próprio docker-compose.yml oficial tem o TODO admitindo isso).
// Na VPS ela está em `false`, porque os webhooks de pagamento e o site
// precisam chamar sem JWT.
//
// Consequência: `config.toml` é decorativo aqui. Função que não checar o token
// no próprio corpo fica **aberta na internet**. Medido em 04/08/2026 —
// `plugplay-diag` respondia 200 sem header nenhum, expondo o mapa das suítes.
//
// Então a checagem tem que morar no código, como o `wuzapi-admin` já fazia.

export interface AuthOk {
  ok: true
  userId: string
  email: string | null
}

export interface AuthFail {
  ok: false
  response: Response
}

/**
 * Exige um JWT de usuário logado no Supabase Auth.
 *
 * Chave de service_role **não passa** de propósito: ela não representa um
 * usuário, e essas telas são de admin humano. Quem precisa de acesso
 * máquina-a-máquina deve ganhar uma rota própria, não herdar esta.
 */
export async function exigirAdmin(req: Request): Promise<AuthOk | AuthFail> {
  const negar = () =>
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })

  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { ok: false, response: negar() }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return { ok: false, response: negar() }

  return { ok: true, userId: data.user.id, email: data.user.email ?? null }
}
