# 18 — Central da missão (MissionHub)

A página principal de uma missão é uma **central de ferramentas**, no formato da referência visual de "Conteúdo da Missão":

```
Cabeçalho   Jornada | Rodada | Missão
Progresso   "SEU PROGRESSO NESTA MISSÃO" · X de Y objetivos · barra · descrição curta · objetivos → ferramenta que ajuda
Alertas     prazo e risco, em uma linha cada
Conclusão   aparece quando todos os objetivos estão feitos (com evidência, se a missão exigir)
Grade       cards grandes: ícone em círculo colorido, título, descrição, dica com o estado real
Mentor      acesso discreto, já com a missão no contexto
Rodapé      experiências de outros estudantes · fontes e detalhes
```

A página principal **organiza**. Os cards **dão acesso** às ferramentas. As ferramentas, abertas num painel lateral, **orientam e executam**. O progresso registra o que foi feito. O passo a passo (`MissionGuide`) continua existindo dentro da ferramenta "Passo a passo" / "Fazer agora".

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `public/js/components/mission-hub/MissionHub.js` | `MissionHub(m, ctx)` e os componentes `MissionOverviewHeader`, `MissionProgressCard`, `MissionToolsGrid`, `MissionToolCard`, `MissionMentorAccess`, `MissionCompletionFeedback` e os painéis genéricos (guia, site oficial, documentos, agenda, entender melhor) |
| `public/js/components/mission-hub/finance-panels.js` | Simulador, Comprovação financeira, Meu dinheiro (`MissionResourcePanel`), Alternativas e Bolsas |
| `public/js/components/mission-hub/tools-config.js` | Quais ferramentas cada missão mostra |
| `public/js/components/mission-hub/hub-icons.js` | Ícones extras (calculadora, cofrinho, lâmpada, escudo com check, calendário) |
| `public/css/mission-hub.css` | Layout: 3 colunas no desktop, 2 no tablet, 1 no celular. Usa só as variáveis do tema |

`views/mission.js` usa `MissionHub` para as missões liberadas. A missão bloqueada continua com `LockedMission`.

## Quantidade de cards = complexidade real

Missões com central própria em `MISSION_TOOLS`:

| Missão | Cards |
|---|---|
| 1.5 Planejamento financeiro inicial | Simulador financeiro (destaque) · Comprovação financeira · Meu dinheiro · Alternativas de financiamento · Bolsas disponíveis · Meu planejamento |
| 2.1 Passaporte | Conferir meu passaporte · Solicitar ou renovar · Preciso de ajuda |
| 6.3 Comprar passagens / 6.5 Organizar chegada | Minha viagem / Minha chegada (abre `#/viagem`, que marca os objetivos automáticos) · Passo a passo · Agenda / ajuda |
| 5.4, 9.1, 9.2, 9.3, 9.4, 9.10 | Subconjuntos das ferramentas financeiras, de 3 a 6 cards |

As demais missões são compostas automaticamente a partir dos dados da missão:
- **simples:** até 3 cards ("Fazer agora", site oficial, ajuda);
- **guiada:** até 5 cards (passo a passo, ferramenta da missão, documentos, site oficial, agenda);
- **complexa:** até 8 cards (inclui "Entender melhor").

Um card só aparece se houver conteúdo real para ele.

## Progresso e conclusão

- O progresso vem **somente** dos objetivos do motor da jornada.
- Uma ferramenta pode declarar `objetivos: ['custos']`. Nesse caso, o card mostra o selo "objetivo" enquanto ele está pendente, e o objetivo no card de progresso ganha um atalho para essa ferramenta.
- As outras ferramentas são complementares e **não bloqueiam** a conclusão.
- Na 1.5:
  - "Calcular minha estimativa" (Simulador) cumpre o objetivo 1 com as premissas da Estuvia (`PUT /finance {iniciar:true}`).
  - Registrar qualquer recurso, ou "Ainda não tenho nada", cumpre o objetivo 2.
  - Com 2/2, aparece "Concluir missão".
- **Desconhecido ≠ zero:** sem recursos informados, a interface mostra "—" e "Ainda não informado", nunca "faltam €7.200". Apoio prometido fica em "Previsto (não conta)". Bolsa só entra como concedida.
- Ao fechar uma ferramenta em que algo mudou, a missão é recarregada e o progresso e as dicas dos cards são atualizados.

## Para configurar uma missão nova

Acrescente uma entrada em `MISSION_TOOLS` com `ferramentas: [...]`. Cada ferramenta tem:
- `painel`: um dos painéis existentes;
- `titulo`, `desc`, `ic`, `cor`;
- `destaque`: opcional;
- `objetivos`: opcional. Use os ids de objetivo, ou `'*'` para o passo a passo.

Para criar um painel novo, acrescente um `case` em `panel()`, em `MissionHub.js`.
