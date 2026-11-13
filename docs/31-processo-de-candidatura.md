# 31 — Processo de candidatura por mestrado

Desde 13/11/2026, cada mestrado tem o seu processo de candidatura resolvido a partir de fontes oficiais, e as
missões das Rodadas 1 a 4 usam esse processo. Relatório da auditoria: `docs/auditorias/2026-11-13-candidaturas.md`.

## Modelo

Todos os mestrados oficiais das 10 universidades públicas andaluzas usam o mesmo procedimento legal (Distrito
Único Andaluz). O que muda por mestrado vem de dados oficiais do próprio mestrado. Por isso o modelo tem três camadas:

| Camada | Arquivo | Conteúdo |
|---|---|---|
| Procedimento oficial | `server/content/application-procedures.js` (`DUA_MASTERES`) | Fases, limite de 6 pedidos, documentos do título estrangeiro, idioma dos documentos, pagamento a cuenta da Fase 1, regras pós-adjudicação. Cada regra tem `fonte`, `artigo` e `revisadoEm`. |
| Regras de mestrados específicos | mesmo arquivo (`PROGRAM_SPECIFIC`) | Psicología General Sanitaria (certificação da Orden CNU/1309/2018, O2 art. 9) e Máster en Profesorado de ESO/Bachillerato (prazo da acreditação de idioma, O2 Anexo I), pelo nome oficial sem acento; duplos seguem o máster habilitante (O2 art. 12.1). |
| Canal por mestrado | `server/content/program-channels.js` | Os 28 mestrados da UGR sem vínculo automático: código DUA conferido (`dua`), vários códigos (`dua-variantes`), procedimento próprio Erasmus Mundus/Arqus (`nao-dua`) ou fora do catálogo do ciclo (`nao-ofertado`). Cada entrada tem evidência (fonte, URL, data). O pipeline do Radar usa os vínculos `dua`. |
| Dados do mestrado | Radar (`programForJourney` em `server/radar/service.js`) | Código DUA (canal), requisitos da ficha (com obrigatórios), critérios de seleção, data da coleta. |

`server/application-process.js` (`applicationProcess`) junta as três camadas com o calendário oficial do ciclo
(Radar) e o perfil do estudante. Cada item sai marcado como `oficial`, `ficha`, `derivado` (deduzido do texto de
um critério, ex.: currículo) ou vai para `pendencias` (não confirmado). Nada é preenchido sem fonte.

`verificacao` do processo: `confirmado` = canal no catálogo do DUA + ficha coletada; `parcial` = falta um dos
dois; `demo` = programa demonstrativo.

## Integração com a jornada (`server/journey-engine.js`)

- `ctx.processo` / `processFor(user, jr)`: processo do mestrado da jornada.
- `regra: { tipo: 'processo', flag }` — missão que só existe para mestrados com aquela regra oficial (Missão 2.8,
  homologação). Para os demais fica "não aplicável" com motivo.
- `alertasProcesso: ['canal' | 'fase' | 'ficha']` — o alerta deixa a missão em "atenção" sem escondê-la.
- `processo: true` — o detalhe da missão inclui o processo; a central mostra a ferramenta "Processo deste mestrado"
  (`public/js/components/ApplicationProcess.js`).
- Objetivo `tipo: 'escolha'` (Missão 3.2, `dados.faseDua`): o servidor recusa a Fase 1 para nacionalidade espanhola.
  Quem ainda não se formou NÃO é empurrado para a Fase 3: os requisitos 4 e 5 do art. 2 (O2) valem só para graduação
  em universidade espanhola ou PARS andaluz; com título estrangeiro, o título precisa estar concluído até a data-limite
  de qualquer fase (aviso "verificar" com a data oficial).
- `soDua: true` — passos do DUA ficam "não aplicáveis" para mestrado com procedimento próprio; a Missão 3.11 leva ao
  canal oficial do programa (Erasmus Mundus/Arqus).
- Ciclo: o processo usa os acordos de 2026/27; jornada de outro ano recebe pendência e alerta (`alertasProcesso: 'ciclo'`).
- Idioma: a exigência é recalculada a partir do texto dos requisitos da ficha (`languageRequirements`), e com dois
  requisitos obrigatórios do mesmo idioma vale o nível mais alto.
- `opcoesNoLimite` (Missão 3.4): "Minhas opções" com 1 a 6 mestrados (a API `PUT /me/choices` já recusa mais de 6).
- Prazos oficiais (`officialDeadlines`): só da fase declarada; sem fase declarada, só datas futuras (nunca um
  "prazo vencido" de uma fase que o estudante não escolheu). Inclui data-limite do título (2.2) e prazos de
  matrícula/reserva/confirmação (4.2).

## Estados de candidatura

`adjudicacao`: `nao-enviada`, `aguardando`, `admitido` (1ª preferência), `admitido-outra-opcao` (vaga numa opção,
em lista nas preferidas), `lista-espera`, `nao-admitido`, `exige-acao`, `excluido`.
`matricula`: `nao-iniciada`, `vaga-confirmada` (rótulo: pagamento a cuenta da Fase 1), `reservada`, `matriculado`
(provisória até a conferência dos documentos).

Transições validadas em `setSituacao`:
- matrícula e visto só com vaga atribuída (`ADMITIDO` em `content/rounds.js`);
- reserva só com `admitido-outra-opcao` (na 1ª preferência a ação é a matrícula);
- resultado sem vaga só depois de voltar a matrícula para "Não iniciada".

## O que NÃO está confirmado (e por quê)

- **Oferta da Fase 1 por mestrado.** Os acordos deixam cada universidade decidir; o catálogo público do DUA devolve
  a mesma lista (byte a byte) nas consultas das Fases 1, 2 e 3 (conferido em 13/11/2026). Fica como pendência
  para todos, com instrução de conferir no portal ou com a universidade.
- **Cirugía Bucal e Implantología (UGR)** e **Abogacía y Procura (Melilla)**: sem código no catálogo do DUA 2026/27;
  canal a confirmar com o Servicio de Másteres Oficiales da UGR. **Food-H (Arqus)**: fora do DUA, canal não publicado.
- **Vagas e preço total** não constam da ficha do DUA.
- **Contradição resolvida:** um FAQ antigo da UNIA dizia que a lista de espera da Fase 1 passava automaticamente à fase
  seguinte; o acordo (O1 arts. 6.6 e 9) exige confirmação expressa, e o documento oficial da UNIA de 2026/27 não repete
  a afirmação. Vale o BOJA.

## Auditoria

Segunda auditoria (conformidade, uma linha por mestrado): `node scripts/audit-conformidade.mjs <dump.json> <fichas.json> <saida>`
compara a ficha e o catálogo do DUA reconsultados com o banco de produção e com o processo aplicado pelo código.
Matriz: `docs/auditorias/2026-11-13-matriz-conformidade.md`.

`node scripts/audit-candidaturas.mjs --dump <detalhes.json> --saida <prefixo>` resolve o processo de todos os
mestrados (o mesmo código da jornada) e grava o resumo e os problemas por mestrado. O dump é a lista pública
`GET /api/radar/opportunities` + `GET /api/radar/opportunities/:id` de um ambiente; sem `--dump`, usa o Radar local.

Testes: `tests/application-process.test.js`.
