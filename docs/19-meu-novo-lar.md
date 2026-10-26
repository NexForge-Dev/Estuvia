# 19 — Meu Novo Lar (missões 6.1 e 6.2)

O fluxo é **Encontrar → Salvar → Comparar → Verificar → Escolher**. A tela não abre com formulário. Ela mostra o destino (vindo da jornada), duas ações ("Procurar moradias" e "Adicionar anúncio que encontrei") e os cards das opções salvas.

## O que a Estuvia faz e o que não faz
- **Não busca nem lê anúncios.** Não há integração autorizada, nem scraping, e nenhum imóvel fictício aparece como resultado de busca.
- **Busca guiada** em 3 perguntas: tipo, orçamento e preferências. Depois, aponta **onde procurar**, só com links conferidos (`content/housing.js → SEARCH_SOURCES`, em 24/10/2026). Em Granada: Spotahome, Uniplaces, HousingAnywhere, Fotocasa (apartamentos) e a página oficial da UGR (O16). Idealista bloqueia a conferência automática, o link da Badi está fora do ar (404) e o da página da UGR em `ugr.es/estudiantes/servicios/alojamiento` também (404); por isso os três ficaram de fora.
- **Faixas de orçamento** só onde há fonte: quarto compartilhado em Granada, com €250 / 300 / 350 tirados das páginas O15 e O16 da UGR. Nos outros casos, o estudante informa o próprio limite.
- **Adicionar por link:** do link, só o nome do site é reconhecido (`siteOf`). O estudante preenche só o essencial (título, preço mensal, tipo e bairro) e completa o resto depois.
- **Fotos** adicionadas pelo estudante ficam só no dispositivo (IndexedDB, scope `<userId>:moradia:<id>`). São reduzidas no navegador e nunca enviadas ao servidor. Sem foto, aparece um espaço reservado neutro por tipo, sem imagem inventada.

## Dados (compatíveis com o que já estava salvo)
`user.housing[]`: `nome, tipo, bairro, aluguel, adicionais, contasIncluidas, caucao, taxaAgencia, entrada, duracaoContrato, link, fonte, distancia, notas, status, checklist, sinais`.

- **Situações:** `quero-conhecer · contato · aguardando · visitado · contrato · escolhida · descartada`. Os valores antigos `pesquisando` e `negociando` são aceitos e convertidos (`normStatus`).
- **Uma só escolhida:** ao escolher outra, a anterior volta para "contrato em análise".
- **Busca guiada:** `user.housingSearch = { tipo, orcamentoMax, preferencias[], comparadoEm }`.

## Custos (`server/housing-engine.js`, testado)
- **Mensal** = aluguel + contas/despesas. Com "contas incluídas", as contas valem 0. Se nada foi informado, as contas ficam **desconhecidas**, nunca zero.
- **Para entrar** = 1º aluguel + caução + taxa de agência. Sem caução informada, o valor aparece como "+ ?".
- **Total da estadia** = mensal × meses + taxa. A **caução é reembolsável** e fica fora do gasto definitivo.
- **Comparação** (2 ou 3 opções, `POST /living/compare`): frases sobre as diferenças, como "custa €80 a menos por mês, mas exige uma caução €220 maior", e o efeito na estadia inteira. Ela lista o que falta saber e avisa que o menor preço não é a melhor escolha automaticamente.

## Conferir antes de pagar
São 6 perguntas: identidade, contrato, imóvel, valor total, caução e pedido de pagamento antecipado (essa última é invertida). Cada resposta pode ser **Sim** (`checklist[id]=true`), **alerta** (`sinais[id]=true`) ou **não sei**. O resultado é `alerta`, `incompleto` ou `conferido`, e a interface **nunca diz "seguro"**. As perguntas aparecem no detalhe da opção, na comparação e no momento de "Selecionar como minha moradia", que mostra os alertas antes de confirmar.

## Integrações
- **Planejamento financeiro:** a moradia escolhida alimenta aluguel, contas e caução (reembolsável), sem duplicar. As contas desconhecidas continuam desconhecidas. Sem caução informada, vale a premissa de 1 mês. Trocar de moradia troca o plano.
- **Missões:**
  - 6.1: "Salvar ao menos 2 opções" (`temMoradias`) e "Comparar as opções" (`comparouMoradias`). É uma trilha paralela, então dá para explorar antes do visto.
  - 6.2: "Registrar a escolhida" e "Conferir contrato, valor total e caução" (`contratoConferido`). Nenhum campo é exigido só para avançar.
- **Agenda AI:** "Conversar com o anunciante", "Visitar ou fazer vídeo-chamada", "Verificar o contrato" e "Conferir as condições de pagamento" viram lembretes na agenda, com a etiqueta "Meu Novo Lar". A Estuvia não agenda com terceiros.
- **Mentor:** botões com o contexto do anúncio: "Esse anúncio parece suspeito?", "Qual fica mais barata?", "Dicas para encontrar" e "Me ajuda a escrever ao proprietário". Também há um rascunho de mensagem em espanhol para o estudante revisar e copiar; nada é enviado pela Estuvia.

Testes em `tests/housing.test.js`.
