# 06 — Gamificação, progresso e conquistas

A gamificação serve para tornar o processo **compreensível e motivador sem virar jogo infantil**: o progresso reflete procedimentos reais concluídos, nunca cliques ou leituras.

## Progressão

- **Jornada → Rodadas → Missões → Objetivos** (detalhes em [13 — Jornada Estuvia](13-jornada-estuvia.md)).
- **Barra por missão** = objetivos realmente feitos; **por rodada** e **jornada** = média das missões aplicáveis (missão não concluída vale no máximo 85%); missões não aplicáveis e opcionais não iniciadas não contam como pendência.
- **Trilha visual** em zigue-zague: cada nó muda de estado (bloqueada, disponível, em andamento, atenção, aguardando, concluída, não aplicável); a linha fica sólida entre missões concluídas; o nó recomendado mostra "Você está aqui".
- **Feedback:** toast ao concluir e ao desbloquear; celebração discreta ao concluir uma rodada ou um marco; histórico de marcos no painel da jornada.

## Marcos (resultados concretos)

| Marco | Missão |
|---|---|
| Primeira candidatura enviada! | 3.6 |
| Vaga universitária conquistada! | 4.3 |
| Matrícula concluída! | 4.6 |
| Visto aprovado! | 5.9 |
| Você chegou ao seu destino! | 7.1 |
| Estadia regularizada! | 8.8 |

XP e níveis foram retirados de propósito: o reconhecimento vem dos resultados reais (marcos e conquistas abaixo).

## Personalização

Avatar, cor de destaque (turquesa Estuvia por padrão), tema escuro/claro, "meu porquê", meta pessoal e dicas geradas pelo perfil e pelas jornadas (idioma exigido × nível declarado, ciclo, consulado).

## Conquistas

Além dos marcos de cada jornada, o estudante tem um quadro de **conquistas pessoais**: 19 medalhas em 4 categorias (Primeiros passos · Candidatura e vaga · Visto e finanças · Mudança e chegada), com nível **bronze** (10 pts), **prata** (25) ou **ouro** (50).

Exemplos: 🎓 *Aprovado(a)!* (adjudicação "Admitido(a)"), 🏁 *Vaga garantida* (vaga confirmada/reservada), 🛂 *Visto aprovado* (situação do visto "Aprovado"), 🏠 *Lar à vista*, ✈️ *Rota traçada*, 📍 *Cheguei!*, 🛡️ *Residente* (TIE).

- **Fonte da verdade:** os mesmos fatos da jornada (missões, situação externa, documentos, finanças, moradia, viagem). Uma conquista ganha em qualquer jornada conta para a pessoa.
- **Reversível:** se o fato deixa de ser verdadeiro, a conquista volta a ficar pendente. `user.conquistas` guarda só a data da primeira vez (`em`) e se a celebração já foi vista (`vistaEm`).
- **API:** `GET /api/achievements` (lista, resumo e `novas`) · `POST /api/achievements/seen` `{ ids }`.
- **Arquivos:** catálogo em `server/content/achievements.js`, regras em `server/achievements-engine.js` (`RULES`, mesmo id), rota em `server/routes/achievements.js`, tela em `public/js/achievements.js`, estilos em `public/css/achievements.css`, testes em `tests/achievements.test.js`.

Para criar uma conquista: adicione a entrada no catálogo e a regra com o mesmo id em `RULES`. O teste do catálogo falha se faltar a regra ou o nível.
