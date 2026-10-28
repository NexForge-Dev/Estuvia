# Estuvia — an international academic mobility journey

A platform that **doesn't just tell you how to get to Spain: it helps you plan, organize and carry out every step**. The real process for a Brazilian who wants to take an official Máster Universitario (starting with the Universidad de Granada, via the Distrito Único Andaluz) becomes **Journey → Rounds → Missions → Goals**, integrated with the AI Planner, AI Mentor, funding, documents, housing and travel.

**Principle:** Estuvia guides and organizes. Applications, enrollment, visas and official requests are made in the competent systems. Nothing is marked as done without the student's confirmation.

---

## How to run

Requirements: **Node.js 20+** (tested with 22).

```bash
npm install
npm start          # http://localhost:3000
npm test           # 235 tests (journey, planner, finances, documents, security, Radar, Community, Achievements, Mentor…)
```

Create an account → onboarding (5 steps) → your first journey is generated. How to use it: [23 — User guide](docs/23-guia-de-uso.md).

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
| [13 — Estuvia Journey](docs/13-jornada-estuvia.md) | **Main:** data model, rounds and missions, rules, mission screen, AI Planner, funding, acceptance criteria |
| [14 — Progression and simplicity](docs/14-progressao-e-simplicidade.md) | Unlocking rounds and missions, parallel tracks, requirements already met, simple/guided/complex missions, account-only access |
| [05 — API](docs/05-api.md) | Endpoints |
| [04 — Security and privacy](docs/04-seguranca.md) | Controls and production checklist |
| [06 — Gamification and achievements](docs/06-gamificacao.md) | Progress, milestones and achievements |
| [07 — AI Assistant](docs/07-assistente-ia.md) | Mentor rules and offline mode |
| [09 — Presentation script](docs/09-roteiro-apresentacao.md) | Demo |
| [10 — Next steps](docs/10-proximos-passos.md) | Roadmap |
| [15 — Estuvia Mentor](docs/15-mentor.md) | Tool-using agent: Guided Mode without a paid API, action confirmation, memory, proactive notices, AI providers |
| [16 — Financial planner](docs/16-planejador-financeiro.md) | Estimated costs with sources, three separate accounts (prepare, sustain, visa), guaranteed × promised resources, ECB exchange rates, scenarios and alternatives |
| [19 — My New Home](docs/19-meu-novo-lar.md) | Guided search with verified links, add by link, cards, comparison, "Check before paying", integration with finances, missions, Planner and Mentor |
| [17 — Structured results](docs/17-resultados-estruturados.md) | Standard results format (consulate and others) |
| [18 — Mission hub](docs/18-central-da-missao.md) | MissionHub: cards according to the mission's real complexity |
| [20 — My Trip](docs/20-minha-viagem.md) | Routes, quote by link, comparison, itinerary and arrival |
| [21 — Documents](docs/21-documentos.md) | Digital wallet by step, **My folder**, encrypted files, integration with missions |
| [22 — Interface and mobile](docs/22-interface-e-celular.md) | Minimalist layer, navigation ("More", bottom bar), mobile rules, how to test |
| [23 — User guide](docs/23-guia-de-uso.md) | How to use the platform today, step by step (for students) |
| [24 — Real time, web search, flight prices and notes](docs/24-tempo-real-e-pesquisa.md) | Live updates (SSE), adaptive Radar checks, free web/video search in the Mentor, flight prices and price alerts, mission notes |
| [25 — Production readiness](docs/25-production-readiness.md) | What the code actually does in production, required env vars, roles, backup/restore, verified vs. unverified items, launch blockers and legal questions |
| [11 — Opportunity Radar](docs/11-radar.md) | Monitoring of official sources |
| [12 — Community](docs/12-comunidade.md) | Moderated community |
| [01](docs/01-visao-produto.md), [02](docs/02-requisitos.md), [03](docs/03-arquitetura.md), [08](docs/08-manual-do-estudante.md) | Vision, requirements, architecture and manual for version 0.1 (historical context) |

---

**Data and honesty:** official sources consulted on 10/24/2026. Programs in the local catalog are **demonstrative** ("Demo data" label); the Radar brings real UGR programs. The 2026 IPREM (€600) stays **pending confirmation**: it matches Ley 31/2022 (2023 budget, automatically extended into 2026), but no 2026-specific norm was found in the BOE on 10/28/2026. The DUA short link (`lajunta.es/portaldua` → Junta de Andalucía DUA page) and the Salvador consulate contacts were checked against the official pages on 10/28/2026. Scholarships appear as "no confirmed call" until the current call is checked. There are no verified video tutorials — the tutorial card stays hidden until one exists.
