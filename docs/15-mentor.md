# 15 — Mentor Estuvia (agente com ferramentas)

O Mentor não é só um chat: ele **entende, explica, planeja e executa ações autorizadas** usando as mesmas regras do backend da Estuvia. Hoje roda no **Modo Guiado** (sem API paga). O mesmo conjunto de ferramentas fica pronto para um modelo de linguagem quando houver orçamento.

> Ele se apresenta como **"Mentor de IA da Estuvia"** (ou **"Assistente Estuvia — Modo Guiado"**, quando não há modelo conectado). Nunca finge ser uma pessoa nem o fundador.

## Situação

| Fase | Situação |
|---|---|
| 1 — Modo Guiado, sem API paga | ✅ Interface completa, ações rápidas, intenções em português, ferramentas reais, confirmação, auditoria, avisos proativos, memória controlada pelo estudante |
| 2 — Integração com LLM | ✅ Pronto: camada de provedor (`anthropic`, `openai-compatible` para OpenAI/Ollama/LM Studio/vLLM). Basta configurar o `.env` |
| 3 — Agente com execução integrada | ✅ Laço de ferramentas: leituras executam na hora, escritas viram **uma proposta** que o estudante confirma. Se a IA falhar, a resposta cai para o Modo Guiado com aviso |

## Arquitetura

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

## System prompt

Está em `server/mentor/prompt.js`, em texto estável e sem dados do estudante, o que permite cache. Ele define:
- **Identidade:** IA, inspirada na metodologia e na experiência do idealizador.
- **Personalidade:** didático, proativo, organizado, prático, paciente, econômico, transparente e humano no tom.
- **Formato:** "explicação simples + próxima ação + ajuda adicional", até ~80 palavras, com termos técnicos explicados.
- **Ações:** escrita = proposta; nunca dizer "feito" antes da confirmação.
- **Fontes:** oficial × orientação prática × experiência do idealizador × estimativa, sem inventar.
- **Dinheiro:** prometido ≠ comprovado; solicitado ≠ concedido.
- **Limites:** sem promessas de visto ou aprovação, sem dados sensíveis, sem envio, pagamento ou acesso governamental.

O Modo Guiado aplica as mesmas regras por código.

## Catálogo de ferramentas

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

### Erros

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

## Confirmação e auditoria

- Uma escrita gera uma **proposta** com prévia: resumo, detalhes e avisos (ex.: "apoio prometido não conta como garantido").
- O estudante pode **editar antes**: dia e hora do compromisso, blocos da semana, valor do recurso, data de chegada.
- Na confirmação, o backend **revalida** com o estado atual, executa os passos em ordem e para no primeiro erro. A tela mostra o resultado real de cada passo e os eventos do motor (missão concluída, rodada desbloqueada).
- A proposta é de **uso único**, por isso não há execução dupla, e expira em 30 minutos.
- Toda ação executada, recusada ou cancelada vai para o `audit` global (sem conteúdo pessoal) e para `user.mentor.historico`, visível ao estudante em "O que o Mentor sabe".

## Contexto e memória

- **Sem conversas no servidor:** o chat vive só na aba do navegador, a partir de `historico` enviado em cada mensagem (até 12).
- **Continuidade** vem dos dados persistentes (jornada, documentos, agenda, finanças) e de **notas autorizadas**. Exemplo: segunda, "não consegui meu histórico" → o Mentor oferece lembrar. Quarta, "consegui o histórico!" → ele reconhece a pendência e propõe atualizar o documento, a missão e resolver a nota.
- **Context Manager:** inclui só perfil acadêmico, jornada em foco, missão em foco, Radar, finanças resumidas, notas e avisos. Diz explicitamente "não cadastrado" e "acesso desativado". Nunca inclui e-mail, documentos ou dados de apoiadores.
- **Permissões por área:** jornada, agenda, finanças, documentos, moradia, Radar e memória, em `PUT /api/mentor/preferences`. Desligar a memória apaga as notas. Uma ferramenta de área desligada responde `sem-permissao` e o Mentor explica como reativar.
- **Contexto da tela:** dentro de uma missão, "não sei fazer isso" usa aquela missão. Em outras telas (finanças, Radar, documentos, agenda, moradia), um pedido genérico de ajuda vai para o fluxo daquela tela.

## Avisos proativos (`proactive.js`)

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

## Modo Guiado: o que ele entende

Cobre agenda (agendar, mover, pendências do dia, organizar ou reorganizar a semana, plano de documentos antes da inscrição), missões (próxima, o que falta, terminei, estou esperando, não consegui, dificuldade, mais simples, me mostra como), finanças (quanto falta, tenho €X, alguém vai ajudar com €X, economizar €X/mês, maiores gastos, custo de vida), bolsas, Radar (quando abre, inscrições abertas, mestrados compatíveis, avise-me, como me inscrevo), documentos, visto, chegada, moradia (listar, comparar, aluguel e caução, anúncio suspeito), e-mails, prazos, glossário e "o que você sabe sobre mim".

Quando não entende, diz claramente que não sabe responder com segurança e oferece o que sabe fazer. **Nunca simula IA generativa.**

## Ligar um modelo de linguagem (Fases 2 e 3)

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

## API

- `GET /api/mentor`: modo, nome, ações rápidas, avisos, permissões e preferências
- `POST /api/mentor/message`: `{ mensagem? | acao?, contexto{ journeyId?, missaoId?, tela? }, historico[] }`
- `GET /api/mentor/actions/:id`, `POST /api/mentor/actions/:id/confirm` (`{ edicoes?: { [passo]: {campos} } }`), `POST /api/mentor/actions/:id/cancel`
- `GET /api/mentor/insights`, `POST /api/mentor/insights/:id/dismiss`
- `GET /api/mentor/memory`, `PUT /api/mentor/preferences`, `DELETE /api/mentor/memory/notes/:id`, `DELETE /api/mentor/memory`
- `GET /api/mentor/tools`: catálogo e capacidades indisponíveis

## Interface (`MentorPanel.js`)

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

## Testes (`tests/mentor.test.js`)

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

## Limitações conhecidas

- A interpretação do Modo Guiado é por regras: frases muito diferentes dos padrões caem na limitação. Isso é seguro: nada é inventado.
- A base de conhecimento é lexical. Para documentos longos (manual completo), use `registerKnowledge()` e, no futuro, embeddings.
- Ainda não há análise de arquivos enviados pelo estudante.
- Não há e-mail nem push, só avisos dentro da plataforma.
- O custo de vida por cidade não tem estimativa verificada: o Mentor usa os dados do próprio estudante e diz isso.
