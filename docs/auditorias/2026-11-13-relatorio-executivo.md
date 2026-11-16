# Relatório executivo: auditoria de conformidade dos processos de candidatura

Data: 13/11/2026. Ciclo dos acordos: 2026/2027. Base: produção (dump público das 21:40 UTC, 923 mestrados) ×
fichas e catálogo do DUA reconsultados (16:52–17:58 UTC) × código local.

Arquivos: `2026-11-13-matriz-conformidade.md` / `.csv` / `.json` (uma linha por mestrado, conferidos idênticos por
`scripts/audit-verifica-matriz.mjs`: 923 linhas, mesmos estados e totais, zero divergências).

## 1. Integridade da reconsulta

| Item | Total |
|---|---|
| Fichas do DUA consultadas (todos os códigos do catálogo 2026/27 das 10 universidades) | 987 |
| Consultadas com sucesso | 987 |
| Falhas / em branco / com aviso de extração | 0 / 0 / 0 |
| Fichas **validadas** (extraídas sem aviso e comparadas com o banco, sem divergência) | 895 |
| Consultadas sem base para comparar (vínculo manual novo; produção ainda não coletou) | 7 |
| Mestrados sem ficha aplicável (fora do DUA, pendência institucional, variantes) | 21 |
| Fichas do DUA sem mestrado correspondente na plataforma | 18 (todas da UGR) |
| Dado do banco divergente da ficha oficial | 0 |

Nenhuma ficha antiga foi considerada atual: a classificação usa só a ficha reconsultada; cada linha registra data e hora UTC da consulta.

## 2. Estados (923 mestrados reais de produção)

| Estado | Total |
|---|---|
| VERIFIED | 0 |
| PARTIALLY_VERIFIED | 914 |
| UNVERIFIED | 0 |
| NON_DUA_PROCESS | 6 |
| INSTITUTIONAL_PENDING | 3 |
| INCORRECT | 0 (com o código atual) |

Por universidade: UAL 73 · UCA 81 · UCO 121 · UGR 138 (129 parciais, 6 fora do DUA, 3 pendências) · UHU 56 · UJA 87 ·
UMA 102 · UNIA 46 · UPO 53 · US 166, todos os demais PARTIALLY_VERIFIED.

**Por que nenhum VERIFIED:** a oferta de vagas na Fase 1 (a fase pensada para estrangeiros) é decidida por cada
universidade e não existe fonte pública por máster. O catálogo do DUA devolve a mesma lista, byte a byte, nas três fases.
Para 841 mestrados essa é a única pendência; para os demais há também variantes, ficha que não repete a regra de PGS
ou ficha ainda não coletada em produção.

## 3. Regras

- 33 regras do procedimento confirmadas no texto do BOJA, com artigo, data e trecho original (tabela R1–R33 na matriz).
  Gerais só justificam o procedimento; requisitos particulares vêm apenas da ficha do próprio código.
- Pendentes (sem fonte pública): oferta da Fase 1 por máster; acordos de 2027/28 (não publicados); vagas e preço
  total por máster.

## 4. Problemas por gravidade

**Críticos**
1. (Corrigido e publicado em aa58269) Regra errada "quem não se formou só concorre na Fase 3": os requisitos 4 e 5 do
   art. 2 (O2) valem só para graduação em universidade espanhola/PARS. Com título brasileiro, o título deve estar
   concluído até a data-limite de qualquer fase.
2. (Corrigido e publicado) Idioma abaixo do exigido: UCA Agroalimentación, UCO Agroalimentación (semipresencial) e UCA
   MEVINAP orientavam B1; as fichas exigem B2 (requisito 099). A API de produção já devolve B2.
3. (Corrigido no código local, **não publicado**) UAL Ingeniería Industrial (106605): a ficha exige título homologado
   ("NO PODRÁN TENER ACCESO"); produção só mostra o texto, sem alerta nem item de elegibilidade.

**Altos**
4. Oferta da Fase 1 não confirmada para nenhum máster do DUA (pendência institucional geral).
5. Acordos de 2027/28 não publicados: quem planeja 2027/28 vê as regras de 2026/27 como referência, com aviso.
6. (Corrigido e publicado) Psicología General Sanitaria: exige a certificação da Orden CNU/1309/2018 (Resolução de
   16/11/2023), não "homologação". Confirmado nas fichas da UGR e da UJA; 8 fichas (UAL, UCA, UCO ×2, UHU, UMA, US ×2)
   não repetem a regra, que vale pelo art. 9 do acordo.
7. (Corrigido no código local, **não publicado**) Etapas próprias obrigatórias da ficha (entrevista, prova, exame) só
   aparecem como texto em produção: UCO Desarrollo Rural (313500), UGR Interpretación de Conferencias, UPO Comunicación
   Internacional, UMA Análisis y Gestión Ambiental, UCA Relaciones Internacionales y Migraciones, UAL Transformación
   Digital Agroalimentario (dual) e UNIA Transformación Digital Energético (dual), 7 mestrados.
8. 18 mestrados oficiais da UGR no DUA ausentes da plataforma (duplos com Profesorado e com Caminos, Transformación
   Digital Salud dual). Lista na matriz (`fichasSemMestradoNoBanco`).

**Médios**
9. 12 mestrados da UGR com vários códigos DUA; em 5 as variantes têm requisitos diferentes (Plasmas, Desarrollo de
   Software, Didáctica de la Matemática, Gestión de Procesos de Negocio, Profesorado com 9 conjuntos).
10. 7 vínculos manuais (UGR) publicados; produção ainda não coletou as fichas deles (o Radar faz isso nas próximas execuções).
11. Registros repetidos: UGR Marketing ×2 e Currículum y Formación ×2 (mesmos códigos); 15 outros nomes repetidos
    são códigos DUA distintos (sedes/centros).

**Baixos**
12. (Corrigido e publicado) Regra de Profesorado aplicada a "Enseñanza de la lengua… para profesorado de español" (UAL).
13. Documentos "deduzidos" dos critérios (CV, carta, entrevista) aparecem marcados como dedução, não como regra.

## 5. Instituições a consultar

| Instituição | O que confirmar |
|---|---|
| Serviço de acesso/pós-graduação de cada uma das 10 universidades (ou o portal do DUA, no prazo da Fase 1) | Em quais másteres há vagas na Fase 1 |
| UGR, Servicio de Másteres Oficiales | Cirugía Bucal e Implantología (fora do catálogo 2026/27); Abogacía y Procura (Melilla) (sem código próprio); canal do Food-H (Arqus) |
| Comisión del Distrito Único Universitario de Andalucía (BOJA) | Acordos de 2027/28, quando publicados |
| Coordenações dos másteres com etapa própria | Datas e formato de entrevista/prova |

## 6. Divergências resolvidas

- UNIA × BOJA (lista de espera da Fase 1): um FAQ antigo da UNIA dizia que a passagem era automática; o BOJA (O1 arts.
  6.6 e 9) exige confirmação expressa. O documento oficial da UNIA de 2026/27 não repete a afirmação. Vale o BOJA.
- Link do GEMMA (Erasmus Mundus, UGR): falha só na verificação TLS automática; conferido manualmente (HTTP 200,
  redireciona ao site oficial do programa).
- Fonte secundária não usada como regra: notícias sobre os 14 mestrados da UNIA na Fase 1.

## 7. Fontes oficiais

- BOJA 245/2025 (Acuerdo de 12/12/2025, Fase 1): https://www.juntadeandalucia.es/boja/2025/245/50
- BOJA 84/2026 (Acuerdo de 20/04/2026, Fases 2 e 3): https://www.juntadeandalucia.es/boja/2026/84/46
- Catálogo e fichas do DUA (987 páginas reconsultadas em 13/11/2026)
- UGR, Másteres Erasmus Mundus y Arqus (curso 2026/2027): https://masteres.ugr.es/ramas/erasmus-mundus-arqus
- UNIA, Fase 1 2026/27 (documento informativo oficial)

## 8. Testes

- `npm test`: 347/347. `npm run check`: 231/231 arquivos.
- Testes com páginas oficiais reais do DUA (`tests/fixtures/dua-oficial`): Agroalimentación UCA (B2), duplo com
  Profesorado UCO, Ingeniería Industrial UAL (homologação), Desarrollo Rural UCO (entrevista).
- Segurança do workflow: 5 perfis × 3 fases (só a Fase 1 para nacionalidade espanhola é recusada), documentos por
  programa, nada não confirmado como oficial, estados e listas de espera, compatibilidade com jornada antiga.
- Fora do DUA: Erasmus Mundus (MITRA, também no navegador), Arqus (Estudios Europeos), Food-H sem canal, Cirugía Bucal.
- Compatibilidade: 6 usuários, 7 jornadas e 504 cálculos de missão do banco local, sem erro.
- Não validado: dados de usuários reais de produção (não acessados); a interface em produção após a publicação de aa58269.

## 9. Limitações

- A oferta da Fase 1 por máster e os acordos de 2027/28 não têm fonte pública hoje.
- A interpretação dos textos das fichas usa regras de texto (idioma, homologação, etapa): o texto oficial sempre
  acompanha o resultado, mas formulações novas podem escapar. Rodar `audit-conformidade.mjs` a cada nova coleta.
- O commit aa58269 (autoria "unknown", 19:00 CET) publicou em `origin/main` o estado do trabalho às 19:00. As mudanças
  posteriores (homologação e etapa própria) estão só no repositório local.
