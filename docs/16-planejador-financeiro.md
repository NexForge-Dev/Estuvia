# 16 — Planejador Financeiro Inteligente

O estudante abre a tela e vê primeiro **o resultado**: quanto custa a jornada, quanto já tem, quanto falta e o que fazer. A Estuvia estima o que tem fonte, e o estudante ajusta o resto em "Editar meus custos". Os cálculos são determinísticos (`server/finance-engine.js`) e não usam LLM.

## Três contas que nunca se misturam

| Conta | O que é | Cálculo |
|---|---|---|
| **A. Preparar a viagem** | Dinheiro antes de partir e no 1º mês | instalação + 1 mês de custos |
| **B. Manter-me no exterior** | Custo recorrente | mensal × meses da estadia |
| **C. Comprovar para o visto** | Exigência de **demonstrar** recursos, não é gasto | IPREM do ano × % × meses (`content/finance.js`, fonte O6) |

O total da jornada (`orcamento`) = instalação + mensal × meses. A comprovação do visto **não** entra nessa soma.

## Despesas (`content/costs.js`)

Cada item (ExpenseItem) tem:
- valor e moeda;
- grupo (instalação ou mensal) e categoria;
- **origem**: premissa com fonte, estudante, "Meu novo lar" ou Viagem;
- **estado**: estimado, confirmado ou pago;
- a indicação de reembolsável (caução).

| Item | Estimativa automática | Fonte |
|---|---|---|
| Moradia (quarto compartilhado, Granada) | 250 / 300 / 350 € conforme o perfil | UGR: O15 (€200–300) e O16 (€300–350). As páginas divergem e não têm data. |
| Alimentação (Espanha) | 179 € × perfil (0,85 / 1 / 1,25) | INE EPF 2024 (O17): 15,8% de €13.626/ano ÷ 12. Média nacional, não de estudante. |
| Caução | 1 mês de aluguel | Premissa explícita da Estuvia (confirme no contrato) |
| Reserva | 1 mês de custo de vida | Premissa explícita da Estuvia |
| Matrícula, documentos, taxa do visto, seguro, transporte, contas, despesas pessoais | **sem valor** (desconhecido) | Não há fonte confiável: o estudante informa |

Regras:
- **Desconhecido ≠ zero.** `valorEur: null`; o plano fica marcado como `parcial`, com `faltamInformar`.
- **Fonte única, sem dupla contagem.** A moradia escolhida em "Meu novo lar" (aluguel + adicionais e caução) e a rota escolhida na Viagem substituem a estimativa e ficam somente leitura.
- **Pago** sai de `aDesembolsar`, mas continua no total histórico.
- **Caução reembolsável:** entra na necessidade de caixa, mas `custoDefinitivo` a desconta.

## Recursos

| Grupo | Conta na meta? |
|---|---|
| Disponível (já é seu) e confirmado | sim |
| Bolsa concedida (valor confirmado) | sim |
| Prometido (apoio sem documentos) | não |
| Bolsa solicitada | não |
| A verificar | não |

Valores em reais sem taxa de câmbio ficam fora da conta, com aviso. O custo de conversão (spread/IOF %) é aplicado ao dinheiro em reais.

## Câmbio (`server/fx.js`)

- **Taxa automática:** taxa de referência do **BCE via api.frankfurter.app**, com cache de 6 h. A tela mostra fonte, data da cotação e hora da atualização.
- **Taxa manual:** fica marcada como "informada por você".
- **Sem serviço disponível** (ou com `FX_PROVIDER=off` ou durante os testes): não há taxa automática, e nenhuma taxa é fingida.

## Cenários e alternativas

- **Perfis:** econômico, equilibrado, confortável e personalizado, com premissas visíveis. A comparação lado a lado mostra instalação, mês, total, reserva e diferença em relação aos recursos.
- **Cenários salvos:** `POST /finance/scenarios`, e `PUT /finance/scenarios/:id/principal` para torná-lo o principal.
- **Quando falta dinheiro**, a tela oferece: procurar bolsas, plano de economia mensal até a partida, apoio da família, reduzir custos, **simular outra data de partida** (`partida`) e comparar destinos. Também há o botão "Decidir com o Mentor".

## Integrações

- **Jornada:** destino, mestrado, ano e duração (editável).
- **Moradia e Viagem:** valores escolhidos.
- **Bolsas:** concedida ou solicitada.
- **Agenda AI:** itens com `vencimento` e ainda não pagos aparecem nos prazos (`financialDeadlines`).
- **Missões:** 1.5 e F.1 se marcam ao "Calcular meus custos" (`planoIniciado`).
- **Assistente/Mentor:** ações `custo`, `suficiente` ("Tenho R$ 20.000, é suficiente?", só simula) e `guardar` (quanto guardar por mês). O Mentor (docs/15) lê `computeFinance`.
- **Durante a estadia** (depois da chegada): lançamento de gastos reais, comparando o previsto com o realizado por categoria (`POST /finance/spending`).

## API

- `GET /finance?journeyId=`
- `PUT /finance` com `{ perfil?, itens?: {id: {valor|null, moeda, status, vencimento} | null}, cambio?, spreadPct?, partida?, iniciar?, informouRecursos?, nenhumaBolsaAplicavel? }`. O campo legado `custos` continua aceito.
- Recursos: `POST|PUT|DELETE /finance/resources`. Status possíveis: `disponivel`, `confirmado`, `prometido`, `previsto`, `solicitado`, `a-verificar`. O campo opcional `origem: 'rapido'` marca a entrada "Quanto dinheiro você já tem?".
- Bolsas: inalteradas.
- Cenários: `/finance/scenarios`.
- Gastos reais: `/finance/spending`.

Testes em `tests/finance.test.js`, cobrindo os critérios 1–18 aplicáveis ao cálculo.
