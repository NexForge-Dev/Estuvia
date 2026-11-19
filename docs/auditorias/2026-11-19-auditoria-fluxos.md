# Auditoria de fluxos — 2026-11-19

Cópia do formulário em Claude Docs: https://claude.ai/artifact/LqCNU1Z68dSeMh24Efz4qF

## Resumo

A auditoria achou 16 itens: 1 possível alto (E1, a confirmar), 3 médios e 12 baixos. O E11 não era erro.

- **Corrigidos:** E2, E5, E7, E8, E9, E10, E12, E13 e E14, no commit `920e36b` (publicado na produção em 2026-11-19).
- **Testes:** os 457 testes automáticos passam e os 260 arquivos não têm erro de sintaxe.
- **Correções anteriores:** as do E2E de 2026-11-18 que reconferimos continuam funcionando (A1–A5, A7, A8, A10–A13).

**Método:** 3 agentes testaram em servidores locais isolados (base JSON, sem Supabase), pela tela e pela API. Focaram no que não foi testado em 2026-11-18 (ver `2026-11-18-e2e-todos-os-fluxos.md`).

## Formulário de erros

| ID | Gravidade | Fluxo | Erro | Onde | Como reproduzir | Status |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Alto (a confirmar) | Onboarding | O navegador travou ("Target crashed") entre a etapa Destino e a tela de resultado. Pode ser só do Chrome sem tela usado no teste | `public/js/views/onboarding.js:392-430`, `resultScreen` ~654 | Preencher as 6 etapas até "Gerar minha jornada" | A confirmar |
| E2 | Médio | Missões / Rodada 7 | Com visto aprovado e chegada registrada, a Rodada 7 seguia bloqueada até marcar a 5.9 | `server/journey-engine.js` (`registerArrival`) | Situação visto=aprovado, POST /arrival, abrir a jornada | Corrigido |
| E3 | Médio | Novo lar / cidades | Só Granada tem moradia, faixas de preço, custos e guia da cidade | `server/content/housing.js:48`, `costs.js:47`, `places.js:119` | Aluno da UMA abre #/novo-lar | Aberto (precisa de dados com fonte) |
| E4 | Médio | Mestrados / catálogo | Só os 138 mestrados da UGR; as outras 9 universidades estão "em coleta" | catálogo do Radar | Abrir #/mestrados | Aberto (precisa de dados com fonte) |
| E5 | Baixo | Finanças | "Pago" sem valor era aceito e ignorado (`jaPago` = 0) | `server/routes/finance.js`, `public/js/views/finance.js` | PUT /finance {itens:{moradia:{status:'pago'}}} | Corrigido |
| E6 | Baixo | Finanças | Partida e vencimento no passado são aceitos; mudar a partida não muda os meses (pode ser de propósito) | `server/routes/finance.js:57-70` | PUT /finance {partida:'2020-01-01'} | A confirmar |
| E7 | Baixo | Missões / QuickPlan | O atalho de planejamento usava o fuso fixo de São Paulo | `public/js/components/QuickPlan.js` | Usar "Meu planejamento" numa missão estando na Espanha | Corrigido |
| E8 | Baixo | Agenda / celular | Faltava nome acessível em "Organizar semana" com só o ícone. A faixa de filtros rolando para o lado é proposital | `public/js/components/WeeklyPlanner.js:97` | #/agenda a 390 px | Corrigido |
| E9 | Baixo | Agenda / API | `/planner/approve` recusava a própria proposta do `/suggest` (campo `prioridadeLabel`) | `server/routes/planner.js` | Reenviar a proposta inteira | Corrigido |
| E10 | Baixo | Viagem | Cotação sem preço mostrava "Faltam: e bagagem" | `public/js/components/travel/TravelDashboard.js:294` | Salvar cotação sem preço | Corrigido |
| E11 | — | Viagem | Cotação com `via-malaga` para aluno de Granada | `server/routes/travel.js` | — | Não é erro: é percurso válido de Granada |
| E12 | Baixo | Radar admin | Erro 400 "Opção inválida." sem dizer o campo | `server/routes/radar-admin.js` | GET /api/radar/admin/history sem parâmetros | Corrigido |
| E13 | Baixo | Idioma es | 76 frases de #/perfil sem tradução | `public/js/i18n.js` | Español, abrir #/perfil | Corrigido |
| E14 | Baixo | Idioma es | "Baixar meus dados" sem tradução | `public/js/i18n.js` | Español, abrir #/perfil | Corrigido |
| E15 | Baixo | Fontes / Missão 1.4 | Numa jornada 2027/28 a fonte O1 se chama "Procedimento DUA 2026/27" (talvez título histórico) | `server/content/sources.js` (O1) | Abrir a 1.4 numa jornada 2027/28 | A confirmar |
| E16 | Baixo | Comunidade | O autor de um post removido recebe 404 e não vê o motivo (talvez de propósito) | `server/routes/community.js:199` | Moderador remove; autor abre o post | A confirmar |

## Fluxos verificados sem erro

- **Conta:** cadastro, login, esqueci/redefinir senha, edição do perfil, "Sair de todos".
- **Jornadas:** até 6 jornadas, com a 7ª recusada; exclusão funciona; link "Pular para o conteúdo" e âncoras da landing sem 404.
- **Missões:** 106 páginas em 2 perfis, sem erro de JS nem resposta 4xx/5xx; a Rodada 2 libera certo.
- **Agenda e finanças:** replanejar não apaga blocos; o custo mensal pago conta certo; os 7 estados de bolsa funcionam.
- **Mentor, Conquistas e Radar do aluno:** carregam a 1280 e 390 px; o Mentor sem IA funciona no modo guiado.
- **Admin:** todas as abas carregam; Status mostra Resend e CRON_SECRET; filtros, ficha, notas, suspensão e papéis funcionam.
- **Autorização:** aluno recebe 403 em 34 rotas de admin, moderação e Radar admin.
- **Moderação:** denúncia → fila → remover → restaurar, com dados pessoais mascarados.
- **Mestrados e viagem:** calculadora de nota, 1.4 e comparação funcionam; viagem para Málaga e cotação sem preço também.
- **Produção:** site e `/api/health` respondem 200, com CSP e HSTS; `/api/cron/radar` responde 401 sem senha.

## Não testado

Documentos pela tela, exclusão de conta pela tela, onboarding completo em espanhol e 2ª/3ª jornada pela tela.
