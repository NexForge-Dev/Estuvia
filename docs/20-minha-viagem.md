# 20 — Minha Viagem (missões 6.3 a 6.5)

Planejador visual da viagem. A Estuvia **organiza as possibilidades** e o estudante avança por etapas: pesquisando → cotação salva → rota escolhida → passagem comprada → viagem concluída.

**Regra principal:** nada de voo, horário, duração ou preço inventado. Os percursos são possibilidades, não voos. Preço, horário e companhia só aparecem quando o estudante informa. Sem cotação, a tela mostra "Preço a consultar", e um valor desconhecido é `null`, nunca 0.

## Telas

| Situação | O que aparece |
|---|---|
| Pesquisando / cotação salva | **Hero** com origem (sugerida pelo estado, com confirmação simples), destino, universidade e data, vindos da jornada. Depois: "Encontrar minha rota" (busca guiada), "Já encontrei uma passagem", os **cards de percurso** e o **comparador** |
| Rota escolhida / comprada / concluída | **Painel "Minha próxima viagem"**: data, rota, custo previsto, etapas da situação e ações (itinerário, comparar outra rota, editar, Agenda AI, documentos, chegada). Abaixo: **itinerário**, **chegada**, **custo no planejamento** e **compromissos da viagem** |

**Visto:** aparece como um aviso discreto e expansível. Não bloqueia a pesquisa. Sem visto aprovado, a compra recomenda tarifa com remarcação, e o comparador alerta sobre tarifa não reembolsável.

## Percursos (`server/content/travel.js`)

Para Granada: **Via Madri**, **Via Málaga** e **Direto ao aeroporto de Granada**. Cada um tem:
- as etapas e os aeroportos;
- se há trecho por terra até a cidade;
- os cuidados (troca de meio de transporte, bilhetes separados, poucas conexões);
- as fontes oficiais: páginas da Aena dos três aeroportos e da Renfe, conferidas em 25/10/2026. A ALSA fica com "confira no site".

Os links de pesquisa (Google Voos e Skyscanner) recebem origem, destino e data. O preço real o estudante vê no próprio site.

## Cotação por link

`POST /api/travel/quotes/parse-link` lê **apenas o que está escrito na URL**:
- Skyscanner: origem, destino e data no caminho;
- Kayak: `REC-AGP/2027-09-01`;
- outros sites: parâmetros comuns como `origin`, `destination` e `date`.

O site não é acessado. Sem dados no link, basta informar nome da rota, preço, data e link; o resto fica em "Mais detalhes": bagagem, trecho por terra, transporte local, pernoite, conexões, malas incluídas, horário de chegada, companhia, tarifa e bilhetes separados. A data da cotação é registrada.

## Comparação e custos

- Total = voo + bagagem + trecho até a cidade + transporte local + pernoite + outros, contando só os itens informados.
- Uma cotação **incompleta** (sem bagagem ou sem o trecho por terra de um percurso que exige isso) mostra "o total pode subir" e **não concorre** a "menor custo".
- O comparador mostra alertas por cotação: 2 ou mais conexões, bilhetes separados, chegada de madrugada (risco de pernoite), tarifa não reembolsável e bagagem não informada.
- **Financeiro:** a rota escolhida entra **uma única vez** como "Passagens", com o detalhamento na nota. O status é "estimado" enquanto for cotação e "confirmado" depois de marcada como comprada (`routeTotal` e o status do item estão em `finance-engine.js`).

## Itinerário e chegada

O itinerário é montado a partir do percurso escolhido e dos dados da cotação: origem, trechos, cidade e **moradia escolhida no "Meu novo lar"**. Cada etapa mostra meio de transporte, operador, data, horário de chegada e custo quando informados; o resto aparece como "Detalhes a definir".

A chegada é preenchida pela rota, por exemplo "Você vai chegar a Madri e precisa seguir até Granada". Ela mostra as opções do aeroporto até a cidade, com fontes oficiais, e "Como vou chegar à minha moradia?". Ao salvar, o meio escolhido entra no itinerário. Sem moradia, a tela mostra "Você ainda não escolheu onde vai ficar." e o botão **Organizar minha moradia**.

## Agenda AI

A partir da data da viagem, a tela sugere estes compromissos: conferir documentos (D-7), preparar a bagagem (D-3), check-in (D-1), sair para o aeroporto, voo, deslocamento até a cidade e entrada na moradia.

- O estudante marca quais quer criar.
- Horários desconhecidos ficam para ele definir.
- Os eventos têm origem `viagem` e não são duplicados.
- Se a data da viagem mudar, a tela propõe novas datas, e **nada muda sem confirmação**.

## Mentor

A ferramenta de leitura `get_travel_plan` responde, no Modo Guiado, a estas perguntas:
- "Qual é a melhor forma de chegar a Granada?" e "Compensa mais ir por Madri ou Málaga?": compara só cotações completas e, se não houver, explica o que falta;
- "Quanto vou gastar com bagagem?";
- "Essa conexão é muito curta?": diz que não tem o tempo exato e explica bilhete único × separado;
- "Como chego do aeroporto até minha casa?";
- "Minha passagem mudou, reorganiza minha viagem."

## API (`/api/travel`)

- `GET /`
- `PUT /profile`
- `POST /quotes/parse-link`
- `POST|PUT|DELETE /quotes(/:id)`
- `POST /quotes/:id/choose`
- `POST /quotes/:id/purchase {comprada, tarifa?, confirmo:true}`
- `PUT /arrival`
- `POST /done`
- `POST /agenda {itens}`
- `POST /agenda/changes {aceitar, recusar}`

As rotas antigas `/api/living/travel/*` continuam válidas e usam os mesmos dados.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `server/content/travel.js` | Percursos, aeroportos e links de pesquisa |
| `server/travel-engine.js` | Estado, custos, comparação, itinerário, chegada e agenda |
| `server/routes/travel.js` | API |
| `public/js/components/travel/TravelDashboard.js` | `TravelHero`, `TravelStatusCard`, `RouteDiscovery`, `TravelRouteCard`, `FlightQuoteImporter`, `RouteComparison`, `TravelItinerary`, `TravelSegment`, `ArrivalPlanner`, `TravelCostSummary`, `TravelAgenda` |
| `public/css/travel.css` | Estilos |
| `public/img/travel/*.svg` | Ilustrações dos percursos |
| `server/mentor/tools/travel.js` | Ferramenta do Mentor |
| `tests/travel.test.js` | Testes |

**Limitações:**
- Não há integração com buscadores, por isso não aparecem preços ao vivo.
- Os percursos estão cadastrados só para Granada; outras cidades mostram apenas as cotações do estudante.
