# Auditoria integral: registro de progresso

Pedido: auditoria técnica, funcional, documental e de dados de toda a Estuvia, com correção (14/11/2026).
Este arquivo é a memória persistente do trabalho: cada fase registra o que foi feito, como foi validado e o que falta.

Regras desta execução:
- Nada é commitado, enviado ao GitHub ou publicado sem autorização explícita (push em `main` = deploy na Vercel).
- Nenhuma alteração destrutiva em dados. Nenhum dado fictício. Regra sem fonte oficial = "pendente de verificação".
- Outra sessão deixou mudanças não commitadas (homologação/etapa própria, `server/application-process.js`, `rounds.js`
  linhas de `alertasProcesso`). Elas foram mantidas; as mudanças desta auditoria estão listadas abaixo por arquivo.

## Fases

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Linha de base: testes, sintaxe, links de todas as fontes, produção no ar | concluída |
| 1 | Regras migratórias (visto, TIE, prorrogação) conferidas na fonte oficial e aplicadas | concluída |
| 2 | Cobertura dos mestrados: os 18 códigos do DUA da UGR que faltavam | código pronto, não publicado |
| 3 | Inventários (processos, documentos, fontes) gerados do código | concluída |
| 4 | Auditoria funcional e técnica (rotas, permissões, RLS, E2E) | concluída |
| 5 | Pendências que dependem de instituições | registradas (RELATORIO.md §7) |
| 6 | Próxima: ECTS/idioma/modalidade por universidade (10 conectores) | não iniciada |
| 7 | Próxima: reler o conteúdo das fontes conferidas em 24–28/10 (O2–O5, O7, O9–O27) | não iniciada |
| 8 | Publicação (commit + deploy) | aguardando autorização |

## Fase 0: linha de base (14/11/2026)

- `npm test`: 347/347 antes das mudanças. `npm run check`: 231/231 arquivos.
- Produção (https://estuvia-pi.vercel.app): HTTP 200.
- Links: 60 URLs extraídas de `server/content`, `public/js/views`, `public/js/data`. 54 OK direto; 5 falharam só na
  verificação TLS do Node (cadeia de certificado), conferidos com curl: todos respondem (auip.org, GEMMA, ICP,
  alsa.es 302, uhu.es). 1 era um placeholder de formulário (`https://…`), não um link.

## Fase 1: regras migratórias (fonte O6, conferida em 14/11/2026)

Fonte: Ministerio de Inclusión, "Autorización de estancia de larga duración para estudios superiores" (Hoja 1,
base RD 1155/2024). Achados e correções:

| # | Regra oficial | Situação antes | Correção |
|---|---|---|---|
| 1 | "No se computarán las cuantías utilizadas para sufragar el coste de los estudios" | **Bug**: o simulador contava todo o dinheiro confirmado para a comprovação do visto, inclusive o reservado para a matrícula | `server/finance-engine.js`: desconta a matrícula ainda não paga; UI explica o desconto (`finance.js`, `finance-panels.js`); teste novo |
| 2 | Passaporte com vigência mínima de 1 ano | Texto dizia só "cobrir a estadia" (fonte M) | Catálogo de documentos (`passaporte`) com a regra e fonte O6 |
| 3 | Antecedentes: estadia > 6 meses, país de origem ou países de residência dos últimos 5 anos | "Varia conforme o consulado" | `antecedentes`, `antecedentes-outros-paises` |
| 4 | Atestado médico não é exigido se o pedido é feito já na Espanha | Ausente | `atestado` |
| 5 | Seguro com seguradora autorizada a operar na Espanha, prestações semelhantes às do SNS | "Confira as coberturas" | `seguro` (alerta: seguro-viagem comum costuma não atender) |
| 6 | Documentos estrangeiros: tradução por tradutor juramentado e apostila | Só "se o consulado pedir" | `traducoes` (regra geral + vale a lista do consulado) |
| 7 | Resolução do visto em até 1 mês; silêncio = negativa | Ausente | Missão 5.8 |
| 8 | Visto concedido deve ser retirado em 2 meses, senão renúncia | Ausente | Missão 5.9 (texto; não foi criado objetivo novo para não reabrir missões concluídas) |
| 9 | TIE pessoalmente, em 1 mês, na Comisaría do lugar de residência; autorização = duração total dos estudos (1 mês antes / 15 dias depois); > 1 ano exige matrícula anual | Parcial | Missão 8.1 |
| 10 | Prorrogação: 2 meses antes a 3 meses depois do vencimento, eletrônica, Oficina de Extranjería da província inicial; até 2 prorrogações; cada uma até 1 ano | "Confira o prazo" | Categoria `renovacao` e `ex-00` (o nome "EX-00" não aparece na página para a prorrogação: deixou de ser afirmado) |

Não confirmado na fonte (fica pendente): direito a trabalhar durante os estudos (a página não trata do tema);
valor das taxas consulares; tempo real de análise por consulado.

## Fase 2: cobertura dos mestrados

- Produção: 923 mestrados (10 universidades). O catálogo do DUA da UGR (fase 2, consultado em 14/11/2026) tem 202
  códigos; 110 estão vinculados a mestrados da UGR, 67 são variantes declaradas, 7 têm vínculo manual ainda não coletado.
- Faltavam 18 ofertas oficiais: 14 duplos com Profesorado, 3 duplos com Caminos e Transformación Digital Salud (dual).
  Causa: para universidades com catálogo próprio (UGR), o pipeline descartava todo código do DUA sem página na UGR.
- Correção: `server/radar/pipeline.js` (`applyCatalog`) passa a criar esses códigos como programas do DUA
  (`dua-<código>`, `somenteDua: true`), exceto variantes declaradas e códigos já vinculados. Simulação com o catálogo
  real e a lista de produção: entram exatamente os 18. Teste novo em `tests/radar.test.js`.
- Efeito em produção só depois do deploy e da próxima coleta do catálogo.

## Arquivos alterados por esta auditoria

- `server/finance-engine.js`, `server/content/finance.js`, `public/js/views/finance.js`,
  `public/js/components/mission-hub/finance-panels.js`, `tests/finance-audit.test.js`
- `server/content/document-catalog.js`, `server/content/sources.js` (O6 conferida em 14/11/2026)
- `server/content/rounds.js` (só os textos `porque` de 5.8, 5.9 e 8.1)
- `server/radar/pipeline.js`, `tests/radar.test.js`
- `docs/auditorias/2026-11-14-auditoria-integral/*`

## Fase 3/4 (14/11/2026, fim do dia)

- Fontes novas: O31 (equivalência de nota média, Ministerio de Ciencia) e O32 (Lei 7/1985 art. 15, Padrón).
  Missões 2.1 e 7.9 passaram a citar fonte oficial.
- `scripts/audit-inventarios.mjs` gerou `inventarios.md` e os CSVs: 72 missões (55 com fonte oficial), 186 documentos
  (139 com fonte oficial), 34 fontes, 29 regras do procedimento DUA.
- E2E no navegador (`e2e-navegador.mjs`, `e2e-resultado.json`), RLS revisado, testes 349/349, sintaxe 232/232.
- Relatório final: `RELATORIO.md`.
- Arquivos adicionais desta fase: `scripts/audit-inventarios.mjs`, `server/content/sources.js` (O31, O32),
  `server/content/rounds.js` (2.1 e 7.9: texto e fontes).
