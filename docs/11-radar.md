# 11 — Radar de Oportunidades

Central que **descobre e monitora** oportunidades de estudo no exterior a partir de fontes oficiais e as conecta à jornada:
**Radar → Jornada → Rodadas → Missões → Agenda AI → Assistente de IA.**

Princípio: nenhum dado sobre abertura de inscrições é apresentado como confirmado sem fonte oficial, e **nunca** reaproveitamos o calendário de um ano como se fosse de outro. O ano anterior aparece somente como "Referência histórica", identificado como tal.

## Estado atual (Etapas 1, 2 e 3 entregues; Etapa 4 pendente)

| Etapa | Situação |
|---|---|
| 1 — Radar funcional (UGR) | ✅ Catálogo oficial completo da UGR (138 másteres, curso 2026/2027), cards, filtros, detalhe, links oficiais. Calendário DUA 2026/2027 cadastrado; 2027/2028 aparece como **Não anunciado**. |
| 2 — Monitoramento automatizado | ✅ Conectores do calendário DUA, do listado UGR e das fichas UGR; snapshots com hash; comparação; validação; fila de revisão; agendador. |
| 3 — Alertas e Agenda AI | ✅ "Avise-me quando abrir", alertas sem duplicação, sugestões de Agenda com prazos oficiais preservados e detecção de mudanças. Prazos oficiais aparecem nas missões e na Agenda da jornada. |
| 4 — Expansão | ⏳ Outras universidades andaluzas, bolsas, outras regiões. Cada uma precisa de conectores e regras próprias — **não presumir DUA fora da Andaluzia**. |

## Arquitetura

```
server/radar/
├── registry.js        SourceRegistry inicial (prioridade = autoridade normativa), canal de candidatura
├── http.js            Coleta educada: User-Agent, robots.txt, 4 s entre requisições por domínio, timeout,
│                      para em 401/403/429 (nunca contorna bloqueios), decodificação latin1/utf-8
├── dates.js           Datas em espanhol → ISO pelo ano do curso; fuso Europe/Madrid
├── connectors/
│   ├── dua-calendar.js   Calendário de másteres do DUA (fases, candidatura, adjudicações, resultas…)
│   ├── ugr-catalog.js    Listado oficial de másteres da UGR
│   └── ugr-program.js    Ficha de cada máster (curso, ECTS, código, coordenação, web, modalidade)
├── pipeline.js        coleta → snapshot → extração → validação → comparação → revisão/publicação
├── status.js          Estados determinísticos (nenhum estado vem de texto de IA)
├── notify.js          Alertas por mudança publicada e por data (abertura, prazo, resultados, confirmação)
├── service.js         Consultas, filtros, indicadores, detalhe, Agenda, contratos para jornada/assistente
├── admin.js           Painel: revisão, correções com evidência, registro manual (BOJA), simulação dev
├── scheduler.js       A cada 15 min roda fontes vencidas; a cada hora recalcula alertas por data
├── db.js              Persistência em data/radar.json (escrita atômica) + snapshots brutos em data/radar-snapshots/
└── seed/              HTML oficial capturado em 24/10/2026 (carga inicial offline e testes)
server/routes/radar.js        API do estudante
server/routes/radar-admin.js  API do painel
public/js/views/radar.js      Explorar Oportunidades + detalhe
public/js/views/radar-admin.js Painel administrativo
public/css/radar.css
tests/radar.test.js
```

### Fontes monitoradas

| Fonte | Método | Frequência | Autoridade |
|---|---|---|---|
| Calendário DUA (`mo_calendario.php`) | HTML público | 6 h | datas de candidatura |
| Listado de másteres UGR | HTML público | 24 h | catálogo |
| Fichas dos másteres UGR | HTML público, 12 por execução | 2 h (≈ todas por dia) | dados do programa |
| BOJA | revisão manual (buscador bloqueado por robots.txt) | — | normativa (prioridade máxima) |
| Catálogo DUA (`mo_catalogo_top.php`) | revisão manual (formulário dinâmico) | — | oferta DUA |
| Portal DUA, SAAP UGR | revisão manual | — | canal / orientação |

As frequências são metas configuráveis, não garantia de atualização instantânea. Falhas usam recuo exponencial (15 min → até a frequência da fonte).

### Regras de publicação

- **Extração incerta** (mês ausente, intervalo invertido, rótulo sem candidatura) ou **ano inconsistente** (documento do curso 2027/2028 citando "enero de 2026") → fila de revisão; nada é publicado.
- **Calendário novo** de um ano ainda inexistente, extraído sem incertezas → publicado como "Confirmada em fonte oficial" e dispara "Novas datas publicadas!".
- **Alteração de prazo de candidatura já publicado** → revisão obrigatória; o dado antigo continua no ar até a aprovação. Aprovada, gera histórico e o alerta "Datas oficiais alteradas".
- **Conflito** com dado de fonte de maior autoridade (ex.: registro manual do BOJA) → revisão indicando qual autoridade prevalece; o sistema não escolhe arbitrariamente.
- **Programa que some do catálogo** → nunca é apagado; vira revisão.
- **Fonte fora do ar** → o último dado verificado continua visível com "atualização pendente"; após 72 h sem verificação bem-sucedida, o estado passa a **Informação desatualizada**.

### Estados

`nao-anunciado`, `previsto`, `anunciadas`, `abertas` (exige janela vigente **e** canal de inscrição confirmado), `encerradas`, `em-avaliacao`, `adjudicacoes`, `resultas`, `suspenso`, `desatualizado`. Calculados em `status.js` a partir de datas, fuso de Madri e saúde da fonte. Quando uma fase está em pós-candidatura e a seguinte já tem datas futuras, o card mostra **Inscrições anunciadas** (a próxima ação possível); o estado de cada fase aparece no detalhe.

Vagas ofertadas nunca significam vagas disponíveis, e a mudança de estado da oportunidade nunca significa que o estudante se candidatou (isso é registrado na missão 3.6).

## Modelo de dados (data/radar.json)

| Entidade | Chave / conteúdo |
|---|---|
| `sources` (SourceRegistry) | url, instituição, tipo, prioridade, método, frequência, última consulta, última verificação ok, estado, falhas seguidas |
| `snapshots` (SourceSnapshot) | fonte, chave, versão, data da coleta, hash do conteúdo extraído, hash bruto, referência ao HTML salvo |
| `programs` | programa oficial + `ficha` conferida |
| `opportunities` (Opportunity) | `programId--AAAA-AAAA`, universidade, tipo, ano acadêmico, procedimento, URL oficial, suspensão |
| `windows` (AdmissionWindow) | `dua-masteres:2026/2027:F1`, abertura, encerramento, fuso, confirmação, texto original |
| `events` (AdmissionEvent) | adjudicação, reclamação, confirmação/matrícula/reserva, resultas, taxa de título |
| `availability` (ProgramAvailability) | vagas ofertadas/remanescentes **somente** com fonte oficial (vazio hoje: as fichas da UGR não publicam vagas) |
| `revisions` (OpportunityRevision) | campo, anterior, novo, evidência (fonte, snapshot, trecho), validação, autor |
| `reviews` | fila de revisão |
| `subscriptions` / `alerts` | acompanhamento e alertas (deduplicados por chave) |
| `agendaLinks` | atividade da Agenda ↔ data oficial que a originou |

As janelas pertencem ao **procedimento** (DUA) e ao ano: valem para todos os másteres andaluzes daquele ciclo.

## API

Pública (personaliza se houver sessão):
- `GET /api/radar/opportunities` — filtros: `q, ano, pais, cidade, universidade, area, modalidade, idioma, nivelIdioma, precoMax, situacao, bolsas=sim, compativel=sim, acompanhando=sim, limit, offset`. Retorna itens, facetas, indicadores e avisos de filtros sem dados na fonte.
- `GET /api/radar/opportunities/:id` — detalhe: calendário por fase, requisitos, documentos, missões, sugestões de Agenda, histórico, fontes.

Estudante (login):
- `PUT|DELETE /api/radar/opportunities/:id/subscription` — `{ eventos?: [calendario, abertura, encerramento, requisitos, resultados, confirmacao, bolsas] }`
- `GET /api/radar/me` — alertas, acompanhamentos e alterações oficiais que afetam a Agenda
- `POST /api/radar/alerts/read`
- `POST /api/radar/opportunities/:id/agenda` — `{ itens: [{ id, data?, inicio?, fim? }] }` (prazo oficial mantém a data)
- `POST /api/radar/agenda-changes/:linkId` — `{ aceitar }`

Admin (`role: admin` ou `role: radar`, concedido pelo administrador em `#/admin/aluno/:id`; `RADAR_ADMIN_EMAILS` só vale fora de produção): `GET /api/radar/admin`, `POST /sources`, `POST /sources/:id/run`, `PUT /sources/:id/availability`, `POST /reviews/:id`, `POST /calendars`, `POST /corrections`, `POST /republish`, `POST /community/import`, e em desenvolvimento `POST|DELETE /dev/simulate`.

## Integrações (contratos em `server/radar/service.js`)

| Função | Uso |
|---|---|
| `programForJourney(id)` | Programa do Radar no formato de `catalog.programById` para criar jornadas |
| `officialDeadlines(user)` | Prazos oficiais confirmados das jornadas ligadas ao Radar (Agenda AI e missões 3.2/3.6/3.9/3.10) |
| `radarContext(question, { user })` | Fatos verificados para o assistente; diz explicitamente quando **não** há calendário |
| `findOfficialMatch({ link, universidadeId, titulo })` | Duplicata contra o Radar oficial (Comunidade) |
| `forgetUser(id)` / `exportUser(id)` | Exclusão e exportação de dados do estudante |

Ligados (verificados ponta a ponta em 24/10/2026):
- `POST /api/journeys` aceita ids do Radar; o motor usa o objeto de `programForJourney`.
- Missões 3.2, 3.6, 3.9 e 3.10 recebem o prazo oficial (origem `oficial`, com `fonteUrl`), que substitui o declarado; aparecem também em `j.prazos` e na Agenda como `prazo-oficial`.
- O assistente injeta `radarContext(...).texto` no prompt da IA; no modo offline deve usar `.resposta` (texto pronto para o estudante).
- `DELETE /me` chama `forgetUser`; `/me/export` inclui `exportUser`.
- Atividades criadas pelo Radar na Agenda têm `origem: 'radar'`, `oportunidadeId` e `oportunidadeTipo: 'radar'` (preservados nas edições e não removidos pelo replanejamento da Agenda AI).

## Desenvolvimento

- `RADAR_SCHEDULER=off` desliga o atualizador (os testes fazem isso).
- `RADAR_ADMIN_EMAILS=email1,email2` libera o painel em `#/radar/admin` **apenas em desenvolvimento/testes**. Em produção o cadastro não verifica e-mail, então o papel é concedido no painel admin (Papel → Equipe do Radar).
- `RADAR_DATA_FILE` muda o arquivo da base (padrão: `data/radar.json`).
- **Simulação**: no painel (somente fora de produção), "Simular publicação" cria um calendário marcado como **DADO DEMONSTRATIVO** em toda a interface para testar alertas e Agenda; nunca sobrescreve calendário oficial e pode ser removido por completo.

## Limitações conhecidas

- Idioma de ensino, nível exigido, preço e vagas **não constam** das fichas da UGR: os filtros correspondentes avisam isso em vez de inventar.
- O catálogo do DUA e o BOJA ainda não têm coleta automática (formulário dinâmico / buscador bloqueado por robots.txt); entram por revisão manual.
- Notificações apenas na plataforma (sem e-mail).
- Bolsas: o indicador lê `server/content/scholarships.js`; hoje nenhuma tem edital aberto confirmado, então o número é 0.
