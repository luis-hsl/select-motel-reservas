# Integração MotelMais PlugPlay

O PMS que a recepção do motel usa. Spec: `https://oxpi.com.br/api/PlugPlay/openapi/v1.json`
(a página `/scalar/v1m` é só a UI — o JSON acima é a fonte).

A spec deixa `responses.200` vazio na maioria dos endpoints de leitura. As formas
reais, medidas contra produção, estão em
[`PLUGPLAY-SAMPLES.md`](./PLUGPLAY-SAMPLES.md).

## O que está ligado

**Push** — reserva paga no site vira reserva no PMS.
`abacatepay-webhook` → enfileira `kind='pms_reserva'` → `process-notifications-queue`
→ `plugplay-sync-reserva` → `POST /api/Reserva`.
Herda o retry exponencial da fila (1m → 2m → 4m … cap 1h, 10 tentativas).

**Disponibilidade** — o PMS enxerga walk-in, manutenção e reserva por telefone;
o banco do site não. Consultado em três pontos:
- `StepData` (via `plugplay-mapa-dia`) — quantas suítes livres em cada horário
- `StepSuite` (via `plugplay-disponibilidade`) — cinza as suítes ocupadas na vitrine
- `abacatepay-create-charge` — última checagem antes de cobrar

### Por que `plugplay-mapa-dia` calcula em vez de perguntar

`ReservaDisponibilidade/PorSuiteId` é por suíte e por janela. Para os 24 slots
× 13 suítes do StepData daria **312 chamadas** — inviável numa tela. A função
puxa 2 endpoints (`/api/Reserva` + `/api/SuitesStatus`) e cruza localmente.

A regra foi medida contra a API, não deduzida:

```
bloqueado = [dataInicio − horasInterdicao, saidaNegociado]
sobrepõe  = entrada < fimBloqueio && saida > inícioBloqueio   (half-open)
```

Validado em 29/07/2026 com uma reserva real de 18:00–20:00 (interdição 2h →
bloqueio 16:00–20:00): o cálculo local reproduziu a resposta de
`ReservaDisponibilidade` em **24/24 slots**, incluindo as bordas
(14:00 livre, 15:00 bloqueado, 19:00 bloqueado, 20:00 livre).

**Limite conhecido:** o cálculo cobre reservas com exatidão, mas o status
atual (Ocupado/Faxina/Manutenção) entra por aproximação — para `Ocupado`
usamos o campo `perm` (tempo restante, conferido), para os demais status uma
janela curta de 2h. Isso só afeta slots de hoje nas próximas horas. O ponto
autoritativo continua sendo o `create-charge`, que consulta o PMS de verdade
antes de cobrar.

**Cancelamento** — admin marca `cancelled` → `plugplay-sync-reserva` com
`cancel:true` → `DELETE /api/Reserva` (soft delete lá).

## Configuração

Variáveis no container `functions` (`infra/supabase-override.yml`):

| Var | Obrigatória | Nota |
|---|---|---|
| `PLUGPLAY_ID` | sim | header `PLUG-PLAY-ID` — nosso integrador é o **252** |
| `PLUGPLAY_TOKEN` | sim | header `PLUG-PLAY-TOKEN` (fica em `infra/secrets.local.env`, que o `.gitignore` cobre) |
| `PLUGPLAY_BASE_URL` | não | default `https://oxpi.com.br/api/PlugPlay` |
| `PLUGPLAY_TZ` | não | default `America/Sao_Paulo` |
| `PLUGPLAY_MODO_MAP` | não | override do mapa de modalidades; ver abaixo |

**Sem `PLUGPLAY_ID`/`PLUGPLAY_TOKEN` a integração fica inerte**: as funções
devolvem `not_configured`, a disponibilidade volta vazia e o site vende
normalmente usando só a checagem local. Nada quebra.

## Mapeamento das suítes

Já feito em `20260729_plugplay_mapeamento_suites.sql`. As 13 suítes batem 1:1.

**O `id` do PMS não é o número do quarto.** Ele expõe os dois — `id` é o que a
API consome (`Reserva.suiteId`), `ref` é o número que a recepção usa. Quarto 12
é `id=8`, quarto 14 é `id=12`. Mapear pelo número quebraria silenciosamente,
mandando reserva para a suíte errada.

| Quarto | `pms_suite_id` | Categoria | `classeId` |
|---|---|---|---|
| 11, 17, 22, 23, 24, 25, 26 | 1, 2, 3, 4, 5, 6, 7 | Standard | 1 |
| 12, 13 | 8, 9 | Hidrolite | 2 |
| 15, 18 | 10, 11 | Hidro | 3 |
| 14, 16 | 12, 13 | VIP Piscina | 4 |

Se abrirem ou renumerarem suíte, rode `plugplay-diag` (lista o PMS ao lado das
nossas não mapeadas) e atualize. Suíte sem `pms_suite_id` é marcada
`suite_unmapped` e o push não insiste — retry não resolve falta de cadastro.

## `OcupacaoModo` — resolvido

A spec declara `modo` como `integer` cru, sem enum. Os valores vieram de
`GET /api/Entidades/TabelaPreco`, que expõe cada modalidade com seu `modo`,
duração e preço:

| Nosso `type` | `modo` | Modalidade no PMS | Duração |
|---|---|---|---|
| `oneHour` | 0 | normal | 60 min |
| `period` | 2 | pernoite2 ("2h") | 120 min |
| `overnight` | 1 | pernoite | 1020 min (17h) |
| `diaria` | 4 | pernoite4 ("Diária") | 1440 min |

Confirmado pelos preços: Suíte Hidro (180/310/400) e VIP Piscina (200/490/590)
batem exatamente com `src/data/suiteCategories.ts`.

O mapa está fixo em `plugplay-sync-reserva`. `PLUGPLAY_MODO_MAP` sobrescreve se
o motel remanejar as modalidades — ex.: `{"period":2,"overnight":1}`.

## Interdição de limpeza — 2h, governada pelo PMS

**Quem manda é o cadastro do integrador no PMS, e ele está em 2h.** Medido:
uma reserva criada *sem* enviar `horasInterdicao` volta com `2` preenchido
(e `horasAlerta: 6`). Não há endpoint que leia ou altere essa configuração —
a única forma de saber é observar o que ele preenche.

`plugplay-sync-reserva` **omite** o campo de propósito. Enviar funciona
(verificado: `1` bloqueia 17:00–20:00, `2` bloqueia 16:00–20:00), mas
congelaria o nosso valor e faria o site ignorar uma mudança futura no cadastro
deles. Omitindo, os dois lados nunca divergem.

Onde as 2h aparecem hoje:

| Lugar | Valor |
|---|---|
| Cadastro do integrador no PMS | 2h (fonte) |
| `StepSuite` → `CLEANING_BUFFER_H` | 2h (espelho, checagem local) |
| `suites.cleaning_buffer_h` | 2h (dado; não lido por nenhuma lógica) |

Em 29/07/2026 chegou-se a baixar para 1h — as 2h vinham da temporada de Dia
dos Namorados, quando cada quarto era limpo *e* redecorado. Foi revertido para
manter site e recepção idênticos: 1h só no site recuperaria a faixa
16:00–17:00, mas mostraria como livre uma suíte que a recepção considera
interditada.

**Para baixar de verdade**, o motel precisa alterar o default do integrador
252 no PMS. Aí `CLEANING_BUFFER_H` no `StepSuite` acompanha.

## Preço: o do site é que vale

São duas tabelas com propósitos diferentes, e isso é intencional:
a do PMS é **preço de balcão** (quem chega na hora), a do site é **reserva
antecipada** — o quarto fica bloqueado para aquele horário.

A integração respeita isso: mandamos o total do site em `valorNegociado` e
`valorPago`, e o PMS registra esse valor em vez de recalcular pela tabela dele.
Verificado em produção. Mexer em preço no site não exige nada aqui.

Estado medido em 29/07/2026 (`GET /api/ConsultaPreco`, preços iguais de segunda
a domingo — o PMS não tem adicional de fim de semana):

| | site | balcão |
|---|---|---|
| Standard · pernoite | **150** | 105 |
| Standard · 1h / 2h / diária | 75 / 95 / 260 | idem |
| Hidro Light · 2h / pernoite / diária | 130 / 220 / 310 | idem |
| Suíte Hidro · 2h / pernoite / diária | 180 / 310 / 400 | idem |
| VIP Piscina · 2h / pernoite / diária | 200 / 490 / 590 | idem |

Ou seja, hoje só Standard/pernoite cobra o prêmio de antecedência; as outras 12
combinações estão no preço de balcão. Não é problema de integração — fica
registrado aqui porque contradiz a intenção das duas tabelas.

## Comportamentos da API que a spec não conta

Descobertos testando contra produção em 29/07/2026 (reserva criada e cancelada).

**`POST /api/Reserva` devolve o uuid como string crua**, não um objeto — o corpo
é literalmente `"63c095e6-3b36-498e-aea7-3227d878d38a"`, apesar de a spec tipar
`Reserva`. `criarReserva()` normaliza para `{ id }`.

**`saidaNegociado` exige `valorNegociado` junto.** Sem os dois, HTTP 400:
*"Defina um valor negociado juntamente com uma saída negociada."*

**O PMS aplica a interdição dele sozinho.** Uma reserva às 14:00 com
`horasInterdicao: 2` bloqueia a suíte a partir das 12:00 — a mensagem de
disponibilidade diz isso explicitamente. Por isso mandamos a janela real
(`checkIn` → `checkOut`), sem somar buffer nosso: os dois juntos esconderiam
suítes livres.

**`horasInterdicao` pode ser enviado e o PMS respeita.** Verificado: a mesma
reserva 18:00–20:00 bloqueia 16:00–20:00 com `2` e 17:00–20:00 com `1`.
Mandamos `suites.cleaning_buffer_h`, que é a fonte da verdade do lado do site
— assim o prazo é ajustável por suíte sem depender do cadastro deles.
`horasAlerta` (6) continua vindo do integrador.

**`ReservaDisponibilidade` considera reservas futuras**, não só ocupação atual —
verificado: janela idêntica e janela sobreposta dão `false` com mensagem
descritiva; janela distante e outra suíte dão `true`; após cancelar volta a
`true`.

**`integracaoAppId` é atribuído por eles** (o nosso é `4`), diferente do
`PLUG-PLAY-ID` (252) que vai no header.

**Mensagem do 400 de duplicidade:** *"Já foi cadastrado uma reserva com o código
de integração desse mesmo aplicativo: IntegracaoId: `<uuid>` / AppId: 4"* — é
o que `plugplay-sync-reserva` reconhece para tratar retry como sucesso.

## Decisões que valem lembrar

**Datas vão em horário local, sem offset.** O PMS interpreta o que recebe como
horário da empresa. Mandar `2026-08-15T01:00:00Z` faria a reserva das 22h do
dia 14 aparecer como 01h do dia 15. `toPmsDateTime()` resolve.

**PMS fora do ar não bloqueia venda.** Tanto na vitrine quanto no
`create-charge`, falha de rede/timeout deixa passar. Perder reserva por
instabilidade do ERP é pior que o overbooking ocasional, que a recepção já
sabe contornar. Overbooking real (PMS respondeu `disponivel:false`) bloqueia.

**Idempotência é do lado deles.** Mandamos o UUID da nossa `reservation` como
`integracaoId`; o PMS devolve 400 se repetir. `plugplay-sync-reserva` trata
esse 400 específico como sucesso — é o caso de um retry cujo POST passou mas a
gravação local falhou.

## Diagnóstico

```sql
-- reservas pagas que não chegaram no PMS
SELECT * FROM pms_sync_pendentes;

-- itens da fila travados
SELECT id, kind, attempts, last_error, next_attempt_at
  FROM notification_queue
 WHERE kind = 'pms_reserva' AND status <> 'sent'
 ORDER BY created_at DESC;
```
