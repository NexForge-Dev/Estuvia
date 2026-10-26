# 17 — Resultados estruturados

Quando a Estuvia já sabe a resposta, a tela mostra o **resultado**, não um parágrafo com um link para o estudante pesquisar. As ferramentas (missões, Mentor, Radar…) devolvem dados `{ tipo, ... }` e o front escolhe o componente pelo tipo. O modelo de linguagem pode explicar o resultado, mas os dados vêm sempre de uma base verificada.

## Formato de todo resultado

| Bloco | O que mostra |
|---|---|
| **A. Resultado** | Ícone, selo de estado (cor = situação) e título curto ("Encontramos seu consulado!") |
| **B. Informação essencial** | Um destaque e poucos campos. Os campos úteis podem ser copiados |
| **C. Próxima ação** | **Um** botão principal, com ação específica ("Ver documentos do meu visto") |
| **D. Ajuda opcional** | Ações secundárias discretas, detalhes recolhidos e a fonte oficial com a data de verificação |

## Arquivos

| Arquivo | Papel |
|---|---|
| `public/js/components/ResultCard.js` | Contém `ResultCard` (genérico) e os componentes `ConsulateResult`, `ChecklistResult`, `OpportunityResult` e `ActionResult`. `renderResult(dados, opts)` escolhe o componente pelo tipo; `registerResult(tipo, fn)` registra tipos novos |
| `public/css/results.css` | Estilos dos cartões, carregados pelo próprio componente. Usa só os tokens do tema (claro e escuro), tem layout responsivo e respeita `prefers-reduced-motion` |
| `server/content/places.js` | Base verificada de jurisdições consulares e a função `consulateResult()` |
| `tests/places.test.js` | Garante que cada estado tem uma única repartição e que um estado sem dado confirmado não gera consulado inventado |

## Consulado (primeiro caso)

- **Base:** `CONSULATES` (5 repartições) e `CONSULAR_JURISDICTIONS` (uma linha por estado: país, estado, consulado, serviço, contatos, URL da fonte, data de verificação). Os dados foram conferidos em 24/10/2026 nas páginas de *Demarcación* e de contato de cada repartição em exteriores.gob.es:

  | Repartição | Estados |
  |---|---|
  | Consulado Geral em Salvador | BA, SE, AL, PE, PB, RN, CE, PI, MA |
  | Seção Consular da Embaixada em Brasília | DF, GO, AM, PA, MT, TO, RO, RR, AC, AP |
  | Consulado Geral em São Paulo | SP, PR, MS |
  | Consulado Geral no Rio de Janeiro | RJ, MG, ES |
  | Consulado Geral em Porto Alegre | RS, SC |

- **E-mail:** `emailVistos` só existe quando a página oficial publica um e-mail específico de vistos (Salvador e Rio). Nos outros casos o cartão mostra "E-mail geral do consulado" ou "E-mail da seção consular" e explica isso.
- **Links diretos:** o link principal vai para a página do **visto de estudos** do consulado, não para a página inicial do ministério. Sem dado confirmado (`nao-confirmado`, `fora-do-brasil`), o cartão diz isso com clareza e leva à página oficial de repartições, sem adivinhar.
- **Onde aparece:**
  - Missão 5.1 (`MissionGuide.consulateStep`): "Ver documentos do meu visto" conclui a 5.1, usando o consulado como evidência, e abre a 5.3.
  - Ferramentas da missão (`MissionTools`).
  - Mentor: a ferramenta `find_consulate` e o intent "qual é o meu consulado?", que aceita a sigla ou o nome do estado.

## Mentor

O orquestrador transforma o resultado de cada ferramenta em cartão (`cardFor`). Tipos sem renderizador próprio no `MentorPanel` caem em `renderResult(c, { compacto: true })`. Para criar um cartão novo:

1. Faça a ferramenta devolver `{ tipo: '<novo>', ... }`.
2. Registre o componente com `registerResult('<novo>', fn)`, seguindo o formato A/B/C/D.

## Para manter

- Ao rever a base consular, atualize `VERIFICADO_EM` em `places.js` e confira as páginas de *Demarcación*.
- Os próximos tipos previstos são: programa acadêmico (Radar), bolsa com compatibilidade, checklist de documentos, comparação de moradias e proposta de calendário. Os componentes `OpportunityResult` e `ChecklistResult` já existem para esses casos. O resumo financeiro é do planejador (`16-planejador-financeiro.md`).
