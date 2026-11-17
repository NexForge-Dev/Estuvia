# E2E de todos os fluxos — 2026-11-18

Oito agentes testaram a aplicação pelo navegador (Playwright + Chrome, desktop e celular) e pela API. Cada um rodou num servidor local isolado: base JSON temporária, sem `.env` e sem Supabase. Nenhum arquivo do repositório foi alterado. Os testes foram **interrompidos antes do fim** porque os créditos estavam acabando, então este relatório traz só o que foi observado de fato. Os itens marcados como *suspeita* vêm só da leitura do código.

Evidências (scripts e prints) em `%TEMP%\claude\8c38974304fd48db\0f654058-...\scratchpad\e2e-<frente>\`.

| Frente | Porta | Situação |
|---|---|---|
| Conta, perfil, idiomas | 4801 | parcial |
| Onboarding e jornadas | 4802 | parcial |
| Missões | 4803 | parcial |
| Mestrados e candidatura DUA | 4804 | parcial |
| Viagem e novo lar | 4805 | parcial (novo lar só via API) |
| Finanças, agenda, documentos | 4806 | parcial |
| Comunidade, Radar, Conquistas, Mentor | 4807 | parcial |
| Admin, moderação, Radar admin | 4808 | parcial (só API) |

Em nenhuma tela testada apareceu erro de JS, violação de CSP ou resposta 5xx do app. As defesas de segurança (XSS, uploads maliciosos, isolamento entre usuários, matriz de permissões de admin) passaram.

---

## ALTO (corrigir antes do beta)

| # | Frente | Bug | Onde |
|---|---|---|---|
| A1 | Onboarding | `PUT /me/profile {"onboardingConcluido":true}` contorna a conclusão validada no servidor | `server/routes/me.js:437` (`profileSchema`) |
| A2 | Agenda | "Replanejar a semana" **apaga os blocos aprovados antes** de a pessoa aprovar a nova proposta. Se ela descarta, eles somem (16 → 4) | `server/routes/planner.js` rota `/replan` |
| A3 | Finanças | Marcar um custo **mensal** como "Pago" conta a estadia inteira (450 × 10 = € 4.500 "já pago") | `server/finance-engine.js` `summarize` (`jaPago`) |
| A4 | Missões | O QuickPlan ("Noites" etc.) **sobrescreve a disponibilidade** da Agenda sem avisar | `public/js/components/QuickPlan.js` `propose()` |
| A5 | Missões | A ferramenta some nas missões "simples": a 1.2 fica sem link para `#/mestrados`; as 7.1, 7.3, 7.6 e 7.8 ficam sem o guia da cidade (*suspeita*) | `mission-hub/tools-config.js` `toolsFor` (`level !== 'simples'`) |
| A6 | Comunidade | O botão "Carregar mais" aparece sempre: `[hidden]` é sobreposto por `.btn {display:inline-flex}`. Pode afetar outros `.btn[hidden]` | `public/css/community.css:22`; falta `[hidden]{display:none!important}` global |
| A7 | Admin | A página Status não mostra o e-mail (Resend) nem o CRON_SECRET, então a pendência de produção fica invisível | `server/system-status.js` (não usa `emailEnabled` de `email.js:6`) |
| A8 | Geral | **Mensagens do zod em inglês cru** chegam ao aluno: "Too big: expected…", "Invalid string: must match pattern /^\d\.\d{1,2}$/". Aparece em auth, finanças, planner, comunidade, journeys e admin | `issues[0].message` em várias rotas. Correção única: locale pt do zod ou um mapeador comum |

| A9 | Viagem/Moradia | **Só Granada tem conteúdo.** US, UMA, UCO, UCA, UHU, UJA, UAL, UPO e UNIA ficam sem aeroportos, percursos, sites de moradia, faixas de preço e guia da cidade. Sevilla e Málaga foram confirmadas; as demais são as mesmas pelo código | `content/travel.js` (`IATA_DEST`, `ROUTE_TEMPLATES`), `housing.js`, `costs.js`, `places.js` |
| A10 | Viagem | A cotação "Recife → Málaga" de quem estuda **em Málaga** é tratada como o percurso de Granada "via Málaga" ("falta trecho por terra", chegada "Defina a rota") | `travel-engine.js` `guessTemplate`/`templateOf` (cidade fixa em Granada), `routes/travel.js` `parseFlightLink` |
| A11 | Viagem | Uma cotação **sem preço de voo** fica "completa" e ganha o selo "Menor custo" (€ 90) | `travel-engine.js` `quoteCost` |
| A12 | Mestrados | O processo da Missão 3.4 mostra o ciclo **2026/27, já encerrado**, sem aviso. Datas passadas aparecem sem marca, e a pendência diz que o calendário "não foi publicado" | `application-process.js` ~55-62 e ~134 (alerta só com `cicloJornada`); `journey-engine.js:601` |
| A13 | Mestrados | A comparação e o catálogo misturam 2027/28 com o início das aulas "01/10/2026". O erro da 7ª opção cita "DUA 2026/27" | `routes/me.js:133` |

## MÉDIO

**Mestrados**
- A comparação diz idioma "Não confirmado", mas a ficha tem o requisito obrigatório 099, que exige espanhol (dua-102708).
- Uma opção que saiu do catálogo trava todo `PUT /me/choices` com "Programa desconhecido." (`me.js:136`; *suspeita*).
- Com 6 opções, definir o mestrado da jornada o corta das opções sem aviso (`routes/journey.js:125,148`; *suspeita*).
- Links ruins nos dados: `webPropria = "-"` vira `href="-"` (UGR alimentación-nutrición). Há também duas URLs numa só string e 70 links em http.
- Com o Radar vazio, o catálogo da UGR aparece atribuído ao DUA, com "verificação" errada. Aparece também "em 1 universidades" (`catalog.js:120`).

**Viagem e moradia**
- No itinerário, uma cotação em R$ aparece com € (`TravelDashboard.js` ~380).
- Escolher outra rota desfaz a passagem comprada, sem confirmação (`routes/travel.js` ~123).
- A chegada não acompanha a data da viagem e pode ficar antes da partida; a API aceita isso (`computeTravel` ~140).
- Datas de viagem e de entrada na moradia no passado ou em 2099 são aceitas; os inputs não têm `min`.
- Cotações e chegada são uma só por usuário, não por jornada. `GET /travel` e `GET /living` não enviam `journeyId`.

**Conta e navegação**
- O link "Pular para o conteúdo" (`index.html:95`, `href="#app"`) abre a 404.
- As âncoras da landing (`#rodadas`, `#perguntas`…) abertas direto também abrem a 404.
- A landing anuncia a "Central de fontes" a visitantes (`landing.js:493`, `index.html:120`), mas `/fontes` exige login.

**Onboarding e jornadas**
- "Já escolhi meu mestrado" sem programa conclui a 1.3, e mesmo assim a jornada fica "Mestrado a definir" (`journey-engine.js:1031-1054`, `progression.js:90`).
- O progresso anterior **sobrescreve respostas explícitas de documentos**: quem declarou "preciso solicitar o passaporte" fica com ele "pronto" (`syncDocumentsFromMissions`, `routes/journey.js:233`).
- Com "Já estou na Espanha", a jornada fica parada na Rodada 5 (5.2 e 5.10 faltam em `PRIOR_STAGES.visto-aprovado`, `progression.js:95`). A tela de resultado diz "5.2", mas o botão diz "7.1".
- O ano letivo já em curso (2026/27, início em setembro de 2026) aparece como opção (`onboarding.js` `cycles`).
- `POST /journeys` aceita `2099/00`, `2027/99` e `inicioAulas` fora do ciclo (`routes/journey.js:38-39`).

**Missões**
- Cliques rápidos em "Já fiz/Desmarcar" deixam a tela diferente do servidor (`MissionHub.js` `GuidePanel.mutate`, `MissionGuide.js` `setObj`).
- Uma aba desatualizada recebe 409 "já concluída" e não recarrega a missão (`views/mission.js` `ctx.mutate`).

**Agenda**
- "Organizar semana" sugere horários que **já passaram hoje** (`agenda-engine.js` `suggestWeek`).
- Organizar de novo passa da meta semanal e duplica missões, porque não desconta o que já foi agendado.
- Eventos fora de 07h–22h ficam invisíveis na grade, mas contam nas estatísticas (`WeeklyPlanner.js` START_H/END_H).

**Finanças**
- "Simular outra data de partida" não tem efeito quando a jornada tem `inicioAulas` (`finance-engine.js`).
- Uma bolsa em "verificando" some dos recursos, e uma bolsa só de "interesse" aparece como "solicitada" (`buildResources`).

**Documentos**
- O documento continua "arquivo-enviado" depois de excluídos todos os arquivos (`routes/documents.js` DELETE `/files/:fid`).

**Comunidade**
- Duplo clique em curtir ou salvar deixa a tela diferente do servidor (`community-parts.js` PostCard).
- "Editar" no detalhe do post só volta ao feed (`onEdit: () => go('/comunidade')`).
- O contador de comentários do cartão não é atualizado pelo detalhe (`setCount`).
- O cabeçalho do grupo não se atualiza:
  - aparece "1 membros", no plural;
  - o contador fica estático;
  - "Participar" continua aparecendo depois de publicar no grupo.
- No formulário "Criar grupo", o `reset()` apaga o País (que é obrigatório) e o erro antigo fica na tela.
- Uma oportunidade com prazo vencido é aceita sem aviso.

**Limites por IP** (risco para Wi-Fi de universidade e NAT)
- `communityWriteLimiter` (`security.js:198`) e `documentUploadLimiter` são por IP; deveriam ser por usuário.
- O limite geral (120/min, `security.js:200`) e o `authLimiter` (20 a cada 15 min) são compartilhados.

**Admin**
- O filtro "Com alerta" devolve todos os alunos, porque conta também os alertas de nível baixo (`routes/admin.js`).
- Um anônimo consegue encher os logs de erro e inflar a taxa de 5xx chamando `/api/cron/radar` sem `CRON_SECRET`. A resposta 503 também revela a configuração (`ops.js`).
- Revogar o papel de quem está em `MODERATOR_EMAILS`/`RADAR_ADMIN_EMAILS` não tem efeito, e o painel mostra o contrário (só fora de produção; `security.js:141`).
- A ficha do aluno mostra "Rodada 1, 7%" e, ao mesmo tempo, a próxima missão 4.1 (*suspeita*).

## BAIXO

- **Conta:**
  - A classe `focus-mode` continua na 404 depois de passar por `/entrar` (`app.js` render, ramo `!route`).
  - O cadastro aceita NUL e RLO no nome.
  - A regex de e-mail do cliente aceita `.a@b.com` e `á@b.com`.
  - O login pela API não faz trim no e-mail.
  - `GET /me` 401 polui o console das páginas públicas.
  - *Suspeitas:* "Sair de todos" sem try/catch; data de `#/fontes` sempre em pt-BR; `/redefinir-senha` sem `guestOnly`.
- **Onboarding:**
  - Textos da home e de `/jornadas` ainda dizem que o mestrado é obrigatório.
  - Não há seletor de idioma no onboarding (o doc 27 diz que há).
  - A nota da TIE não redesenha ao digitar a duração.
  - Erros de português: "Morando em Espanha"; nota de consulado para quem já está na Espanha.
  - Um aviso aponta para um seletor de mestrado inexistente.
  - Divisões e nacionalidade inválidas são aceitas fora do Brasil.
  - O "Voltar" do navegador sai do fluxo.
  - "Não sei meu nível" e "Ainda não sei meu nível" aparecem misturados.
  - Sobra "UGR - " em "Outras jornadas".
- **Missões:**
  - A fonte O4 (catálogo de **Engenharia e Arquitetura**, `sources.js:39-44`) aparece para todas as áreas.
  - Quem já tem mestrado fica com a 1.3 bloqueada pela 1.2 (*design*).
- **Finanças, Agenda e Documentos:**
  - Um PNG enviado como "foto.exe" fica salvo com `.exe` (`cleanName`).
  - O rótulo `<b>RG</b>` vira "bRG/b".
  - A barra do card do visto some (`finance.css:46-47`).
  - O prazo de bolsa na Agenda não é clicável.
  - Bolsa vencida mostra "Prazo em -N dias", a data aparece crua e o título fica "Bolsa Bolsa X".
  - O servidor aceita o mês `2099-13` e `emitidoEm` no futuro.
  - Aparece "16 De Nov. – 22 De Nov. De 2026".
  - Salvar o valor que a pessoa já tem não mostra confirmação.
  - *Suspeita:* "hoje" do cliente e do servidor em fusos diferentes.
- **Comunidade:**
  - A 5ª imagem é descartada sem aviso, e o upload não mostra carregamento.
  - O menu "⋯" não fecha ao clicar fora.
  - Tirar dos "Salvos" não remove o cartão.
  - Excluir comentário e remover oportunidade acontecem sem confirmação.
  - A nota da moderação não aparece para o autor.
  - Um post de 5000 caracteres não tem "ver mais".
  - *Suspeitas:* no celular o "⋯" fica coberto; em `radar.js` faltam try/catch e há "Preço máximo 0" contra `positive()`.
- **Admin:**
  - Notas do admin não entram na auditoria.
  - DELETE de nota inexistente responde 200.
  - Eventos aparecem sem rótulo (`journey.situacao`, `radar.import`…; `admin.js:28-35`).
  - `docs/11-radar.md` e `radar-admin.js` citam `/dev/simulate`, que foi removido em b202d4e.
  - "Online agora" inclui contas suspensas.
  - A lista `/admin/users` não tem paginação.

- **Mestrados:**
  - "Limpar" não aparece quando só a busca está preenchida, e o estado vazio não tem botão para limpar.
  - A comparação e o cabeçalho da jornada mostram o nome em MAIÚSCULAS (`ChoicesCompare.js:57`).
  - Os critérios aparecem metade em português, metade em espanhol sem acento.
  - Os botões ficam desabilitados com 6 opções e não explicam por quê.
  - O estado vazio da comparação leva ao Radar, e não a `#/mestrados`.
  - Cada filtro refaz `/compare` e o select perde o foco.
  - Há mestrados duplicados (UCA, centro adscrito) que não se distinguem.
  - Faltam créditos em 100% dos mestrados de 5 universidades.
  - No celular, o botão do chat cobre um card.
  - "jornada" aparece em minúscula na barra inferior.
  - Os filtros não persistem.
  - "CARTAS DE REFERENCIA" não é reconhecido.
- **Viagem e moradia:**
  - "Trem" aparece como "Transporte local".
  - A data do link Kayak é ignorada.
  - A lixeira da cotação apaga sem confirmar.
  - DELETE de um id inexistente ou alheio responde 200.
  - "Malas" e "orçamento" do assistente nunca são usados.
  - Aluguel 0 é aceito.
  - A nota do financeiro aparece sem moeda.
  - *Suspeitas:* o select da moradia fica "Escolhido" ao fechar pelo X; os rótulos ficam fixos em €.

---

## Não testado, para a próxima rodada

- **Mestrados:** calculadora de nota, elegibilidade da 1.4, `#/fontes`, celular em parte.
- **Viagem e moradia:** a interface de `#/novo-lar`, a interface de viagem para cidades sem conteúdo, preços com token real.
- **Missões:** varredura das 77 missões em 4 perfis, celular, liberação da Rodada 2, ferramentas 2.3, 3.6, 3.8, 5.1, 5.2, 5.10, chegada e Rodadas 7 e 8.
- **Conta:** perfil (editar, exportar, excluir), troca de idioma, login e logout pela interface, redefinir senha pela interface.
- **Onboarding:** 2ª, 3ª e 7ª jornadas pela interface, exclusão, onboarding em espanhol.
- **Documentos:** a interface inteira.
- **Agenda:** celular e disponibilidade.
- **Mentor, Conquistas, Radar** (aluno) e eventos ao vivo.
- **Admin:** a interface inteira, a moderação e o Radar admin de ponta a ponta.
