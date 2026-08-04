# Formatos reais da API PlugPlay

Sondagem de **04/08/2026 12:23** (`plugplay-probe`, integrador 252, produção).

Existe porque a spec (`openapi/v1.json`) declara `responses.200` **vazio** para
quase tudo que interessa a um painel — `SuitesStatus`, `CategoriaDisponibilidade`,
`Ocupacao`, os relatórios. Modelar tela em cima disso seria chute. Aqui está a
forma medida, com os campos que a spec não conta.

Complementa [`PLUGPLAY.md`](./PLUGPLAY.md), que cobre a integração já ligada
(push de reserva + disponibilidade). Este documento é sobre **leitura** — o que
dá para mostrar no admin.

Regenerar: `GET /functions/v1/plugplay-probe` com JWT de admin.
`?only=chave1,chave2` sonda um subconjunto, `?raw=1` desliga a redação de PII
(o resultado **não** deve ser commitado).

## Placar

21 sondados, **14 respondem 200**.

| Grupo | Chave | Endpoint | |
|---|---|---|---|
| Operação | `suites-status` | `/api/SuitesStatus` | ✅ 13 itens |
| | `categoria-disponibilidade` | `/api/CategoriaDisponibilidade` | ✅ 4 itens |
| | `ocupacoes-agora` | `/api/OcupacoesAgora` | ❌ 401 (outro esquema de auth) |
| Movimento | `ocupacao-pendentes` | `/api/Ocupacao` | ✅ 10 itens |
| | `ocupacao-periodo` | `/api/Ocupacao/PorPeriodo` | ✅ 132 itens (7 dias) |
| | `reservas` | `/api/Reserva` | ✅ 1 item |
| | `cobranca-atual` | `/api/CobrancaAtual/{ref}` | ⏭️ pulado, motel vazio às 12:23 |
| Desempenho | `rel-ocupacao-categoria` | `/api/Relatorios/PorOcupacaoPorCategoriaMesAno` | ✅ objeto |
| | `rel-mapa-calor` | `/api/Relatorios/MapaCalorPorMesAno` | ✅ objeto |
| Financeiro | `caixa-mes` | `/api/Caixa/PorMesAno` | ✅ 7 itens |
| | `rel-pagamentos` | `/api/Relatorios/ListagemPagamentosPorPeriodo` | ✅ 136 pagamentos |
| | `formas-pagamento` | `/api/Entidades/FormaPagamento` | ❌ 401 `FormasPagamento` |
| Consumo | `produtos` | `/api/Entidades/Produto/GetAll` | ✅ 343 itens |
| | `rel-venda-produtos` | `/api/Relatorios/VendaProdutosPorPeriodo` | ❌ 401 `RelVendaProdutos` |
| | `rel-curva-abc` | `/api/Relatorios/CurvaAbcPorPeriodo` | ❌ 401 `RelCurvaAbc` |
| Governança | `rel-limpezas` | `/api/Relatorios/LimpezasPorPeriodo` | ❌ 401 `RelLimpezas` |
| | `rel-interdicoes` | `/api/Relatorios/InterdicoesPorPeriodo` | ❌ 401 `RelInterdicoes` |
| Preço | `preco-regras` | `/api/ConsultaPreco/Regras` | ✅ 16 itens |
| | `tabela-preco` | `/api/Entidades/TabelaPreco` | ✅ 4 classes |
| | `datas-especiais` | `/api/Entidades/TabelaPreco/DatasEspeciais` | ✅ 14 itens |
| | `cupons` | `/api/CupomPromocional` | ✅ 8 itens |

## O que falta pedir para a Oxpi

Cinco permissões, com o nome exato que a mensagem de erro cita — é o que o
cadastro do app PlugPlay espera:

```
FormasPagamento    RelVendaProdutos    RelCurvaAbc    RelLimpezas    RelInterdicoes
```

A mensagem é sempre a mesma: *"O aplicativo não possui a permissão 'X' para
acessar esse recurso. Habilite no cadastro do app PlugPlay."* Foi o mesmo texto
que apareceu em 29/07 para os seis grupos liberados em 31/07 —
ver [[project_plugplay_permissoes]].

**Nenhuma delas bloqueia a Fase 1.** Duas observações que mudam a prioridade:

- **`FormasPagamento` é dispensável.** O dicionário `id → descrição/abreviação`
  vem embutido em `Caixa.pagamentos[]` (`{id, desc, abr, valor}`) e os rótulos
  também vêm prontos em `rel-pagamentos.totais[].descricao`. O endpoint próprio
  só acrescentaria as formas inativas.
- **`RelLimpezas`/`RelInterdicoes` têm substituto parcial.** `SuitesStatus`
  carrega `horaInicioLimpeza`, `horaInicioSujo`, `horaInicioOzonio`,
  `horaInicioFaxina`, `horaEncerramentoOcupacao` e os `tempoDesde*` já
  formatados — dá para montar o ciclo de virada de quarto **do estado atual**
  sem o relatório. O que falta é a série histórica.

`RelVendaProdutos` e `RelCurvaAbc` não têm substituto: `Ocupacao.consumos[]` traz
`produtoId`/`quantidade`/`preco`/`precoCusto` por estadia, então margem por
produto é calculável no nosso lado cruzando com `produtos`, mas é conta nossa,
não relatório deles.

### `OcupacoesAgora` é outro caso

Devolve `401 "EmpresaId ou token inválido"` — **não** é falta de permissão. A
spec pede `empresaId` e `token` em **query string**, não nos headers
`PLUG-PLAY-ID`/`PLUG-PLAY-TOKEN` que o resto da API usa. É um endpoint legado
com esquema de auth próprio.

Não vale perseguir: ele devolve só uma contagem em texto puro, e
`SuitesStatus` já dá a mesma informação com o detalhe por suíte.

## Achados que mudam a Fase 1

### `taxaOcupacao` passa de 100% e isso está certo

Um motel gira o mesmo quarto várias vezes por dia. A taxa é **ocupações por
suíte-dia**, não fração de capacidade. Medido em 04/08 (mês corrente, 4 dias
decorridos, 58 ocupações, 13 suítes):

| Campo | Fórmula (confere exato) | Valor |
|---|---|---|
| `taxaOcupacao` | `ocupacoes / (suites × dias)` | `58/52` = **1.1154** |
| `revPAR` | `totalRecebido / (suites × dias)` | `10244/52` = **197** |
| `ticketMedio` | `totalRecebido / ocupacoes` | `10244/58` = **176.62** |

Renderizar `taxaOcupacao` como barra de progresso travada em 100% seria errado —
é um índice de giro. E `dias` é o **decorrido do mês**, não o mês inteiro:
comparar com mês fechado exige normalizar.

### O relatório do mês já traz o comparativo, mas vem `null`

`mesPassado`, `mesPassadoPct`, `anoPassado`, `anoPassadoPct` e
`placaCarroEstatistica` existem no topo do objeto e estavam **todos `null`** em
04/08. Podem depender de flag no cadastro ou de mês fechado — não dá para
prometer o comparativo na tela sem sondar de novo com o mês anterior.

### O mapa de calor é bom de graça

`MapaCalorPorMesAno` devolve um objeto com chaves `seg`…`dom` (+ total), cada uma
com `h0`…`h23` e `total`, cada célula `{value, rate, qtd}`. É uma grade
7×24 pronta — não precisa de agregação nossa.

### A API expõe nome de funcionário, não só de hóspede

A primeira rodada vazou `Caixa.operador` (nome da funcionária do turno) e
`Caixa.verificacoes[].alias`/`.login` em claro — o regex de PII do probe cobria
só campos de hóspede. Corrigido: `operador|camareira|alias|login` entraram no
padrão, e a re-sondagem confirmou o mascaramento.

Vale lembrar ao ler o resto da API: `Ocupacao` tem `camareirasLimpeza`,
`camareirasLiberacao`, `camareirasConferencia` e `consumos[].operadorId`;
`Reserva` tem `operadorNome`. Qualquer tela que mostre isso está mostrando
desempenho individual de funcionária, o que é decisão do motel, não default.

## Formas

Só os campos que importam. `…` = truncado pela profundidade da sondagem.

### `SuitesStatus` → `[13]`

O objeto mais rico da API, e o alvo principal desta sondagem. Estado atual +
histórico de higienização + conta aberta, tudo por suíte.

```jsonc
{
  "id": 1, "ref": "11", "refF": "11",           // id ≠ número do quarto (ver PLUGPLAY.md)
  "statusId": 1, "status": "Livre",
  "classeId": 1, "classe": "SUÍTE", "classeOrdem": 0,
  "corBackground": "#00CC00", "corTexto": "#FFFFFF",  // cores que a recepção enxerga
  "obs": null, "obsEstilo": 0, "temObs": false,
  "garagem": false, "portaServico": false, "portaCliente": false, "energizado": false,

  // ocupação corrente (zerada quando livre)
  "isOcupado": false, "ocupacaoId": null, "ocupacaoTipo": 0,
  "modoId": 0, "modo": null, "modoSigla": null,
  "entrada": "0001-01-01T00:00:00", "entradaF": "01/01/01 00:00",
  "perm": "14:49", "permMinutos": 889.457,      // tempo restante; usado no plugplay-mapa-dia
  "emPernoite": false, "emCheckout": false,
  "comAlertaTempo": false, "alertaTempoPct": 0,
  "totalConsumo": 0, "valorPrevisto": 0, "totalPrevisto": 0,
  "consumos": null, "temConsumo": false, "consumoQtd": 0,
  "imagemEntradaId": null,

  // ciclo de higienização — substitui parcialmente RelLimpezas
  "horaEncerramentoOcupacao": "2026-08-03T19:02:44.982",
  "horaInicioSujo": null,
  "horaInicioLimpeza": "2026-08-03T21:08:37.23",
  "horaInicioOzonio": "2026-05-11T10:19:42.77",
  "horaInicioFaxina": "2026-07-01T09:52:26.923",
  "tempoDesdeEncerramento": "17:19",            // já formatado; "85d 02:02" quando passa de 1 dia
  "tempoDesdeInicioLimpeza": "15:13",
  "tempoDesdeInicioSujo": "",                   // string vazia, não null
  "qtdEnergizacaoOzonio": 0, "qtdEnergizacaoLimpeza": 0, "qtdEnergizacaoFaxina": 0,
  "funcionarioConferenteCheckoutId": null,
  "manutencaoId": null,
  "horaUltimoStatus": "2026-08-03T21:32:32.54"
}
```

**`statusId: 1` = Livre.** Foi o único valor observado — as 13 suítes estavam
livres às 12:23 de uma terça. Os demais códigos continuam desconhecidos; rodar de
novo com o motel em movimento para mapeá-los.

**Datas zeradas vêm como `0001-01-01T00:00:00`**, não `null`. Tratar como vazio.

### `CategoriaDisponibilidade` → `[4]`

```jsonc
{ "categoriaId": 1, "categoria": "SUÍTE", "disponiveis": 7, "total": 7 }
```

Categorias: `1 SUÍTE` (7), `2 HIDRO LIGHT` (2), e mais duas — casa com o
mapeamento de `PLUGPLAY.md` (Hidro 2, VIP Piscina 2).

### `Ocupacao` e `Ocupacao/PorPeriodo` → `[n]`

**Mesmo objeto nos dois.** `/api/Ocupacao` são as pendentes de sync (10);
`PorPeriodo` é o histórico (132 em 7 dias). É a base do ingest da Fase 2.

```jsonc
{
  "ocupacaoId": 0, "codigo": 0, "caixaId": 0, "caixaOriginalId": 0, "suiteId": 0,
  "entrada": "…datetime", "saida": "…datetime", "dataBaseCaixa": "…datetime",

  // valores por modalidade — o total NÃO vem somado
  "normal": 0, "pernoite": 0, "pernoiteExecutivo": 0, "pernoite3": 0, "pernoite4": 0,
  "excesso": 0, "excessoPernoite": 0, "excessoPernoiteExecutivo": 0,
  "excessoPernoite3": 0, "excessoPernoite4": 0,
  "desconto": 0, "acrescimo": 0, "pessoaExtra": 0, "quantidadePessoaExtra": 0,
  "totalCortesia": 0, "totalConsumo": 0, "totalRecebido": 0,

  "modo": 0,                    // mapa em PLUGPLAY.md: 0 normal, 1 pernoite, 2 "2h", 4 diária
  "tipoConducao": 0, "isEntradaAutomatica": false, "qtdPernoiteExtra": 0,
  "placa": "«mascarado»",       // identidade do hóspede de balcão — 74% preenchido
  "reservaId": null,            // preenchido só nas que vieram do site
  "clienteFidelidadeId": null,  // null em 100%; não há endpoint para escrever
  "horaEspera": null, "marcador": 0, "marcadores": null, "imagemEntradaId": 0,

  // sinais de auditoria da recepção
  "mostrouContaMult": false, "mostrouContaMaiorMenor": false, "mostrouContaSemCarro": false,
  "teveTransferencia": false, "teveExclusaoProduto": false, "teveEdicaoFormaPgto": false,
  "tevePagamentoAntecipado": false,
  "camareirasLimpeza": null, "camareirasLiberacao": null, "camareirasConferencia": null,

  "pagamentos":  [{ "pagamentoId":0, "formaPagamentoId":0, "formaPagamentoDescricao":"",
                    "valor":0, "dataPagamento":"…datetime",
                    "authCode":null, "autExtRef":null, "reqNum":null, "authSyst":null }],
  "observacoes": [{ "observacaoId":0, "dataHora":"…datetime", "tipo":0,
                    "observacao":"«mascarado»", "refId":0,
                    "info":null, "refId2":null, "valor":null, "valor2":null,
                    "boolValue":null, "boolValue2":null }],
  "consumos":    [{ "consumoProdutoId":0, "produtoId":0, "quantidade":0,
                    "precoCusto":0, "preco":0, "isDigitadoOperador":false, "operadorId":0 }]
}
```

`incluirObservacoes`/`incluirPagamentos`/`incluirConsumos` precisam ir como
`true` na query — sem eles os três arrays vêm vazios.

**`consumos[]` traz `precoCusto` e `preco`**, ou seja: margem por produto é
calculável sem `RelVendaProdutos`.

### `Reserva` → `[n]`

~120 campos. O objeto carrega 4 slots de cliente (`clienteId`…`clienteId4`) e 3
de pagamento (`valorPago`…`valorPago3`), quase todos `null` no nosso uso.
Os que importam:

```jsonc
{
  "id": "uuid-string", "suiteId": 0, "suiteRef": "", "suiteClasseNome": "",
  "dataCadastro": "…datetime", "dataInicio": "…datetime", "dataInicioF": "",
  "saidaPrevista": "…datetime", "saidaNegociado": null, "saidaPrevistaOuNegociada": null,
  "modo": 0, "tipo": 0, "status": 0, "statusColor": "#…",
  "nome": "«mascarado»", "telefone": null, "cpf": null, "email": null,
  "identidade": "…", "observacoes": "",
  "integracaoId": null, "integracaoAppId": 0, "integracaoStatus": 0, "integracaoSync": false,
  "ocupacaoId": null,                    // liga a reserva à estadia quando o hóspede chega
  "horasAlerta": 6, "horasInterdicao": 2,
  "valorPago": 0, "valorReceber": null, "valorNegociado": null, "totalAPagar": 0,
  "formaPagamentoId": 0, "formaPagamentoDescricao": "", "formaPagamentoAbreviacao": "",
  "cancelada": false, "canceladaMotivo": null, "canceladaDataHora": null,
  "isExpirado": false, "isGuiaMoteisGo": false,
  "operadorId": 0, "operadorNome": "", "modulo": 0, "moduloTxt": ""
}
```

**`integracaoAppId` separa a origem** — o nosso é `4`. Reserva de telefone/balcão
vem com outro valor, então dá para segmentar site × recepção no painel.

**`nome` vem preenchido mesmo em reserva de balcão**, ao contrário de `Ocupacao` —
é a única fonte de identidade nominal na API.

### `Relatorios/PorOcupacaoPorCategoriaMesAno` → objeto

`{ items: [4], …~90 escalares no topo }`. `items[]` é por classe de suíte, o topo
é o consolidado. Cada nível repete o mesmo vocabulário:

- **modalidades**: `normal`, `pernoite`, `pernoiteExecutivo`, `pernoite3`…`pernoite10`
- **excessos**: `excesso`, `excessoPernoite`, `excessoPernoite3`…`excessoPernoite10`
- **contagens**: `ocupacoes`, `ocupacoesNormal`, `ocupacoesPernoite*`, `ocupacoesVip`
- **totais**: `tot`, `totNormal`, `totP1`…`totP10`, `totDescontos`, e os `%` em `*Pct`
- **metas**: `m1`…`m10` com `m1Label`…`m10Label`
- **derivados**: `revPAR`, `taxaOcupacao`, `ticketMedio`, `ticketMedioConsumo`, `pct`/`pctF`, `perm`/`permF`
- **dinheiro**: `totalRecebido`, `consumo`, `desconto`, `acrescimo`, `pessoaExtra`, `cortesia`
- **contexto**: `suitesDisponiveis` (13), `incluiAntecipados`, `pagamentosReservasTotal`,
  `totalRecebidoSemPagamentosReservas`
- **comparativo** (todos `null` em 04/08): `mesPassado`, `mesPassadoPct`,
  `anoPassado`, `anoPassadoPct`, `placaCarroEstatistica`, `benchmarkRede`
- **outros blocos**: `vendasDireta`/`vendasDiretaTotal`/`vendaDiretaQtd`,
  `duplicatas`/`duplicatasTotal`, `pagamentosReservas`, `canceladas`

`items[].suiteRef` e `items[].operador` vêm `null` no corte por categoria — o
mesmo relatório provavelmente serve a outros agrupamentos.

### `Relatorios/MapaCalorPorMesAno` → objeto

```jsonc
{
  "seg": { "dia": 0, "diaNome": "", "diaAbv": "", "isTotal": false,
           "h0": { "value": 0, "rate": 0, "qtd": 0 }, … "h23": {…},
           "total": { "value": 0, "rate": 0, "qtd": 0 } },
  "ter": {…}, "qua": {…}, "qui": {…}, "sex": {…}, "sab": {…}, "dom": {…}
}
```

Grade 7×24 pronta. `value` = faturamento, `qtd` = ocupações, `rate` = taxa.

### `Caixa/PorMesAno` → `[7]`

Sete fechamentos no mês. O aberto tem `fim: null`.

```jsonc
{
  "id": 646, "operador": "«nome da funcionária — NÃO commitar»",
  "inicio": "2026-08-04T07:01:00", "fim": null, "dataBaseCaixa": "2026-08-04T00:00:00",
  "terminalId": 0, "valorInicial": 0,
  "f1": 0, … "f15": 0,                     // por forma de pagamento, índice = pagamentos[].id
  "totalSangriasF1": 0, … "totalSangriasF15": 0,
  "totalSangrias": 0, "totalAjustes": 0, "totalDeclarado": 0, "totalCorrecao": 0,
  "totalDespesas": 0, "totalConsumoFunc": 0, "somaConsumoFunc": false,
  "totalRecebido": 0, "totalDinheiro": 0, "total": 0,
  "descontos": 0, "quebraDesconto": 0,
  "dinheiro": 0, "dinheiroAntecipado": 0, "totalAntecipado": 0,
  "conferido": false,
  "inicialDifereFinal": false, "inicialDifereFinalQuebra": 0, "finalDifereInicial": false,
  "pagamentos":    [{ "id":1, "desc":"Dinheiro", "abr":"DIN", "valor":0,
                      "agrupado":false, "exibe":true }],
  "verificacoes":  [{ "id":0, "alias":"", "login":"", "quantidade":0,
                      "verificado":false, "conferido":false }]
}
```

**`pagamentos[]` é o dicionário das formas** — `id 1 Dinheiro/DIN`,
`id 2 Depósito em Conta/DPC`, +5. É o que dispensa a permissão `FormasPagamento`.
`f1`…`f15` indexam por esse `id`.

`Caixa/ViewModel` (detalhe de um caixa) não foi sondado: exige `id`, então só
depois de escolher um na tela.

### `Relatorios/ListagemPagamentosPorPeriodo` → objeto

```jsonc
{
  "items": [{ "pagamentoId":0, "dataPagamento":"…datetime", "suiteRef":"",
              "caixaId":0, "ocupacaoId":0,
              "formaPagamentoId":0, "formaPagamentoDescricao":"", "formaPagamentoAbreviacao":"",
              "taxa":0, "valor":0, "valorTaxa":0, "valorLiquido":0,
              "antecipado":false, "formaPagamentoTipo":0,
              "entrada":"…datetime", "saida":null,
              "bandeiraId":null, "bandeiraDescricao":null, "authCode":null,
              "conciliacao*": null }],            // ~18 campos de conciliação, todos null
  "totais": [{ "descricao": "PIX", "total": 2255, "naoSoma": false },
             { "descricao": "C. Debito", "total": 6036.1, "naoSoma": false }, …],
  "total": 19642.1
}
```

**`valorLiquido` já desconta a taxa da adquirente** — é o número honesto para o
painel. Todo o bloco `conciliacao*` veio `null`: o motel não usa conciliação.

`totais[]` tem `naoSoma` — linha marcada assim não entra no `total`.

### `Entidades/Produto/GetAll` → `[343]`

```jsonc
{
  "id": 0, "nome": "", "unidade": "", "referencia": "",
  "precoCusto": 0, "precoVenda": 0, "precoFuncionario": 0,
  "grupoId": 0, "grupoNome": "", "subgrupoId": 0, "subgrupoNome": "",
  "estoqueMinimo": 0, "estoqueControlado": false, "quantidadeSuite": 0,
  "estoqueRecepcao": false, "estoqueRecepcaoQuantidade": 0,
  "isAtivo": false, "isComposto": false, "isIngrediente": false,
  "disponivelCardapio": false, "categoriaCardapioId": null, "categoriaCardapioNome": null,
  "descricao": null, "destaque": false, "omiteCliente": false, "verNaRecepcao": false,
  "prato": false, "imprimiCozinha": false, "imprimeCorredor": false,
  "adicionalDeProdutoId": null, "variacoes": null, "variacoesList": [],
  "flags": 0, "temFlagHorarioVendas": false, "temFlagPrecoDinamico": false
}
```

343 produtos — muito mais que o cardápio do site. `disponivelCardapio` +
`categoriaCardapioNome` são o filtro para cruzar com o nosso.
`precoCusto` + `precoVenda` dão margem sem depender de `RelCurvaAbc`.

### `ConsultaPreco/Regras` → `[16]`

16 = 4 categorias × 4 modalidades. Preço de **balcão** — o do site é outro, e
isso é de propósito (ver [[project_precos_site_vs_pms]]).

```jsonc
{ "categoriaId": 1, "categoria": "SUÍTE", "modalidade": "Normal",
  "descricao": "PADRÃO", "valor": 75, "periodo": "1h", "ehPadrao": true,
  "diasHorasInclusos": null, "diasHorasExclusos": null,
  "datasInclusas": null, "datasExclusas": null,
  "datasEspeciaisInclusas": null, "datasEspeciaisExclusas": null, "validade": null }
```

Todos os 16 com `ehPadrao: true` e os campos de exceção `null` — **o motel não
tem regra condicional de preço no PMS**. Confirma o "preços iguais de segunda a
domingo" registrado em `PLUGPLAY.md`.

### `Entidades/TabelaPreco` → objeto

```jsonc
{ "items": [{ "suiteClasseId": 0, "suiteClasseNome": "", "isAtivo": true,
              "tabelaPreco": { "normal": {…}, "pernoite": {…}, "pernoite2": {…},
                               "pernoite3": {…}, … "pernoite10": {…} } }] }
```

Cada modalidade: `{ modo, padrao, regras, precoPessoaExtra, precoPessoaExtraPct,
pessoaExtraPorPct, pessoaExtraPctBaseCalculo, inicioExcessoPessoaExtra,
tempoExcessoPessoaExtra, precoExcessoPessoaExtra }`.

Foi daqui que saiu o mapa de `OcupacaoModo` em `PLUGPLAY.md`. Sondar mais fundo
(`MAX_DEPTH` cortou em `regras`) se a Fase 1 precisar das regras de pessoa extra.

### `Entidades/TabelaPreco/DatasEspeciais` → `[14]`

```jsonc
{ "tipo": 0,  "data": "2026-01-01T00:00:00", "vespera": "2025-12-31T00:00:00",
  "pos": "2026-01-02T00:00:00", "tipoTxt": "Ano Novo" }
{ "tipo": 10, "data": "2026-02-17T00:00:00", "vespera": "2026-02-16T00:00:00",
  "pos": "2026-02-18T00:00:00", "tipoTxt": "Carnaval" }
```

14 feriados de 2026, cada um com véspera e pós já calculados. `tipoTxt` é o
rótulo pronto. Como nenhuma regra de preço referencia data especial (acima), hoje
isso é só calendário — útil para anotar o gráfico de faturamento.

### `CupomPromocional` → `[8]`

```jsonc
{
  "id": "uuid", "codigo": "", "descricao": "",
  "valor": 0, "valorLimite": 0, "valorModo": 0, "valorDisplay": "",
  "periodoMinutos": 0, "periodoComportamento": 0, "periodoDisplay": "",
  "modalidade": 0, "isAtivo": true,
  "dataExpiracao": null, "dataExpiracaoDisplay": "",
  "utilizaApenasCheckIn": false, "utilizaApenasCheckInMinutos": 0,
  "apenasAdmin": false, "apenasAutoAtendimento": false,
  "classesJson": "[]", "diasSemanaJson": "[]", "datasJson": "[]",
  "datasExclusasJson": "[]", "produtosJson": "…", "autoAtendimentoConfJson": "…",
  "classesList": [], "diasSemanaList": [], "datas": [], "datasExclusas": [],
  "produtos": { "orSet": [{ "ordem": …, "nome": …, "produtos": … }] },
  "temValorOuPeriodo": false, "temProdutos": false,
  "temMultiplosConjuntosProdutos": false, "qtdConjuntosProdutos": 0,
  "produtosDisplay": "", "selecaoUmItemPorConjunto": false,
  "error": "", "marcadoExclusao": false, "enviadoPC": false
}
```

**Os `*Json` são string com JSON dentro**, e vêm duplicados nas versões já
parseadas (`classesList`, `diasSemanaList`, `datas`, `datasExclusas`). Usar as
listas, não as strings.

`produtos.orSet[]` (5 conjuntos) é a estrutura de cupom de produto — OR entre
conjuntos, e `selecaoUmItemPorConjunto` decide se é um item ou todos.

Os `*Display` já vêm formatados pelo PMS — reaproveitar em vez de reformatar.

### `CobrancaAtual/{suiteReferencia}` → não sondado

Pulado: nenhuma suíte ocupada às 12:23. O probe escolhe sozinho a primeira
ocupada de `SuitesStatus`, então basta rodar de novo com o motel em movimento —
à noite, de preferência.

## Não sondados de propósito

Endpoints de leitura que a API expõe como **POST**:
`OcorrenciaManutencao/Kanban`, `Estoque/ListagemSaldo`, os `/Busca`.

`plugplayGet()` só sabe GET — decisão deliberada para que uma whitelist de
caminhos não vire vetor de escrita no sistema que a recepção usa. Se a Fase 1
precisar de algum deles, o wrapper precisa de um método próprio, com a whitelist
fechada no código e não vinda de query string.
