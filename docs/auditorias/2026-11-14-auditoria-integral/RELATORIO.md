# Auditoria integral da Estuvia: relatório (14/11/2026)

Escopo: mestrados oficiais das 10 universidades públicas andaluzas no Distrito Único Andaluz (DUA), processo completo
do estudante (do planejamento à estadia regularizada), base documental, funcionalidades, segurança e dados.
Registro de progresso: `PROGRESSO.md`. Inventários gerados do código: `inventarios.md` e os CSVs desta pasta.
Auditoria anterior do processo de candidatura (base desta): `../2026-11-13-relatorio-executivo.md` e a matriz de 923 mestrados.

**Estado de publicação:** nada desta auditoria foi commitado nem publicado. Produção continua na versão `aa58269`.

## 1. Auditoria técnica

| Verificação | Resultado |
|---|---|
| Linguagem/arquitetura | JavaScript ES modules (Node 20, Express), front-end sem build. Não há TypeScript, lint nem etapa de build no projeto: os itens "erros de TypeScript", "lint" e "build de produção" não se aplicam. Equivalente usado: `npm run check` (sintaxe de todos os arquivos) |
| Sintaxe | 232/232 arquivos sem erro |
| Testes automatizados (unitários, integração, banco com PGlite, segurança) | 349/349 (eram 347; +2 novos) |
| E2E em navegador (Chrome, servidor local com banco JSON temporário) | 29/35 automáticos + 6 reconferidos manualmente: todos corretos (ver seção 9) |
| Responsividade (390 px) | Início, Documentos, Financiamento, Jornada: sem rolagem horizontal |
| Autorização | Jornada de outro estudante: 404. Admin por estudante: 403. Anônimo: 401. POST sem cabeçalho anti-CSRF: 403 |
| Supabase/RLS | Todas as tabelas com RLS ativo, `revoke all` para `public/anon/authenticated`, acesso só por `service_role`. O navegador não usa o Supabase diretamente |
| Links oficiais | 60 URLs: 59 respondem (5 só falham na cadeia TLS do Node, conferidas com curl); 1 é placeholder de formulário |
| Produção | https://estuvia-pi.vercel.app responde 200 |

## 2. Cobertura dos mestrados andaluzes

- Produção: 923 mestrados (UAL 73 · UCA 81 · UCO 121 · UGR 138 · UHU 56 · UJA 87 · UMA 102 · UNIA 46 · UPO 53 · US 166).
- Catálogo do DUA da UGR reconsultado em 14/11/2026: 202 códigos = 110 vinculados + 67 variantes declaradas + 7
  vínculos manuais (ainda não coletados) + **18 ausentes da plataforma**.
- **Corrigido (não publicado):** os 18 (14 duplos com Profesorado, 3 duplos com Caminos, Transformación Digital
  Salud dual) passam a entrar como programas do DUA. Simulação com o catálogo real: entram exatamente estes 18, sem
  duplicar nenhum. Depois do deploy e da próxima coleta, a plataforma terá **941** ofertas.
- Campos por mestrado (lista de produção): ficha DUA verificada 895/923, critérios e pesos 895, exigência de
  espanhol 895, web própria 904, centro e datas de início/fim na ficha DUA (exibidos no detalhe).
  **Lacuna:** créditos ECTS, idioma de ensino e modalidade presencial não constam da ficha do DUA (só "semipresencial"
  e "a distância" aparecem no nome). Estão em 1/923 (UGR). Exigem coletar a página de cada universidade: ver seção 7.
- Requisitos diferenciados: gerais (BOJA, 33 regras R1–R33), por mestrado (ficha DUA: idioma, homologação, etapa
  própria, titulações preferentes), específicos (Psicología General Sanitaria, Profesorado), por perfil (5 perfis × 3
  fases em `tests/candidatura-seguranca.test.js`), canais fora do DUA (Erasmus Mundus, Arqus).

## 3. Inventário dos processos

72 missões em 10 rodadas (`inventario-processos.csv`): perfil e escolha do mestrado (1), documentação acadêmica,
traduções, apostila, idioma, PGS (2), DUA: fases, solicitação, até 6 pedidos ordenados, envio, adjudicação,
alegações, reserva, lista de espera, resultas, canal próprio (3), matrícula, pagamentos, comprovantes (4), visto:
consulado por estado, checklist, meios, seguro, antecedentes e atestado, pedido, acompanhamento (5), moradia,
passagem, chegada (6), primeiros dias: universidade, acessos, telefone, banco, transporte, empadronamiento (7),
TIE (8), financiamento e bolsas (9).

Os 24 processos pedidos estão todos cobertos. Base das missões: 55 com fonte oficial e 17 só com orientação prática
(moradia, banco, transporte, chip, acessos acadêmicos: são práticas, sem norma oficial aplicável). Nesta auditoria,
2.1 (passaporte) e 7.9 (empadronamiento) passaram a citar fonte oficial.

## 4. Inventário documental

186 tipos de documento em 17 categorias (`inventario-documentos.csv`), cada um com: categoria, usos e exigência por
procedimento (obrigatório, condicional com a condição, recomendado), apostila, tradução, validade, onde obter, quando,
fontes. 139 com fonte oficial; 47 sem fonte oficial são práticos (banco, moradia, viagem, complementares).
Regras oficiais aplicadas nesta auditoria: passaporte (vigência mínima de 1 ano), antecedentes (estadia > 6 meses;
países de residência dos últimos 5 anos), atestado (dispensado quando pedido já na Espanha), seguro (seguradora
autorizada na Espanha, cobertura equivalente ao SNS), traduções (tradutor juramentado + apostila), meios econômicos
(custo do curso não conta), declaração de equivalência de nota média (procedimento atual do Ministerio de Ciencia,
gratuito, com o efeito no DUA), prorrogação (janela, via eletrônica, limites).

## 5. Bugs encontrados e corrigidos

| # | Gravidade | Bug | Correção | Teste |
|---|---|---|---|---|
| 1 | Alta | O simulador contava o dinheiro reservado para a matrícula como meio de subsistência do visto. A regra oficial exclui "las cuantías utilizadas para sufragar el coste de los estudios": um estudante com € 8.000 e matrícula de € 3.000 a pagar via "visto coberto" (exigência € 7.200), mas só tem € 5.000 que contam | `finance-engine.js` desconta a matrícula ainda não paga; Financiamento e painel da missão explicam o desconto | `finance-audit.test.js` + E2E ("69% coberto", alerta "faltam € 2.200") |
| 2 | Alta | 18 mestrados oficiais da UGR fora da plataforma: o pipeline descartava código do DUA sem página no catálogo da UGR | `pipeline.js` cria esses códigos como programas do DUA, sem duplicar variantes nem vinculados | `radar.test.js` + simulação com dados reais |
| 3 | Média | Fonte do visto/TIE (O6) com regras desatualizadas ou ausentes (prazos de resolução, retirada, TIE, prorrogação) | Textos de 5.8, 5.9, 8.1 e catálogo | E2E dos documentos |
| 4 | Média | Declaração de equivalência de nota média sem fonte nem endereço (o órgão mudou: ANECA → Ministerio de Ciencia) | Fonte O31 e texto com o efeito no DUA (O2 art. 12.2) | E2E |
| 5 | Baixa | "EX-00" afirmado como formulário da prorrogação; a fonte oficial só diz "modelo oficial" | Texto deixou de afirmar | - |

Não corrigido (documentado): a função `estuvia_entity_tables()` não teve `revoke` de `public` (só devolve a lista
fixa de nomes de tabelas; impacto baixo; corrigir exige migração no banco de produção). Diferença de leitura entre
"Quanto ainda falta" (meta do orçamento) e o alerta da página inicial (maior entre orçamento e visto): os dois estão
corretos, mas o rótulo pode confundir.

## 6. Funcionalidades implementadas

- Desconto da matrícula na comprovação do visto, com explicação na interface.
- Inclusão dos duplos e variantes duais do DUA ausentes do catálogo da UGR.
- Duas fontes oficiais novas: O31 (equivalência de nota média) e O32 (Lei 7/1985, art. 15, Padrón).
- `scripts/audit-inventarios.mjs`: gera os inventários de processos, documentos, fontes e regras a partir do código
  (reexecutar a cada mudança de conteúdo).
- `e2e-navegador.mjs`: roteiro E2E reutilizável (servidor local com banco JSON temporário).

## 7. Informações pendentes de confirmação

| Informação | Por quê | Quem confirma |
|---|---|---|
| Oferta de vagas na Fase 1 por mestrado | Não há fonte pública; o catálogo do DUA é idêntico nas 3 fases | Cada universidade (serviço de pós-graduação) |
| Acordos do DUA 2027/28 | Não publicados | Comisión del DUA (BOJA) |
| Créditos ECTS, idioma de ensino e modalidade presencial de 922 mestrados | Não estão na ficha do DUA | Páginas de cada universidade (próxima fase: conector por universidade) |
| Direito de trabalhar durante os estudos (horas, autorização) | A página oficial do Ministerio não trata do tema | Fonte oficial específica a localizar e conferir |
| Taxas consulares e tempo real de análise do visto | Variam por consulado | Consulado competente |
| Cita, documentos e prazo do empadronamiento por cidade | Definidos por cada ayuntamiento | Sede eletrônica de cada cidade |
| UGR: Cirugía Bucal, Abogacía (Melilla), canal do Food-H | Ver auditoria de 13/11 | UGR, Servicio de Másteres Oficiales |

## 8. Fontes oficiais utilizadas

34 fontes cadastradas, 32 oficiais (`fontes-oficiais.csv`, com URL e data de conferência). Conferidas nesta auditoria:
- Ministerio de Inclusión, Estancia por estudios (O6): https://inclusion.gob.es/web/migraciones/w/estancia-por-estudios
- Ministerio de Ciencia, Innovación y Universidades, Equivalencia de la Nota Media (O31): https://www.ciencia.gob.es/Universidades/NotaMedia.html
- BOE, Ley 7/1985, art. 15 (O32): https://www.boe.es/buscar/act.php?id=BOE-A-1985-5392
- Catálogo de másteres do DUA (UGR, fase 2, 2026/27): portal sguit da Junta de Andalucía
- Demais fontes: verificação de disponibilidade em 14/11/2026 (seção 1); BOJA 245/2025 e 84/2026 conferidos em 13/11/2026.

Fontes com conferência de conteúdo mais antiga (24 a 28/10/2026) seguem disponíveis, mas devem ser relidas na
próxima rodada: O2–O5, O7, O9–O17 e o catálogo de documentos (O18–O27).

## 9. Resultados dos testes

- `npm test`: 349/349 (`# fail 0`). `npm run check`: 232/232.
- E2E (`e2e-resultado.json`): cadastro, perfil, jornada, finanças, 15 páginas sem erro de console nem 5xx, celular,
  4 testes de permissão: OK. Seis verificações falharam por erro do roteiro e foram reconferidas: missões 5.8/8.1
  estão bloqueadas nessa fase da jornada e por isso a API só mostra a prévia (comportamento correto); o detalhe dos
  documentos fica em `/api/documents/:id` (regras novas presentes em seguro, equivalência, passaporte e
  antecedentes); a página Financiamento mostra o desconto ("69% coberto. Sem contar € 3.000 da matrícula…").
- Perfil testado: estudante brasileira, residente em SP, diploma brasileiro, mestrado da UGR 2027/28, € 8.000
  disponíveis e matrícula de € 3.000 a pagar.

## 10. Limitações

- Nada publicado: as correções só chegam aos estudantes depois de commit, deploy e (para os 18 mestrados) nova
  coleta do catálogo.
- ECTS, idioma de ensino e modalidade por mestrado continuam pendentes (seção 7). É a maior lacuna de dados.
- A leitura dos textos das fichas usa regras de texto; formulações novas podem escapar (rodar
  `scripts/audit-conformidade.mjs` a cada coleta).
- Não foram acessados dados reais de usuários de produção nem o painel admin de produção.
- O coletor horário do DUA roda a partir desta pasta: com o código novo, ele passará a baixar também as 18 fichas
  novas (cerca de 18 requisições a mais, uma vez). Produção só as aproveita depois do deploy.
