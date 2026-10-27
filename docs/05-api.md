# 05 — Referência da API

Base `/api`, JSON. Erros: `{ "error": "mensagem" }`. Escritas exigem o cabeçalho `X-Requested-With: travessia` (CSRF). Sessão em cookie httpOnly.

## Público
`GET /health` · `GET /content/app` · `GET /content/journey` (rodadas, marcos, etiquetas, situações) · `GET /content/landing` (dados da landing: regra de comprovação do visto/IPREM com fonte e etapas do diagnóstico) · `GET /content/sources` · `GET /content/catalog` · `GET /content/documents` · `GET /content/scholarships` · `GET /content/places` · `GET /content/finance-rules` · `GET /content/faq`

## Autenticação
`POST /auth/register {nome,email,senha,aceite}` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` · `POST /auth/change-password {atual,nova}`

## Perfil e documentos
`GET /me` · `PUT /me/profile` (campos estritos) · `PUT /me/choices {choices}` (≤6) · `PUT /me/documents {id: pendente|em-preparacao|pronto|enviado|correcao|nao-se-aplica}` · `GET /me/export` · `DELETE /me {senha}`

## Jornadas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/journeys` | Resumos (destino, progresso, rodada atual, próxima missão, próximo prazo) |
| POST | `/journeys` | `{programaId, anoAcademico, inicioAulas?, duracaoMeses?}` (≤6, sem duplicar programa) |
| GET/PUT/DELETE | `/journeys/:jid` | Jornada calculada / editar datas / excluir |
| PUT | `/journeys/:jid/situacao` | `{campo: adjudicacao|matricula|visto, valor}` → `{journey, events}` |
| POST/PUT/DELETE | `/journeys/:jid/contacts[/:cid]` | Contatos acadêmicos (exige `fonteUrl` https) |
| GET | `/journeys/:jid/missions/:id` | Detalhe: definição, objetivos, documentos, fontes, tipo, fluxo, elegibilidade/consulado/contatos/finanças |
| PUT | `/journeys/:jid/missions/:id/objectives/:obj` | `{feito}` ou `{valor}` (data, texto, situação) |
| POST | `/journeys/:jid/missions/:id/complete` | `{confirmo: true}` — exige todos os objetivos |
| POST | `/journeys/:jid/missions/:id/reopen` | Reabrir |
| PUT | `/journeys/:jid/missions/:id/state` | `{aguardando?, naoAplicavel?, prazo?, nota?, execucao?}` |

Mutações devolvem `{ mission, journey, events }` com eventos `missao-concluida`, `rodada-concluida`, `marco`, `desbloqueio`, `urgente`.

## Agenda AI
`GET /planner` (eventos, prazos, disponibilidade) · `POST /planner` · `PUT/DELETE /planner/events/:id` · `PUT /planner/availability` · `POST /planner/suggest {semana, journeyId?, missaoId?}` · `POST /planner/approve {itens}` · `POST /planner/replan {semana}`

## Financiamento
`GET /finance?journeyId=` · `PUT /finance {custos?, cambio?, informouRecursos?, nenhumaBolsaAplicavel?}` · `POST/PUT/DELETE /finance/resources[/:id]` · `POST /finance/scholarships {catalogId | nome…}` · `PUT /finance/scholarships/:id {status?, prazo?, valorTotal?, tarefa?}` · `DELETE /finance/scholarships/:id`

## Moradia e viagem
`GET /living` · `POST/PUT/DELETE /living/housing[/:id]` (status `escolhida` é única) · `POST/PUT/DELETE /living/travel/routes[/:id]` · `PUT /living/travel/arrival`

## Documentos (carteira e Minha pasta)
Detalhes e regras em [21 — Documentos](21-documentos.md). `journeyId` (query) é opcional: sem ele, vale a primeira jornada.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/documents/dashboard` | Carteira: resumo, próximo documento, etapas, "comece cedo" |
| GET | `/documents/files` | **Minha pasta:** `{arquivos, tipos}`, versão mais recente de cada arquivo, de qualquer etapa |
| GET | `/documents/missions/:jid/:mid` | `{prontos, faltam, naoNecessarios}` para a central da missão |
| GET | `/documents/:docId` | Detalhe do documento (status, evidências, arquivos, envios) |
| PUT | `/documents/:docId` | `{status?, aguardando?, declarado?, conferido?, validade?}` |
| POST | `/documents/declare` | `{itens: {docId: tenho|nao-tenho}}` ("o que você já tem") |
| POST / DELETE | `/documents/:docId/submissions[/:sid]` | Envio por procedimento: `{procedimento, resultado?: enviado|aceito|correcao, em?, nota?}` |
| POST | `/documents/:docId/reminder` | `{tipo: verificar|solicitar|validade|revisar, data?, confirmar?}`. Sem `confirmar: true` devolve só a prévia |
| POST | `/documents/:docId/files` | Corpo binário (PDF, PNG, JPG, WEBP, até 10 MB). Cabeçalho `X-File-Name`. Query: `serie` (nova versão), `missao`, `rotulo` |
| GET | `/documents/files/:fid` | Baixa o arquivo (só o dono). `?download=1` força download |
| DELETE | `/documents/files/:fid` | Exclui o arquivo do disco |

- `docId: pessoal` = **Outro documento** (RG, CNH, vacina…). Exige `?rotulo=` (até 60 caracteres) no primeiro envio, não cria status e devolve `documento: null`.
- Limites: 60 arquivos e 150 MB por estudante. Tipo conferido pelos bytes (415 se falso). Arquivos cifrados com AES-256-GCM.

## Mentor IA
`POST /assistant/ask {pergunta? | acao?, journeyId?, missaoId?, historico?}` → SSE `delta` / `replace` / `done {fontes, acoes, modo}`. Ações rápidas: `dificuldade, simples, documentos, custo, economizar, proximo, dua, certificado, contato, email, semdinheiro, bolsas, apoio, vistodocs, moradia, semana`.

Mentor com ferramentas: `/mentor` (doc 15). Viagem: `/travel` (doc 20).

Módulos de outras frentes: `/radar`, `/radar/admin` (doc 11), `/community` (doc 12), `/achievements` (doc 06).
