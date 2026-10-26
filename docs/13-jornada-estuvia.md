# 13 — Jornada Estuvia: rodadas, missões e módulos integrados

## 1. Hierarquia

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

## 2. Rodadas

1. **Encontrando meu mestrado** — perfil acadêmico, explorar universidades, encontrar o mestrado, elegibilidade, planejamento financeiro inicial.
2. **Preparando minha candidatura** — passaporte, diploma, histórico, complementares, idioma (só se exigido), CV/cartas, organizar documentação.
3. **Conquistando minha vaga** — DUA, fase, candidatura, mestrados (até 6), anexos, envio, comprovante, contato com a universidade (recomendação), adjudicação, lista de espera (condicional).
4. **Confirmando minha matrícula** — resultado, procedimento, ação no prazo, taxas, pagamento, comprovantes, documentação para o visto.
5. **Conquistando meu visto** — consulado, e-mail ao consulado (recomendação), checklist, recursos (integra finanças), seguro, complementares, solicitar, acompanhar, conferir.
6. **Preparando minha mudança** — Meu novo lar, escolha (entra no orçamento), passagens, documentos de viagem, chegada.
7. **Cheguei à Espanha** — moradia, universidade, acessos, horários, telefone, banco, transporte, registros locais + guia de Granada.
8. **Regularizando minha estadia** — TIE (só para estadia > 6 meses).
- **Trilha F — Como vou financiar meus estudos?** (transversal, ids `9.x` exibidos como `F.x`).

## 3. Estados e regras

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
- **Prazos:** só regra oficial (TIE = entrada + 30 dias), prazo confirmado pelo Radar ou data declarada pelo estudante. Nunca inventados.
- **Progresso:** missão não concluída vale no máximo 85% do seu peso; rodadas e jornada só chegam a 100% com conclusões reais.

## 4. Conteúdo da missão

`components/MissionContent.js` — cabeçalho contextual, "Seu progresso nesta missão" (objetivos reais) e grade de cards que **abrem funcionalidades** em painéis:

| Tipo (`missionType`) | Cards |
|---|---|
| candidatura | Antes de começar, Guia completo, (Tutorial), Fluxo, Documentos, Agenda AI, Executar, Mentor, Ferramenta |
| financeiro | Entenda a exigência, Simulador, Documentos, Alternativas, Bolsas, Agenda AI, Mentor, Executar |
| moradia | Guia, Comparador, Custos, Checklist de segurança, Agenda AI, Executar, Mentor, Fluxo |
| tie | Antes de começar, Documentos, Como fazer, Executar (portal oficial), (Tutorial), Agenda AI, Mentor, Fluxo |
| bolsas | Elegibilidade, Radar, Comparar, Documentos, Agenda AI, Executar, Mentor |

O card **Tutorial visual** só aparece com tutorial verificado (nenhum cadastrado). **Executar missão** registra "Ainda não comecei / Estou fazendo / Aguardando resposta / Concluí / Preciso de ajuda"; "Concluí" pede confirmação com o critério. Abrir o portal ou ler o guia não conclui nada.

## 5. Agenda AI (`agenda-engine.js`)

- Entrada: missões abertas de todas as jornadas, tarefas de bolsas, disponibilidade (dias, janela, horas/semana, preferência curta/longa, fuso) e compromissos existentes.
- Prioridade: crítica → alta → normal → aguardando resposta (blocos curtos de verificação).
- `POST /planner/suggest` gera proposta (opcionalmente focada numa missão — "Organizar esta missão na minha semana"); o estudante remove/edita e **aprova**.
- `POST /planner/replan` remove blocos sugeridos futuros que perderam sentido (missão concluída, bloqueada, aguardando) e propõe de novo.
- Nunca conclui missões. Eventos de outras origens (estudante, comunidade, radar) não são apagados.

## 6. Financiamento (`finance-engine.js`)

- **(A) Exigência do visto** = `IPREM[ano].mensal × 100% × meses` — tabela em `content/finance.js` (2026: €600, *pendente de confirmação*). Ano sem valor → usa o mais recente e sinaliza.
- **(B) Orçamento real** = custos únicos + mensais × meses; moradia e rota escolhidas entram automaticamente.
- Recursos: só "disponível/confirmado" contam; "previsto/solicitado" aparecem à parte. Bolsa **concedida** entra pela cobertura confirmada e cria tarefas de aceite.
- Déficit → caminhos: bolsas, apoio familiar documentado, destinos mais baratos, outro período, plano de economia mensal, financiamento educacional (trabalho não substitui a comprovação).

## 7. Critérios de aceitação (como verificar)

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
