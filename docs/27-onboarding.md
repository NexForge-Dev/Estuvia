# 27 — Onboarding: auditoria, fluxo e componentes

O primeiro onboarding tem **6 etapas + revisão** e gera a primeira jornada. As jornadas seguintes pedem só o **destino** e reaproveitam perfil, requisitos, documentos e finanças.

Arquivos: `public/js/views/onboarding.js` (fluxo), `public/js/views/auth.js` (login/cadastro), `public/js/components/Select.js`, `public/js/ui.js` (`toast`), `public/js/data/geo.js`, `public/js/data/academic.js`, `public/css/flow.css`, `public/js/i18n-flow.js` (traduções ES/EN).

## 1. Auditoria: o que cada resposta realmente alimenta

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

## 2. Fluxo

1. **Origem**: nacionalidade e país (Select pesquisável, nomes via `Intl.DisplayNames`), divisão administrativa dependente do país (`geo.js`: Brasil (UF), Espanha (províncias por comunidade), Portugal, EUA, México, Argentina, Colômbia, Chile, Peru, Uruguai, Paraguai, Bolívia, Equador, Venezuela, Canadá, Itália, Alemanha, França). País sem lista: sem campo. Mensagem real: consulado da UF (de `places.js`) ou aviso de visto fora do Brasil.
2. **Formação**: nível (chips), instituição (busca por nome/sigla; "Não encontrei" abre texto livre), área (agrupada pelos 5 ramos usados pelas universidades espanholas; "Outra área").
3. **Idiomas**: CEFR A1–C2 + "Não falo", "Nativo", "Ainda não sei"; certificado (DELE, SIELE, outro, não tenho) e nível do certificado.
4. **Orçamento**: valor em euros com formatação, atalhos de referência, "Ainda não sei".
5. **Destino**: universidade (cards com logo), mestrado **opcional** dentro do destino ("Já sei qual mestrado quero", com os programas oficiais do Radar), ano, **início por período** (setembro/outubro do 1º ano ou fevereiro do 2º, ou "Ainda não sei"), duração (com efeito da TIE explicado), situação atual (linha do tempo de `PRIOR_STAGES`), data de entrada só para "Já estou na Espanha", confirmação.
6. **Documentos**: uma pergunta por vez, respostas com categoria visual (já tenho / ainda não / preciso verificar), resumo final.
7. **Revisão** ("Sua jornada está quase pronta.") com "Editar" por etapa → **geração** com a lista de passos → **resultado real**: rodada inicial, missões para começar, não aplicáveis, progresso reconhecido e primeira missão recomendada (tudo vindo do motor).

O resumo "Seu perfil até agora" (lateral no desktop, topo no celular) mostra só o que o estudante respondeu.

## 3. Mestrado opcional (decisão de arquitetura)

O motor já tratava jornada sem programa (`buildContext` cai em `jr.universidadeId`; a interface mostra "Mestrado a definir"; idioma vira "atenção"). Só `POST /journeys` exigia `programaId`. Agora:

- `POST /journeys` aceita `universidadeId` sem `programaId`. Nenhum programa é escolhido automaticamente.
- Duplicidade preservada: mesmo programa → 409; e no máximo uma jornada **sem programa** por universidade + ano.
- `PUT /journeys/:jid/program` define o mestrado depois (mesma universidade, sem repetir). O Radar oferece "definir nesta jornada" quando há uma jornada "a definir" na mesma universidade. O objetivo automático da Missão 1.3 ("Mestrado desta jornada definido") só conclui quando há programa.
- Quem marca "Já escolhi meu mestrado" (ou etapa posterior) sem selecionar programa recebe um aviso e o seletor abre sozinho.

## 4. Validação e gravação

- Frontend: o botão "Continuar" fica desabilitado enquanto a etapa estiver incompleta e a linha "Falta: …" diz o quê. Strings vazias ou só com espaços não contam. Responder "não sei" ≠ não responder.
- Servidor: `PUT /me/profile` valida cada campo (enums estritos; `certificadoNivel` só A1–C2); `POST /me/onboarding/complete` confere o essencial (inclusive UF para quem mora no Brasil, situação do orçamento, documentos e existência de jornada) e responde 422 com `faltam[]`.
- Ordem de gravação (`finish()`): perfil → requisitos → jornada → progresso anterior → **conclusão** (`onboardingConcluido` só no fim). Antes, a flag era gravada antes de criar a jornada.
- Repetição segura: duplo clique ignorado; o id da jornada criada fica no rascunho, e "Tentar novamente" a reaproveita (não cria outra). Perfil e requisitos são idempotentes; o progresso anterior não é reaplicado se já registrado.
- Rascunho no `localStorage` por usuário e modo (`estuvia:onboarding:<id>:perfil|jornada`), restaurado ao recarregar e apagado ao concluir.

### Data de início (correção)

O campo de data digitada foi trocado por períodos acadêmicos. O valor enviado é `inicioAulas = AAAA-MM-01` com `inicioAulasAproximado: true` (o prazo aparece como "Início das aulas (mês previsto)"). O período fica no rascunho e volta ao retornar à etapa. Não consegui reproduzir com certeza a causa original da perda da data digitada; a troca elimina a máscara manual de dd/mm/aaaa, que era o ponto frágil do fluxo.

## 5. Componentes

- **Select** (`components/Select.js`): combobox acessível (ARIA `combobox`/`listbox`, `aria-activedescendant`), busca com normalização de acentos, grupos, opção fixa ("Não encontrei"), teclado (setas, Home/End, PageUp/PageDown, Enter, Esc, digitação rápida), lista em portal com posição fixa que abre para cima/baixo e alinha pela borda direita para não sair da tela; no celular vira folha inferior. Expõe `value`, `setOptions`, `setInvalid`, `setDisabled` e um `<input type="hidden" name>` para formulários. Usado no onboarding, no perfil e no seletor de idioma (com bandeiras em SVG: emoji de bandeira não aparece no Windows). Os `<select>` nativos restantes ganharam o mesmo visual por CSS.
- **Toasts** (`ui.js`): sucesso, erro, atenção e informação (`ok|err|warn|info`, compatível com as chamadas antigas), ícone, botão fechar, barra de tempo, pausa ao passar o mouse/focar, erro com `role="alert"`, no máximo 4.
- **Modo foco** (`isFocusPath` em `app.js`): login, cadastro, recuperação de senha e onboarding sem menu lateral, barra inferior, rodapé e **sem Mentor**.
- Movimento: transições curtas; `prefers-reduced-motion` desliga as animações.

## 6. Testes

- `tests/onboarding.test.js`: jornada sem mestrado, duplicidade, `PUT /program` (Missão 1.3), TIE por duração, progresso anterior sem mestrado, "não sei"/"verificar", conclusão validada, orçamento no planejador, divisões administrativas.
- E2E em navegador (Playwright + Chrome, servidor isolado com JSON temporário): cadastro/login sem lateral, seis etapas, divisões de vários países, instituição manual, persistência ao recarregar, data de início salva, TIE, progresso anterior, documentos, revisão, geração, segunda jornada só com destino, Mentor ausente/presente, toasts, seletor de idioma dentro da tela e celular sem rolagem horizontal.
