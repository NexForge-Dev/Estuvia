# Estuvia — jornada de mobilidade acadêmica internacional

Plataforma que **não diz apenas como chegar à Espanha: ajuda a planejar, organizar e executar cada passo**. O processo real de um brasileiro que quer cursar um Máster Universitario oficial (começando pela Universidad de Granada, via Distrito Único Andaluz) vira **Jornada → Rodadas → Missões → Objetivos**, integrado a Agenda AI, Mentor IA, financiamento, documentos, moradia e viagem.

**Princípio:** a Estuvia orienta e organiza. Candidatura, matrícula, visto e pedidos oficiais são feitos nos sistemas competentes. Nada é concluído sem a confirmação do estudante.

---

## Como rodar

Requisitos: **Node.js 20+** (testado com 22).

```bash
npm install
npm start          # http://localhost:3000
npm test           # 128 testes (jornada, agenda, finanças, documentos, segurança, Radar, Comunidade, Conquistas, Mentor…)
```

Crie uma conta → onboarding (5 passos) → sua primeira jornada é gerada. Para usar: [23 — Guia de uso](docs/23-guia-de-uso.md).

**IA (opcional):** sem chave, o Mentor responde em modo "base verificada" (ações rápidas calculadas com os dados reais da jornada). Para ativar o Claude: `cp .env.example .env`, preencha `ANTHROPIC_API_KEY` e reinicie.

**Ilustrações:** as capas e banners são arte própria em SVG (`npm`-free): `node scripts/generate-art.mjs`. Para usar fotos reais, salve arquivos com o mesmo nome em `public/img/`.

---

## Telas

| Tela | Rota | O que faz |
|---|---|---|
| Início (dashboard) | `#/` | Minha jornada, progresso geral, continuar missão, até 3 **alertas inteligentes**, rodada atual, Agenda AI, prazos e finanças |
| Minhas Jornadas | `#/jornadas` | Cards com capa, destino, curso, ano, status, progresso e **Acessar Rodadas**; criar/excluir jornadas |
| Rodadas | `#/j/:id` | Cards de rodada com banner, estado (Atual/Concluída/Disponível/Bloqueada), missões e %; situação externa; prazos; marcos |
| Trilha de missões | `#/j/:id/r/:n` | **Zigue-zague** com nós por estado, linha que acompanha o progresso, "Você está aqui" e botão fixo **Continuar minha jornada** |
| Conteúdo da missão | `#/j/:id/m/:missão` | Cabeçalho Jornada/Rodada/Missão, **Seu progresso nesta missão** e **cards funcionais por tipo de missão** (antes de começar, guia, fluxo, documentos, Agenda AI, executar, Mentor, simulador, bolsas, moradia…) + experiências da comunidade |
| Agenda AI | `#/agenda` | Calendário semanal, filtros, **clicar e arrastar para criar**, arrastar para reagendar, puxar a borda para mudar a duração, disponibilidade, **Organizar minha semana com IA**, **Replanejar**, prazos oficiais × declarados |
| Financiamento | `#/financiamento` | (A) comprovação do visto (IPREM parametrizado por ano) × (B) orçamento real; recursos, apoio familiar, bolsas, caminhos quando falta dinheiro |
| Meu novo lar | `#/novo-lar` | Cadastro e comparação de moradias, verificação antifraude, escolha integrada ao orçamento |
| Viagem | `#/viagem` | Rotas cotadas (custo total), escolha integrada ao orçamento, chegada |
| Documentos | `#/documentos` | **Minha pasta** (todos os arquivos, de qualquer etapa, e "Outro documento"), carteira por etapa da jornada, status, validade, envios por procedimento |
| Mestrados | `#/mestrados` | Catálogo com filtros, requisitos, "Minhas opções" (até 6) |
| Mentor IA | painel flutuante + `#/assistente` | Contexto da jornada/missão, ações rápidas, ações propostas com confirmação |
| Oportunidades, Comunidade, Conquistas | `#/oportunidades`, `#/comunidade`, `#/conquistas` | Módulos integrados (docs 11, 12 e 06) |
| Painel admin | `#/admin` | Só para a conta `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env` (criada ao iniciar o servidor). A conta admin vê **só** o painel: **status da IA** (chaves do Mentor/Assistente, uso, falhas e botão "Testar agora"), **inscrições** de todos (candidatura, matrícula, visto), lista de alunos com filtros (com alerta, sem entrar há 7+ dias, admitidos…) e **ficha de acompanhamento de cada aluno** em `#/admin/aluno/:id` (dias sem entrar, jornadas e inscrição, prazos, documentos, finanças e bolsas, moradia, viagem, agenda, pontos de atenção e anotações internas), quem está online e em que tela, **módulos mais acessados** (acessos, pessoas, tempo médio; 7/30/90 dias), ativos por dia (30 dias), lista de usuários com último acesso, IP e dispositivo, eventos (cadastros, logins, logins falhos), encerrar sessões e suspender contas |

**Navegação:** menu com Início, Minha jornada, Agenda, Documentos e Financiamento; o resto fica em **Mais**. No celular, barra inferior com os 4 primeiros + Menu (doc 22).

---

## Estrutura

```
server/
  app.js, index.js, config.js, security.js, store.js
  journey-engine.js     status, dependências, decisões externas, prazos, progresso, recomendação
  finance-engine.js     exigência do visto × orçamento × recursos, caminhos
  agenda-engine.js      proposta semanal, foco por missão, replanejamento
  assistant-context.js  contexto do Mentor + respostas determinísticas das ações rápidas
  content/              rounds.js (8 rodadas + trilha F), catalog, documents, finance (IPREM), scholarships, places, sources
  routes/               auth, me, journey, planner, finance, living, assistant, content (+ radar, community, achievements)
  radar/, community-engine.js, achievements-engine.js   (módulos das outras frentes)
public/
  index.html, css/styles.css (design system dark-first), css/minimal.css (camada minimalista + celular, carregada por último)
  js/app.js (roteador), api.js, ui.js, icons.js, data.js, localfiles.js (anexos só no navegador)
  js/components/  JourneyCard, RoundCard, JourneyProgress, MissionPath (MissionNode), MissionContent,
                  MissionDetail (MissionChecklist, documentos), MissionTools, AIJourneyAssistant, WeeklyPlanner, common,
                  MentorPanel, QuickPlan, MissionGuide, ResultCard,
                  documents/ (MyFolder, DocumentCard, DocumentDetailPanel, DocumentUpload, MissionDocuments),
                  mission-hub/ (MissionHub), travel/ (TravelDashboard)
  js/views/       home, journeys, journey, trail, mission, agenda, finance, housing, travel, documents, catalog, onboarding, profile, manual, sources, landing, auth, assistant
scripts/generate-art.mjs
tests/
```

## Documentação

**Tudo num arquivo só:** [DOCUMENTACAO.md](DOCUMENTACAO.md), com índice. É gerado a partir dos arquivos abaixo com `npm run docs`: edite os arquivos de `docs/` e gere de novo.

| Documento | Conteúdo |
|---|---|
| [13 — Jornada Estuvia](docs/13-jornada-estuvia.md) | **Principal:** modelo de dados, rodadas e missões, regras, tela de missão, Agenda AI, financiamento, critérios de aceitação |
| [14 — Progressão e simplicidade](docs/14-progressao-e-simplicidade.md) | Desbloqueio de rodadas e missões, trilhas paralelas, requisitos já atendidos, missões simples/guiadas/complexas, acesso só com conta |
| [05 — API](docs/05-api.md) | Endpoints |
| [04 — Segurança e privacidade](docs/04-seguranca.md) | Controles e checklist de produção |
| [06 — Gamificação e conquistas](docs/06-gamificacao.md) | Progresso, marcos e conquistas |
| [07 — Assistente de IA](docs/07-assistente-ia.md) | Regras do Mentor e modo offline |
| [09 — Roteiro de apresentação](docs/09-roteiro-apresentacao.md) | Demo |
| [10 — Próximos passos](docs/10-proximos-passos.md) | Roadmap |
| [15 — Mentor Estuvia](docs/15-mentor.md) | Agente com ferramentas: Modo Guiado sem API paga, confirmação de ações, memória, avisos proativos, provedores de IA |
| [16 — Planejador financeiro](docs/16-planejador-financeiro.md) | Custos estimados com fonte, três contas separadas (preparar, manter, visto), recursos garantidos × prometidos, câmbio BCE, cenários e alternativas |
| [19 — Meu Novo Lar](docs/19-meu-novo-lar.md) | Busca guiada com links conferidos, adicionar por link, cards, comparação, "Conferir antes de pagar", integração com finanças, missões, Agenda e Mentor |
| [17 — Resultados estruturados](docs/17-resultados-estruturados.md) | Formato padrão de resultados (consulado e outros) |
| [18 — Central da missão](docs/18-central-da-missao.md) | MissionHub: cards conforme a complexidade real da missão |
| [20 — Minha Viagem](docs/20-minha-viagem.md) | Percursos, cotação por link, comparação, itinerário e chegada |
| [21 — Documentos](docs/21-documentos.md) | Carteira digital por etapa, **Minha pasta**, arquivos cifrados, integração com missões |
| [22 — Interface e celular](docs/22-interface-e-celular.md) | Camada minimalista, navegação ("Mais", barra inferior), regras de celular, como testar |
| [23 — Guia de uso](docs/23-guia-de-uso.md) | Como usar a plataforma hoje, passo a passo (para o estudante) |
| [11 — Radar de Oportunidades](docs/11-radar.md) | Monitoramento de fontes oficiais |
| [12 — Comunidade](docs/12-comunidade.md) | Comunidade moderada |
| [01](docs/01-visao-produto.md), [02](docs/02-requisitos.md), [03](docs/03-arquitetura.md), [08](docs/08-manual-do-estudante.md) | Visão, requisitos, arquitetura e manual da versão 0.1 (contexto histórico) |

---

**Dados e honestidade:** fontes oficiais consultadas em 24/10/2026. Programas do catálogo local são **demonstrativos** (rótulo "Dados demo"); o Radar traz programas reais da UGR. O IPREM 2026 (€600), o link curto do DUA e o e-mail do consulado de Salvador foram informados pelo idealizador e aparecem como **pendentes de confirmação**. Bolsas aparecem como "sem edital confirmado" até a conferência do edital vigente. Não há tutoriais em vídeo verificados — o card de tutorial fica oculto até existir um.
