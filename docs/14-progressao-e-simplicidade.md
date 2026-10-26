# 14 — Progressão, simplicidade e complexidade adaptativa

A regra de produto: **mostrar a jornada completa em visão geral, liberar a execução detalhada aos poucos, sem esconder alertas, custos ou obrigações.** A interface acompanha a complexidade real da tarefa, nunca a do template.

## 1. Acesso

Sem conta, só a página de apresentação, o login e o cadastro. Manual, fontes, catálogo e conteúdo das missões exigem login (`requireAuth` em `/api/content/*`, exceto `app` e `journey`, que devolve só a visão geral das rodadas, sem missões).

## 2. Progressão (servidor)

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

## 3. Requisitos já atendidos

`GET/PUT /journeys/requirements` cobre passaporte, diploma, histórico e TIE (a TIE só depois da chegada). As perguntas aparecem uma de cada vez no onboarding e podem ser corrigidas em "Meu perfil → O que eu já tenho". "Sim, já tenho" marca a missão como **requisito já atendido** e o documento como "pronto". Mudar a resposta desfaz só o que ela marcou.

## 4. Complexidade adaptativa (interface)

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

## 5. Assistente

As ações rápidas novas estão em `assistant-context.quickAnswer`. A regra 12 do prompt pede resposta curta primeiro, termos explicados e aprofundamento sob pedido. O contexto inclui a complexidade e o risco da missão. As respostas podem trazer `acoes` do tipo `perguntar`, que encadeiam outra ação rápida. O novo Mentor (outra sessão, `/api/mentor`) segue o mesmo contrato.

## 6. Testes

`tests/progression.test.js` cobre os 15 critérios de aceitação da progressão, mais acesso só com conta, complexidade e risco, requisitos atendidos e reversíveis, SKIPPED e chegada.
