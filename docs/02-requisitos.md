# 02 — Requisitos e regras de negócio

> **Documento da versão 0.1 (Travessia, 6 fases).** A versão atual (Estuvia: 8 rodadas + trilha de financiamento, Agenda AI, financiamento, moradia, viagem) está descrita em [13 — Jornada Estuvia](13-jornada-estuvia.md).

Legenda de status: ✅ implementado no MVP · 🟡 parcial · ⏳ planejado

## Requisitos funcionais

| ID | Prior. | Requisito | Status | Onde |
|---|---|---|---|---|
| RF-01 | P0 | Onboarding: nome, formação, área, estado, idiomas, ano pretendido, "porquê" | ✅ | `public/js/views/profile.js`, `PUT /api/me/profile` |
| RF-02 | P0 | Catálogo de universidades e mestrados | 🟡 9 universidades + 3 programas de demonstração | `server/content/catalog.js` |
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

## Regras de negócio e como o sistema as respeita

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

## Requisitos não funcionais

| Requisito | Status |
|---|---|
| Privacidade: minimização, sem cópias de documentos, exportação e exclusão | ✅ |
| Segurança: hash forte, sessão httpOnly, CSRF, CSP, rate limit, logs de auditoria | ✅ ver `04-seguranca.md` |
| Confiabilidade: etiquetas e datas de revisão; status autodeclarado identificado | ✅ |
| Acessibilidade: mobile-first, teclado, foco visível, contraste, `prefers-reduced-motion`, linguagem simples | ✅ |
| Resiliência: IA indisponível → base verificada; nunca inventa regra | ✅ |
