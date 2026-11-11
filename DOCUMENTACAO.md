# Estuvia — Documentação completa

> Documento único gerado por `node scripts/build-docs.mjs` a partir do `README.md` e de `docs/*.md` em 2026-11-11. Para alterar, edite os arquivos de origem e gere de novo.

## Índice

- [Visão geral](#visao-geral)
- [Parte 1 — Para o estudante](#parte-1)
  - [23 — Guia de uso (versão atual)](#doc-23)
  - [08 — Manual do estudante: do Brasil ao mestrado na Andaluzia](#doc-08)
- [Parte 2 — Produto e jornada](#parte-2)
  - [01 — Visão e produto](#doc-01)
  - [02 — Requisitos e regras de negócio](#doc-02)
  - [13 — Jornada Estuvia: rodadas, missões e módulos integrados](#doc-13)
  - [27 — Onboarding: auditoria, fluxo e componentes](#doc-27)
  - [14 — Progressão, simplicidade e complexidade adaptativa](#doc-14)
  - [06 — Gamificação, progresso e conquistas](#doc-06)
- [Parte 3 — Módulos](#parte-3)
  - [15 — Mentor Estuvia (agente com ferramentas)](#doc-15)
  - [07 — Assistente de IA ("Guia")](#doc-07)
  - [16 — Planejador Financeiro Inteligente](#doc-16)
  - [19 — Meu Novo Lar (missões 6.1 e 6.2)](#doc-19)
  - [20 — Minha Viagem (missões 6.3 a 6.5)](#doc-20)
  - [21 — Minha Carteira de Documentos](#doc-21)
  - [17 — Resultados estruturados](#doc-17)
  - [18 — Central da missão (MissionHub)](#doc-18)
  - [11 — Radar de Oportunidades](#doc-11)
  - [24 — Tempo real, pesquisa na web, preços de passagens e anotações](#doc-24)
  - [12 — Comunidade colaborativa](#doc-12)
- [Parte 4 — Técnico](#parte-4)
  - [22 — Interface: visual minimalista, navegação e celular](#doc-22)
  - [03 — Arquitetura](#doc-03)
  - [05 — Referência da API](#doc-05)
  - [04 — Segurança e privacidade](#doc-04)
  - [25 — Production readiness (audit of 2026-11-09)](#doc-25)
  - [28 — Ambientes DEV × PROD](#doc-28)
  - [Auditoria de lançamento — Estuvia](#doc-26)
- [Parte 5 — Apresentação e próximos passos](#parte-5)
  - [09 — Roteiro de apresentação (≈10 min)](#doc-09)
  - [10 — Próximos passos](#doc-10)

---

<a id="visao-geral"></a>

# Visão geral

A platform that **doesn't just tell you how to get to Spain: it helps you plan, organize and carry out every step**. The real process for a Brazilian who wants to take an official Máster Universitario (starting with the Universidad de Granada, via the Distrito Único Andaluz) becomes **Journey → Rounds → Missions → Goals**, integrated with the AI Planner, AI Mentor, funding, documents, housing and travel.

**Principle:** Estuvia guides and organizes. Applications, enrollment, visas and official requests are made in the competent systems. Nothing is marked as done without the student's confirmation.

---

## How to run

Requirements: **Node.js 20+** (tested with 22).

```bash
npm install
npm start          # http://localhost:3000
npm test           # 252 tests (journey, planner, finances, documents, security, Radar, Community, Achievements, Mentor…)
```

Create an account → onboarding (6 steps: origin, education, languages, budget, destination, documents) → review → your first journey is generated. Later journeys only ask for the destination. Details: [27 — Onboarding](#doc-27). How to use it: [23 — User guide](#doc-23).

**Free integrations (optional):** `YOUTUBE_API_KEY` lists videos/lessons in the Mentor chat and `TRAVELPAYOUTS_TOKEN` turns on flight prices and price alerts; both are free (see `.env.example` and doc 24). Web search (Canal UGR, GDELT, Wikipedia) needs no key.

**AI (optional):** without a key, the Mentor answers in "verified base" mode (quick actions computed from the journey's real data). To enable Claude: `cp .env.example .env`, fill in `ANTHROPIC_API_KEY` and restart.

**Illustrations:** covers and banners are original SVG art (`npm`-free): `node scripts/generate-art.mjs`. To use real photos, save files with the same name in `public/img/`.

---

## Screens

| Screen | Route | What it does |
|---|---|---|
| Home (dashboard) | `#/` | My journey, overall progress, continue mission, up to 3 **smart alerts**, current round, AI Planner, deadlines and finances |
| My Journeys | `#/jornadas` | Cards with cover, destination, program, year, status, progress and **Open Rounds**; create/delete journeys |
| Rounds | `#/j/:id` | Round cards with banner, state (Current/Completed/Available/Locked), missions and %; external status; deadlines; milestones |
| Mission trail | `#/j/:id/r/:n` | **Zigzag** with nodes by state, a line that follows progress, "You are here" and a fixed **Continue my journey** button |
| Mission content | `#/j/:id/m/:mission` | Journey/Round/Mission header, **Your progress in this mission** and **functional cards by mission type** (before you start, guide, flow, documents, AI Planner, execute, Mentor, simulator, scholarships, housing…) + community experiences |
| AI Planner | `#/agenda` | Weekly calendar, filters, **click and drag to create**, drag to reschedule, pull the edge to change duration, availability, **Organize my week with AI**, **Replan**, official × self-declared deadlines |
| Funding | `#/financiamento` | (A) visa proof of funds (IPREM parameterized by year) × (B) real budget; resources, family support, scholarships, paths when money is short |
| My new home | `#/novo-lar` | Register and compare housing options, anti-fraud check, choice integrated with the budget |
| Travel | `#/viagem` | Quoted routes (total cost), choice integrated with the budget, arrival |
| Documents | `#/documentos` | **My folder** (all files, from any step, and "Other document"), wallet by journey step, status, expiry, submissions by procedure |
| Master's programs | `#/mestrados` | Catalog with filters, requirements, "My options" (up to 6) |
| AI Mentor | floating panel + `#/assistente` | Journey/mission context, quick actions, proposed actions with confirmation |
| Opportunities, Community, Achievements | `#/oportunidades`, `#/comunidade`, `#/conquistas` | Integrated modules (docs 11, 12 and 06) |
| Admin panel | `#/admin` | Only for the `ADMIN_EMAIL`/`ADMIN_PASSWORD` account in `.env` (created when the server starts). The admin account sees **only** the panel: **AI status** (Mentor/Assistant keys, usage, failures and a "Test now" button), everyone's **applications** (application, enrollment, visa), student list with filters (with alerts, inactive for 7+ days, admitted…) and a **follow-up sheet for each student** at `#/admin/aluno/:id` (days since last login, journeys and application, deadlines, documents, finances and scholarships, housing, travel, planner, points of attention and internal notes), who is online and on which screen, **most accessed modules** (visits, people, average time; 7/30/90 days), daily actives (30 days), user list with last access, IP and device, events (sign-ups, logins, failed logins), end sessions and suspend accounts |

**Navigation:** menu with Home, My journey, Planner, Documents and Funding; everything else is under **More**. On mobile, a bottom bar with the first 4 + Menu (doc 22).

---

## Structure

```
server/
  app.js, index.js, config.js, security.js, store.js
  journey-engine.js     status, dependencies, external decisions, deadlines, progress, recommendation
  finance-engine.js     visa requirement × budget × resources, paths
  agenda-engine.js      weekly proposal, focus per mission, replanning
  assistant-context.js  Mentor context + deterministic answers for quick actions
  content/              rounds.js (8 rounds + track F), catalog, documents, finance (IPREM), scholarships, places, sources
  routes/               auth, me, journey, planner, finance, living, assistant, content (+ radar, community, achievements)
  radar/, community-engine.js, achievements-engine.js   (modules from the other workstreams)
public/
  index.html, css/styles.css (dark-first design system), css/minimal.css (minimalist + mobile layer, loaded last)
  js/app.js (router), api.js, ui.js, icons.js, data.js, localfiles.js (attachments kept in the browser only)
  js/components/  JourneyCard, RoundCard, JourneyProgress, MissionPath (MissionNode), MissionContent,
                  MissionDetail (MissionChecklist, documents), MissionTools, AIJourneyAssistant, WeeklyPlanner, common,
                  MentorPanel, QuickPlan, MissionGuide, ResultCard,
                  documents/ (MyFolder, DocumentCard, DocumentDetailPanel, DocumentUpload, MissionDocuments),
                  mission-hub/ (MissionHub), travel/ (TravelDashboard)
  js/views/       home, journeys, journey, trail, mission, agenda, finance, housing, travel, documents, catalog, onboarding, profile, manual, sources, landing, auth, assistant
scripts/generate-art.mjs
tests/
```

## Documentation

**Everything in a single file:** [DOCUMENTACAO.md](DOCUMENTACAO.md), with a table of contents. It is generated from the files below with `npm run docs`: edit the files in `docs/` and regenerate. (The documentation itself is in Portuguese.)

| Document | Contents |
|---|---|
| [13 — Estuvia Journey](#doc-13) | **Main:** data model, rounds and missions, rules, mission screen, AI Planner, funding, acceptance criteria |
| [14 — Progression and simplicity](#doc-14) | Unlocking rounds and missions, parallel tracks, requirements already met, simple/guided/complex missions, account-only access |
| [05 — API](#doc-05) | Endpoints |
| [04 — Security and privacy](#doc-04) | Controls and production checklist |
| [06 — Gamification and achievements](#doc-06) | Progress, milestones and achievements |
| [07 — AI Assistant](#doc-07) | Mentor rules and offline mode |
| [09 — Presentation script](#doc-09) | Demo |
| [10 — Next steps](#doc-10) | Roadmap |
| [15 — Estuvia Mentor](#doc-15) | Tool-using agent: Guided Mode without a paid API, action confirmation, memory, proactive notices, AI providers |
| [16 — Financial planner](#doc-16) | Estimated costs with sources, three separate accounts (prepare, sustain, visa), guaranteed × promised resources, ECB exchange rates, scenarios and alternatives |
| [19 — My New Home](#doc-19) | Guided search with verified links, add by link, cards, comparison, "Check before paying", integration with finances, missions, Planner and Mentor |
| [17 — Structured results](#doc-17) | Standard results format (consulate and others) |
| [18 — Mission hub](#doc-18) | MissionHub: cards according to the mission's real complexity |
| [20 — My Trip](#doc-20) | Routes, quote by link, comparison, itinerary and arrival |
| [21 — Documents](#doc-21) | Digital wallet by step, **My folder**, encrypted files, integration with missions |
| [22 — Interface and mobile](#doc-22) | Minimalist layer, navigation ("More", bottom bar), mobile rules, how to test |
| [23 — User guide](#doc-23) | How to use the platform today, step by step (for students) |
| [24 — Real time, web search, flight prices and notes](#doc-24) | Live updates (SSE), adaptive Radar checks, free web/video search in the Mentor, flight prices and price alerts, mission notes |
| [25 — Production readiness](#doc-25) | What the code actually does in production, required env vars, roles, backup/restore, verified vs. unverified items, launch blockers and legal questions |
| [26 — Launch and LGPD audit](#doc-26) | Launch and data-protection audit |
| [27 — Onboarding](#doc-27) | Field-by-field audit (what each answer feeds), the 6-step flow, validation, saving order, components (Select, Toasts) |
| [28 — DEV × PROD environments](#doc-28) | Separate Supabase projects, isolation guards, backup, migrations and the manual steps to create production |
| [11 — Opportunity Radar](#doc-11) | Monitoring of official sources |
| [12 — Community](#doc-12) | Moderated community |
| [01](#doc-01), [02](#doc-02), [03](#doc-03), [08](#doc-08) | Vision, requirements, architecture and manual for version 0.1 (historical context) |

---

**Data and honesty:** official sources consulted on 11/09/2026. Programs in the local catalog are **demonstrative** ("Demo data" label); the Radar brings real UGR programs. The official student guide lists €600/month as the IPREM reference for 2026; the simulator is an estimate for a single student and does not model dependents or prepaid accommodation, so confirm the current calculation with the competent consulate. The DUA short link (`lajunta.es/portaldua` → Junta de Andalucía DUA page) and the Salvador consulate contacts were checked against the official pages on 10/28/2026. Scholarships appear as "no confirmed call" until the current call is checked. There are no verified video tutorials — the tutorial card stays hidden until one exists.



---

<a id="parte-1"></a>

# Parte 1 — Para o estudante

<a id="doc-23"></a>

## 23 — Guia de uso (versão atual)

Guia prático para o estudante usar a Estuvia hoje. O conteúdo do processo (DUA, visto, chegada) está no [manual](#doc-08) e na própria plataforma (menu **Mais → Manual**). As regras técnicas de cada tela estão nos documentos 13 a 22.

> A Estuvia orienta e organiza. Candidatura, matrícula, visto e pedidos oficiais são feitos nos sistemas competentes. Confirme sempre nas fontes oficiais do seu ciclo.

### 1. Primeiros passos

1. **Crie sua conta** (Criar conta) e responda o onboarding em 6 etapas: origem, formação, idiomas, orçamento, destino e documentos. O painel "Seu perfil até agora" mostra o que você já informou; o rascunho fica salvo se você recarregar a página.
2. **Escolha o destino** (universidade, ano, início das aulas, duração e em que ponto você está). O mestrado é opcional nessa hora: se ainda não escolheu, a jornada começa com "Mestrado a definir" e você o define depois pelo Radar (Missão 1.3). Revise e toque em **Gerar minha jornada**: a Estuvia monta as **rodadas** e **missões**.
3. No **Início**, toque em **Continuar missão**. É sempre o próximo passo recomendado.

### 2. Onde fica cada coisa

| Quero… | Vá em |
|---|---|
| Ver meu próximo passo e meu progresso | **Início** |
| Ver todas as rodadas e missões | **Minha jornada** |
| Organizar a semana e ver prazos oficiais | **Agenda** |
| Guardar passaporte, carta de aceitação e outros arquivos | **Documentos → Minha pasta** |
| Saber se o dinheiro fecha e achar bolsas | **Financiamento** |
| Comparar moradias | **Mais → Meu novo lar** |
| Comparar passagens e planejar a chegada | **Mais → Viagem** |
| Procurar mestrados | **Mais → Mestrados** |
| Ver novas datas e editais oficiais | **Mais → Oportunidades** |
| Perguntar para outros estudantes | **Mais → Comunidade** |
| Tirar dúvida rápida | Botão **Mentor** (canto inferior direito) |
| Mudar nome, tema claro/escuro ou cor | Seu avatar → **Meu perfil** |

No celular, Início, Jornada, Agenda e Documentos ficam na **barra de baixo**. O resto está em **Menu**.

### 3. Missões

- Cada missão diz **o que fazer numa frase** e traz um link oficial por vez.
- **Já fiz isso:** marca como concluída (algumas pedem comprovante, como o envio no DUA e o protocolo do visto).
- **Já pedi e estou aguardando:** a missão fica em espera sem atrasar as outras.
- **Preciso de ajuda:** a missão vira passo a passo, e o Mentor ajuda.
- Rodadas futuras aparecem bloqueadas até a hora certa. Prazos oficiais aparecem mesmo assim.

Para candidatura com título estrangeiro, confira a lista de documentos acadêmicos da missão 2.4: diploma, histórico, comprovação oficial de acesso à pós-graduação no país de origem e escala de notas. A fase 1 do DUA não oferece vaga em todos os mestrados. Antes do visto, use o prazo de pelo menos dois meses e a lista atual do consulado que atende sua residência; os requisitos de antecedentes e atestado variam.

### 4. Minha pasta (guardar documentos para a viagem)

Fica no topo de **Documentos**.

1. Toque em **Guardar documento**.
2. Em **Que documento é?**, escolha: passaporte, carta de admissão, visto, seguro, passagem… Para algo fora da lista (RG, CNH, vacina), escolha **Outro documento** e dê um nome.
3. Escolha o arquivo: **PDF ou foto, até 10 MB**. No celular dá para tirar a foto na hora.
4. Toque em **Guardar**.

Na lista você pode **abrir**, **baixar** ou **excluir** cada arquivo.

- Os arquivos ficam **cifrados na sua conta** e só você acessa.
- Cabem até 60 arquivos e 150 MB.
- Guardar na Estuvia **não é validação oficial**: o consulado e a universidade conferem os originais.
- **Dica para a viagem:** antes de embarcar, baixe no celular os arquivos que vai precisar na imigração (passaporte, visto, carta de admissão, seguro, comprovante de moradia, passagem). No aeroporto pode não haver internet.

Abaixo da pasta fica a **carteira por etapa**: o que falta para a etapa atual, o que começar cedo e o status de cada documento (Pendente, Preparando, Pronto, Enviado, Precisa de atenção).

### 5. Agenda

- **Dia ou Semana:** escolha no topo (o celular abre no Dia, com uma faixa para trocar de dia). Clicar no número de um dia na visão Semana abre aquele dia. A linha vermelha marca a hora atual.
- **+ Novo** cria um compromisso no próximo horário livre. Na janela, toque numa categoria colorida e use os atalhos de duração (30 min, 1 h, 1h30, 2 h).
- **Categorias** abaixo do topo são também a legenda: toque para mostrar ou esconder.
- **Ajustes** reúne sua disponibilidade, o horário da Espanha e o replanejamento com IA.

- **Criar um compromisso:** clique num horário vazio e arraste até o fim (no celular, segure o dedo um instante e arraste). Abre a tela de nova atividade com data, início e fim já preenchidos. Um clique simples cria 1 hora.
- **Mudar horário:** arraste o bloco para outro dia ou hora. **Mudar duração:** puxe a borda de baixo do bloco.
- **Organizar minha semana com IA** sugere horários para as missões liberadas. Nada entra na agenda sem você aprovar.
- **Replanejar** reorganiza o que ficou para trás.
- Prazos **oficiais** (com fonte) aparecem separados dos que você mesmo cadastrou.

### 6. Financiamento

Três contas que nunca se misturam: **quanto custa preparar**, **quanto custa morar lá** e **quanto o visto exige comprovar**. A referência 2026 cadastrada é €600 por mês para estudante individual; dependentes e alojamento antecipado podem alterar o cálculo e devem ser confirmados no consulado. Registre seus recursos para saber se o plano fecha. Se faltar, a tela mostra caminhos: bolsas, apoio da família, economia, destinos mais baratos.

### 7. Mentor

Conhece sua jornada, prazos e finanças. Responde curto primeiro e explica os termos. Quando sugere uma ação (criar evento, marcar documento), **pede sua confirmação**. No topo do painel do Mentor, o botão **O que o Mentor sabe** mostra e controla a memória dele.

### 8. Privacidade

- Em **Meu perfil** você pode baixar todos os seus dados (JSON) ou excluir a conta.
- Excluir a conta apaga também todos os arquivos da Minha pasta.

<a id="doc-08"></a>

## 08 — Manual do estudante: do Brasil ao mestrado na Andaluzia

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](#doc-13).

> Versão em texto do manual que está dentro da plataforma (menu **Manual**). Base: manual do idealizador [M] e fontes oficiais consultadas em 24/10/2026. **Datas e regras mudam a cada ciclo: confirme sempre nas fontes do seu ano.**

### Antes de começar

- Este caminho vale para quem **já tem graduação concluída no Brasil** e quer um **Máster Universitario oficial** em universidade **pública** andaluza. A pré-inscrição é feita pelo **Distrito Único Andaluz (DUA)**.
- **Processo centralizado, requisitos descentralizados:** o DUA organiza a candidatura, mas cada mestrado define seus requisitos (formação de acesso, idioma, documentos). [O3]
- **Sem homologação prévia:** para pedir acesso a mestrado oficial, o diploma de fora do Espaço Europeu de Educação Superior não precisa ser homologado antes. A universidade verifica a equivalência de nível. Isso não reconhece o diploma para outras finalidades. [O1]
- **Comece cedo e em paralelo:** idioma, documentos acadêmicos, dossiê do visto e finanças podem andar juntos desde o início.

### Fase 1 — Descoberta 🧭

1. **Complete seu perfil** na plataforma: formação, idiomas, estado, ano pretendido e o seu porquê.
2. **Explore o catálogo** no portal de másteres do DUA [O5] e no site das universidades [O4]. Anote de 3 a 6 programas.
3. **Leia a ficha oficial** de cada programa: "requisitos de acceso" e "criterios de admisión". Nunca aplique a regra de um curso a outro.
4. **Verifique o idioma** (pode adiantar): alguns programas pedem nível ou certificado (ex.: DELE/SIELE), outros aceitam outras formas de comprovação. Se não estiver claro, escreva para a coordenação do mestrado.

### Fase 2 — Candidatura DUA 📝

1. **Documentos acadêmicos** (pode adiantar): passaporte, diploma e histórico. Conforme o caso, também a **escala de notas** (mínima/máxima) e um **documento de órgão competente** mostrando que o título dá acesso à pós-graduação no Brasil. [O1]
2. **Entenda a homologação** (não é necessária para o acesso). [O1][O3]
3. **Cadastre-se no DUA** e crie sua solicitação de mestrado. [O5]
4. **Ordene até 6 preferências** (ciclo 2026/27). A ordem importa: coloque primeiro o que você mais quer. [O2][O3]
5. **Envie dentro do prazo da sua fase** (pessoas com título estrangeiro costumam ter uma fase 1 própria) e **guarde o comprovante**. [O1][O2]

### Fase 3 — Adjudicação e matrícula 🎯

1. **Acompanhe as listas** de adjudicação nas datas oficiais da sua fase.
2. **Entenda seu status:** *admitido*, *lista de espera*, *precisa confirmar/reservar*, *matriculado* e *não admitido* são situações diferentes, e cada uma pede uma ação.
3. **Confirme ou reserve no prazo.** Perder esse prazo pode significar perder a vaga. [O2]
4. **Matricule-se** pelos canais da universidade e baixe a **carta de admissão/matrícula**, que você vai usar no visto.

### Fase 4 — Visto de estudos 🛂

1. **Descubra seu consulado** (pode adiantar): é o consulado espanhol que atende o estado onde você mora. [O7]
2. **Monte o dossiê** (pode adiantar). As referências oficiais incluem admissão/matrícula, meios econômicos, seguro saúde, documentos pessoais e, quando aplicável, antecedentes criminais e atestado médico. Apostila e tradução **só quando exigidas**. Use a lista do **seu** consulado. [O6][O7]
3. **Meios econômicos** (pode adiantar): o valor mínimo segue a norma vigente e é conferido pelo consulado. Nenhum valor "garante" o visto. [O6]
4. **Agende e solicite** com o dossiê completo.
5. **Confira o visto** ao receber: nome, número do passaporte, datas e tipo.

### Fase 5 — Mudança 🧳

1. **Moradia** (pode adiantar): desconfie de preço muito abaixo do mercado, nunca pague caução sem contrato e sem verificar o anunciante, e peça vídeo-chamada do imóvel.
2. **Passagem:** comprar antes do visto aprovado é risco financeiro. Prefira tarifas com remarcação.
3. **Pasta de viagem** na bagagem de mão: passaporte com visto, carta de admissão, seguro, comprovantes financeiros e de moradia, além de cópias digitais.

### Fase 6 — Chegada 🏁

1. **Apresente-se na universidade** (secretaria ou serviço internacional do mestrado).
2. **Vida local:** chip de celular, conta bancária, transporte e **empadronamiento**.
3. **TIE:** com estada por estudos de **mais de seis meses**, solicite a TIE **em até um mês após a entrada** na Espanha. Agende a *cita previa* logo ao chegar. [O6]

### Linha do tempo sugerida (orientação prática, não oficial)

| Quando | O quê |
|---|---|
| 12–9 meses antes | Escolher área e programas, verificar idioma, pedir documentos acadêmicos |
| 9–6 meses antes | Cadastro DUA, 6 opções, envio na fase correta |
| 6–3 meses antes | Adjudicações, confirmação, matrícula; iniciar o dossiê do visto |
| 3–1 mês antes | Pedido de visto, moradia segura, passagem conforme o status do visto |
| 1º mês na Espanha | Universidade, empadronamiento, TIE |

### Erros mais comuns

- Descobrir tarde a exigência de idioma.
- Generalizar regras ("Granada não exige espanhol", "Sevilha exige B2").
- Reutilizar datas de outro ciclo.
- Achar que admitido é o mesmo que matriculado e perder o prazo.
- Deixar antecedentes, apostilas e traduções para o fim.
- Pagar caução sem contrato.
- Comprar passagem antes do visto sem tarifa flexível.
- Esquecer o prazo da TIE.

### Como tirar o máximo da plataforma

1. Complete o perfil: ele personaliza dicas e o Guia.
2. Escreva seu "porquê".
3. Siga o "próximo passo" do painel.
4. Adiante as missões "pode adiantar".
5. Use o checklist de documentos (DUA × visto).
6. Monte o orçamento cedo.
7. Pergunte ao Guia e confira as fontes citadas.
8. Atualize seu status a cada novidade.

### Glossário

- **DUA:** Distrito Único Andaluz, sistema centralizado de pré-inscrição nas universidades públicas andaluzas.
- **Máster Universitario:** mestrado oficial (diferente de "título propio").
- **Adjudicação:** publicação do resultado por opção (admitido, espera, não admitido).
- **Matrícula:** inscrição efetiva, com pagamento de taxas.
- **Empadronamiento:** registro de endereço na prefeitura.
- **TIE:** Tarjeta de Identidad de Extranjero.
- **Apostila de Haia:** certificação internacional de documento público, quando exigida.

### Fontes

- [M] Roteiro — Como se inscrever em um Mestrado na UGR (manual do idealizador)
- [O1] https://www.juntadeandalucia.es/boja/2025/245/50
- [O2] https://www.juntadeandalucia.es/boja/2026/84/46
- [O3] https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/mo_requisitos_procedimiento.php
- [O4] https://masteres.ugr.es/ramas/ingenieria-arquitectura
- [O5] https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres
- [O6] https://inclusion.gob.es/web/migraciones/w/estancia-por-estudios
- [O7] https://www.exteriores.gob.es/Consulados/salvadordebahia/es/ServiciosConsulares/Paginas/index.aspx?scca=Visados&scco=Brasil&scd=250&scs=Visados+Nacionales+-+Visado+de+estudios

---

<a id="parte-2"></a>

# Parte 2 — Produto e jornada

<a id="doc-01"></a>

## 01 — Visão e produto

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](#doc-13).

**Versão:** 0.1 · **Data:** 24/10/2026 · **Status:** MVP funcional para validação
**Mercado-piloto:** brasileiros que desejam cursar Máster Universitario em universidade pública da Andaluzia
**Origem:** manual "Roteiro — Como se inscrever em um Mestrado na Universidad de Granada (UGR)" [M]

### 1. Problema

Uma pessoa formada no Brasil que quer fazer mestrado na Espanha precisa resolver muita coisa por conta própria:

- descobrir os cursos e verificar se a graduação dela dá acesso;
- organizar a candidatura no Distrito Único Andaluz (DUA) e acompanhar as adjudicações;
- fazer a matrícula e preparar o visto (recursos financeiros, seguro, antecedentes, traduções);
- encontrar moradia, viajar e resolver os trâmites locais (empadronamiento, TIE).

As fontes estão espalhadas entre órgãos públicos, universidades, consulados e serviços comerciais. Pequenos erros de ordem, prazo ou documentação atrasam a viagem ou geram custo.

### 2. Solução

Uma plataforma web que transforma esse processo em uma **jornada em 6 fases, como um jogo**. Cada missão diz **o que fazer, como fazer, com qual documento e com qual fonte oficial**. O estudante ganha XP, sobe de nível e desbloqueia conquistas a cada etapa.

#### Pilares

1. **Saber onde ir.** O mapa da jornada sempre destaca o próximo passo.
2. **Saber como fazer.** Cada missão traz passos práticos e fontes.
3. **Tirar dúvidas na hora.** O Guia (IA) responde ancorado nas fontes e admite quando não sabe.
4. **Acreditar que é possível.** Gamificação, celebração de conquistas e o "meu porquê" sempre visível.
5. **Ser parte da família.** A plataforma é do estudante: avatar, cores, tema, metas, dicas personalizadas e linguagem acolhedora.
6. **Confiança.** Toda informação tem etiqueta e fonte.

#### Proposta de valor (hipótese)

> "Da escolha do mestrado à instalação na Espanha: um caminho personalizado que mostra o próximo passo, o documento necessário, a fonte oficial e o impacto financeiro da decisão."

### 3. Etiquetas obrigatórias de conteúdo

| Etiqueta | Significado | Exemplo |
|---|---|---|
| **Fonte oficial verificada** | Regra conferida em norma ou página oficial, com URL e data de revisão | Até seis opções na solicitação DUA 2026/27 |
| **Orientação prática** | Sugestão da experiência do manual, sem ser obrigação legal | Pesquisar moradia ao receber a aprovação |
| **Estimativa** | Valor ou duração com premissas explícitas | Orçamento de aluguel e transporte |
| **Pendente de confirmação** | Depende do curso, consulado, ano ou situação pessoal | Necessidade de DELE/SIELE em um programa |

### 4. Persona principal

**Perfil:** brasileiro(a) com graduação concluída, morando no Brasil, interessado(a) em mestrado oficial na Andaluzia e com pouca familiaridade com o processo espanhol. Pode ter recursos limitados e precisa comparar opções antes de decisões caras.

**Dores:** não saber por onde começar, descobrir tarde a exigência de idioma, documentação incompleta, perder uma adjudicação, subestimar custos e depender de grupos informais para entender visto e TIE.

**Objetivo:** encontrar um curso compatível, completar o processo correto e chegar à Espanha com menos incerteza.

### 5. Escopo

**Dentro:** mestrados oficiais de universidades públicas andaluzas pelo DUA, candidatura a partir do Brasil, pré-partida e chegada.

**Fora (por enquanto):** graduação, doutorado, títulos propios, universidades privadas, agenciamento consular, garantia de admissão, envio automático ao DUA, aconselhamento jurídico individual e venda de passagens.

### 6. Hipóteses a validar

- **H1.** O maior valor está na execução guiada da jornada, e não em uma coleção de artigos.
- **H2.** Os usuários usarão o roadmap por semanas e voltarão a cada nova etapa (a gamificação reforça isso).
- **H3.** Requisitos explicados com fontes oficiais geram mais confiança que respostas genéricas de IA.
- **H4.** O planejamento financeiro integrado ajuda a escolher cidade e data.
- **H5.** Existe disposição a pagar por recursos avançados (preço e modelo ainda desconhecidos).

### 7. Modelos de negócio (hipóteses)

- **Freemium:** jornada essencial e fontes oficiais gratuitas, recursos premium de planejamento e acompanhamento.
- **B2B/B2B2C futuro:** parceria com universidades e comunidades, só com acordo formal.
- **Indicação de serviços:** parceiros identificados, transparência de conflitos e nenhuma interferência no conteúdo oficial.

Antes de definir preço, a pesquisa inicial precisa medir a disposição a pagar.

### 8. Métricas iniciais

| Métrica | Definição |
|---|---|
| Ativação | % de novos usuários que completam o perfil e salvam um programa |
| Compreensão | % que indica o próximo passo correto em teste moderado |
| Confiabilidade | % de regras publicadas com link oficial, ano e data de revisão |
| Uso contínuo | Retorno após mudança real de etapa (status declarado) |
| Progresso | Missões concluídas e fases finalizadas (autodeclarado) |
| Monetização | Interesse em recursos pagos, medido em entrevistas e testes |

### 9. Riscos principais

| Risco | Tratamento |
|---|---|
| Normas e calendários mudam todo ano | Conteúdo versionado por ciclo e data de revisão em cada fonte |
| Confundir orientação com assessoria oficial | Avisos visíveis e links para os sistemas oficiais |
| IA inventar instruções | Respostas limitadas à base, com citação e fallback para a base verificada |
| Requisito de idioma varia por curso | Nunca inferir pela universidade; status "verificar" até haver fonte |
| Parceria parecer vínculo oficial | Nunca usar marca universitária sugerindo convênio inexistente |
| Abandono após a candidatura | Fases 3–6 e conquistas que mantêm o engajamento |

<a id="doc-02"></a>

## 02 — Requisitos e regras de negócio

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](#doc-13).

Legenda de status: ✅ implementado no MVP · 🟡 parcial · ⏳ planejado

### Requisitos funcionais

| ID | Prior. | Requisito | Status | Onde |
|---|---|---|---|---|
| RF-01 | P0 | Onboarding em 6 etapas (origem, formação, idiomas, orçamento, destino, documentos) + revisão; perfil editável depois | ✅ | `public/js/views/onboarding.js`, `public/js/views/profile.js`, `PUT /api/me/profile`, `POST /api/me/onboarding/complete` (doc 27) |
| RF-02 | P0 | Catálogo de universidades e mestrados | 🟡 9 universidades; 5 programas locais demonstrativos; Radar com 138 mestrados UGR para 2026/27. O conector DUA consulta as nove universidades e a UNIA, mas a base local ainda não recebeu esses catálogos; requisitos detalhados por programa também seguem pendentes. | `server/content/catalog.js`, `server/radar/` |
| RF-03 | P0 | Checagem preliminar de requisitos (requerido / verificar) com fonte | ✅ | Ficha do programa em `catalog.js` (view) |
| RF-04 | P0 | Roadmap com dependências e tarefas paralelas | ✅ 6 fases, 23 missões, desbloqueio e missões paralelas | `server/content/journey.js`, `server/game.js` |
| RF-05 | P0 | Gestor de até 6 opções ordenáveis | ✅ | `PUT /api/me/choices` |
| RF-06 | P0 | Checklist documental (DUA × visto) com condição e fonte | ✅ Sem upload de arquivos (de propósito) | `server/content/documents.js` |
| RF-07 | P0 | Registro manual de status (candidatura/visto) | ✅ Identificado como "declarado por você" | `PUT /api/me/status` |
| RF-08 | P0 | Calendário e lembretes de prazos confirmados | ⏳ Dica de ciclo implementada; calendário depende da publicação oficial | `docs/10-proximos-passos.md` |
| RF-09 | P0 | Simulador de orçamento (A–D) separando a comprovação do visto | ✅ | `public/js/views/budget.js` |
| RF-10 | P0 | Painel administrativo de requisitos e fontes | 🟡 Conteúdo editorial versionado em código; painel visual planejado | `server/content/*` |
| RF-11 | P1 | Assistente de IA ancorado em fontes | ✅ Antecipado a pedido do idealizador, com modo offline | `server/routes/assistant.js` |
| RF-12 | P1 | Comunidade moderada | ⏳ | — |
| RF-13 | P2 | Parcerias e serviços locais | ⏳ | — |
| RF-14 | — | Login, cadastro, troca de senha, logout geral | ✅ | `server/routes/auth.js` |
| RF-15 | — | Painel explicativo (para que serve) | ✅ | `public/js/views/landing.js` |
| RF-16 | — | Manual completo do processo | ✅ | `public/js/views/manual.js`, `docs/08` |
| RF-17 | — | Gamificação: XP, níveis, conquistas, celebração | ✅ | `server/game.js` |
| RF-18 | — | Personalização: avatar, cor, tema, metas, dicas | ✅ | `profile.js`, `game.js#personalTips` |
| RF-19 | — | Exportar e excluir meus dados | ✅ | `GET /api/me/export`, `DELETE /api/me` |

### Regras de negócio e como o sistema as respeita

| Regra | Implementação |
|---|---|
| **RN-01** Processo centralizado, requisitos descentralizados | Cada programa tem a própria lista de requisitos; o idioma nunca é herdado da universidade. |
| **RN-02** Datas dependem do ciclo | O catálogo traz `ciclo`; a dica de calendário cita o ciclo pretendido pelo estudante e manda confirmar a fonte. Nenhuma data é cadastrada sem fonte. |
| **RN-03** Diploma estrangeiro não exige homologação prévia | Missão "Entenda: não precisa homologar" com [O1]/[O3] e a ressalva de finalidade. |
| **RN-04** Documentação acadêmica condicional | Checklist com `requerido` / `condicional` / `verificar` e fonte por item. |
| **RN-05** Idioma por programa | Status "verificar" ou "não confirmado" quando falta evidência; nunca "aprovado/reprovado". |
| **RN-06** Adjudicação não é conclusão | Estados distintos: admitido, lista de espera, precisa confirmar, matriculado, não admitido. |
| **RN-07** Visto condicionado à situação | Missões e checklist separam DUA de visto; mandam usar a lista do consulado do estado do estudante. |
| **RN-08** TIE em até 1 mês (estada > 6 meses) | Missão na Fase 6 e menção na linha do tempo do manual, para alertar antes da chegada. |
| **RN-09** Fonte e data em cada regra | `server/content/sources.js` com `revisadoEm`; toda missão, FAQ e documento referencia uma fonte. |

### Requisitos não funcionais

| Requisito | Status |
|---|---|
| Privacidade: minimização, sem cópias de documentos, exportação e exclusão | ✅ |
| Segurança: hash forte, sessão httpOnly, CSRF, CSP, rate limit, logs de auditoria | ✅ ver `04-seguranca.md` |
| Confiabilidade: etiquetas e datas de revisão; status autodeclarado identificado | ✅ |
| Acessibilidade: mobile-first, teclado, foco visível, contraste, `prefers-reduced-motion`, linguagem simples | ✅ |
| Resiliência: IA indisponível → base verificada; nunca inventa regra | ✅ |

<a id="doc-13"></a>

## 13 — Jornada Estuvia: rodadas, missões e módulos integrados

### 1. Hierarquia

**Jornada → Rodadas → Missões → Objetivos.** Definições ficam em `server/content/rounds.js` (conteúdo puro); regras em `server/journey-engine.js`; componentes em `public/js/components/`. O progresso **nunca é um número salvo**: é recalculado a partir de fatos (objetivos marcados, missões confirmadas, dados declarados, decisões externas).

| Entidade (spec) | Onde está |
|---|---|
| UserProfile | `user.profile` |
| Journey | `user.journeys[]` — `{ id, programaId, universidadeId, anoAcademico, inicioAulas, duracaoMeses, missions, dados, situacao, contatos }` |
| University / MasterProgram / ProgramRequirement | `content/catalog.js` (+ programas do Radar via `registerProgramSource`) |
| Round / Mission / MissionObjective / MissionDependency | `content/rounds.js` (`dependencias`, `requer`, `regra`) |
| UserMissionProgress | `journey.missions[id] = { objetivos, concluidaEm, aguardando, naoAplicavel, prazo, execucao, nota }` |
| UserDocument | `user.documents[id] = status` + anexos locais (IndexedDB, `public/js/localfiles.js`) |
| OfficialSource | `content/sources.js` (com `revisadoEm`, `pendente`) |
| FinancialPlan / FinancialResource | `user.finance` + `finance-engine.js` |
| Scholarship / ScholarshipApplication | `content/scholarships.js` / `user.scholarshipApps[]` |
| UniversityContact | `journey.contatos[]` |
| HousingOption / TravelPlan | `user.housing[]` / `user.travel` |
| AgendaEvent / TaskReminder | `user.planner[]` + prazos calculados + alertas do Início |
| AssistantConversation | memória da aba (não gravada no servidor) |

### 2. Rodadas

1. **Encontrando meu mestrado** — perfil acadêmico, explorar universidades, encontrar o mestrado, elegibilidade, planejamento financeiro inicial.
2. **Preparando minha candidatura** — passaporte, diploma, histórico, complementares, idioma (só se exigido), CV/cartas, organizar documentação.
3. **Conquistando minha vaga** — DUA, fase, candidatura, mestrados (até 6), anexos, envio, comprovante, contato com a universidade (recomendação), adjudicação, lista de espera (condicional).
4. **Confirmando minha matrícula** — resultado, procedimento, ação no prazo, taxas, pagamento, comprovantes, documentação para o visto.
5. **Conquistando meu visto** — consulado, e-mail ao consulado (recomendação), checklist, recursos (integra finanças), seguro, complementares, solicitar, acompanhar, conferir.
6. **Preparando minha mudança** — Meu novo lar, escolha (entra no orçamento), passagens, documentos de viagem, chegada.
7. **Cheguei à Espanha** — moradia, universidade, acessos, horários, telefone, banco, transporte, registros locais + guia de Granada.
8. **Regularizando minha estadia** — TIE (só para estadia > 6 meses).
- **Trilha F — Como vou financiar meus estudos?** (transversal, ids `9.x` exibidos como `F.x`).

### 3. Estados e regras

| Estado | Quando |
|---|---|
| Bloqueada | Dependência pendente **ou** decisão externa ainda não registrada (`requer`, marcada como "não é atraso seu") |
| Disponível | Pode começar |
| Em andamento | Algum objetivo feito ou execução "Estou fazendo" |
| Aguardando terceiros | Marcado pelo estudante ou automático pela situação (`aguardandoSe`, ex.: adjudicação "aguardando") |
| Atenção necessária | Prazo ≤ 14 dias/vencido, requisito não confirmado, `atencaoSe` (ex.: "exige ação") |
| Concluída | Todos os objetivos + **confirmação explícita** |
| Não aplicável | Regra do programa/perfil/situação ou marcado após conferência (condicionais/opcionais) |

- **Prioridade crítica:** prazo ≤ 7 dias ou `urgenteSe` (ex.: admissão registrada → 4.1; visto aprovado → 5.9/6.2/6.3).
- **Missões opcionais** (3.8, 5.2) não contam como pendência se não forem iniciadas.
- **Situação externa** por jornada: adjudicação, matrícula, visto (`SITUACAO` em `rounds.js`).
- **Prazos:** só regra oficial (TIE = entrada + 1 mês de calendário), prazo confirmado pelo Radar ou data declarada pelo estudante. Nunca inventados.
- **Progresso:** missão não concluída vale no máximo 85% do seu peso; rodadas e jornada só chegam a 100% com conclusões reais.

### 4. Conteúdo da missão

`components/MissionContent.js` — cabeçalho contextual, "Seu progresso nesta missão" (objetivos reais) e grade de cards que **abrem funcionalidades** em painéis:

| Tipo (`missionType`) | Cards |
|---|---|
| candidatura | Antes de começar, Guia completo, (Tutorial), Fluxo, Documentos, Agenda AI, Executar, Mentor, Ferramenta |
| financeiro | Entenda a exigência, Simulador, Documentos, Alternativas, Bolsas, Agenda AI, Mentor, Executar |
| moradia | Guia, Comparador, Custos, Checklist de segurança, Agenda AI, Executar, Mentor, Fluxo |
| tie | Antes de começar, Documentos, Como fazer, Executar (portal oficial), (Tutorial), Agenda AI, Mentor, Fluxo |
| bolsas | Elegibilidade, Radar, Comparar, Documentos, Agenda AI, Executar, Mentor |

O card **Tutorial visual** só aparece com tutorial verificado (nenhum cadastrado). **Executar missão** registra "Ainda não comecei / Estou fazendo / Aguardando resposta / Concluí / Preciso de ajuda"; "Concluí" pede confirmação com o critério. Abrir o portal ou ler o guia não conclui nada.

### 5. Agenda AI (`agenda-engine.js`)

- Entrada: missões abertas de todas as jornadas, tarefas de bolsas, disponibilidade (dias, janela, horas/semana, preferência curta/longa, fuso) e compromissos existentes.
- Prioridade: crítica → alta → normal → aguardando resposta (blocos curtos de verificação).
- `POST /planner/suggest` gera proposta (opcionalmente focada numa missão — "Organizar esta missão na minha semana"); o estudante remove/edita e **aprova**.
- `POST /planner/replan` remove blocos sugeridos futuros que perderam sentido (missão concluída, bloqueada, aguardando) e propõe de novo.
- Nunca conclui missões. Eventos de outras origens (estudante, comunidade, radar) não são apagados.

### 6. Financiamento (`finance-engine.js`)

- **(A) Exigência estimada do visto** = `IPREM[ano].mensal × 100% × meses` — tabela em `content/finance.js` (referência oficial consultada para 2026: €600). O simulador cobre apenas estudante individual; dependentes e ajustes por alojamento/bolsa antecipados exigem confirmação consular.
- **(B) Orçamento real** = custos únicos + mensais × meses; moradia e rota escolhidas entram automaticamente.
- Recursos: só "disponível/confirmado" contam; "previsto/solicitado" aparecem à parte. Bolsa **concedida** entra pela cobertura confirmada e cria tarefas de aceite.
- Déficit → caminhos: bolsas, apoio familiar documentado, destinos mais baratos, outro período, plano de economia mensal, financiamento educacional (trabalho não substitui a comprovação).

### 7. Critérios de aceitação (como verificar)

| # | Cenário | Onde |
|---|---|---|
| 1–2 | Criar jornada Brasil → Granada e ver requisitos | Onboarding / Mestrados → Criar jornada; teste `1–2` |
| 3 | Rodada 3 com missões DUA | `#/j/:id/r/3`; teste `3` |
| 4, 12, 13 (trilha) | Concluir missões e ver a trilha/módulos mudarem | Conteúdo da missão → Executar; teste `4/12` |
| 5 | Aguardando decisão universitária | Painel "Situação" ou objetivo da 3.9; teste `5/13` |
| 6 | Contato oficial de professor/coordenador | Missão 3.8 → "Encontrar contato acadêmico" |
| 7–9 | Recursos insuficientes, alternativas, bolsa com prazo e tarefas | `#/financiamento`; teste `7–9` |
| 10–11 | Agenda AI organiza a semana | `#/agenda` → Organizar; teste `10–11` |
| 13–14 | Admissão e visto aprovados destacam próximas ações | Situação; testes `5/13` e `14` |
| 15 | Sair e entrar sem perder progresso | teste `15` (sessão sobrevive a reinício do servidor em dev) |
| Missão #15 | Composição diferente de cards por tipo | Compare missões 3.6, 6.1, 8.3, 9.4 |

Todos os cenários foram exercitados também pela interface (E2E em navegador, desktop e celular).

<a id="doc-27"></a>

## 27 — Onboarding: auditoria, fluxo e componentes

O primeiro onboarding tem **6 etapas + revisão** e gera a primeira jornada. As jornadas seguintes pedem só o **destino** e reaproveitam perfil, requisitos, documentos e finanças.

Arquivos: `public/js/views/onboarding.js` (fluxo), `public/js/views/auth.js` (login/cadastro), `public/js/components/Select.js`, `public/js/ui.js` (`toast`), `public/js/data/geo.js`, `public/js/data/academic.js`, `public/css/flow.css`, `public/js/i18n-flow.js` (traduções ES/EN).

### 1. Auditoria: o que cada resposta realmente alimenta

Levantado no código (não por suposição). "Obrigatório" = precisa de resposta para avançar; uma resposta como "Ainda não sei" conta como resposta.

| Campo | Onde é usado | Missões | Documentos | Finanças | Progresso | Obrigatório? |
|---|---|---|---|---|---|---|
| `nacionalidade` | Objetivo auto `perfilOrigem` (Missão 1.1), conquista "perfil completo", contexto do Mentor, modelos de carta | 1.1 (objetivo) | — | — | — | Sim |
| `paisResidencia` | Regra `perfil` das missões de visto (`igual: 'Brasil'`, senão "atenção"), consulado (`places.js`), condição `residenteBrasil` da Carteira, dicas | 5.x (atenção fora do Brasil) | Comprovante de residência (cond.) | — | — | Sim |
| `estado` | Consulado por UF (`consulateForState`), objetivo `temEstado` | 5.1 (consulado) | Jurisdição consular | — | — | Sim quando o país tem lista de divisões (no Brasil, a UF; validado também no servidor) |
| `formacao` | Objetivo `perfilFormacao`, elegibilidade "Titulação de acesso" (Missão 1.4) | 1.1, 1.4 | — | — | — | Sim |
| `instituicao` | Contexto do Mentor, painel admin | — | — | — | — | Sim (pedido do produto: resposta manual aceita) |
| `area` | Contexto do Mentor, painel admin | — | — | — | — | Sim (idem; "Outra área" aceita) |
| `espanhol` | Objetivo `perfilIdioma`, elegibilidade de idioma (1.4), dicas | 1.1, 1.4 | — | — | — | Sim (`nao-sei` é válido) |
| `certificadoEspanhol` / `certificadoNivel` | Objetivo `certificadoAtende`, elegibilidade | 2.x de idioma | — | — | — | Sim responder; ninguém precisa ter certificado |
| `ingles` | Contexto do Mentor | — | — | — | — | Sim (`nao-sei` é válido) |
| `orcamentoDisponivel` + `orcamentoSituacao` | **Antes:** só no painel admin (o `finance-engine` não lia). **Agora:** `plano.orcamentoDeclarado` no Planejamento financeiro, como referência | — | — | Referência, **não** recurso comprovado | — | Sim (`nao-sei` é válido; ausência nunca vira zero) |
| `universidadeId` | Jornada: universidade, cidade, custos, Radar | todas | — | custos da cidade | — | Sim |
| `programaId` | Exigência de idioma (2.x), duração padrão, prazos oficiais do Radar, objetivo `temProgramaPrincipal` (1.3) | 1.3, 2.x, 3.x | — | — | — | **Não** (ver §3) |
| `anoAcademico` | Objetivo `temAnoAcademico`, IPREM do ano, prazos do Radar | 1.x, 3.x | — | ano da regra do visto | — | Sim |
| `inicioAulas` | Prazo "Início das aulas", partida no planejador, validade do passaporte | — | passaporte | data de partida | — | Sim responder (`Ainda não sei` válido) |
| `duracaoMeses` | Regra da TIE (`> 6` meses), meses de custo, validade do passaporte | 8.x | TIE | meses | — | Sim responder (`Ainda não sei` → TIE em "atenção") |
| `etapa` (+ `dataEntrada`) | `declarePriorProgress` | marca missões como declaradas | — | — | Rodadas desbloqueadas | Sim; data só para "Já estou na Espanha" |
| `requisitos.*` | `applyRequirements` + Carteira (`tenho` → documento "pronto", origem "declarado") | 2.1–2.3, 8.x | passaporte, diploma, histórico | — | conclui como "requisito atendido" | Sim (passaporte, diploma, histórico; TIE só para quem está na Espanha) |

Removido da interface do onboarding: o bloco independente **"Mestrado pretendido"**. Os campos `situacaoCandidatura`/`situacaoVisto` do perfil nunca foram exibidos (o onboarding antigo só reenviava os valores padrão) e o motor não os lê; o onboarding deixou de enviá-los. A situação real fica na jornada (`etapa` → `situacao`).

### 2. Fluxo

1. **Origem**: nacionalidade e país (Select pesquisável, nomes via `Intl.DisplayNames`), divisão administrativa dependente do país (`geo.js`: Brasil (UF), Espanha (províncias por comunidade), Portugal, EUA, México, Argentina, Colômbia, Chile, Peru, Uruguai, Paraguai, Bolívia, Equador, Venezuela, Canadá, Itália, Alemanha, França). País sem lista: sem campo. Mensagem real: consulado da UF (de `places.js`) ou aviso de visto fora do Brasil.
2. **Formação**: nível (chips), instituição (busca por nome/sigla; "Não encontrei" abre texto livre), área (agrupada pelos 5 ramos usados pelas universidades espanholas; "Outra área").
3. **Idiomas**: CEFR A1–C2 + "Não falo", "Nativo", "Ainda não sei"; certificado (DELE, SIELE, outro, não tenho) e nível do certificado.
4. **Orçamento**: valor em euros com formatação, atalhos de referência, "Ainda não sei".
5. **Destino**: universidade (cards com logo), mestrado **opcional** dentro do destino ("Já sei qual mestrado quero", com os programas oficiais do Radar), ano, **início por período** (setembro/outubro do 1º ano ou fevereiro do 2º, ou "Ainda não sei"), duração (com efeito da TIE explicado), situação atual (linha do tempo de `PRIOR_STAGES`), data de entrada só para "Já estou na Espanha", confirmação.
6. **Documentos**: uma pergunta por vez, respostas com categoria visual (já tenho / ainda não / preciso verificar), resumo final.
7. **Revisão** ("Sua jornada está quase pronta.") com "Editar" por etapa → **geração** com a lista de passos → **resultado real**: rodada inicial, missões para começar, não aplicáveis, progresso reconhecido e primeira missão recomendada (tudo vindo do motor).

O resumo "Seu perfil até agora" (lateral no desktop, topo no celular) mostra só o que o estudante respondeu.

### 3. Mestrado opcional (decisão de arquitetura)

O motor já tratava jornada sem programa (`buildContext` cai em `jr.universidadeId`; a interface mostra "Mestrado a definir"; idioma vira "atenção"). Só `POST /journeys` exigia `programaId`. Agora:

- `POST /journeys` aceita `universidadeId` sem `programaId`. Nenhum programa é escolhido automaticamente.
- Duplicidade preservada: mesmo programa → 409; e no máximo uma jornada **sem programa** por universidade + ano.
- `PUT /journeys/:jid/program` define o mestrado depois (mesma universidade, sem repetir). O Radar oferece "definir nesta jornada" quando há uma jornada "a definir" na mesma universidade. O objetivo automático da Missão 1.3 ("Mestrado desta jornada definido") só conclui quando há programa.
- Quem marca "Já escolhi meu mestrado" (ou etapa posterior) sem selecionar programa recebe um aviso e o seletor abre sozinho.

### 4. Validação e gravação

- Frontend: o botão "Continuar" fica desabilitado enquanto a etapa estiver incompleta e a linha "Falta: …" diz o quê. Strings vazias ou só com espaços não contam. Responder "não sei" ≠ não responder.
- Servidor: `PUT /me/profile` valida cada campo (enums estritos; `certificadoNivel` só A1–C2); `POST /me/onboarding/complete` confere o essencial (inclusive UF para quem mora no Brasil, situação do orçamento, documentos e existência de jornada) e responde 422 com `faltam[]`.
- Ordem de gravação (`finish()`): perfil → requisitos → jornada → progresso anterior → **conclusão** (`onboardingConcluido` só no fim). Antes, a flag era gravada antes de criar a jornada.
- Repetição segura: duplo clique ignorado; o id da jornada criada fica no rascunho, e "Tentar novamente" a reaproveita (não cria outra). Perfil e requisitos são idempotentes; o progresso anterior não é reaplicado se já registrado.
- Rascunho no `localStorage` por usuário e modo (`estuvia:onboarding:<id>:perfil|jornada`), restaurado ao recarregar e apagado ao concluir.

#### Data de início (correção)

O campo de data digitada foi trocado por períodos acadêmicos. O valor enviado é `inicioAulas = AAAA-MM-01` com `inicioAulasAproximado: true` (o prazo aparece como "Início das aulas (mês previsto)"). O período fica no rascunho e volta ao retornar à etapa. Não consegui reproduzir com certeza a causa original da perda da data digitada; a troca elimina a máscara manual de dd/mm/aaaa, que era o ponto frágil do fluxo.

### 5. Componentes

- **Select** (`components/Select.js`): combobox acessível (ARIA `combobox`/`listbox`, `aria-activedescendant`), busca com normalização de acentos, grupos, opção fixa ("Não encontrei"), teclado (setas, Home/End, PageUp/PageDown, Enter, Esc, digitação rápida), lista em portal com posição fixa que abre para cima/baixo e alinha pela borda direita para não sair da tela; no celular vira folha inferior. Expõe `value`, `setOptions`, `setInvalid`, `setDisabled` e um `<input type="hidden" name>` para formulários. Usado no onboarding, no perfil e no seletor de idioma (com bandeiras em SVG: emoji de bandeira não aparece no Windows). Os `<select>` nativos restantes ganharam o mesmo visual por CSS.
- **Toasts** (`ui.js`): sucesso, erro, atenção e informação (`ok|err|warn|info`, compatível com as chamadas antigas), ícone, botão fechar, barra de tempo, pausa ao passar o mouse/focar, erro com `role="alert"`, no máximo 4.
- **Modo foco** (`isFocusPath` em `app.js`): login, cadastro, recuperação de senha e onboarding sem menu lateral, barra inferior, rodapé e **sem Mentor**.
- Movimento: transições curtas; `prefers-reduced-motion` desliga as animações.

### 6. Testes

- `tests/onboarding.test.js`: jornada sem mestrado, duplicidade, `PUT /program` (Missão 1.3), TIE por duração, progresso anterior sem mestrado, "não sei"/"verificar", conclusão validada, orçamento no planejador, divisões administrativas.
- E2E em navegador (Playwright + Chrome, servidor isolado com JSON temporário): cadastro/login sem lateral, seis etapas, divisões de vários países, instituição manual, persistência ao recarregar, data de início salva, TIE, progresso anterior, documentos, revisão, geração, segunda jornada só com destino, Mentor ausente/presente, toasts, seletor de idioma dentro da tela e celular sem rolagem horizontal.

<a id="doc-14"></a>

## 14 — Progressão, simplicidade e complexidade adaptativa

A regra de produto: **mostrar a jornada completa em visão geral, liberar a execução detalhada aos poucos, sem esconder alertas, custos ou obrigações.** A interface acompanha a complexidade real da tarefa, nunca a do template.

### 1. Acesso

Sem conta, só a página de apresentação, o login e o cadastro. Manual, fontes, catálogo e conteúdo das missões exigem login (`requireAuth` em `/api/content/*`, exceto `app` e `journey`, que devolve só a visão geral das rodadas, sem missões).

### 2. Progressão (servidor)

Regras em `server/content/progression.js`, avaliadas em `server/journey-engine.js`.

| Conceito | Onde |
|---|---|
| **RoundUnlockRule** | `ROUND_UNLOCK`: `requisitos` (todos) ou `alternativas` (qualquer uma, ex.: decisão externa registrada) |
| **MissionUnlockRule** | `dependencias`, `requer`, `regra` em `content/rounds.js` + desbloqueio da rodada |
| **UserMissionProgress** | `journey.missions[id]` = `{ objetivos, concluidaEm, evidencia, declarada, requisitoAtendido, ignorada, aguardando }` |
| **UnlockEvent** | `journey.desbloqueios[]` = `{ entidade: 'rodada:3' \| 'missao:3.1', tipo, motivo, em }` — gravado por `recordUnlocks` (idempotente) |

| Rodada | Desbloqueia quando |
|---|---|
| 1 e F (financiamento) | sempre |
| 2 | 1.1 perfil + 1.3 mestrado + 1.5 planejamento financeiro (ou candidatura já enviada) |
| 3 | 2.4–2.7 documentação e requisitos (N/A conta como resolvida) |
| 4 | 3.6 candidatura enviada ou resultado registrado — a matrícula (4.1–4.3) só abre com "admitido" |
| 5 | 4.6 comprovantes acadêmicos, matrícula registrada ou pedido de visto já apresentado |
| 6 | visto aprovado (5.9 ou situação) |
| 7 e 8 | chegada registrada (`POST /journeys/:id/arrival`), que exige visto aprovado. A TIE não depende das tarefas da Rodada 7. |

- **Trilhas paralelas** (`MISSION_TRACK`): financiamento, preparação do visto (5.1–5.6), pesquisa de moradia (6.1), comparação de passagens (6.3) e obrigações legais (8.1–8.2). Elas ignoram o bloqueio da rodada, mas respeitam as próprias dependências.
- **Estados:** `bloqueada` (LOCKED), `disponivel` (AVAILABLE), `em-andamento` (IN_PROGRESS), `aguardando` (WAITING_EXTERNAL), `atencao` (NEEDS_ATTENTION), `concluida` (COMPLETED), `nao-aplicavel` (NOT_APPLICABLE) e `ignorada` (SKIPPED, só para opcionais).
- **Origem da conclusão** (`conclusao`): `plataforma`, `declarada` (progresso anterior) ou `requisito-atendido`.
- **Rodada registrada não volta a bloquear** se um pré-requisito for reaberto.
- **O navegador não vê o que está bloqueado:** `journeyForClient` remove as missões das rodadas bloqueadas (exceto as das trilhas paralelas). `missionForClient` devolve só nome, objetivo resumido, o que falta e prazo oficial. Mutações em missão bloqueada respondem 409.
- **Prazos oficiais** (Radar) continuam aparecendo mesmo com a rodada bloqueada.
- **O calendário nunca desbloqueia nada:** a Agenda AI só planeja missões liberadas.
- **Evidência:** obrigatória para concluir 3.6 (comprovante do DUA) e 5.7 (protocolo do visto).
- **Quem já avançou:** `POST /journeys/:id/prior-progress {etapa, dataEntrada?, confirmo:true}` com as etapas de `PRIOR_STAGES`. Nunca rebaixa uma situação nem apaga conclusões.

### 3. Requisitos já atendidos

`GET/PUT /journeys/requirements` cobre passaporte, diploma, histórico e TIE (a TIE só depois da chegada). As perguntas aparecem uma de cada vez no onboarding e podem ser corrigidas em "Meu perfil → O que eu já tenho". "Sim, já tenho" marca a missão como **requisito já atendido** e o documento como "pronto". Todas as perguntas aceitam também "Preciso verificar", que mantém a missão aberta. Mudar a resposta desfaz só o que ela marcou.

### 4. Complexidade adaptativa (interface)

`complexityOf(id)` define o modo e `riskOf(id)` define o risco, que é independente: uma tarefa fácil pode ter consequência séria.

| Modo | Exemplos | Tela (`MissionGuide.js`) |
|---|---|---|
| **simples** | conferir passaporte, salvar comprovante, chip, transporte | Um card com uma frase, uma ação principal (site oficial ou "Já fiz isso") e "Já pedi e estou aguardando" ou "Preciso de ajuda". A confirmação fica no mesmo card. Pedir ajuda transforma a missão em guiada. |
| **guiada** | moradia, seguro, elegibilidade, documentos específicos | Um passo de cada vez ("Já fiz" ou "Ainda não consegui", que mostra alternativas). No fim vem "Conseguiu?". As ferramentas ficam recolhidas. |
| **complexa** | envio no DUA, comprovação financeira, visto, bolsas, viabilidade | Passos + ambiente completo aberto (documentos, prazos, Agenda, fluxo, ferramentas). |

Em todos os modos:
- "O que fazer" numa frase.
- Alerta de risco curto quando o risco é médio ou alto.
- "Precisa de ajuda?" com ações rápidas: *O que faço agora? · Não entendi · Me mostra como fazer · Não tenho esse documento · Estou com dificuldade · Quanto custa? · Posso fazer depois?*
- "Palavras desta missão", tiradas do glossário (`public/js/glossary.js`).
- "Organizar esta missão na minha semana" em dois toques (`QuickPlan.js`).
- Detalhes em "Entender melhor" e "Fontes e detalhes".
- Um único link oficial por vez, com o órgão e o que fazer depois de abrir.

Missões com ferramentas próprias:
- **5.1:** pergunta "Em qual estado você mora?" e responde "Encontramos seu consulado!" (ou indica a lista oficial quando a jurisdição não está confirmada).
- **Financeiras:** perguntam "Você já tem dinheiro para comprovar?" e oferecem alternativas (bolsas, economia, apoio da família, destinos mais baratos, estimativa calculada).

### 5. Assistente

As ações rápidas novas estão em `assistant-context.quickAnswer`. A regra 12 do prompt pede resposta curta primeiro, termos explicados e aprofundamento sob pedido. O contexto inclui a complexidade e o risco da missão. As respostas podem trazer `acoes` do tipo `perguntar`, que encadeiam outra ação rápida. O novo Mentor (outra sessão, `/api/mentor`) segue o mesmo contrato.

### 6. Testes

`tests/progression.test.js` cobre os 15 critérios de aceitação da progressão, mais acesso só com conta, complexidade e risco, requisitos atendidos e reversíveis, SKIPPED e chegada.

<a id="doc-06"></a>

## 06 — Gamificação, progresso e conquistas

A gamificação serve para tornar o processo **compreensível e motivador sem virar jogo infantil**: o progresso reflete procedimentos reais concluídos, nunca cliques ou leituras.

### Progressão

- **Jornada → Rodadas → Missões → Objetivos** (detalhes em [13 — Jornada Estuvia](#doc-13)).
- **Barra por missão** = objetivos realmente feitos; **por rodada** e **jornada** = média das missões aplicáveis (missão não concluída vale no máximo 85%); missões não aplicáveis e opcionais não iniciadas não contam como pendência.
- **Trilha visual** em zigue-zague: cada nó muda de estado (bloqueada, disponível, em andamento, atenção, aguardando, concluída, não aplicável); a linha fica sólida entre missões concluídas; o nó recomendado mostra "Você está aqui".
- **Feedback:** toast ao concluir e ao desbloquear; celebração discreta ao concluir uma rodada ou um marco; histórico de marcos no painel da jornada.

### Marcos (resultados concretos)

| Marco | Missão |
|---|---|
| Primeira candidatura enviada! | 3.6 |
| Vaga universitária conquistada! | 4.3 |
| Matrícula concluída! | 4.6 |
| Visto aprovado! | 5.9 |
| Você chegou ao seu destino! | 7.1 |
| Estadia regularizada! | 8.8 |

XP e níveis foram retirados de propósito: o reconhecimento vem dos resultados reais (marcos e conquistas abaixo).

### Personalização

Avatar, cor de destaque (turquesa Estuvia por padrão), tema escuro/claro, "meu porquê", meta pessoal e dicas geradas pelo perfil e pelas jornadas (idioma exigido × nível declarado, ciclo, consulado).

### Conquistas

Além dos marcos de cada jornada, o estudante tem um quadro de **conquistas pessoais**: 19 medalhas em 4 categorias (Primeiros passos · Candidatura e vaga · Visto e finanças · Mudança e chegada), com nível **bronze** (10 pts), **prata** (25) ou **ouro** (50).

Exemplos: 🎓 *Aprovado(a)!* (adjudicação "Admitido(a)"), 🏁 *Vaga garantida* (vaga confirmada/reservada), 🛂 *Visto aprovado* (situação do visto "Aprovado"), 🏠 *Lar à vista*, ✈️ *Rota traçada*, 📍 *Cheguei!*, 🛡️ *Residente* (TIE).

- **Fonte da verdade:** os mesmos fatos da jornada (missões, situação externa, documentos, finanças, moradia, viagem). Uma conquista ganha em qualquer jornada conta para a pessoa.
- **Reversível:** se o fato deixa de ser verdadeiro, a conquista volta a ficar pendente. `user.conquistas` guarda só a data da primeira vez (`em`) e se a celebração já foi vista (`vistaEm`).
- **API:** `GET /api/achievements` (lista, resumo e `novas`) · `POST /api/achievements/seen` `{ ids }`.
- **Arquivos:** catálogo em `server/content/achievements.js`, regras em `server/achievements-engine.js` (`RULES`, mesmo id), rota em `server/routes/achievements.js`, tela em `public/js/achievements.js`, estilos em `public/css/achievements.css`, testes em `tests/achievements.test.js`.

Para criar uma conquista: adicione a entrada no catálogo e a regra com o mesmo id em `RULES`. O teste do catálogo falha se faltar a regra ou o nível.

---

<a id="parte-3"></a>

# Parte 3 — Módulos

<a id="doc-15"></a>

## 15 — Mentor Estuvia (agente com ferramentas)

O Mentor não é só um chat: ele **entende, explica, planeja e executa ações autorizadas** usando as mesmas regras do backend da Estuvia. Hoje roda no **Modo Guiado** (sem API paga). O mesmo conjunto de ferramentas fica pronto para um modelo de linguagem quando houver orçamento.

> Ele se apresenta como **"Mentor de IA da Estuvia"** (ou **"Assistente Estuvia — Modo Guiado"**, quando não há modelo conectado). Nunca finge ser uma pessoa nem o fundador.

### Situação

| Fase | Situação |
|---|---|
| 1 — Modo Guiado, sem API paga | ✅ Interface completa, ações rápidas, intenções em português, ferramentas reais, confirmação, auditoria, avisos proativos, memória controlada pelo estudante |
| 2 — Integração com LLM | ✅ Pronto: camada de provedor (`anthropic`, `openai-compatible` para OpenAI/Ollama/LM Studio/vLLM). Basta configurar o `.env` |
| 3 — Agente com execução integrada | ✅ Laço de ferramentas: leituras executam na hora, escritas viram **uma proposta** que o estudante confirma. Se a IA falhar, a resposta cai para o Modo Guiado com aviso |

### Arquitetura

```
public/js/components/MentorPanel.js   AI Mentor UI: botão flutuante, painel, página, cartões, propostas, "O que o Mentor sabe"
public/css/mentor.css
server/routes/mentor.js                API /api/mentor
server/mentor/
├── orchestrator.js   Mentor Orchestrator: escolhe o modo, monta o contexto, roda o laço de ferramentas
├── guided.js         Modo Guiado: intenções por regras → ferramentas → resposta curta + próxima ação
├── prompt.js         System prompt (identidade, personalidade, regras, limites)
├── providers/        AI Provider: index (escolha), anthropic.js, openai-compatible.js
├── knowledge.js      Knowledge Base: trechos com procedência (RAG lexical BM25; troca por embeddings sem mudar o formato)
├── context.js        Context Manager: contexto mínimo, respeitando permissões; diz o que NÃO está cadastrado
├── tools/            Tool Registry: core (contrato), journey, agenda, finance, radar, documents, housing, knowledge, index
├── actions.js        Action Confirmation: propostas com prévia, uso único, expiração em 30 min, revalidação na confirmação
├── memory.js         Safety and Permissions + memória (notas autorizadas) + Audit Log do estudante
├── proactive.js      Avisos proativos gerados por regras
└── parse.js          Datas ("amanhã", "sexta às 10h"), valores ("€2.000", "R$ 3.500"), missões, documentos, eventos
```

Fluxo de uma mensagem:

```
UI ──POST /mentor/message {mensagem|acao, contexto{journeyId, missaoId, tela}, historico}
      └─ orchestrator ─┬─ sem provedor → guided.js ─┐
                       └─ com provedor → laço LLM ──┤
                                 ferramentas (tools/) ── motores existentes (journey-engine, agenda-engine,
                                                          finance-engine, radar/service, store)
      ◄─ { texto, cartoes[], proposta?, sugestoes[], fontes[], ferramentas[], modo }
UI ──POST /mentor/actions/:id/confirm {edicoes?} → executa de verdade → resultado real + eventos
```

As ferramentas chamam os **mesmos motores** das telas. As mutações de missão repetem o padrão `mutate()` de `routes/journey.js`: cópia → motor valida → `recordUnlocks` → persistir. Por isso o Mentor não consegue desbloquear nada que a tela também não desbloquearia.

### System prompt

Está em `server/mentor/prompt.js`, em texto estável e sem dados do estudante, o que permite cache. Ele define:
- **Identidade:** IA, inspirada na metodologia e na experiência do idealizador.
- **Personalidade:** didático, proativo, organizado, prático, paciente, econômico, transparente e humano no tom.
- **Formato:** "explicação simples + próxima ação + ajuda adicional", até ~80 palavras, com termos técnicos explicados.
- **Ações:** escrita = proposta; nunca dizer "feito" antes da confirmação.
- **Fontes:** oficial × orientação prática × experiência do idealizador × estimativa, sem inventar.
- **Dinheiro:** prometido ≠ comprovado; solicitado ≠ concedido.
- **Limites:** sem promessas de visto ou aprovação, sem dados sensíveis, sem envio, pagamento ou acesso governamental.

O Modo Guiado aplica as mesmas regras por código.

### Catálogo de ferramentas

O contrato completo está em `GET /api/mentor/tools`: entrada em JSON Schema (gerado do zod), saída, efeito e permissão.

| Ferramenta | Efeito | Permissão | O que faz |
|---|---|---|---|
| `get_user_journey` | leitura | jornada | Destino, progresso, rodada atual, próxima missão, prazos e situação |
| `get_current_mission` | leitura | jornada | Missão em foco ou a próxima. Se bloqueada: só nome, objetivo resumido e o que falta |
| `get_pending_missions` | leitura | jornada | Agrupadas: agora, em andamento, atenção, aguardando, bloqueadas |
| `update_mission_progress` | **escrita** | jornada | Marca objetivo, conclui, aguardando, execução ou nota. O motor verifica dependências e evidências obrigatórias (3.6 e 5.7) |
| `register_arrival` | **escrita** | jornada | Data de entrada na Espanha. Exige o visto aprovado registrado |
| `get_user_availability` | leitura | agenda | Disponibilidade da Agenda AI e primeiro horário livre do dia |
| `get_calendar_events` | leitura | agenda | Compromissos e prazos com a origem: oficial, previsão ou informado pelo estudante |
| `propose_weekly_schedule` | leitura | agenda | Proposta da semana pela Agenda AI, **sem salvar** |
| `create_calendar_event` | **escrita** | agenda | Cria um ou mais compromissos (também a semana aprovada) |
| `update_calendar_event` | **escrita** | agenda | Move ou ajusta. **Prazo oficial do Radar não muda de data** |
| `replan_week` | **escrita** | agenda | Libera blocos antigos da Agenda AI/Mentor e salva nova distribuição |
| `get_financial_summary` | leitura | finanças | Exigência do visto (IPREM), orçamento, recursos por status, déficit, maiores gastos e caminhos |
| `calculate_financial_gap` | leitura | finanças | Quanto falta; simula "se eu tiver €X" e "se eu guardar €Y/mês" **sem gravar** |
| `update_financial_resource` | **escrita** | finanças | Recurso disponível, previsto (prometido), solicitado ou confirmado. Só disponível e confirmado contam como garantidos |
| `search_scholarships` | leitura | finanças | Catálogo com a situação do edital. Nunca diz que a bolsa cobre o mestrado |
| `save_scholarship` | **escrita** | finanças | Acompanhar bolsa e criar as tarefas (aparecem na Agenda AI) |
| `search_master_programs` | leitura | radar | Mestrados do Radar por nome ou área (português → espanhol), com a situação verificada |
| `get_verified_deadlines` | leitura | radar | Calendário oficial do mestrado da jornada, prazos oficiais e declarados, resposta pronta do Radar |
| `subscribe_to_opportunity` | **escrita** | radar | "Avise-me quando abrir" (avisos dentro da Estuvia) |
| `get_required_documents` | leitura | documentos | Documentos das missões, situação, exigência, fonte e dica |
| `update_document_status` | **escrita** | documentos | Situação no checklist. "Pronto" **não** é validação oficial |
| `get_housing_options` | leitura | moradia | Opções salvas: mensal, caução, entrada e checklist antifraude |
| `compare_housing_options` | leitura | moradia | Custo total, entrada, total no período e observações |
| `assess_listing_risk` | leitura | moradia | Sinais de golpe num anúncio colado. Nunca diz "é seguro" |
| `save_housing_option` | **escrita** | moradia | Salva no "Meu novo lar" |
| `get_official_sources` | leitura | — | Base de conhecimento com natureza, fonte e data de verificação |
| `draft_email` | rascunho | — | E-mail em espanhol (coordenador, professor, universidade, consulado). **Nunca envia** |
| `remember_note` / `resolve_note` | **escrita** | memória | Pendência curta que o estudante pediu para lembrar. Recusa dados sensíveis |

**O que ainda não existe** (`UNAVAILABLE`): o Mentor explica a limitação e oferece a alternativa.
- Enviar e-mail: em vez disso, prepara o rascunho.
- Inscrição oficial: em vez disso, guia o estudante e registra o comprovante.
- Cita previa ou agendamento no consulado: em vez disso, coloca um lembrete na agenda.
- Pagamentos: em vez disso, mostra o valor estimado e onde pagar pelo canal oficial.
- Envio de documentos: em vez disso, atualiza o checklist.
- Busca de anúncios na web: em vez disso, salva e compara o que o estudante encontrar.

#### Erros

Todas as ferramentas devolvem `{ ok:false, erro:{ codigo, mensagem, status } }` com uma mensagem amigável. Os códigos são:
- `sem-jornada`
- `sem-permissao`
- `entrada`
- `regra` (vem do motor)
- `evidencia`
- `prazo-oficial`
- `data-passada`
- `duplicado`
- `limite`
- `nao-encontrado`
- `interno` (registrado no console, sem expor detalhes)

### Confirmação e auditoria

- Uma escrita gera uma **proposta** com prévia: resumo, detalhes e avisos (ex.: "apoio prometido não conta como garantido").
- O estudante pode **editar antes**: dia e hora do compromisso, blocos da semana, valor do recurso, data de chegada.
- Na confirmação, o backend **revalida** com o estado atual, executa os passos em ordem e para no primeiro erro. A tela mostra o resultado real de cada passo e os eventos do motor (missão concluída, rodada desbloqueada).
- A proposta é de **uso único**, por isso não há execução dupla, e expira em 30 minutos.
- Toda ação executada, recusada ou cancelada vai para o `audit` global (sem conteúdo pessoal) e para `user.mentor.historico`, visível ao estudante em "O que o Mentor sabe".

### Contexto e memória

- **Sem conversas no servidor:** o chat vive só na aba do navegador, a partir de `historico` enviado em cada mensagem (até 12).
- **Continuidade** vem dos dados persistentes (jornada, documentos, agenda, finanças) e de **notas autorizadas**. Exemplo: segunda, "não consegui meu histórico" → o Mentor oferece lembrar. Quarta, "consegui o histórico!" → ele reconhece a pendência e propõe atualizar o documento, a missão e resolver a nota.
- **Context Manager:** inclui só perfil acadêmico, jornada em foco, missão em foco, Radar, finanças resumidas, notas e avisos. Diz explicitamente "não cadastrado" e "acesso desativado". Nunca inclui e-mail, documentos ou dados de apoiadores.
- **Permissões por área:** jornada, agenda, finanças, documentos, moradia, Radar e memória, em `PUT /api/mentor/preferences`. Desligar a memória apaga as notas. Uma ferramenta de área desligada responde `sem-permissao` e o Mentor explica como reativar.
- **Contexto da tela:** dentro de uma missão, "não sei fazer isso" usa aquela missão. Em outras telas (finanças, Radar, documentos, agenda, moradia), um pedido genérico de ajuda vai para o fluxo daquela tela.

### Avisos proativos (`proactive.js`)

São só regras sobre dados confiáveis. Cada aviso tem `origem: 'regra:…'`, pode ser dispensado e respeita `preferencias.proativo` e os tipos de aviso.

| Regra | Dispara quando |
|---|---|
| `radar-alerta` | Alerta do Radar não lido (abertura, prazo, resultados) |
| `radar-agenda-alterada` | Data oficial mudou e afeta um evento da agenda |
| `radar-abertura-proxima` | Candidatura do mestrado da jornada abre em até 30 dias (fonte oficial) |
| `radar-abertas` | Inscrições abertas e envio não registrado |
| `prazo-proximo` | Prazo de missão em até 14 dias |
| `missao-parada` | Missão em andamento há 21 dias ou mais |
| `chegada-tie` | Chegada registrada e TIE não resolvida (estada > 6 meses: até 1 mês após a entrada) |
| `documentos-pendentes` | Documentos requeridos pendentes nas Rodadas 2 e 3 |
| `financas-sem-recursos` | Rodada 4 em diante sem recursos registrados |
| `bolsa-prazo` | Prazo de bolsa em até 14 dias com tarefas pendentes |
| `memoria-pendencia` | Nota aberta há 2 dias ou mais ("Conseguiu resolver?") |

### Modo Guiado: o que ele entende

Cobre agenda (agendar, mover, pendências do dia, organizar ou reorganizar a semana, plano de documentos antes da inscrição), missões (próxima, o que falta, terminei, estou esperando, não consegui, dificuldade, mais simples, me mostra como), finanças (quanto falta, tenho €X, alguém vai ajudar com €X, economizar €X/mês, maiores gastos, custo de vida), bolsas, Radar (quando abre, inscrições abertas, mestrados compatíveis, avise-me, como me inscrevo), documentos, visto, chegada, moradia (listar, comparar, aluguel e caução, anúncio suspeito), e-mails, prazos, glossário e "o que você sabe sobre mim".

Quando não entende, diz claramente que não sabe responder com segurança e oferece o que sabe fazer. **Nunca simula IA generativa.**

### Ligar um modelo de linguagem (Fases 2 e 3)

```
# Claude
MENTOR_PROVIDER=anthropic
ANTHROPIC_API_KEY=...          # só no backend
MENTOR_MODEL=claude-opus-5-5   # opcional

# Compatível com chat completions (OpenAI ou modelo local)
MENTOR_PROVIDER=openai-compatible
MENTOR_BASE_URL=http://localhost:11434/v1   # ex.: Ollama
MENTOR_MODEL=nome-do-modelo
MENTOR_API_KEY=                              # se o servidor exigir
```

Outro fornecedor (ex.: Gemini) entra como um arquivo novo em `providers/` com `chat({ system, messages, tools }) → { texto, chamadas, parada, bruto }`. Nada mais muda.

Modelos locais não cobram por mensagem, mas exigem GPU ou hospedagem: avalie o custo antes. Com IA ligada, o limite é de 40 mensagens por hora por estudante; no Modo Guiado, 200.

### Limites de custo e de tempo

- **Teto diário por estudante:** `AI_DAILY_TOKENS_PER_USER` (padrão 300 000; `0` desliga), somando Mentor e Assistente. Conferido antes do laço e entre as etapas. Esgotado, a resposta vem do Modo Guiado / base local, com aviso explícito de que está sem IA generativa.
- **Tempo:** `MENTOR_TIMEOUT_MS` por chamada ao modelo (padrão 60 s, SDK com 1 nova tentativa) e `MENTOR_DEADLINE_MS` por mensagem (padrão 120 s). Estourou: Modo Guiado com aviso.
- **Ferramentas:** no máximo 6 chamadas por etapa e 12 por mensagem; as excedentes recebem `tool_result` de erro e não executam.
- **Limite de perguntas:** 40/hora **por conta** (não por IP).
- Tokens usados ficam em `user.aiUso` e no painel admin (status da IA).

### API

- `GET /api/mentor`: modo, nome, ações rápidas, avisos, permissões e preferências
- `POST /api/mentor/message`: `{ mensagem? | acao?, contexto{ journeyId?, missaoId?, tela? }, historico[] }`
- `GET /api/mentor/actions/:id`, `POST /api/mentor/actions/:id/confirm` (`{ edicoes?: { [passo]: {campos} } }`), `POST /api/mentor/actions/:id/cancel`
- `GET /api/mentor/insights`, `POST /api/mentor/insights/:id/dismiss`
- `GET /api/mentor/memory`, `PUT /api/mentor/preferences`, `DELETE /api/mentor/memory/notes/:id`, `DELETE /api/mentor/memory`
- `GET /api/mentor/tools`: catálogo e capacidades indisponíveis

### Interface (`MentorPanel.js`)

Exporta:
- `MentorPanel({ compact, onClose })`
- `mountMentorLauncher()`: botão flutuante, no mesmo `#assistant-root` do painel anterior
- `openMentor({ mensagem?, acao?, rotulo?, missaoId? })`: abrir de qualquer tela já com uma pergunta
- `mentorPageView()` e `mentorMemoryView()`

O painel tem:
- **Cabeçalho:** identidade e selo do modo (Modo Guiado / IA ativa).
- **Barra de contexto:** jornada, rodada e missão.
- **Conversa, ações rápidas e campo de texto.**
- **Cartões:** semana, compromissos, missões, jornada, finanças, oportunidades, bolsas, documentos com botão "Ficou pronto", moradias, sinais de risco, rascunho de e-mail com "Copiar", fontes.
- **Proposta:** prévia, edição, "Confirmar" / "Agora não" e o feedback real da execução.
- **Rastro:** as consultas que o Mentor fez naquela resposta.

Depois de uma ação confirmada, o painel chama `invalidate()` e dispara `padapal:data-changed`.

### Testes (`tests/mentor.test.js`)

29 testes. Cobrem:
- **Interpretação:** datas, horários, valores, missões.
- **Base de conhecimento:** procedência dos trechos.
- **Catálogo:** todas as ferramentas exigidas, com contrato.
- **Agenda:** agendar com a proposta antes da gravação, uso único, tarefa bloqueada, mover "essa tarefa", cancelar, semana com edição, pendências do dia.
- **Missões:** concluir pelo motor, dependência e evidência obrigatórias, aguardando, memória de pendência.
- **Contexto:** contexto da missão.
- **Finanças:** simulação não grava; prometido não conta.
- **Bolsas e Radar:** bolsas sem edital confirmado, Radar sem datas inventadas e com acompanhamento sem duplicar, inscrição pelo DUA.
- **Outros fluxos:** documentos (pronto ≠ validado), moradia (busca externa como limitação, anúncio suspeito), e-mail (só rascunho), chegada exige visto aprovado, pergunta fora do alcance.
- **Controles:** permissões, avisos proativos com dispensa e desligamento, contexto sem e-mail, apagar memória.
- **Provedor falso:** escrita vira proposta e não executa; a falha cai para o Modo Guiado.

### Limitações conhecidas

- A interpretação do Modo Guiado é por regras: frases muito diferentes dos padrões caem na limitação. Isso é seguro: nada é inventado.
- A base de conhecimento é lexical. Para documentos longos (manual completo), use `registerKnowledge()` e, no futuro, embeddings.
- Ainda não há análise de arquivos enviados pelo estudante.
- Não há e-mail nem push, só avisos dentro da plataforma.
- O custo de vida por cidade não tem estimativa verificada: o Mentor usa os dados do próprio estudante e diz isso.

<a id="doc-07"></a>

## 07 — Assistente de IA ("Guia")

### O que é

Um chat dentro da plataforma que tira dúvidas sobre o processo: DUA, documentos, idioma, visto, moradia e TIE. Ele responde **ancorado nas fontes cadastradas**, cita as fontes no formato [O1] e [O6] e **admite quando não sabe**.

### Dois modos

| Modo | Quando | Como responde |
|---|---|---|
| **Claude** | `ANTHROPIC_API_KEY` definida no `.env` | Modelo `claude-opus-5-5` (configurável em `ANTHROPIC_MODEL`), resposta em streaming |
| **Offline** | Sem chave, ou se a API falhar | Busca por palavras-chave na base verificada (`server/content/knowledge.js`) |

A troca é automática: se a IA cair no meio da conversa, o estudante recebe a resposta da base verificada com um aviso, em vez de uma tela de erro.

### Como a IA é controlada

- **System prompt fixo** com a base inteira: fontes, fases, missões e FAQ. Ele é estável (não leva dados do usuário), o que permite **cache de prompt** e reduz custo e latência.
- **Regras inegociáveis:** só afirmar o que está na base, citar as fontes, nunca garantir admissão ou visto, nunca generalizar idioma, separar exigência de dica, não pedir dados sensíveis e ignorar tentativas de mudar as regras.
- **Contexto do estudante** vai na mensagem do usuário: apelido, formação, área, espanhol, estado, ano, fase e status. Assim a resposta é personalizada.
- **Esforço `low`:** respostas rápidas e curtas, adequadas para chat.
- **Fallback de segurança** (`fallbacks: "default"`): se o modelo recusar por política, a API tenta automaticamente o modelo alternativo recomendado. Uma recusa final vira mensagem amigável.
- **Limites:** pergunta com até 1.500 caracteres, histórico de até 12 mensagens, 40 perguntas por hora por IP.

### Como melhorar as respostas

1. **Amplie a base:** adicione entradas em `FAQ` (`server/content/knowledge.js`) com `q`, `a`, `tag`, `fontes` e `keywords`. As keywords alimentam o modo offline.
2. **Novas fontes:** cadastre-as em `server/content/sources.js` com URL e `revisadoEm`.
3. **Avaliação:** monte um conjunto de 30–50 perguntas reais de estudantes (das entrevistas) com a resposta esperada e rode-o a cada mudança na base ou no prompt.

### Custos

Cada pergunta envia a base (alguns milhares de tokens, quase tudo servido do cache depois da primeira chamada) mais uma resposta curta. Para o piloto, o custo por estudante é baixo. Monitore o uso no console da Anthropic.

<a id="doc-16"></a>

## 16 — Planejador Financeiro Inteligente

O estudante abre a tela e vê primeiro **o resultado**: quanto custa a jornada, quanto já tem, quanto falta e o que fazer. A Estuvia estima o que tem fonte, e o estudante ajusta o resto em "Editar meus custos". Os cálculos são determinísticos (`server/finance-engine.js`) e não usam LLM.

### Três contas que nunca se misturam

| Conta | O que é | Cálculo |
|---|---|---|
| **A. Preparar a viagem** | Dinheiro antes de partir e no 1º mês | instalação + 1 mês de custos |
| **B. Manter-me no exterior** | Custo recorrente | mensal × meses da estadia |
| **C. Comprovar para o visto** | Exigência de **demonstrar** recursos, não é gasto | IPREM do ano × % × meses (`content/finance.js`, fonte O6) |

O total da jornada (`orcamento`) = instalação + mensal × meses. A comprovação do visto **não** entra nessa soma.

### Despesas (`content/costs.js`)

Cada item (ExpenseItem) tem:
- valor e moeda;
- grupo (instalação ou mensal) e categoria;
- **origem**: premissa com fonte, estudante, "Meu novo lar" ou Viagem;
- **estado**: estimado, confirmado ou pago;
- a indicação de reembolsável (caução).

| Item | Estimativa automática | Fonte |
|---|---|---|
| Moradia (quarto compartilhado, Granada) | 250 / 300 / 350 € conforme o perfil | UGR: O15 (€200–300) e O16 (€300–350). As páginas divergem e não têm data. |
| Alimentação (Espanha) | 179 € × perfil (0,85 / 1 / 1,25) | INE EPF 2024 (O17): 15,8% de €13.626/ano ÷ 12. Média nacional, não de estudante. |
| Caução | 1 mês de aluguel | Premissa explícita da Estuvia (confirme no contrato) |
| Reserva | 1 mês de custo de vida | Premissa explícita da Estuvia |
| Matrícula, documentos, taxa do visto, seguro, transporte, contas, despesas pessoais | **sem valor** (desconhecido) | Não há fonte confiável: o estudante informa |

Regras:
- **Desconhecido ≠ zero.** `valorEur: null`; o plano fica marcado como `parcial`, com `faltamInformar`.
- **Fonte única, sem dupla contagem.** A moradia escolhida em "Meu novo lar" (aluguel + adicionais e caução) e a rota escolhida na Viagem substituem a estimativa e ficam somente leitura.
- **Pago** sai de `aDesembolsar`, mas continua no total histórico.
- **Caução reembolsável:** entra na necessidade de caixa, mas `custoDefinitivo` a desconta.

### Recursos

| Grupo | Conta na meta? |
|---|---|
| Disponível (já é seu) e confirmado | sim |
| Bolsa concedida (valor confirmado) | sim |
| Prometido (apoio sem documentos) | não |
| Bolsa solicitada | não |
| A verificar | não |

Valores em reais sem taxa de câmbio ficam fora da conta, com aviso. O custo de conversão (spread/IOF %) é aplicado ao dinheiro em reais.

### Câmbio (`server/fx.js`)

- **Taxa automática:** taxa de referência do **BCE via api.frankfurter.app**, com cache de 6 h. A tela mostra fonte, data da cotação e hora da atualização.
- **Taxa manual:** fica marcada como "informada por você".
- **Sem serviço disponível** (ou com `FX_PROVIDER=off` ou durante os testes): não há taxa automática, e nenhuma taxa é fingida.

### Cenários e alternativas

- **Perfis:** econômico, equilibrado, confortável e personalizado, com premissas visíveis. A comparação lado a lado mostra instalação, mês, total, reserva e diferença em relação aos recursos.
- **Cenários salvos:** `POST /finance/scenarios`, e `PUT /finance/scenarios/:id/principal` para torná-lo o principal.
- **Quando falta dinheiro**, a tela oferece: procurar bolsas, plano de economia mensal até a partida, apoio da família, reduzir custos, **simular outra data de partida** (`partida`) e comparar destinos. Também há o botão "Decidir com o Mentor".

### Integrações

- **Jornada:** destino, mestrado, ano e duração (editável).
- **Moradia e Viagem:** valores escolhidos.
- **Bolsas:** concedida ou solicitada.
- **Agenda AI:** itens com `vencimento` e ainda não pagos aparecem nos prazos (`financialDeadlines`).
- **Missões:** 1.5 e F.1 se marcam ao "Calcular meus custos" (`planoIniciado`).
- **Assistente/Mentor:** ações `custo`, `suficiente` ("Tenho R$ 20.000, é suficiente?", só simula) e `guardar` (quanto guardar por mês). O Mentor (docs/15) lê `computeFinance`.
- **Durante a estadia** (depois da chegada): lançamento de gastos reais, comparando o previsto com o realizado por categoria (`POST /finance/spending`).

### API

- `GET /finance?journeyId=`
- `PUT /finance` com `{ perfil?, itens?: {id: {valor|null, moeda, status, vencimento} | null}, cambio?, spreadPct?, partida?, iniciar?, informouRecursos?, nenhumaBolsaAplicavel? }`. O campo legado `custos` continua aceito.
- Recursos: `POST|PUT|DELETE /finance/resources`. Status possíveis: `disponivel`, `confirmado`, `prometido`, `previsto`, `solicitado`, `a-verificar`. O campo opcional `origem: 'rapido'` marca a entrada "Quanto dinheiro você já tem?".
- Bolsas: inalteradas.
- Cenários: `/finance/scenarios`.
- Gastos reais: `/finance/spending`.

Testes em `tests/finance.test.js`, cobrindo os critérios 1–18 aplicáveis ao cálculo.

<a id="doc-19"></a>

## 19 — Meu Novo Lar (missões 6.1 e 6.2)

O fluxo é **Encontrar → Salvar → Comparar → Verificar → Escolher**. A tela não abre com formulário. Ela mostra o destino (vindo da jornada), duas ações ("Procurar moradias" e "Adicionar anúncio que encontrei") e os cards das opções salvas.

### O que a Estuvia faz e o que não faz
- **Não busca nem lê anúncios.** Não há integração autorizada, nem scraping, e nenhum imóvel fictício aparece como resultado de busca.
- **Busca guiada** em 3 perguntas: tipo, orçamento e preferências. Depois, aponta **onde procurar**, só com links conferidos (`content/housing.js → SEARCH_SOURCES`, em 24/10/2026). Em Granada: Spotahome, Uniplaces, HousingAnywhere, Fotocasa (apartamentos) e a página oficial da UGR (O16). Idealista bloqueia a conferência automática, o link da Badi está fora do ar (404) e o da página da UGR em `ugr.es/estudiantes/servicios/alojamiento` também (404); por isso os três ficaram de fora.
- **Faixas de orçamento** só onde há fonte: quarto compartilhado em Granada, com €250 / 300 / 350 tirados das páginas O15 e O16 da UGR. Nos outros casos, o estudante informa o próprio limite.
- **Adicionar por link:** do link, só o nome do site é reconhecido (`siteOf`). O estudante preenche só o essencial (título, preço mensal, tipo e bairro) e completa o resto depois.
- **Fotos** adicionadas pelo estudante ficam só no dispositivo (IndexedDB, scope `<userId>:moradia:<id>`). São reduzidas no navegador e nunca enviadas ao servidor. Sem foto, aparece um espaço reservado neutro por tipo, sem imagem inventada.

### Dados (compatíveis com o que já estava salvo)
`user.housing[]`: `nome, tipo, bairro, aluguel, adicionais, contasIncluidas, caucao, taxaAgencia, entrada, duracaoContrato, link, fonte, distancia, notas, status, checklist, sinais`.

- **Situações:** `quero-conhecer · contato · aguardando · visitado · contrato · escolhida · descartada`. Os valores antigos `pesquisando` e `negociando` são aceitos e convertidos (`normStatus`).
- **Uma só escolhida:** ao escolher outra, a anterior volta para "contrato em análise".
- **Busca guiada:** `user.housingSearch = { tipo, orcamentoMax, preferencias[], comparadoEm }`.

### Custos (`server/housing-engine.js`, testado)
- **Mensal** = aluguel + contas/despesas. Com "contas incluídas", as contas valem 0. Se nada foi informado, as contas ficam **desconhecidas**, nunca zero.
- **Para entrar** = 1º aluguel + caução + taxa de agência. Sem caução informada, o valor aparece como "+ ?".
- **Total da estadia** = mensal × meses + taxa. A **caução é reembolsável** e fica fora do gasto definitivo.
- **Comparação** (2 ou 3 opções, `POST /living/compare`): frases sobre as diferenças, como "custa €80 a menos por mês, mas exige uma caução €220 maior", e o efeito na estadia inteira. Ela lista o que falta saber e avisa que o menor preço não é a melhor escolha automaticamente.

### Conferir antes de pagar
São 6 perguntas: identidade, contrato, imóvel, valor total, caução e pedido de pagamento antecipado (essa última é invertida). Cada resposta pode ser **Sim** (`checklist[id]=true`), **alerta** (`sinais[id]=true`) ou **não sei**. O resultado é `alerta`, `incompleto` ou `conferido`, e a interface **nunca diz "seguro"**. As perguntas aparecem no detalhe da opção, na comparação e no momento de "Selecionar como minha moradia", que mostra os alertas antes de confirmar.

### Integrações
- **Planejamento financeiro:** a moradia escolhida alimenta aluguel, contas e caução (reembolsável), sem duplicar. As contas desconhecidas continuam desconhecidas. Sem caução informada, vale a premissa de 1 mês. Trocar de moradia troca o plano.
- **Missões:**
  - 6.1: "Salvar ao menos 2 opções" (`temMoradias`) e "Comparar as opções" (`comparouMoradias`). É uma trilha paralela, então dá para explorar antes do visto.
  - 6.2: "Registrar a escolhida" e "Conferir contrato, valor total e caução" (`contratoConferido`). Nenhum campo é exigido só para avançar.
- **Agenda AI:** "Conversar com o anunciante", "Visitar ou fazer vídeo-chamada", "Verificar o contrato" e "Conferir as condições de pagamento" viram lembretes na agenda, com a etiqueta "Meu Novo Lar". A Estuvia não agenda com terceiros.
- **Mentor:** botões com o contexto do anúncio: "Esse anúncio parece suspeito?", "Qual fica mais barata?", "Dicas para encontrar" e "Me ajuda a escrever ao proprietário". Também há um rascunho de mensagem em espanhol para o estudante revisar e copiar; nada é enviado pela Estuvia.

Testes em `tests/housing.test.js`.

<a id="doc-20"></a>

## 20 — Minha Viagem (missões 6.3 a 6.5)

Planejador visual da viagem. A Estuvia **organiza as possibilidades** e o estudante avança por etapas: pesquisando → cotação salva → rota escolhida → passagem comprada → viagem concluída.

**Regra principal:** nada de voo, horário, duração ou preço inventado. Os percursos são possibilidades, não voos. Preço, horário e companhia só aparecem quando o estudante informa. Sem cotação, a tela mostra "Preço a consultar", e um valor desconhecido é `null`, nunca 0.

### Telas

| Situação | O que aparece |
|---|---|
| Pesquisando / cotação salva | **Hero** com origem (sugerida pelo estado, com confirmação simples), destino, universidade e data, vindos da jornada. Depois: "Encontrar minha rota" (busca guiada), "Já encontrei uma passagem", os **cards de percurso** e o **comparador** |
| Rota escolhida / comprada / concluída | **Painel "Minha próxima viagem"**: data, rota, custo previsto, etapas da situação e ações (itinerário, comparar outra rota, editar, Agenda AI, documentos, chegada). Abaixo: **itinerário**, **chegada**, **custo no planejamento** e **compromissos da viagem** |

**Visto:** aparece como um aviso discreto e expansível. Não bloqueia a pesquisa. Sem visto aprovado, a compra recomenda tarifa com remarcação, e o comparador alerta sobre tarifa não reembolsável.

### Percursos (`server/content/travel.js`)

Para Granada: **Via Madri**, **Via Málaga** e **Direto ao aeroporto de Granada**. Cada um tem:
- as etapas e os aeroportos;
- se há trecho por terra até a cidade;
- os cuidados (troca de meio de transporte, bilhetes separados, poucas conexões);
- as fontes oficiais: páginas da Aena dos três aeroportos e da Renfe, conferidas em 25/10/2026. A ALSA fica com "confira no site".

Os links de pesquisa (Google Voos e Skyscanner) recebem origem, destino e data. O preço real o estudante vê no próprio site.

### Cotação por link

`POST /api/travel/quotes/parse-link` lê **apenas o que está escrito na URL**:
- Skyscanner: origem, destino e data no caminho;
- Kayak: `REC-AGP/2027-09-01`;
- outros sites: parâmetros comuns como `origin`, `destination` e `date`.

O site não é acessado. Sem dados no link, basta informar nome da rota, preço, data e link; o resto fica em "Mais detalhes": bagagem, trecho por terra, transporte local, pernoite, conexões, malas incluídas, horário de chegada, companhia, tarifa e bilhetes separados. A data da cotação é registrada.

### Comparação e custos

- Total = voo + bagagem + trecho até a cidade + transporte local + pernoite + outros, contando só os itens informados.
- Uma cotação **incompleta** (sem bagagem ou sem o trecho por terra de um percurso que exige isso) mostra "o total pode subir" e **não concorre** a "menor custo".
- O comparador mostra alertas por cotação: 2 ou mais conexões, bilhetes separados, chegada de madrugada (risco de pernoite), tarifa não reembolsável e bagagem não informada.
- **Financeiro:** a rota escolhida entra **uma única vez** como "Passagens", com o detalhamento na nota. O status é "estimado" enquanto for cotação e "confirmado" depois de marcada como comprada (`routeTotal` e o status do item estão em `finance-engine.js`).

### Itinerário e chegada

O itinerário é montado a partir do percurso escolhido e dos dados da cotação: origem, trechos, cidade e **moradia escolhida no "Meu novo lar"**. Cada etapa mostra meio de transporte, operador, data, horário de chegada e custo quando informados; o resto aparece como "Detalhes a definir".

A chegada é preenchida pela rota, por exemplo "Você vai chegar a Madri e precisa seguir até Granada". Ela mostra as opções do aeroporto até a cidade, com fontes oficiais, e "Como vou chegar à minha moradia?". Ao salvar, o meio escolhido entra no itinerário. Sem moradia, a tela mostra "Você ainda não escolheu onde vai ficar." e o botão **Organizar minha moradia**.

### Agenda AI

A partir da data da viagem, a tela sugere estes compromissos: conferir documentos (D-7), preparar a bagagem (D-3), check-in (D-1), sair para o aeroporto, voo, deslocamento até a cidade e entrada na moradia.

- O estudante marca quais quer criar.
- Horários desconhecidos ficam para ele definir.
- Os eventos têm origem `viagem` e não são duplicados.
- Se a data da viagem mudar, a tela propõe novas datas, e **nada muda sem confirmação**.

### Mentor

A ferramenta de leitura `get_travel_plan` responde, no Modo Guiado, a estas perguntas:
- "Qual é a melhor forma de chegar a Granada?" e "Compensa mais ir por Madri ou Málaga?": compara só cotações completas e, se não houver, explica o que falta;
- "Quanto vou gastar com bagagem?";
- "Essa conexão é muito curta?": diz que não tem o tempo exato e explica bilhete único × separado;
- "Como chego do aeroporto até minha casa?";
- "Minha passagem mudou, reorganiza minha viagem."

### API (`/api/travel`)

- `GET /`
- `PUT /profile`
- `POST /quotes/parse-link`
- `POST|PUT|DELETE /quotes(/:id)`
- `POST /quotes/:id/choose`
- `POST /quotes/:id/purchase {comprada, tarifa?, confirmo:true}`
- `PUT /arrival`
- `POST /done`
- `POST /agenda {itens}`
- `POST /agenda/changes {aceitar, recusar}`

As rotas antigas `/api/living/travel/*` continuam válidas e usam os mesmos dados.

### Arquivos

| Arquivo | Conteúdo |
|---|---|
| `server/content/travel.js` | Percursos, aeroportos e links de pesquisa |
| `server/travel-engine.js` | Estado, custos, comparação, itinerário, chegada e agenda |
| `server/routes/travel.js` | API |
| `public/js/components/travel/TravelDashboard.js` | `TravelHero`, `TravelStatusCard`, `RouteDiscovery`, `TravelRouteCard`, `FlightQuoteImporter`, `RouteComparison`, `TravelItinerary`, `TravelSegment`, `ArrivalPlanner`, `TravelCostSummary`, `TravelAgenda` |
| `public/css/travel.css` | Estilos |
| `public/img/travel/*.svg` | Ilustrações dos percursos |
| `server/mentor/tools/travel.js` | Ferramenta do Mentor |
| `tests/travel.test.js` | Testes |

**Limitações:**
- Não há integração com buscadores, por isso não aparecem preços ao vivo.
- Os percursos estão cadastrados só para Granada; outras cidades mostram apenas as cotações do estudante.

<a id="doc-21"></a>

## 21 — Minha Carteira de Documentos

A carteira responde, ao abrir: **"Estes são os documentos que preciso agora, estes já tenho, estes estão pendentes, e aqui descubro como conseguir cada um."**

Ela é um cofre digital personalizado. Cada documento existe uma vez só e serve a todas as etapas e missões que o usam. A tela principal mostra só o que importa no momento: o resto fica em categorias que se abrem uma de cada vez.

### Arquivos

| Arquivo | Papel |
|---|---|
| `server/content/document-catalog.js` | **Catálogo**: 17 categorias, ~185 tipos de documento, o uso de cada um por categoria (244 itens), condições do estudante, estados, papéis de arquivo e guias de apostila e tradução |
| `server/content/documents.js` | Mescla o catálogo com os campos da primeira versão (os 25 ids antigos continuam iguais) e exporta `DOCUMENTS` no formato que missões, Mentor e admin já usam |
| `server/document-engine.js` | Regras puras: condições, aplicabilidade por uso, estado detalhado, validade, itens-checklist, painel, categorias, busca e integração com missões |
| `server/document-rules.js` | Revisões editoriais (aviso, data, fontes) gravadas em `data/document-rules.json` |
| `server/routes/documents.js` | API `/api/documents/*`, arquivos cifrados, consentimento e links assinados |
| `server/routes/admin.js` | `GET/PUT /api/admin/document-rules[/:docId]` (só admin) |
| `public/js/views/documents.js` | Tela `#/documentos[/<id>]` |
| `public/js/components/documents/*` | `DocumentDetailPanel`, `DocumentUpload` (prévia, papel, consentimento), `MissionDocuments` (central da missão), `MyFolder`, `shared` |
| `tests/documents.test.js`, `tests/wallet.test.js` | Testes de API |

### Catálogo

**Categorias:**

1. Pessoais
2. Acadêmicos brasileiros
3. Candidatura
4. Admissão e matrícula
5. Financeira
6. Visto
7. Saúde
8. Moradia
9. Viagem
10. Empadronamiento
11. NIE e TIE
12. Universidade na Espanha
13. Banco
14. Trabalho e estágios
15. Familiares
16. Complementar
17. Renovação

Cada categoria tem nome, ícone, descrição e etapa da jornada.

**Documento canônico (`DOC_TYPES`):**

- **Textos:** o que é, para que serve, onde conseguir e quando solicitar. Quando o documento não traz algum deles, vale o padrão da categoria (`CATEGORY_DEFAULTS`).
- **Apostila e tradução:** `'talvez'` ou `'nao'`. Nunca são "sempre".
- **Validade:** `'data'` (tem vencimento impresso) ou `'recencia'` (o órgão pode exigir emissão recente; não inventamos prazo).
- **Arquivos:** `partes` (frente/verso) e `multiplos`.
- **Referências:** `fontes`, missões extras, `agregado` (item-checklist que reúne outros documentos) e `atendidoPor` (ex.: a média final pode estar no histórico).

**Uso por categoria (`CATEGORY_USES`):** `[docId, classe O/C/R, { cond, condicao, rotulo, nota, etapa }]`.

- **Referências, não cópias:** o passaporte é um documento só. Aparece em pessoais, visto, viagem, NIE/TIE, banco, trabalho e renovação, cada vez com o rótulo daquele uso (ex.: "Cópia do passaporte").
- **`etapa`:** usada quando o momento do uso difere da categoria. A foto e o comprovante de residência são pessoais, mas são usados no visto.

### Classificação contextual

| Uso | Condição do estudante | Exigência mostrada |
|---|---|---|
| O | sem condição, ou condição confirmada | **Exigido para você** |
| O ou C | condição ainda desconhecida | **A confirmar** |
| C | condição confirmada (ex.: curso > 6 meses → EX-17) | **Exigido para você** |
| C | sem condição verificável (ex.: "se o programa pedir") | **Conforme o caso** |
| R | — | **Recomendado** |
| qualquer | condição falsa | **Não se aplica** (fora das pendências) |

Um documento usado em várias categorias recebe a exigência mais forte entre os usos que valem.

A contagem de pendências só inclui o que é **exigido para você**. "Conforme o caso" e "Recomendado" aparecem nas categorias, mas não assustam como pendência.

#### Minha situação (condições)

- **Detectadas pela jornada:**
  - moro no Brasil (perfil);
  - curso > 6 meses (duração);
  - certificado de espanhol (ficha do mestrado);
  - bolsa concedida e patrocinador (finanças);
  - visto aprovado e chegada (jornada).
- **Informadas pelo estudante (padrão "não"):**
  - acompanhantes, cônjuge, filhos, menor de idade;
  - representante, mudança de nome, diploma pendente, outras graduações;
  - residência em outros países, necessidades especiais;
  - medicamentos, animal, veículo, NIE anterior;
  - trabalho, renovação.

Tudo pode ser corrigido em **Minha situação** (`PUT /documents/conditions`). `null` volta ao valor detectado.

Exemplos:

- Curso de até 6 meses: EX-17, TIE e antecedentes viram "Não se aplica".
- Sem acompanhantes: a categoria 15 fica oculta.
- Sem intenção de renovar: a categoria 17 fica fora da jornada principal.
- Bolsa concedida: a documentação da bolsa passa a ser exigida.
- Visto aprovado: o foco ("Seus próximos documentos") passa para viagem e moradia.
- Chegada registrada: o foco passa para empadronamiento, TIE e matrícula.

### Estados (12)

| Estado | Status interno (lido pelas missões) |
|---|---|
| Não iniciado · Preciso solicitar | `pendente` |
| Aguardando emissão · Documento recebido · Arquivo enviado · Precisa de tradução · Precisa de apostilamento | `em-preparacao` |
| Pronto para utilização | `pronto` (ou `enviado`, com registro de envio) |
| Precisa de correção · Vencido | `correcao` |
| Dispensado · Não aplicável | `nao-se-aplica` |

- **Onde fica:** `user.documents[docId]` continua sendo a fonte do status. O estado detalhado fica em `docRecords[docId].estado`, junto com o `estadoBase` em que foi registrado. Se o status mudar por outro caminho (missão, Mentor, envio), o estado volta a ser derivado.
- **Calculados, nunca escolhidos à mão:** "Vencido" (validade passada) e "Não aplicável" (pelas condições).
- **Apostila/tradução:**
  - Marcar "o órgão pediu" num documento pronto o leva para "Precisa de apostilamento" (ou tradução).
  - Anexar um arquivo com papel `apostila`/`traducao` marca a apostila (ou tradução) como pronta.
  - A Estuvia nunca marca apostila ou tradução como necessárias sozinha.
- **Confiança, sempre separada:** declarado · anexado · conferido por você · aceito no procedimento (registrado por você). A Estuvia verifica só se o arquivo existe; nunca afirma aprovação oficial.

### Arquivos

- **Formatos:** PDF, JPG/JPEG, PNG e WEBP, até 10 MB. O tipo é conferido pelos bytes.
  - PDFs com conteúdo ativo (`/JavaScript`, `/OpenAction`, `/Launch`, arquivos embutidos, XFA) são recusados.
- **Limites:** 80 arquivos e 200 MB por estudante.
- **Papel do arquivo:**
  - Valores: original, frente, verso, documento apostilado, apostila, tradução, comprovante da tradução, cópia, outro.
  - Agrupamento: arquivos com papéis diferentes ficam no mesmo documento. Diploma original, apostilado e traduzido são três arquivos de um só documento.
- **Antes de salvar:** prévia, nome sugerido (editável) e papel. Depois, dá para corrigir papel e nome (`PATCH /documents/files/:fid`).
- **Versões:**
  - Substituir cria uma nova versão na mesma série.
  - Com "Guardar versões antigas" desligado (`PUT /documents/prefs`), a versão anterior é apagada do disco.
- **Upload opcional:** marcar "Já tenho" conclui sem enviar arquivo sensível.

### Segurança e privacidade

- **Acesso:**
  - Sessão obrigatória em todas as rotas e autorização por estudante (um não acessa o arquivo do outro).
  - Sem URL pública: cada link de arquivo é **assinado (HMAC) e expira em 15 min**, válido só para o dono.
- **Armazenamento:**
  - Arquivos cifrados em disco (AES-256-GCM) em `DOCS_DIR`, fora de `public/`.
  - Em produção, defina `DOCUMENTS_KEY` e faça backup da chave.
- **Na entrega:** `Cache-Control: private, no-store`, `nosniff`, e imagens servidas em `sandbox`.
- **Consentimento:**
  - Exigido antes do primeiro arquivo (`POST /documents/consent`, versão `2026-10-27`).
  - O texto diz que os arquivos não vão para IA nem para treino de modelos e que podem ser excluídos.
  - Arquivos guardados antes desta versão continuam acessíveis; o consentimento só é pedido para novos envios.
- **Credenciais:** observações, emissor, notas de envio e nomes de "Outro documento" recusam texto que pareça senha, PIN, CVV, token ou código de acesso.
- **Exclusão e portabilidade:**
  - Exclusão definitiva de todos os arquivos (`DELETE /documents/files` com `{ confirmar: 'EXCLUIR' }`).
  - Exclusão da conta apaga a pasta.
  - A exportação (LGPD/RGPD) inclui metadados, condições, consentimento e preferências, sem iv e tag.
- **Mentor:** não lê arquivos.

### Integração com missões

- **Quais documentos cada missão usa:** `documentos` das missões em `rounds.js`, mais `prepara`, mais `missoes` do catálogo (ex.: foto e cita da TIE → missões 8.x).
- **Contrato (`GET /documents/missions/:jid/:mid`):** devolve `{ prontos, faltam, conformeCaso, naoNecessarios }`. Cada item traz uma mensagem como "Você ainda não adicionou seu histórico à Carteira." e, quando é o caso, `atendivelPor`.
- **Na central da missão:** cada documento oferece *Enviar arquivo*, *Já tenho*, *Meu histórico já mostra isso* e *Ver como conseguir*.
- **Nos dois sentidos:**
  - Atualizar na carteira atualiza todas as missões.
  - Concluir a missão de preparo promove o documento (uma vez, sem rebaixar).
  - As regras automáticas das missões continuam lendo `user.documents`.

### Validade e alertas

- **Documentos com `validade: 'data'`** (passaporte, visto, seguro, TIE, CNH…): registram a data de vencimento.
  - Alerta quando falta menos que a janela escolhida (padrão 60 dias; 30, 90 ou 180).
  - Passaporte, visto e seguro também alertam se vencem antes do fim previsto da estadia.
  - Data passada → "Vencido".
- **Documentos com `validade: 'recencia'`** (antecedentes, atestado, extratos, certidões, empadronamiento): registram a data de emissão. Depois de 90 dias aparece um aviso para conferir o prazo aceito na fonte, nunca um vencimento inventado.
- **Diploma e documentos sem validade** não aceitam data de vencimento.

### Fontes e revisão das regras

- Cada documento aponta fontes de `content/sources.js`. As fontes O18 a O27 foram acrescentadas e conferidas em 27/10/2026: CNJ (apostila), Policía Nacional, cita previa, MAEC, PF (antecedentes e passaporte), tradutores juramentados, Seguridad Social, Receita e Ministério da Saúde.
- **Para mudar uma regra:** edite o catálogo (todas as telas leem dele) ou registre uma revisão editorial pelo admin:
  - `aviso`: texto curto mostrado no detalhe;
  - `revisadoEm`: data da revisão;
  - `fontes`: substituem as do catálogo.
- O detalhe mostra "Informação revisada em…" e lembra que regras mudam.

### Ordem fixa: necessários → opcionais → contingência

Em toda a plataforma (carteira, categoria, missão, rodada e busca), os documentos aparecem nesta ordem:

| Grupo | O que é | Exigência interna |
|---|---|---|
| **Documentos necessários** | Exigidos para o seu caso | `requerido` |
| **Documentos opcionais** | Não são exigência, mas ajudam | `recomendado` |
| **Documentos de contingência** | Só se o procedimento pedir ou a sua situação mudar | `condicional` / `verificar` |

Na missão e na categoria, "Necessários" fica aberto e os outros grupos ficam recolhidos.

### Missões e rodadas → Documentos

- **Missão de preparo:** concluir a missão que prepara o documento (`prepara`) grava o documento como pronto na Carteira **na mesma gravação**, inclusive quando a conclusão vem pelo Mentor. Exemplo: 2.1 Preparar meu passaporte → Passaporte.
  - A resposta traz o evento `carteira`, e a tela avisa "Guardado na sua Carteira".
  - Missões de preparo: 2.1 a 2.6, 3.6, 3.7, 4.5, 4.6, 5.4, 5.5, 5.7, 5.9, 6.3, 7.9, 8.3 a 8.6 e 8.8.
- **Central da missão:** toda missão que usa documento mostra o card **Documentos desta missão**. O arquivo enviado ali vai para a Carteira, na categoria certa, com a missão de origem registrada (`missaoId`).
  - O bloco antigo, que guardava o anexo só no navegador, foi substituído.
- **Rodada:** a tela da rodada mostra "Documentos · X/Y prontos" e o que falta (`GET /documents/rounds/:jid/:n`).
- **Na Carteira:** o documento mostra a rodada e a missão de onde vem ("é aqui que você consegue este documento").

### Tela (simples)

1. **Topo:** título e três números (prontos, para fazer, atenção).
2. **Para agora:** até 5 documentos da etapa atual, mais "Comece cedo" (recolhido).
3. **Busca:** os filtros ficam escondidos no botão "Filtros".
4. **Categorias:** quadradinhos com ícone, nome e "3/6". Abrem uma de cada vez.
5. **Linhas recolhidas:** categorias que não se aplicam, Minha situação, Minha pasta e Privacidade.
6. **Detalhe do documento:** "Você já tem?" (Já tenho · Preciso pedir · Já pedi · Ajuda) e os arquivos. O resto fica recolhido.

### Próximos passos

- Conferência visual no navegador (desktop e celular). As telas foram feitas sem teste em navegador.
- Pré-visualização de PDF dentro da página. Hoje o PDF abre em nova aba, porque a CSP bloqueia `blob:`.
- Listas por consulado: hoje a lista é a geral, com o link do consulado do estudante.
- Migrar o armazenamento para um serviço de objetos com cifra no servidor, mantendo a mesma interface.

<a id="doc-17"></a>

## 17 — Resultados estruturados

Quando a Estuvia já sabe a resposta, a tela mostra o **resultado**, não um parágrafo com um link para o estudante pesquisar. As ferramentas (missões, Mentor, Radar…) devolvem dados `{ tipo, ... }` e o front escolhe o componente pelo tipo. O modelo de linguagem pode explicar o resultado, mas os dados vêm sempre de uma base verificada.

### Formato de todo resultado

| Bloco | O que mostra |
|---|---|
| **A. Resultado** | Ícone, selo de estado (cor = situação) e título curto ("Encontramos seu consulado!") |
| **B. Informação essencial** | Um destaque e poucos campos. Os campos úteis podem ser copiados |
| **C. Próxima ação** | **Um** botão principal, com ação específica ("Ver documentos do meu visto") |
| **D. Ajuda opcional** | Ações secundárias discretas, detalhes recolhidos e a fonte oficial com a data de verificação |

### Arquivos

| Arquivo | Papel |
|---|---|
| `public/js/components/ResultCard.js` | Contém `ResultCard` (genérico) e os componentes `ConsulateResult`, `ChecklistResult`, `OpportunityResult` e `ActionResult`. `renderResult(dados, opts)` escolhe o componente pelo tipo; `registerResult(tipo, fn)` registra tipos novos |
| `public/css/results.css` | Estilos dos cartões, carregados pelo próprio componente. Usa só os tokens do tema (claro e escuro), tem layout responsivo e respeita `prefers-reduced-motion` |
| `server/content/places.js` | Base verificada de jurisdições consulares e a função `consulateResult()` |
| `tests/places.test.js` | Garante que cada estado tem uma única repartição e que um estado sem dado confirmado não gera consulado inventado |

### Consulado (primeiro caso)

- **Base:** `CONSULATES` (5 repartições) e `CONSULAR_JURISDICTIONS` (uma linha por estado: país, estado, consulado, serviço, contatos, URL da fonte, data de verificação). Os dados foram conferidos em 24/10/2026 nas páginas de *Demarcación* e de contato de cada repartição em exteriores.gob.es:

  | Repartição | Estados |
  |---|---|
  | Consulado Geral em Salvador | BA, SE, AL, PE, PB, RN, CE, PI, MA |
  | Seção Consular da Embaixada em Brasília | DF, GO, AM, PA, MT, TO, RO, RR, AC, AP |
  | Consulado Geral em São Paulo | SP, PR, MS |
  | Consulado Geral no Rio de Janeiro | RJ, MG, ES |
  | Consulado Geral em Porto Alegre | RS, SC |

- **E-mail:** `emailVistos` só existe quando a página oficial publica um e-mail específico de vistos (Salvador e Rio). Nos outros casos o cartão mostra "E-mail geral do consulado" ou "E-mail da seção consular" e explica isso.
- **Links diretos:** o link principal vai para a página do **visto de estudos** do consulado, não para a página inicial do ministério. Sem dado confirmado (`nao-confirmado`, `fora-do-brasil`), o cartão diz isso com clareza e leva à página oficial de repartições, sem adivinhar.
- **Onde aparece:**
  - Missão 5.1 (`MissionGuide.consulateStep`): "Ver documentos do meu visto" conclui a 5.1, usando o consulado como evidência, e abre a 5.3.
  - Ferramentas da missão (`MissionTools`).
  - Mentor: a ferramenta `find_consulate` e o intent "qual é o meu consulado?", que aceita a sigla ou o nome do estado.

### Mentor

O orquestrador transforma o resultado de cada ferramenta em cartão (`cardFor`). Tipos sem renderizador próprio no `MentorPanel` caem em `renderResult(c, { compacto: true })`. Para criar um cartão novo:

1. Faça a ferramenta devolver `{ tipo: '<novo>', ... }`.
2. Registre o componente com `registerResult('<novo>', fn)`, seguindo o formato A/B/C/D.

### Para manter

- Ao rever a base consular, atualize `VERIFICADO_EM` em `places.js` e confira as páginas de *Demarcación*.
- Os próximos tipos previstos são: programa acadêmico (Radar), bolsa com compatibilidade, checklist de documentos, comparação de moradias e proposta de calendário. Os componentes `OpportunityResult` e `ChecklistResult` já existem para esses casos. O resumo financeiro é do planejador (`16-planejador-financeiro.md`).

<a id="doc-18"></a>

## 18 — Central da missão (MissionHub)

A página principal de uma missão é uma **central de ferramentas**, no formato da referência visual de "Conteúdo da Missão":

```
Cabeçalho   Jornada | Rodada | Missão
Progresso   "SEU PROGRESSO NESTA MISSÃO" · X de Y objetivos · barra · descrição curta · objetivos → ferramenta que ajuda
Alertas     prazo e risco, em uma linha cada
Conclusão   aparece quando todos os objetivos estão feitos (com evidência, se a missão exigir)
Grade       cards grandes: ícone em círculo colorido, título, descrição, dica com o estado real
Mentor      acesso discreto, já com a missão no contexto
Rodapé      experiências de outros estudantes · fontes e detalhes
```

A página principal **organiza**. Os cards **dão acesso** às ferramentas. As ferramentas, abertas num painel lateral, **orientam e executam**. O progresso registra o que foi feito. O passo a passo (`MissionGuide`) continua existindo dentro da ferramenta "Passo a passo" / "Fazer agora".

### Arquivos

| Arquivo | Conteúdo |
|---|---|
| `public/js/components/mission-hub/MissionHub.js` | `MissionHub(m, ctx)` e os componentes `MissionOverviewHeader`, `MissionProgressCard`, `MissionToolsGrid`, `MissionToolCard`, `MissionMentorAccess`, `MissionCompletionFeedback` e os painéis genéricos (guia, site oficial, documentos, agenda, entender melhor) |
| `public/js/components/mission-hub/finance-panels.js` | Simulador, Comprovação financeira, Meu dinheiro (`MissionResourcePanel`), Alternativas e Bolsas |
| `public/js/components/mission-hub/tools-config.js` | Quais ferramentas cada missão mostra |
| `public/js/components/mission-hub/hub-icons.js` | Ícones extras (calculadora, cofrinho, lâmpada, escudo com check, calendário) |
| `public/css/mission-hub.css` | Layout: 3 colunas no desktop, 2 no tablet, 1 no celular. Usa só as variáveis do tema |

`views/mission.js` usa `MissionHub` para as missões liberadas. A missão bloqueada continua com `LockedMission`.

### Quantidade de cards = complexidade real

Missões com central própria em `MISSION_TOOLS`:

| Missão | Cards |
|---|---|
| 1.5 Planejamento financeiro inicial | Simulador financeiro (destaque) · Comprovação financeira · Meu dinheiro · Alternativas de financiamento · Bolsas disponíveis · Meu planejamento |
| 2.1 Passaporte | Conferir meu passaporte · Solicitar ou renovar · Preciso de ajuda |
| 6.3 Comprar passagens / 6.5 Organizar chegada | Minha viagem / Minha chegada (abre `#/viagem`, que marca os objetivos automáticos) · Passo a passo · Agenda / ajuda |
| 5.4, 9.1, 9.2, 9.3, 9.4, 9.10 | Subconjuntos das ferramentas financeiras, de 3 a 6 cards |

As demais missões são compostas automaticamente a partir dos dados da missão:
- **simples:** até 3 cards ("Fazer agora", site oficial, ajuda);
- **guiada:** até 5 cards (passo a passo, ferramenta da missão, documentos, site oficial, agenda);
- **complexa:** até 8 cards (inclui "Entender melhor").

Um card só aparece se houver conteúdo real para ele.

### Progresso e conclusão

- O progresso vem **somente** dos objetivos do motor da jornada.
- Uma ferramenta pode declarar `objetivos: ['custos']`. Nesse caso, o card mostra o selo "objetivo" enquanto ele está pendente, e o objetivo no card de progresso ganha um atalho para essa ferramenta.
- As outras ferramentas são complementares e **não bloqueiam** a conclusão.
- Na 1.5:
  - "Calcular minha estimativa" (Simulador) cumpre o objetivo 1 com as premissas da Estuvia (`PUT /finance {iniciar:true}`).
  - Registrar qualquer recurso, ou "Ainda não tenho nada", cumpre o objetivo 2.
  - Com 2/2, aparece "Concluir missão".
- **Desconhecido ≠ zero:** sem recursos informados, a interface mostra "—" e "Ainda não informado", nunca "faltam €7.200". Apoio prometido fica em "Previsto (não conta)". Bolsa só entra como concedida.
- Ao fechar uma ferramenta em que algo mudou, a missão é recarregada e o progresso e as dicas dos cards são atualizados.

### Para configurar uma missão nova

Acrescente uma entrada em `MISSION_TOOLS` com `ferramentas: [...]`. Cada ferramenta tem:
- `painel`: um dos painéis existentes;
- `titulo`, `desc`, `ic`, `cor`;
- `destaque`: opcional;
- `objetivos`: opcional. Use os ids de objetivo, ou `'*'` para o passo a passo.

Para criar um painel novo, acrescente um `case` em `panel()`, em `MissionHub.js`.

<a id="doc-11"></a>

## 11 — Radar de Oportunidades

Central que **descobre e monitora** oportunidades de estudo no exterior a partir de fontes oficiais e as conecta à jornada:
**Radar → Jornada → Rodadas → Missões → Agenda AI → Assistente de IA.**

Princípio: nenhum dado sobre abertura de inscrições é apresentado como confirmado sem fonte oficial, e **nunca** reaproveitamos o calendário de um ano como se fosse de outro. O ano anterior aparece somente como "Referência histórica", identificado como tal.

### Estado atual (Etapas 1, 2 e 3 entregues; Etapa 4 pendente)

| Etapa | Situação |
|---|---|
| 1 — Radar funcional (UGR + catálogo DUA) | ✅ Catálogo oficial da UGR (138 másteres, curso 2026/2027), cards, filtros, detalhe, links oficiais. O conector DUA consulta o catálogo das nove universidades públicas andaluzas e da UNIA; ele registra nome e ficha oficial, sem inferir requisitos não coletados. Calendário DUA 2026/2027 cadastrado; 2027/2028 aparece como **Não anunciado**. |
| 2 — Monitoramento automatizado | ✅ Conectores do calendário DUA, do listado UGR e das fichas UGR; snapshots com hash; comparação; validação; fila de revisão; agendador. |
| 3 — Alertas e Agenda AI | ✅ "Avise-me quando abrir", alertas sem duplicação, sugestões de Agenda com prazos oficiais preservados e detecção de mudanças. Prazos oficiais aparecem nas missões e na Agenda da jornada. |
| 4 — Expansão | ⏳ Conferir requisitos detalhados por programa nas outras universidades, conectar bolsas e cobrir outras regiões. Cada região precisa de conectores e regras próprias — **não presumir DUA fora da Andaluzia**. |

### Arquitetura

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

Com `DB_PROVIDER=supabase`, o estado do Radar (`sources`, `snapshots`, `programs`, `opportunities`, `windows`, `events` etc.) é persistido na linha `radar` de `public.estuvia_state`. Os snapshots HTML brutos continuam em `data/radar-snapshots/`.

#### Fontes monitoradas

| Fonte | Método | Frequência | Autoridade |
|---|---|---|---|
| Calendário DUA (`mo_calendario.php`) | HTML público | 6 h | datas de candidatura |
| Listado de másteres UGR | HTML público | 24 h | catálogo |
| Fichas dos másteres UGR | HTML público, 12 por execução | 2 h (≈ todas por dia) | dados do programa |
| BOJA | revisão manual (buscador bloqueado por robots.txt) | — | normativa (prioridade máxima) |
| Catálogo DUA (`mo_catalogo.php`) | HTML público, consulta POST por universidade e fase | 24 h | oferta DUA |
| Portal DUA, SAAP UGR | revisão manual | — | canal / orientação |

As frequências são metas configuráveis, não garantia de atualização instantânea. Falhas usam recuo exponencial (15 min → até a frequência da fonte). O catálogo DUA atualiza a listagem e os links oficiais das fichas; ainda não coleta automaticamente o conteúdo interno de cada ficha. A base local consultada nesta preparação contém apenas os 138 registros UGR: as últimas execuções do DUA falharam antes de publicar os catálogos das demais instituições. A execução seguinte, após esta correção, precisa ser conferida no painel do Radar.

#### Regras de publicação

- **Extração incerta** (mês ausente, intervalo invertido, rótulo sem candidatura) ou **ano inconsistente** (documento do curso 2027/2028 citando "enero de 2026") → fila de revisão; nada é publicado.
- **Calendário novo** de um ano ainda inexistente, extraído sem incertezas → publicado como "Confirmada em fonte oficial" e dispara "Novas datas publicadas!".
- **Alteração de prazo de candidatura já publicado** → revisão obrigatória; o dado antigo continua no ar até a aprovação. Aprovada, gera histórico e o alerta "Datas oficiais alteradas".
- **Conflito** com dado de fonte de maior autoridade (ex.: registro manual do BOJA) → revisão indicando qual autoridade prevalece; o sistema não escolhe arbitrariamente.
- **Programa que some do catálogo** → nunca é apagado; vira revisão.
- **Fonte fora do ar** → o último dado verificado continua visível com "atualização pendente"; após 72 h sem verificação bem-sucedida, o estado passa a **Informação desatualizada**.

#### Estados

`nao-anunciado`, `previsto`, `anunciadas`, `abertas` (exige janela vigente **e** canal de inscrição confirmado), `encerradas`, `em-avaliacao`, `adjudicacoes`, `resultas`, `suspenso`, `desatualizado`. Calculados em `status.js` a partir de datas, fuso de Madri e saúde da fonte. Quando uma fase está em pós-candidatura e a seguinte já tem datas futuras, o card mostra **Inscrições anunciadas** (a próxima ação possível); o estado de cada fase aparece no detalhe.

Vagas ofertadas nunca significam vagas disponíveis, e a mudança de estado da oportunidade nunca significa que o estudante se candidatou (isso é registrado na missão 3.6).

### Modelo de dados (data/radar.json ou estado Supabase)

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

### API

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

### Integrações (contratos em `server/radar/service.js`)

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

### Desenvolvimento

- `RADAR_SCHEDULER=off` desliga o atualizador (os testes fazem isso).
- `RADAR_ADMIN_EMAILS=email1,email2` libera o painel em `#/radar/admin` **apenas em desenvolvimento/testes**. Em produção o cadastro não verifica e-mail, então o papel é concedido no painel admin (Papel → Equipe do Radar).
- `RADAR_DATA_FILE` muda o arquivo da base (padrão: `data/radar.json`).
- **Simulação**: no painel (somente fora de produção), "Simular publicação" cria um calendário marcado como **DADO DEMONSTRATIVO** em toda a interface para testar alertas e Agenda; nunca sobrescreve calendário oficial e pode ser removido por completo.

### Limitações conhecidas

- Idioma de ensino, nível exigido, preço e vagas **não constam** das fichas da UGR: os filtros correspondentes avisam isso em vez de inventar.
- O catálogo do DUA e o BOJA ainda não têm coleta automática (formulário dinâmico / buscador bloqueado por robots.txt); entram por revisão manual.
- Notificações apenas na plataforma (sem e-mail).
- Bolsas: o indicador lê `server/content/scholarships.js`; hoje nenhuma tem edital aberto confirmado, então o número é 0.

<a id="doc-24"></a>

## 24 — Tempo real, pesquisa na web, preços de passagens e anotações

Tudo aqui usa **serviços gratuitos**. Nada é inventado: cada dado mostra a fonte e a hora da consulta. Quando um serviço não está configurado ou falha, a tela diz isso.

### 1. Atualizações ao vivo (Server-Sent Events)

O navegador mantém uma conexão aberta em `GET /api/events` (só para quem está logado). Quando algo muda, o servidor envia um aviso curto e a tela se atualiza, sem recarregar a página.

| Evento | Quando | Quem recebe | O que a tela faz |
|---|---|---|---|
| `radar-alerta` | O Radar criou um alerta para uma oportunidade que o estudante acompanha (calendário publicado, abertura, prazo acabando, resultado) | Só o estudante dono do alerta | Mostra um aviso e recarrega o Radar |
| `radar-atualizado` | O atualizador publicou mudança vinda de fonte oficial, ou a equipe aprovou uma revisão | Todos os conectados | Mostra um aviso e recarrega o Radar |
| `preco-passagem` | O menor preço visto ficou abaixo do teto do alerta de preço | Só o estudante dono do alerta | Mostra um aviso e recarrega "Minha viagem" |

- Arquivos: `server/events.js` (barramento), `server/routes/events.js` (rota), `public/js/live.js` (cliente: `startLive`, `stopLive`, `onLive`).
- Se a conexão cair, o navegador reconecta sozinho em 15 s. Há um sinal de vida a cada 25 s e no máximo 5 conexões por estudante.
- Só avisos curtos passam por esse canal. Os dados completos continuam vindo da API, com as mesmas permissões.
- **Escala:** o barramento fica na memória do processo. Com mais de uma instância do servidor, troque-o por Redis pub/sub ou PostgreSQL `LISTEN/NOTIFY`, mantendo `emitTo` e `broadcast`.

### 2. Radar mais rápido perto das datas

- **Frequência adaptativa** (`effectiveFrequencyHours` em `server/radar/pipeline.js`): a fonte de datas de candidatura (calendário do DUA) é conferida a cada **1 h** quando falta até 2 dias para uma abertura, encerramento ou resultado oficial, e a cada **3 h** quando falta até 14 dias. Fora disso vale a frequência cadastrada (6 h). O valor usado fica em `source.frequenciaEfetivaHoras`.
- **Requisição condicional:** cada coleta guarda o `ETag` e o `Last-Modified` da página (`source.validadores`). Na coleta seguinte, se a página oficial não mudou, ela responde `304`: nada é baixado e a verificação conta como bem-sucedida.
- As regras de publicação não mudaram (doc 11): mudança de prazo continua passando por revisão.

### 3. Pesquisa na web e vídeos no Mentor

O estudante pede no chat, por exemplo "Pesquise notícias sobre visto de estudante" ou "Me mostra vídeos sobre apostila". Também há os botões rápidos **Novidades na web** e **Vídeos e aulas**. Funciona no Modo Guiado (sem IA) e com IA (ferramentas `search_web` e `search_videos`).

| Fonte | Natureza mostrada | Chave | Limite gratuito |
|---|---|---|---|
| Canal UGR: feeds das últimas notícias e convocatórias (≈ 40 itens cada), em cache aquecido a cada 30 min e filtrados pelas palavras da pergunta | Fonte oficial | não | respeita `robots.txt` e intervalo por domínio |
| GDELT DOC 2.0 (imprensa, últimos 3 meses, PT/ES) | Imprensa (não oficial) | não | 1 consulta a cada 5 s, controlada pelo servidor |
| Wikipédia em português (só quando a pergunta é sobre um conceito; só páginas com uma palavra da pergunta no título) | Enciclopédia (explica o conceito, não é fonte oficial) | não | uso moderado, com User-Agent |
| YouTube Data API v3 | Vídeo de terceiros | `YOUTUBE_API_KEY` (gratuita) | ≈ 100 buscas por dia |

- Cada resultado mostra título, quem publicou, a natureza e a data. O chat lembra que imprensa, Wikipédia e vídeo não são regra oficial.
- Vídeos: busca segura, de preferência em português, dos últimos 3 anos, só vídeos que podem ser incorporados. O player (`youtube-nocookie.com`) só carrega quando o estudante toca no vídeo. A CSP libera apenas `i.ytimg.com` (miniaturas) e `www.youtube-nocookie.com` (player).
- Sem `YOUTUBE_API_KEY`, o Mentor mostra só o link da busca no YouTube.
- A busca interna do Canal UGR (`?s=`) não é usada porque leva 10–20 s.
- Cache: feeds oficiais 30 min, imprensa 30 min, Wikipédia 24 h, vídeos 12 h. Se uma fonte falhar, as outras continuam e a falha aparece explicada.
- Fontes que **não** usamos porque os termos proíbem uso fora de leitor pessoal: os feeds RSS do Google Notícias e do Bing.

### 4. Preços de passagens e alerta de preço

Na tela **Minha viagem**, a seção recolhida **Preços vistos agora** traz os menores preços que usuários do Aviasales encontraram nas últimas ~48 h. Os dados vêm da Aviasales Data API, pelo programa de afiliados gratuito Travelpayouts (`TRAVELPAYOUTS_TOKEN`).

- Consulta: aeroporto de saída do perfil × aeroportos do destino (Granada: GRX, MAD, AGP), no mês da viagem. Sem data informada, usa o mês anterior ao início das aulas. Só ida, em R$, cache de 3 h.
- É referência, não oferta: o preço final, a bagagem e as regras aparecem no site. **Salvar como cotação** cria uma cotação marcada "preço visto, a confirmar".
- **Alerta de preço:** o estudante define um teto em R$. A cada 6 h o servidor confere as rotas de quem ativou. Quando o menor preço visto fica abaixo do teto, avisa ao vivo e guarda o aviso (últimos 10). O aviso só se repete se o preço cair mais ou se já tiverem passado 3 dias.
- Rotas: `GET /api/travel/prices`, `PUT /api/travel/price-alert` `{ ativo, teto }`. Código: `server/flight-prices.js`.

### 5. Anotações da missão

Cada missão tem o card **Minhas anotações**, com três tipos:

- **Anotação:** lembrete livre.
- **Tarefa:** tem caixinha para marcar como feita.
- **Preciso de ajuda:** tem o botão **Perguntar ao Mentor**, que abre o chat já com a dúvida e a missão no contexto, e pode ser marcada como resolvida.

- Só o estudante vê. Anotações **não** concluem objetivos nem a missão.
- O Mentor recebe as anotações abertas da missão em foco, como dado do estudante (nunca como instrução).
- Limite de 40 anotações por missão, 500 caracteres cada.
- Rotas: `POST /api/journeys/:jid/missions/:id/notes` `{ texto, tipo }`, `PUT …/notes/:noteId` `{ texto?, tipo?, feito? }`, `DELETE …/notes/:noteId`.

### 6. Tela mais limpa

- **Missão:** só cabeçalho, progresso e cards. Anotações, **Pergunte ao Mentor** (ou "Preciso de ajuda", sem duplicar) e **Experiências e fontes** viraram cards que abrem em painel.
- **Minha jornada:** Prazos importantes, Situação financeira, O que já aconteceu? e Marcos da jornada são painéis recolhíveis (`FoldPanel`). Fechados, mostram um resumo curto ("próximo em 12 dias", "faltam € 5.000", "2 de 6"). O navegador lembra quais o estudante deixou abertos.

Testes: `tests/live.test.js`.

<a id="doc-12"></a>

## 12 — Comunidade colaborativa

Rede social interna para estudantes internacionais: descobrir uma oportunidade, ver o quanto ela é confiável, salvar e transformá-la numa ação na jornada e na agenda. Usa a mesma autenticação, identidade visual (tokens de `styles.css`, claro/escuro) e persistência do resto da plataforma.

### Arquivos

| Arquivo | Papel |
|---|---|
| `server/content/community.js` | Categorias, naturezas, estados de verificação, motivos de denúncia, grupos iniciais, domínios institucionais, listas de spam/golpe |
| `server/community-engine.js` | Regras puras: análise de links, máscara de dados pessoais, sinais de spam, duplicatas, relevância, estado efetivo de verificação e `communityRadarFeed()` (contrato do Radar) |
| `server/routes/community.js` | API `/api/community/*` (feed, interações, grupos, missões, agenda, moderação, imagens) |
| `public/js/views/community.js` | Telas `#/comunidade[/secao[/id]]` |
| `public/js/views/community-parts.js` | Cartão de publicação, compositor, selos, denúncia |
| `public/js/views/community-mod.js` | Painel de moderação |
| `public/css/community.css` | Estilos (carregado pela própria view) |
| `tests/community.test.js` | 11 testes de integração |

Dados: coleção `community` em `data/db.json` (`posts`, `comments`, `groups`, `reports`, `media`); imagens em `data/media/` (fora de `public/`, servidas só para quem pode ver o post). No usuário: `opportunities` (missões geradas) e eventos `origem: 'comunidade'` em `planner`.

### Confiança da informação

- **Natureza** de cada publicação: relato pessoal, dúvida, dica ou "baseado em fonte oficial". A última **exige** citar um link de domínio institucional e mesmo assim só vira oficial depois de verificada.
- Em categorias sensíveis (documentação e vistos, custo de vida), relatos mostram o aviso "não é orientação oficial" com link para a Central de fontes.
- **Verificação** (oportunidades e orientações oficiais): `Não verificada → Em verificação → Verificada → Informação desatualizada / Rejeitada`. O estudante só pode *pedir* verificação; a mudança de estado é da moderação, com checklist obrigatório (link oficial, requisitos, datas), prazo registrado e nota quando o domínio não é institucional. **Um link não torna nada oficial.**
- Uma verificada com prazo vencido aparece automaticamente como desatualizada. Se o autor editar algo verificado, volta para "Em verificação" e sai do Radar.

### Integrações

- **Radar de Oportunidades**: `communityRadarFeed()` entrega as oportunidades verificadas, publicadas, com prazo vigente e sem duplicatas. O Radar (`server/radar`) as trata como fonte "comunidade" de revisão manual — nunca publica automaticamente como dado oficial.
- **Radar oficial**: ao publicar ou editar uma oportunidade, `findOfficialMatch()` (`server/radar/service.js`) verifica se o programa já está no Radar; se estiver, o autor é avisado e o cartão mostra "ver datas oficiais" (`#/oportunidades/<id>`). Se o módulo do Radar não carregar, a comunidade funciona sem essa checagem.
- **Duplicatas**: mesmo edital (URL normalizada, sem `utm_*`, `www`, barra final) ou instituição+título equivalentes. Na publicação o autor vê a existente e pode publicar mesmo assim (fica marcado para a moderação); na verificação, uma duplicata de outra já verificada é bloqueada.
- **Missões** ("Adicionar à minha jornada"): gera a missão "Avaliar oportunidade" (fonte, cada requisito, prazo, decisão). Decidir "Vou me candidatar" gera as atividades de candidatura. Tela: `#/comunidade/oportunidades`.
- **Agenda AI**: "Prazo na agenda" cria o evento do prazo e um bloco de revisão 7 dias antes. Quando a moderação registra uma **alteração confirmada** no edital (`PUT /mod/posts/:id/opportunity`), a data dos eventos e a missão de todos que acompanham são atualizadas, com aviso na missão.
- **Conteúdo da Missão**: `GET /community/missions/:missaoId` devolve relatos ligados à missão; `#/comunidade/missao/:id` abre o feed da missão com o compositor já vinculado.

### Moderação e segurança

- Moderadores: `role: 'moderador'`, concedido pelo administrador em `#/admin/aluno/:id` (Papel). `MODERATOR_EMAILS` no `.env` só vale fora de produção (o cadastro não verifica e-mail). Painel em `#/comunidade/moderacao`; toda decisão vai para o histórico da publicação e para o log de auditoria.
- **Spam**: limite por hora (8 posts, 30 comentários) + limitador de taxa; texto repetido em 24 h bloqueado; pontuação por termos de golpe ("visto garantido", "pix"…), excesso de links, caixa alta, conta recente com links. Pontuação alta → "em revisão" (só autor e equipe veem).
- **Links suspeitos**: encurtadores, IP, punycode, TLDs de risco, credenciais na URL, domínio que imita órgão/universidade. Ficam não clicáveis e mandam a publicação para revisão.
- **Dados pessoais**: CPF, NIE/DNI, passaporte, telefone e e-mail pessoal são mascarados antes de gravar; o autor é avisado. Na comunidade só aparecem apelido/primeiro nome e avatar.
- **Denúncias**: uma por pessoa e conteúdo; 3 denúncias abertas tiram o conteúdo do ar até a decisão.
- **Imagens**: PNG/JPEG/WebP/GIF até 2 MB, tipo conferido pelos bytes iniciais; servidas com `nosniff`.
- **LGPD/RGPD**: exportação inclui publicações, comentários, denúncias feitas e grupos; excluir a conta apaga tudo isso e as imagens.

### Próximos passos

- Suporte a outros formatos (vídeo, PDF de edital) usando a mesma tabela `media`.
- Notificações (resposta em comentário, verificação concluída) e menções.
- Migrar `community` para tabelas PostgreSQL junto com o resto da base (ver `03-arquitetura.md`).

---

<a id="parte-4"></a>

# Parte 4 — Técnico

<a id="doc-22"></a>

## 22 — Interface: visual minimalista, navegação e celular

A regra visual: **menos coisa na tela, mesma informação disponível.** Nada foi removido do produto. O que é secundário fica um toque mais longe, e o visual é plano e calmo para o conteúdo aparecer.

### 1. Arquivos

| Arquivo | Papel |
|---|---|
| `public/css/styles.css` | Design system base (tokens, componentes). Não foi reescrito |
| `public/css/minimal.css` | **Camada minimalista + regras de celular.** Carregada por último no `index.html` |
| `public/js/app.js` | `NAV`, `NAV_MORE` e `renderNav()`: menu lateral, seção "Mais" e barra inferior |
| `public/index.html` | `<nav id="tabbar">` e `viewport-fit=cover` (áreas seguras do iPhone) |
| `public/js/icons.js` | Ícone `menu` (usado na barra inferior) |
| `public/js/views/home.js` | Início com menos painéis |

### 2. Camada minimalista (`minimal.css`)

- **Por que uma camada separada:** o visual muda sem tocar nos 12 CSS dos módulos. Para voltar ao visual anterior, basta remover o `<link>` de `minimal.css` do `index.html`.
- **Seletores com `html` na frente** (`html .btn`): ganham dos CSS carregados sob demanda (mentor, comunidade, viagem, documentos, central da missão, resultados), que entram no `<head>` depois.
- **O que muda:**

  | Item | Antes | Agora |
  |---|---|---|
  | Sombras | `--shadow` em cards, modais, toasts | Nenhuma (`box-shadow: none`) |
  | Gradientes | Botão principal, barras, cards em destaque | Cor sólida (`--accent`) |
  | Cantos | 18–26px | 8–14px (`--radius: 12px`) |
  | Fundos | Vários tons (`--bg`, `--bg-2`, superfícies) | Fundo único, superfícies próximas |
  | Fontes | Pesos 750–900 | Pesos 500–700 |
  | Movimento | Missão atual pulsando, entrada de página .28s | Sem pulso, entrada .15s |

- **Tokens preservados:** cores de estado (`--ok`, `--warn`, `--danger`, `--info`…) e as cores de destaque escolhidas no perfil (`data-accent`) continuam valendo. Os temas claro e escuro também.
- **Imagens dos heróis** (início, jornada, landing) mantêm o escurecimento por cima: ele garante a leitura do texto branco.

### 3. Navegação

| Onde | Itens |
|---|---|
| Menu principal (`NAV`) | Início · Minha jornada · Agenda · Documentos · Financiamento |
| "Mais" (`NAV_MORE`, recolhível) | Meu novo lar · Viagem · Mestrados · Oportunidades · Comunidade · Conquistas · Mentor IA · Manual |
| Barra inferior (celular) | Os 4 primeiros de `NAV` + **Menu** (abre a lateral completa) |

- "Mais" abre sozinho quando a tela atual está nele e lembra se você o abriu.
- Para mover uma tela para o menu principal, basta movê-la de `NAV_MORE` para `NAV`. A barra inferior usa sempre `NAV.slice(0, 4)`.
- As rotas não mudaram: links antigos (`#/viagem`, `#/conquistas`…) continuam funcionando.
- Sem login, o menu mostra só Início, Entrar e Criar conta, e a barra inferior não aparece.

### 4. Início

Ficou: herói com destino, progresso e "Continuar missão" · até **3** alertas (antes 6) · rodada atual · Agenda AI · prazos · situação financeira · outras jornadas.

Saiu: o painel "Meu assistente" (o botão flutuante do Mentor já faz isso) e o texto longo sob o painel financeiro (a explicação continua em Financiamento).

### 5. Celular

Pontos de quebra: **960px** (menu vira gaveta, aparece a barra inferior) e **640px** (ajustes de tela pequena).

| Até 960px | Até 640px |
|---|---|
| Barra inferior fixa, com área segura do iPhone (`env(safe-area-inset-bottom)`) | Campos com **16px** (o iPhone não dá zoom ao tocar) e 44px de altura |
| Botão do Mentor, toasts e botão fixo de missão sobem acima da barra | Botões com no mínimo 44px; `btn-lg` ocupa a largura toda |
| Hambúrguer do topo some (a barra tem "Menu") | Heróis em coluna: anel de 84px no topo, texto embaixo |
| Gaveta lateral esconde a barra quando aberta | Alertas em 1 coluna; números do financeiro em 2 |
| | Mentor flutuante só com ícone |
| | Modais e painéis abrem de baixo, com largura total |
| | Margens laterais de 16px e sem rolagem horizontal (`overflow-x: clip`) |

Os CSS dos módulos já tinham regras próprias de celular (comunidade, documentos, finanças, moradia, mentor, central da missão, radar, resultados, viagem). Elas continuam valendo.

### 6. Para telas novas

1. Use os componentes existentes (`.panel`, `.btn`, `.chip`, `.field`). Não crie sombras nem gradientes.
2. Uma ação principal por tela (`btn-cta`). As outras ficam `btn-ghost`.
3. Grades com `repeat(auto-fit, minmax(…px, 1fr))` com mínimo de até 260px (cabe em 320px de tela).
4. Tabelas dentro de `.table-wrap` (rolagem horizontal).
5. Textos longos em "Entender melhor" (`<details>`), não abertos na tela.
6. Teste em 360px de largura: nenhum elemento pode passar da tela nem ficar sob a barra inferior.

### 7. Como testar no celular

- **No computador:** F12 → Ctrl+Shift+M (modo dispositivo) → escolha um iPhone ou um Android de 360px.
- **No aparelho:** com o servidor rodando, abra `http://<IP do computador>:3000` na mesma rede Wi-Fi.
- **Conferir:** barra inferior, "Menu" abrindo a lateral, Mentor acima da barra, campos sem zoom, nada cortado na lateral.

### 8. Pendências

- Não houve conferência visual em navegador durante a implementação: faça o teste da seção 7.
- Telas muito densas (missão, financiamento) ainda podem ser simplificadas no conteúdo, não só no visual.
- Instalar como app (PWA, ícone na tela inicial) ainda não existe.

<a id="doc-03"></a>

## 03 — Arquitetura

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](#doc-13).

### Visão geral

```
Navegador (SPA leve, JS modules)
   │  fetch JSON + cookie httpOnly + cabeçalho X-Requested-With
   ▼
Express (server/app.js)
   ├─ security.js  → helmet (CSP), rate limit, CSRF, sessão JWT
   ├─ routes/auth.js       cadastro, login, logout, troca de senha
   ├─ routes/me.js         perfil, missões, opções, status, documentos, orçamento, export, exclusão
   ├─ routes/content.js    conteúdo público (jornada, fontes, catálogo, documentos, FAQ)
   └─ routes/assistant.js  Guia: Claude (SSE) ou base local
        │
        ├─ game.js     regras de XP, desbloqueio, conquistas, dicas
        ├─ content/*   conteúdo editorial versionado
        ├─ store.js    estado de usuários/comunidade (JSON local ou Supabase)
        └─ radar/db.js estado do Radar (JSON local ou Supabase)
```

### Decisões técnicas

| Decisão | Motivo |
|---|---|
| **Node.js + Express** | Simples, conhecido e com uma única linguagem no front e no back. |
| **Front sem build** (HTML + CSS + ES modules) | Roda com `npm start`, sem bundler nem etapa de compilação, e é fácil de apresentar e modificar. A migração para Next.js/React continua possível (o documento de visão cita isso como stack candidata). |
| **Roteamento por hash** (`#/jornada`) | Funciona em qualquer hospedagem estática. |
| **Conteúdo em `server/content/`** | A base editorial fica versionada no git, revisável por pull request, com fonte e data. É o embrião do painel editorial (RF-10). |
| **Persistência intercambiável** | `DB_PROVIDER=json` mantém os arquivos locais. `DB_PROVIDER=supabase` grava os estados principais em linhas JSONB no Supabase, sem expor a chave secreta ao navegador. |
| **SSE para o assistente** | A resposta aparece enquanto é gerada, com uma conexão HTTP simples. |
| **DOM via `h()` + `textContent`** | Elimina XSS por construção (nada de `innerHTML` com dados). |

### Modelo de dados (como está gravado hoje)

O adaptador Supabase preserva o formato atual do MVP em duas linhas da tabela `estuvia_state`: `main` contém usuários, comunidade, auditoria e analytics; `radar` contém fontes, programas, oportunidades, janelas e alertas. Cada gravação usa uma versão esperada para detectar concorrência e evitar sobrescrita silenciosa. A estrutura normalizada continua sendo uma etapa futura.

```jsonc
// data/db.json ou public.estuvia_state (id = "main")
{
  "users": [{
    "id": "uuid",
    "email": "ana@exemplo.com",          // único, minúsculo
    "passwordHash": "scrypt$sal$hash",
    "tokenVersion": 1,                    // invalida sessões
    "createdAt": "...", "updatedAt": "...", "consentAt": "...",
    "profile": {
      "nome": "", "apelido": "", "avatar": "🎓", "cor": "azul", "tema": "auto",
      "formacao": "", "area": "", "estado": "BA", "cidadeDesejada": "",
      "anoPretendido": "2027", "espanhol": "B1", "ingles": "B2",
      "porque": "", "metaPessoal": "", "cambio": 6.1
    },
    "progress": { "completed": { "<missionId>": "ISO date" } },
    "choices": ["<programId>", "..."],          // máx. 6, ordenado
    "status": { "candidatura": "...", "visto": "...", "declaradoEm": "..." },
    "documents": { "<docId>": "pendente|solicitado|pronto|nao-se-aplica" },
    "budget": [{ "categoria": "mensal", "descricao": "", "valor": 0, "moeda": "EUR", "tipo": "estimativa" }]
  }],
  "audit": [{ "id": "", "at": "", "action": "login|register|...", "userId": "" }]
}
```

### Mapa para o modelo relacional (PostgreSQL)

| Documento de visão | Hoje | Tabela futura |
|---|---|---|
| StudentProfile | `user.profile` | `student_profile` (1:1 com `users`) |
| University / Program / Requirement | `content/catalog.js` | `university`, `program`, `requirement` |
| Source | `content/sources.js` | `source` (com `reviewed_at`, `status`) |
| TaskDefinition | `content/journey.js` (missões) | `task_definition` |
| UserTask | `user.progress.completed` | `user_task (user_id, task_id, completed_at)` |
| ApplicationChoice | `user.choices` | `application_choice (user_id, program_id, position, cycle)` |
| Application | `user.status` | `application (user_id, cycle, phase, declared_status)` |
| BudgetItem | `user.budget` | `budget_item` |
| AuditEvent | `audit` | `audit_event` |

#### Supabase

1. Aplique [`supabase/schema.sql`](../supabase/schema.sql) no SQL Editor do projeto Supabase.
2. No `.env` do servidor, defina `DB_PROVIDER=supabase`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (a chave `sb_secret_...`, somente no servidor).
3. Reinicie o servidor. Se as linhas ainda não existirem, o app importa os estados locais `data/db.json` e `data/radar.json` para `main` e `radar`. Os arquivos locais são preservados como cópia.

O cliente do navegador não usa a chave secret. O `.env.local` e os helpers `@supabase/ssr` do exemplo Next.js não se aplicam a este backend Express. A mídia comunitária, os arquivos cifrados de documentos e os snapshots HTML brutos do Radar continuam no armazenamento local; esta integração migra o estado JSON principal.

#### Migração para tabelas normalizadas

1. Criar as tabelas acima (sugestão: Prisma ou Drizzle para migrations).
2. Reimplementar `server/store.js` mantendo a mesma interface (`users.findByEmail`, `findById`, `create`, `update`, `remove`, `audit.log`). As rotas não mudam.
3. Script único para importar `data/db.json`.
4. Mover `content/*` para tabelas com painel editorial e manter o arquivo como seed.

### Escalabilidade e operação

- O provider JSON serve para **uma instância**. O provider Supabase persiste estado no Postgres e detecta conflitos entre processos com versionamento; como o app ainda carrega o estado em memória, rode uma instância de escrita até migrar para tabelas/reposórios por operação.
- O rate limit fica em memória. Com várias instâncias, ele deve usar um store compartilhado (Redis).
- O servidor é stateless, exceto pelo `store`. A sessão vai no cookie assinado.

<a id="doc-05"></a>

## 05 — Referência da API

Base `/api`, JSON. Erros: `{ "error": "mensagem" }`. Escritas exigem o cabeçalho `X-Requested-With: travessia` (CSRF). Sessão em cookie httpOnly.

### Público
`GET /health` · `GET /content/app` · `GET /content/journey` (rodadas, marcos, etiquetas, situações) · `GET /content/landing` (dados da landing: regra de comprovação do visto/IPREM com fonte e etapas do diagnóstico) · `GET /content/sources` · `GET /content/catalog` · `GET /content/documents` · `GET /content/scholarships` · `GET /content/places` · `GET /content/finance-rules` · `GET /content/faq`

### Autenticação
`POST /auth/register {nome,email,senha,aceite}` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` · `POST /auth/change-password {atual,nova}`

### Perfil e documentos
`GET /me` · `PUT /me/profile` (campos estritos; `espanhol`/`ingles` aceitam `nao-sei`; `orcamentoSituacao: informado|nao-sei`) · `POST /me/onboarding/complete` (confere o essencial no servidor e só então marca `onboardingConcluido`; 422 com `faltam[]`; idempotente) · `PUT /me/choices {choices}` (≤6) · `PUT /me/documents {id: pendente|em-preparacao|pronto|enviado|correcao|nao-se-aplica}` · `GET /me/export` · `DELETE /me {senha}`

### Jornadas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/journeys` | Resumos (destino, progresso, rodada atual, próxima missão, próximo prazo) |
| GET | `/journeys/progress-stages` | Etapas de progresso anterior: `{id, rotulo, exigeDataEntrada, missoes}` (missões reconhecidas, acumuladas) |
| POST | `/journeys` | `{universidadeId e/ou programaId, anoAcademico?, inicioAulas?, inicioAulasAproximado?, duracaoMeses?}`. Mestrado opcional: sem ele a jornada nasce "Mestrado a definir". Duplicidade: mesmo programa, ou mesma universidade + ano sem programa (409). ≤6 jornadas |
| PUT | `/journeys/:jid/program` | `{programaId}` define/troca o mestrado (mesma universidade, sem repetir outra jornada); conclui o objetivo automático da Missão 1.3 |
| GET/PUT/DELETE | `/journeys/:jid` | Jornada calculada / editar datas / excluir |
| PUT | `/journeys/:jid/situacao` | `{campo: adjudicacao|matricula|visto, valor}` → `{journey, events}` |
| POST/PUT/DELETE | `/journeys/:jid/contacts[/:cid]` | Contatos acadêmicos (exige `fonteUrl` https) |
| GET | `/journeys/:jid/missions/:id` | Detalhe: definição, objetivos, documentos, fontes, tipo, fluxo, elegibilidade/consulado/contatos/finanças |
| PUT | `/journeys/:jid/missions/:id/objectives/:obj` | `{feito}` ou `{valor}` (data, texto, situação) |
| POST | `/journeys/:jid/missions/:id/complete` | `{confirmo: true}` — exige todos os objetivos |
| POST | `/journeys/:jid/missions/:id/reopen` | Reabrir |
| PUT | `/journeys/:jid/missions/:id/state` | `{aguardando?, naoAplicavel?, prazo?, nota?, execucao?}` |

Mutações devolvem `{ mission, journey, events }` com eventos `missao-concluida`, `rodada-concluida`, `marco`, `desbloqueio`, `urgente`.

### Agenda AI
`GET /planner` (eventos, prazos, disponibilidade) · `POST /planner` · `PUT/DELETE /planner/events/:id` · `PUT /planner/availability` · `POST /planner/suggest {semana, journeyId?, missaoId?}` · `POST /planner/approve {itens}` · `POST /planner/replan {semana}`

### Financiamento
`GET /finance?journeyId=` (o `plano` traz `orcamentoDeclarado {situacao: informado|nao-sei|nao-informado, valor, diferenca}`: referência do onboarding, nunca somada aos recursos) · `PUT /finance {custos?, cambio?, informouRecursos?, nenhumaBolsaAplicavel?}` · `POST/PUT/DELETE /finance/resources[/:id]` · `POST /finance/scholarships {catalogId | nome…}` · `PUT /finance/scholarships/:id {status?, prazo?, valorTotal?, tarefa?}` · `DELETE /finance/scholarships/:id`

### Moradia e viagem
`GET /living` · `POST/PUT/DELETE /living/housing[/:id]` (status `escolhida` é única) · `POST/PUT/DELETE /living/travel/routes[/:id]` · `PUT /living/travel/arrival`

### Documentos (carteira e Minha pasta)
Detalhes e regras em [21 — Documentos](#doc-21). `journeyId` (query) é opcional: sem ele, vale a primeira jornada.

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

### Mentor IA
`POST /assistant/ask {pergunta? | acao?, journeyId?, missaoId?, historico?}` → SSE `delta` / `replace` / `done {fontes, acoes, modo}`. Ações rápidas: `dificuldade, simples, documentos, custo, economizar, proximo, dua, certificado, contato, email, semdinheiro, bolsas, apoio, vistodocs, moradia, semana`.

Mentor com ferramentas: `/mentor` (doc 15). Viagem: `/travel` (doc 20).

Módulos de outras frentes: `/radar`, `/radar/admin` (doc 11), `/community` (doc 12), `/achievements` (doc 06).

<a id="doc-04"></a>

## 04 — Segurança e privacidade

### Controles implementados

| Ameaça | Controle | Onde |
|---|---|---|
| Vazamento de senhas | **scrypt** (N=16384, r=8, p=1), sal aleatório por usuário, comparação em tempo constante | `security.js#hashPassword` |
| Enumeração de contas | Mensagem genérica "E-mail ou senha incorretos" e hash fictício para gastar o mesmo tempo quando o e-mail não existe | `routes/auth.js` |
| Força bruta | Rate limit: 20 tentativas / 15 min em auth, 120 req/min na API, 40 perguntas/h ao assistente | `security.js` |
| Roubo de sessão por XSS | JWT em cookie **httpOnly**, **SameSite=Strict** e **Secure** em produção; expira em 8 h | `issueSession` |
| XSS | CSP restritiva (`script-src 'self'`, sem inline), renderização só com `textContent`, markdown mínimo seguro | `security.js`, `public/js/ui.js` |
| CSRF | SameSite=Strict, cabeçalho obrigatório `X-Requested-With` em métodos de escrita e checagem de `Origin` | `csrfGuard` |
| Clickjacking | `frame-ancestors 'none'` | CSP |
| Sessões esquecidas | "Sair de todos os dispositivos" e troca de senha incrementam `tokenVersion` | `routes/auth.js` |
| Acesso a dados de terceiros | Todas as rotas `/api/me` usam o `id` da sessão; nenhum id vem do cliente | `routes/me.js` |
| Mass assignment | Schemas **zod** `.strict()` rejeitam campos extras (ex.: `isAdmin`) | `routes/me.js` |
| Payloads abusivos | JSON limitado a 50 kb, strings e listas com tamanho máximo | `app.js`, schemas |
| Vazamento de erros | Handler global sem stack trace para o cliente; `x-powered-by` desligado | `app.js` |
| Prompt injection no Guia | System prompt com regra de ignorar instruções do usuário que tentem mudar as regras; respostas limitadas à base | `routes/assistant.js` |
| Corrupção da base | Escrita atômica (arquivo temporário + rename) e serializada | `store.js` |
| Dependências vulneráveis | `npm audit` com 0 vulnerabilidades (zod 4.x) | `package.json` |

### Privacidade (LGPD / RGPD)

- **Minimização:** a plataforma não pede CPF, número de passaporte ou cópias de documentos. O checklist guarda só o **status**.
- **Consentimento:** registrado em `consentAt` no cadastro.
- **Portabilidade:** `GET /api/me/export` devolve todos os dados do usuário em JSON.
- **Eliminação:** `DELETE /api/me` (com reconfirmação de senha) remove a conta definitivamente.
- **Conversa com o Guia:** não é gravada no servidor; fica só na aba do navegador. Com a IA ativa, a pergunta e um contexto resumido do perfil (sem e-mail) são enviados à API da Anthropic.
- **Auditoria:** login, falhas de login, cadastro, troca de senha e exclusão ficam registrados (até 5.000 eventos).

### Checklist antes de produção

- [ ] `NODE_ENV=production` e `JWT_SECRET` forte (o servidor **recusa subir** sem ele)
- [ ] HTTPS (atrás de proxy: `trust proxy` já ativado em produção) e `ALLOWED_ORIGIN` definido
- [ ] Migrar `store.js` para PostgreSQL com backups e criptografia em repouso
- [ ] Rate limit com store compartilhado (Redis) se houver mais de uma instância
- [ ] Política de privacidade e termos revisados por profissional (LGPD/RGPD)
- [ ] Verificação de e-mail e recuperação de senha por e-mail
- [ ] Monitoramento de erros e alertas
- [ ] Revisão de segurança independente (pentest leve)
- [ ] Política de retenção do log de auditoria

<a id="doc-25"></a>

## 25 — Production readiness (audit of 2026-11-09)

This document describes what the code **actually** does today and what must happen before a commercial launch. It replaces assumptions in older docs where they conflict.

### Runtime reality

| Area | Current implementation | Consequence |
|---|---|---|
| Persistence | One JSON file (`data/db.json`) held in memory and rewritten atomically (temp file + rename) on every write. Radar uses `data/radar.json`. | **Single process, single instance only.** No horizontal scaling, no concurrent writers, whole-file rewrite cost grows with users. Migration path: reimplement `server/store.js` (interface is isolated). |
| Write failures | Since this audit, a failed write rejects the request (HTTP 500) and `/api/health` returns **503** until a write succeeds. | Point external monitoring at `/api/health`. |
| Files | Document wallet: AES-256-GCM at rest in `data/docfiles` (server-held key, **not end-to-end**). Community images in `data/media`. | Back up together with the JSON files and `DOCUMENTS_KEY`. |
| In-memory state | Mentor action proposals (30 min), rate-limit counters, request metrics, recent logs. | Lost on restart; rate limits are per process. |
| Async errors | Express 4 does not catch rejected async handlers; `server/app.js` now forwards them to the error handler, and `server/index.js` logs (instead of crashing on) unhandled rejections. | One bad request no longer takes the server down for everyone. |
| Deployment config | None in the repository (no Dockerfile/Procfile/IaC). | Hosting must be chosen; requirements below. |

### Hosting requirements

- Node ≥ 20 (CI uses 22), one long-running process, persistent writable disk for `data/` (or `DATA_FILE`, `MEDIA_DIR`, `DOCS_DIR`, `RADAR_DATA_FILE`).
- TLS-terminating reverse proxy in front; `NODE_ENV=production` enables `trust proxy`, `Secure` cookies and HSTS. Set `ALLOWED_ORIGIN` to the public origin.
- Outbound HTTPS to: `www.juntadeandalucia.es`, `masteres.ugr.es` (Radar), and optionally the AI provider, Travelpayouts, GDELT, Wikipedia, YouTube Data API, ECB FX.

### Environment variables (production)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | |
| `JWT_SECRET` | yes (≥ 32 chars) | Server refuses to start otherwise. Rotating it logs everyone out. |
| `DOCUMENTS_KEY` | yes (≥ 32 chars) | Server refuses to start otherwise. **Losing it makes every stored document unreadable.** Keep it in a secrets manager with backup. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recommended | Password ≥ 12 chars with letters and digits in production. The email is reserved (cannot be registered). On each boot the password is re-synced from env and existing sessions of that account are revoked if it changed. Never logged. |
| `ALLOWED_ORIGIN` | yes behind a proxy | CSRF origin check. |
| `MENTOR_PROVIDER`, `MENTOR_MODEL`, `ANTHROPIC_API_KEY` | optional | Without them the Mentor runs in Guided Mode (no generative AI, clearly labeled). |
| `AI_DAILY_TOKENS_PER_USER`, `MENTOR_TIMEOUT_MS`, `MENTOR_DEADLINE_MS` | optional | Cost and latency caps (see docs/15). |
| `TRAVELPAYOUTS_TOKEN`, `YOUTUBE_API_KEY` | optional | Indicative prices / videos. |
| `MODERATOR_EMAILS`, `RADAR_ADMIN_EMAILS` | **ignored in production** | Registration does not verify email, so granting roles by email was a privilege-escalation hole. Grant roles in `#/admin/aluno/:id` → *Papel*. |

### Roles

Roles come only from the server-side `role` field: `admin` (only the `ADMIN_EMAIL` account, set at boot), `moderador`, `radar`. The admin grants/revokes `moderador` and `radar` via `POST /api/admin/users/:id/role`; the change revokes the target's sessions and is audited (`admin-role`).

### Backup and restore

1. Stop the process (or accept a crash-consistent copy: writes are atomic renames).
2. Copy `db.json`, `radar.json`, `docfiles/`, `media/`, `document-rules.json` together. Store `DOCUMENTS_KEY` separately.
3. Restore by putting the files back and starting with the **same** `DOCUMENTS_KEY`.
4. Test a restore before launch. No automated backup exists yet.

### Verified in this audit

- `npm run check` (syntax of all JS) and `npm test`: **235/235** pass (baseline was 171/173; two Radar tests were date-dependent).
- Manual smoke run: production boot refuses missing `DOCUMENTS_KEY`; dev server serves the SPA, registration, journeys, Radar.
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm run check`, `npm test`, `npm audit --omit=dev --audit-level=high` on PRs. `npm audit` reported 0 vulnerabilities on 2026-10-28.

### Not verified (needs credentials, infrastructure or a human)

- Real AI provider calls (tests use a local fake Anthropic server driving the real SDK).
- Real Travelpayouts, YouTube, GDELT, Wikipedia, ECB calls; live Radar scraping (tests use saved official HTML).
- Browser end-to-end and accessibility testing at mobile/tablet/desktop sizes (no browser test tooling in the repo).
- Any staging or production deployment.

### Blockers before a paid launch

1. **No email verification.** Password reset by email now exists (`POST /api/auth/forgot-password` / `reset-password`, Resend via `RESEND_API_KEY` + `EMAIL_FROM`, 1-hour single-use token stored hashed, resets revoke sessions). Without those variables in production, recovery responds 503. Registration still does not verify the email address.
2. **Single-instance JSON persistence** with no automated backups. Acceptable for a small pilot on one server with disk backups; not for scale.
3. **Legal review (LGPD/GDPR)** — see below.
4. **Official-data status:** the Ministry's student guide lists €600/month as the 2026 IPREM reference and the 2023 state budget remains extended in 2026. The visa simulator remains an estimate and does not model dependents or prepaid accommodation. DUA short link and Salvador consulate contacts verified on 2026-10-28. The local catalog is demonstrative; scholarships show "no confirmed call".
5. **Self-declared official outcomes:** admission/enrollment/visa are student-declared (now recorded with `origem: 'declarado'`, audited, and enrollment/visa require a declared admission first). There is no officially-confirmed state; product decision needed.

### Legal questions for qualified review

- Retention of audit logs (IP, user agent, failed-login emails) after account deletion; Marco Civil art. 15 may require 6 months — define period and legal basis.
- Whether internal admin notes must be included in the data export (currently **excluded**, matching the admin panel's promise).
- Consent text says only the student accesses documents, while the server holds the key (encryption at rest, not end-to-end). Changing it may require bumping `CONSENT_VERSION`.
- Free-text detail of reports by deleted users is kept (author id removed).
- Visa proof-of-funds is shown as an estimate (100% IPREM × months, single applicant); dependent allowances and prepaid accommodation adjustments are not modelled. Never presented as a guarantee.

### Known limitations (accepted for now)

- Logout clears the cookie but does not revoke the JWT server-side (use "Sair de todos os dispositivos" for revocation). Sessions last 8 h.
- Login throttling is per IP (20 / 15 min); there is no per-account lockout.
- Encrypted PDFs cannot be scanned for active content; PDFs are served inline.
- Radar "Candidaturas abertas" alerts can fire while the source is stale (the card itself shows *desatualizado*).
- Mentor proposals are lost on restart; partial execution of a multi-step proposal is reported as "not executed" in the UI.
- A monthly budget item marked "pago" counts as paid for the whole stay; a granted scholarship also added as a resource is counted twice.

<a id="doc-28"></a>

## 28 — Ambientes DEV × PROD

**Situação em 11/11/2026:** produção **ainda não está separada**. O `.env` local usa `DB_PROVIDER=supabase` apontando para o projeto `pomtzhzoxwwnxztwwmft`, e a linha `main` desse projeto recebia gravações durante a auditoria (versão 372 → 374 em minutos). Não foi possível verificar daqui quais variáveis a Vercel usa (não há Vercel CLI nesta máquina), mas tudo indica que desenvolvimento e o ambiente publicado compartilham o mesmo banco.

Decisão: o projeto atual (`pomtzhzoxwwnxztwwmft`) passa a ser **só de desenvolvimento**. Produção ganha um projeto Supabase **novo e vazio**.

### 1. Arquitetura de persistência

- `server/store.js` (usuários, auditoria, comunidade, uso) e `server/radar/db.js` (Radar): estado JSON em memória, gravado inteiro a cada escrita.
- `DB_PROVIDER=json`: arquivos em `data/` (`db.json`, `radar.json`). `DB_PROVIDER=supabase`: tabela `estuvia_state`, uma linha por domínio (`main`, `radar`), com controle otimista de versão (`server/database.js`).
- Arquivos (documentos cifrados, imagens da comunidade, regras editoriais): disco local ou Supabase Storage (buckets privados `estuvia-documents`, `estuvia-community`, `estuvia-meta`, criados pelo servidor).
- Autenticação é própria (JWT em cookie), não usa Supabase Auth. O banco só é acessado pelo servidor com a chave **secret**; RLS ligada e nenhum acesso para `anon`/`authenticated` (`supabase/migrations/0001_estuvia_state.sql`).
- `npm test` sempre roda com JSON em pasta temporária e sem `.env` (`scripts/test.mjs`): os testes nunca tocam um banco real.

### 2. Barreiras implementadas

| Barreira | Onde | Efeito |
|---|---|---|
| `APP_ENV` (`development`/`production`/`test`) coerente com `NODE_ENV` | `server/config.js` | Não sobe com `APP_ENV=production` sem `NODE_ENV=production` (e vice-versa). |
| Referências dos projetos: `SUPABASE_DEV_PROJECT_REF` e `SUPABASE_PROD_PROJECT_REF` | `assertProjectAllowed()` em `server/database.js`, chamada em **todo** cliente Supabase (banco e Storage) | DEV apontando para o projeto de PROD (ou o contrário) é recusado **antes de qualquer leitura**. Testado: `[ambiente] Ambiente "development" apontando para o banco de PRODUÇÃO…`. |
| Marcação no próprio banco: `state.meta.ambiente` | `initStore()` + `checkDatabaseEnvironment()` | Banco marcado para um ambiente nunca é aberto por outro. Produção só se marca sozinha se o banco estiver **vazio** (projeto novo). Banco com dados e sem marcação: só aviso; marcar é explícito (`npm run db:env`). |
| Sem cópia de dados pessoais para PROD | `initStore()` e `initRadarStore()` | Na primeira execução, a linha nova recebe a cópia da base local **só fora de produção**. Em produção: `main` começa vazia; no Radar só os dados públicos (programas, prazos, fontes), sem inscrições, alertas e vínculos de agenda. |

Testes: `tests/db-environments.test.js`.

### 3. Ferramentas

```bash
npm run db:backup                         # backup SOMENTE LEITURA de estuvia_state → data/backups/ (fora do git)
npm run db:env -- status                  # projeto, ambiente marcado, nº de usuários
npm run db:env -- mark development --confirmo
```

`db:env mark` nunca troca uma marcação existente e usa a versão otimista: servidores já rodando com a versão anterior em memória falham na próxima gravação (conflito) e precisam ser reiniciados.

**Backup feito em 11/11/2026:** `data/backups/supabase-pomtzhzoxwwnxztwwmft-2026-11-11T00-01-52-392Z.json` (linhas `main` v372, 7 usuários, e `radar` v18). Contém dados pessoais: não versionar, não enviar, guardar com cuidado. **Não inclui** os arquivos do Storage.

### 4. O que precisa ser feito manualmente (painéis)

Nada abaixo foi feito ainda: depende de acesso aos painéis do Supabase e da Vercel.

1. **Backup do Storage do projeto atual** (documentos cifrados e imagens): Supabase → Storage → baixar os buckets `estuvia-documents`, `estuvia-community`, `estuvia-meta`, ou usar a CLI do Supabase. Os documentos só abrem com a `DOCUMENTS_KEY` do ambiente que os cifrou.
2. **Criar o projeto de produção** no Supabase (região próxima dos usuários, ex.: São Paulo). Anotar a referência `<ref>`.
3. No **SQL Editor do projeto novo**, aplicar `supabase/migrations/0001_estuvia_state.sql`.
4. Em *Project Settings → API keys*, criar uma chave **secret** só para produção. Nunca reutilizar a de desenvolvimento.
5. Na **Vercel → Settings → Environment Variables**, escopo **Production**:
   - `NODE_ENV=production`, `APP_ENV=production`, `DB_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`
   - `SUPABASE_URL=https://<ref-prod>.supabase.co`, `SUPABASE_SECRET_KEY=<secret de prod>`
   - `SUPABASE_PROD_PROJECT_REF=<ref-prod>`, `SUPABASE_DEV_PROJECT_REF=pomtzhzoxwwnxztwwmft`
   - **Novos** `JWT_SECRET` e `DOCUMENTS_KEY` (≥ 32 caracteres, diferentes dos de DEV; guardar a `DOCUMENTS_KEY` com backup), `ALLOWED_ORIGIN`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `RESEND_API_KEY`/`EMAIL_FROM`, chaves de IA se usadas.
   - Remover das variáveis de *Preview* qualquer credencial de produção (previews devem usar DEV ou JSON).
6. **Deploy** de produção. Na primeira subida o servidor encontra o banco vazio, cria as linhas e marca `ambiente = production` (log: `Banco <ref> vazio marcado como "production"`).
7. Conferir: `GET /api/health` em produção, criar uma conta de teste, gerar uma jornada e checar no Supabase de **produção** que a linha `main` mudou (e que a de DEV não mudou).
8. **Só depois** de produção estar no projeto novo, no `.env` local:
   - `APP_ENV=development`, `SUPABASE_DEV_PROJECT_REF=pomtzhzoxwwnxztwwmft`, `SUPABASE_PROD_PROJECT_REF=<ref-prod>`
   - rodar `npm run db:env -- mark development --confirmo` (com o servidor local parado).
   A partir daí, nenhum servidor de produção abre o banco de DEV, e o DEV se recusa a abrir o de PROD.

**Dados existentes:** os 7 usuários do banco atual **não** foram copiados para produção. Migrar contas reais exige decisão e autorização (LGPD: finalidade, consentimento, aviso aos titulares). Se for decidido migrar, faça a partir do backup, de forma seletiva, e registre o procedimento.

**Ordem importa:** marcar o banco atual como `development` antes de mover a produção derrubaria a produção atual na próxima reinicialização com o código novo (o servidor recusaria abrir o banco). Por isso o passo 8 vem por último.

<a id="doc-26"></a>

## Auditoria de lançamento — Estuvia

**Data:** 9 de novembro de 2026

**Escopo:** revisão estática do código, textos legais, configuração e documentação do repositório; conferência de fontes oficiais brasileiras e espanholas sobre o processo acadêmico.
**Veredito:** **não recomendo abrir cadastro público nem permitir envio de documentos ainda.** A aplicação já tem bastante estrutura funcional e controles técnicos úteis, mas os avisos legais são explicitamente rascunhos, há divergências entre o que a interface promete e o que o servidor permite, o fluxo de exclusão/retensão precisa ser definido e não foi possível confirmar uma implantação real nem a região dos provedores.

Esta revisão é um diagnóstico de produto e tecnologia, não um parecer jurídico, pentest, certificação LGPD/GDPR ou validação de um ambiente de produção. Um advogado com experiência em privacidade, consumidor e serviços educacionais/migratórios deve revisar os documentos finais.

### 1. O que a plataforma faz hoje

A Estuvia organiza a jornada para candidatura, preparação de documentos, visto e chegada. A candidatura, matrícula e pedidos consulares são feitos pelo próprio estudante nos sistemas oficiais; a Estuvia não os envia. Estados como candidatura, admissão e visto dependem de declaração do usuário, não de confirmação da universidade ou do consulado. Isso está refletido nos termos e no código e deve continuar claro na interface.

A carteira aceita arquivos de passaporte, comprovantes e outros documentos; a lista inclui certidão de antecedentes e atestado médico. Os arquivos são cifrados com AES-256-GCM em repouso e a chave fica no servidor. Isso protege os arquivos armazenados, mas **não é criptografia ponta a ponta**: a aplicação precisa conseguir decifrá-los para entregar o arquivo ao usuário. A IA não recebe os arquivos segundo o código examinado; quando ativada, a pergunta e o contexto da jornada são enviados ao provedor configurado.

O código contém proteção de senha com scrypt, sessão em cookie HttpOnly, controles de origem/CSRF, limitação de tentativas, cabeçalhos de segurança e armazenamento privado para documentos quando Supabase Storage é usado. São boas bases, mas não substituem configuração correta, revisão de acesso, gestão de chaves, backup e resposta a incidentes.

### 2. Bloqueadores antes de lançamento público

#### P0 — Política e termos não podem ir ao ar como estão

`public/js/views/legal.js` apresenta a Política de Privacidade e os Termos como **“Rascunho”** e contém campos `[PREENCHER]` para controlador, CNPJ/endereço, contato, provedores, países, transferências internacionais, retenção, idade mínima, preço e foro. A tela de cadastro já recolhe aceitação, mas não há documentos completos para o usuário aceitar. O termo também traz uma limitação ampla de responsabilidade (“na máxima extensão permitida pela lei”); em relação de consumo, uma cláusula não pode eliminar direitos legais nem afastar automaticamente a responsabilidade por falha do serviço.

Antes de liberar contas reais, fechar com advogado e publicar uma versão identificável e datada, com: identidade do controlador/operador, canais de suporte e privacidade, finalidades e bases legais por categoria, fornecedores e países, regras de retenção e eliminação, direitos e procedimento de atendimento, idade mínima, preço/condições (inclusive se gratuito) e explicação correta sobre o que a Estuvia faz e não faz. O Marco Civil e a LGPD exigem transparência; o CDC mantém regras próprias de responsabilidade e invalida certas cláusulas abusivas.

#### P0 — Consentimento de documentos está inconsistente

O modal em `public/js/components/documents/DocumentUpload.js` diz que “só você acessa”. A própria política esclarece que a chave de criptografia fica no servidor. Corrigir a promessa: informar que os arquivos são cifrados, que o servidor precisa decifrá-los para servi-los e quais acessos administrativos/técnicos são possíveis e auditados. Não chamar o recurso de “privado só para você” sem qualificação verificável.

O fluxo registra versão e data do aceite, o que é um bom começo, mas o consentimento é genérico para “documentos”. Como a carteira aceita atestado médico, pode haver dado pessoal sensível de saúde sob a LGPD. O controlador precisa validar uma base legal específica para cada categoria e uma apresentação destacada e informada para dados sensíveis; um aceite genérico de upload não resolve automaticamente isso. Também não encontrei um fluxo de revogação do consentimento de documentos: o endpoint visto registra aceite, sem opção equivalente de revogar. A política promete essa revogação.

**Decisão recomendada:** reduzir o risco retirando da nuvem os documentos cujo conteúdo não seja necessário, guardando somente checklist/estado e permitindo que o estudante mantenha os originais localmente. Se a carteira continuar, limitar categorias, explicar cada finalidade, implementar retirada do consentimento e exclusão, controlar acesso da equipe, registrar todo acesso privilegiado e formalizar backup, chave e retenção.

#### P0 — Operadores e transferências internacionais sem identificação final

O código pode usar Vercel, Supabase, Resend, Anthropic ou endpoint compatível com OpenAI; há também integrações opcionais de pesquisa, vídeo e preços de viagem. Ainda não há uma lista final de quais estarão ativos, que dados recebem, países de armazenamento/acesso, suboperadores e prazos de retenção. A política mantém esses campos em aberto.

Faça um mapa de dados que cubra cada integração (incluindo conteúdo enviado ao Mentor e consultas de viagem/pesquisa), obtenha os contratos de operador/DPA, confirme regiões e suboperadores e escolha um mecanismo válido para transferências internacionais. A Resolução CD/ANPD nº 19/2024 prevê mecanismos como cláusulas-padrão contratuais e exige transparência sobre a transferência. Não basta escrever “adotamos salvaguardas” sem saber quais contratos e mecanismos realmente cobrem cada fornecedor.

#### P0 — Definir exclusão, exportação e retenção de ponta a ponta

O endpoint de exclusão remove o usuário e aciona remoção dos documentos, registros do Radar e conteúdo da comunidade. Há, porém, dados que podem permanecer:

- eventos de auditoria são mantidos até o limite de 5.000 itens, sem prazo temporal de retenção definido no código;
- métricas de uso guardam IDs de usuários e são podadas por janela de 120 dias, mas a exclusão não remove explicitamente esses IDs;
- denúncias de usuários excluídos têm o identificador do autor removido, mas o texto livre da denúncia é mantido;
- a exportação JSON exclui notas administrativas e exporta metadados dos arquivos, não o conteúdo binário desses arquivos.

Defina por escrito o que é apagado, anonimizado ou retido e por qual base/prazo; implemente a mesma regra em contas, auditoria, métricas, comunidade, Radar, storage e backups. Remover apenas o identificador não basta se texto livre ainda puder identificar alguém. Garanta ao usuário acesso/baixar seus arquivos e explique claramente o escopo do export. A política precisa descrever exceções de retenção, inclusive registros legalmente obrigatórios.

O Marco Civil prevê guarda segura de registros de acesso por seis meses para determinados provedores de aplicações constituídos como pessoa jurídica e que atuam de forma organizada, profissional e econômica. Os eventos de auditoria do Estuvia não demonstram, por si só, que essa obrigação está atendida: a retenção é por quantidade e os logs completos de acesso devem ser confirmados com a hospedagem/proxy e com assessoria jurídica.

#### P0 — Canal de privacidade, idade e prova de aceitação

A política diz que o serviço é para maiores de 18 anos, mas o formulário/API de cadastro não pede nem valida idade. Decida se menores serão excluídos e implemente uma barreira coerente; se forem aceitos, desenhe o fluxo de melhor interesse e representação/consentimento aplicável. A LGPD tem regra especial para crianças e adolescentes.

A conta registra `consentAt`, mas não uma versão identificável dos Termos/Política aceitos. Guarde evento, data/hora, versão/hash do texto apresentado e mecanismo de aceitação. Isso melhora a prova e permite avisar sobre mudanças relevantes. Também publique um canal funcional para direitos e reclamações. A indicação de encarregado pode ter exceção para certos agentes de pequeno porte, mas isso depende de enquadramento e risco; mesmo quando dispensado, deve existir canal de comunicação. Como há carteira de documentos potencialmente sensíveis, não presuma que a exceção se aplica sem avaliação.

### 3. Processo acadêmico e documental

O fluxo atual serve como organizador e preparador; não é um processo oficial integrado. Requisitos por mestrado, calendário, documentos, homologação/tradução/apostila, visto e condições consulares podem mudar e variar conforme pessoa, programa e chamada. Cada item marcado como obrigatório/condicional deve levar a uma fonte oficial, data de verificação e indicação de quando a regra é individual ou precisa de confirmação humana.

Há uma questão de calendário imediata. Na data desta auditoria, as datas gerais do DUA para 2026/27 já passaram, mas a UGR publicou em 5 de novembro um procedimento extraordinário para vagas remanescentes, com pedidos de 6 a 10 de novembro e somente para determinados mestrados. Para a próxima edição, 2027/28, não publique calendário como confirmado até existir chamada oficial. O Radar e o catálogo local ainda precisam de atualização bem-sucedida e evidência de cobertura/atualidade; a documentação de prontidão registra falha anterior de atualização e dados locais para 2026/27. O usuário deve ver “desatualizado/sem chamada oficial” em vez de datas inferidas.

Antes de cada ciclo, valide de ponta a ponta: oferta e requisitos no catálogo oficial, fases e calendários do DUA, processo extraordinário da UGR, documentos para cada fase, mensagens de erro e links externos. Teste também a rota de visto/chegada sem apresentar estimativa como decisão oficial. A publicação oficial da UGR deixa claro que a candidatura de mestrado é online pelo DUA.

### 4. Infraestrutura e operação

O repositório tem `vercel.json` e `api/index.js`, então há um caminho de implantação serverless na Vercel. Também existe execução local em `server/index.js`. A configuração padrão do banco é JSON local; em serverless isso não é persistência confiável. A opção atual para produção é configurar banco e storage duráveis (por exemplo, Supabase), validar buckets privados, políticas, região e chaves de servidor. **Não há evidência neste repositório de que uma URL de produção esteja publicada, nem de que região, contratos, segredos, TLS, recuperação de senha, monitoramento e restauração tenham sido validados ao vivo.**

`LANCAMENTO.md` ainda descreve JSON local como caminho principal e desaconselha Vercel; isso conflita com a integração Supabase/Vercel que hoje existe no código. Atualize o runbook para uma arquitetura única de lançamento. Antes de abrir ao público, validar em staging com credenciais reais: registro, recuperação de senha, envio/abertura/exclusão de arquivo, exportação e exclusão da conta, reinício/deploy, backup e restauração. Confirmar que `JWT_SECRET`, `DOCUMENTS_KEY`, credenciais Supabase e e-mail estão em secret manager e nunca no navegador/repositório. Definir MFA para conta administrativa, menor privilégio, revisão de acessos e procedimento de troca/restauração da chave.

Os testes automatizados anteriormente registrados no projeto passaram (237/237 e verificação de sintaxe 190/190), mas usam provedores/fixtures locais e não comprovam um deploy real, acessibilidade, fluxo em navegador, região contratual, transferências ou segurança operacional.

### 5. LGPD, GDPR e redução de risco jurídico

Mantenha um registro das operações de tratamento (dados, finalidades, base legal, sistema, operadores, país, retenção e controles), documente o teste de legítimo interesse quando usado e prepare um Relatório de Impacto à Proteção de Dados. A LGPD permite que a ANPD determine o relatório; para uma plataforma que guarda documentos de identidade e pode receber dados de saúde, preparar o RIPD antes do lançamento é uma medida prudente de prestação de contas, não uma afirmação de que a lei exige automaticamente um relatório em todo caso.

Crie um procedimento de incidente: canal de acionamento, responsável, contenção, preservação de evidências, avaliação de risco, contato com provedores, modelos de aviso e registro das decisões. Quando o incidente puder acarretar risco ou dano relevante, a regra da ANPD prevê comunicação à ANPD e aos titulares em três dias úteis, ressalvadas regras específicas.

O GDPR pode ser aplicável dependendo de onde o controlador/processador está estabelecido e de a plataforma oferecer serviços a pessoas localizadas na UE ou monitorar o comportamento delas lá. O assunto ser “estudar na Espanha”, por si só, não determina a aplicação. Como a plataforma trata candidatura e chegada na Espanha, faça uma análise territorial com advogado antes de decidir que só a LGPD vale; se o GDPR for aplicável, revisar bases, direitos, contratos, dados de saúde e criminais, segurança e prazos europeus.

Não há termo, CNPJ, cláusula ou seguro que impeça alguém de ajuizar uma ação ou elimine responsabilidade legal. O que reduz exposição é tratar menos dados, fazer promessas verdadeiras, manter informação oficial atualizada e rastreável, cumprir direitos e prazos, controlar acessos, corrigir falhas, documentar decisões e ter contratos/seguros adequados. Recomendo advogado de privacidade/consumidor para fechar a estrutura do negócio e revisar os textos, além de avaliar com corretor seguro cibernético e responsabilidade profissional/tecnológica. A estrutura societária pode organizar a atividade e o risco, mas não é imunidade pessoal automática.

### 6. Plano de lançamento por ordem

1. **Bloqueio legal:** completar e revisar Política/Termos, decidir idade mínima e preço, publicar contato e responsável, registrar versões aceitas.
2. **Documentos:** corrigir a mensagem do consentimento, fazer análise de base legal para dados de saúde, implementar revogação/exclusão e decidir se a carteira deve guardar documentos sensíveis.
3. **Mapa e fornecedores:** listar dados enviados e países de cada provedor, contratos de operador e mecanismo documentado de transferência.
4. **Direitos e retenção:** alinhar exportar/excluir com o que permanece em logs, métricas, denúncias e backups; criar calendário de retenção e processo de solicitação.
5. **Governança:** registro de tratamento, RIPD, canal de privacidade/encarregado conforme enquadramento e plano de incidentes.
6. **Processo de Granada/Andaluzia:** atualizar a chamada corrente, distinguir fase regular e extraordinária, não afirmar datas 2027/28 antes da fonte oficial, revisar documentos e cobertura dos mestrados.
7. **Produção:** selecionar host/DB/storage e região, configurar segredos e e-mail, backups/restauração, MFA/admin, monitoramento e smoke tests em staging.
8. **Aprovação final:** advogado revisa documentação; responsável técnico verifica evidências de produção; então liberar um piloto limitado e monitorado. Só ampliar após observar o fluxo real e corrigir falhas.

### 7. Fontes oficiais consultadas

- [Lei Geral de Proteção de Dados — LGPD, texto no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Resolução CD/ANPD nº 19/2024 — transferências internacionais e cláusulas-padrão](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
- [ANPD — comunicação de incidente de segurança e prazo de três dias úteis](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Resolução CD/ANPD nº 2/2022 — agentes de pequeno porte e canal de atendimento](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- [Marco Civil da Internet — art. 15, guarda de registros de acesso](https://www.planalto.gov.br/ccivil_03/leis/l12965.htm)
- [Código de Defesa do Consumidor — arts. 14 e 51](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)
- [GDPR — Regulamento (UE) 2016/679, especialmente arts. 3, 9, 10, 28, 32 e 33](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/)
- [Junta de Andalucía — calendário DUA de mestrados 2026/27 para títulos estrangeiros não homologados](https://www.juntadeandalucia.es/boja/2025/245/50)
- [Universidad de Granada — chamada extraordinária 2026/27, solicitação de 6 a 10 de novembro](https://saap.ugr.es/informacion/noticias/procedimiento-extraordinario)
- [UGR — pedido de admissão a mestrados via Distrito Único Andaluz](https://www.ugr.es/destacado/admision-estudios-master-curso-2026-2027)

---

<a id="parte-5"></a>

# Parte 5 — Apresentação e próximos passos

<a id="doc-09"></a>

## 09 — Roteiro de apresentação (≈10 min)

**Preparação:** `npm install && npm start`, janela anônima em `http://localhost:3000`. (Com `ANTHROPIC_API_KEY` o Mentor usa o Claude; sem ela, responde com a base verificada — apresente isso como resiliência.)

1. **Problema (30 s).** Dezenas de sites, prazos e documentos; um erro custa meses.
2. **Cadastro + onboarding (1 min).** 6 etapas (origem, formação, idiomas, orçamento, destino, documentos) com o resumo "Seu perfil até agora" se atualizando. No destino, escolha a UGR e, em "Já sei qual mestrado quero", um mestrado do Radar. Mostre a revisão e o resultado real: rodada inicial, missões não aplicáveis, progresso reconhecido.
3. **Início (1 min).** Hero da jornada, progresso, **alertas inteligentes**, Agenda AI, prazos, finanças.
4. **Minhas Jornadas → Rodadas (1 min).** Cards com capa e "Acessar Rodadas"; cards de rodada com estado e %; trilha F de financiamento.
5. **Trilha (1 min).** Zigue-zague, "Você está aqui", bloqueios por dependência, botão "Continuar minha jornada".
6. **Conteúdo da missão (2 min).** Abra 1.2: cards → Documentos e checklist (marque objetivos) → Executar → "Concluí" → confirmação. Volte à trilha: o nó ficou verde. Abra 6.1 e 9.4 para mostrar **cards diferentes por tipo**.
7. **Decisão externa (1 min).** Em Rodadas → Situação: "Admitido(a)". A 4.1 vira **crítica**; a Agenda sugere replanejar.
8. **Financiamento (1 min).** Registre €3.000: aparece o déficit e os caminhos; salve uma bolsa (tarefas criadas); marque como concedida e veja o simulador mudar.
9. **Agenda AI (1 min).** "Organizar minha semana com IA" → proposta tracejada → Aprovar → arraste um bloco.
10. **Mentor (30 s).** "Não tenho dinheiro suficiente" → resposta com números reais e ações que exigem clique.
11. **Fecho (30 s).** Segurança (senhas scrypt, CSRF, CSP, sem documentos no servidor), 42 testes, próximos passos (banco, catálogo verificado, notificações).

<a id="doc-10"></a>

## 10 — Próximos passos

### Ciclos (do documento de visão)

| Ciclo | Entrega | Status |
|---|---|---|
| 0 — Base editorial | Manual convertido em regras, tarefas e fontes | ✅ `server/content/` |
| 1 — Protótipo | Perfil, catálogo piloto, ficha, roadmap e tarefas | ✅ |
| 2 — MVP | Preferências, status manual, orçamento, fontes, IA, gamificação | ✅ (calendário 2026/27 cadastrado no Radar; próximo ciclo depende de publicação oficial) |
| 3 — Validação | Entrevistas, usabilidade, disposição a pagar | ⏳ próximo |
| 4 — Andaluzia | Mais universidades e cursos com revisão editorial | ⏳ |
| 5 — Expansão | Comunidade, oportunidades, novas regiões | ⏳ |

### Técnico (em ordem de prioridade)

1. **Banco de dados:** PostgreSQL, reimplementando `server/store.js` (ver `03-arquitetura.md`).
2. **Recuperação de senha e verificação de e-mail.**
3. **Catálogo real por programa:** o Radar cobre 138 mestrados UGR em 2026/27. Verificar requisitos acadêmicos, idioma, documentos e oferta de cada programa diretamente na ficha oficial antes de recomendar candidatura; o coletor atual não confirma idioma nem todos os requisitos.
4. **Calendário (RF-08):** importar e revisar o calendário de cada novo ciclo assim que houver publicação oficial, com fonte. Lembretes por e-mail continuam pendentes; data sem fonte não gera alerta.
5. **Painel editorial (RF-10):** tela para cadastrar requisito, fonte, data de revisão e status, com alerta de regra vencida.
6. **Avaliação do Guia:** conjunto de perguntas reais com resposta esperada.
7. **Analytics com privacidade** para as métricas de ativação e uso contínuo.
8. **Deploy:** container ou PaaS com HTTPS e `NODE_ENV=production`.
9. **Conferência visual no celular** (doc 22, seção 7): a camada minimalista e a barra inferior foram feitas sem teste em navegador.
10. **Minha pasta offline:** guardar no aparelho uma cópia dos arquivos marcados "levar na viagem", para abrir no aeroporto sem internet (PWA).
11. **Testes do Radar:** `tests/radar.test.js` (critérios 7–10 e 11–14) falham hoje, provavelmente por datas fixas que já passaram. Corrigir antes do próximo ciclo.

### Validação (antes de construir mais)

- Entrevistar 12–15 pessoas: interessados, candidatos em processo e recém-chegados.
- Teste moderado com 5 usuários: eles identificam o próximo passo? Entendem as etiquetas?
- Medir se a gamificação aumenta o retorno (H2).
- Teste de interesse em recursos pagos (H5).

### Decisões em aberto

Nome e marca · cursos-piloto · canais de alerta · modelo de atualização editorial · escopo final do planejador financeiro · política de monetização.
