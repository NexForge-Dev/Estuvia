# 24 — Tempo real, pesquisa na web, preços de passagens e anotações

Tudo aqui usa **serviços gratuitos**. Nada é inventado: cada dado mostra a fonte e a hora da consulta. Quando um serviço não está configurado ou falha, a tela diz isso.

## 1. Atualizações ao vivo (Server-Sent Events)

O navegador mantém uma conexão aberta em `GET /api/events` (só para quem está logado). Quando algo muda, o servidor envia um aviso curto e a tela se atualiza, sem recarregar a página.

| Evento | Quando | Quem recebe | O que a tela faz |
|---|---|---|---|
| `radar-alerta` | O Radar criou um alerta para uma oportunidade que o estudante acompanha (calendário publicado, abertura, prazo acabando, resultado) | Só o estudante dono do alerta | Mostra um aviso e recarrega o Radar |
| `radar-atualizado` | O atualizador publicou mudança vinda de fonte oficial, ou a equipe aprovou uma revisão | Todos os conectados | Mostra um aviso e recarrega o Radar |
| `preco-passagem` | O menor preço visto ficou abaixo do teto do alerta de preço | Só o estudante dono do alerta | Mostra um aviso e recarrega "Minha viagem" |

- Arquivos: `server/events.js` (barramento), `server/routes/events.js` (rota), `public/js/live.js` (cliente: `startLive`, `stopLive`, `onLive`).
- Se a conexão cair, o navegador reconecta sozinho em 15 s. Há um sinal de vida a cada 25 s e no máximo 5 conexões por estudante.
- Só avisos curtos passam por esse canal. Os dados completos continuam vindo da API, com as mesmas permissões.
- **Escala:** o barramento fica na memória do processo. Com mais de uma instância do servidor, troque-o por Redis pub/sub ou PostgreSQL `LISTEN/NOTIFY`, mantendo `emitTo` e `broadcast`.

## 2. Radar mais rápido perto das datas

- **Frequência adaptativa** (`effectiveFrequencyHours` em `server/radar/pipeline.js`): a fonte de datas de candidatura (calendário do DUA) é conferida a cada **1 h** quando falta até 2 dias para uma abertura, encerramento ou resultado oficial, e a cada **3 h** quando falta até 14 dias. Fora disso vale a frequência cadastrada (6 h). O valor usado fica em `source.frequenciaEfetivaHoras`.
- **Requisição condicional:** cada coleta guarda o `ETag` e o `Last-Modified` da página (`source.validadores`). Na coleta seguinte, se a página oficial não mudou, ela responde `304`: nada é baixado e a verificação conta como bem-sucedida.
- As regras de publicação não mudaram (doc 11): mudança de prazo continua passando por revisão.

## 3. Pesquisa na web e vídeos no Mentor

O estudante pede no chat, por exemplo "Pesquise notícias sobre visto de estudante" ou "Me mostra vídeos sobre apostila". Também há os botões rápidos **Novidades na web** e **Vídeos e aulas**. Funciona no Modo Guiado (sem IA) e com IA (ferramentas `search_web` e `search_videos`).

| Fonte | Natureza mostrada | Chave | Limite gratuito |
|---|---|---|---|
| Canal UGR: feeds das últimas notícias e convocatórias (≈ 40 itens cada), em cache aquecido a cada 30 min e filtrados pelas palavras da pergunta | Fonte oficial | não | respeita `robots.txt` e intervalo por domínio |
| GDELT DOC 2.0 (imprensa, últimos 3 meses, PT/ES) | Imprensa (não oficial) | não | 1 consulta a cada 5 s, controlada pelo servidor |
| Wikipédia em português (só quando a pergunta é sobre um conceito; só páginas com uma palavra da pergunta no título) | Enciclopédia (explica o conceito, não é fonte oficial) | não | uso moderado, com User-Agent |
| YouTube Data API v3 | Vídeo de terceiros | `YOUTUBE_API_KEY` (gratuita) | ≈ 100 buscas por dia |

- Cada resultado mostra título, quem publicou, a natureza e a data. O chat lembra que imprensa, Wikipédia e vídeo não são regra oficial.
- Vídeos: busca segura, de preferência em português, dos últimos 3 anos, só vídeos que podem ser incorporados. O player (`youtube-nocookie.com`) só carrega quando o estudante toca no vídeo. A CSP libera apenas `i.ytimg.com` (miniaturas) e `www.youtube-nocookie.com` (player).
- Sem `YOUTUBE_API_KEY`, o Mentor mostra só o link da busca no YouTube.
- A busca interna do Canal UGR (`?s=`) não é usada porque leva 10–20 s.
- Cache: feeds oficiais 30 min, imprensa 30 min, Wikipédia 24 h, vídeos 12 h. Se uma fonte falhar, as outras continuam e a falha aparece explicada.
- Fontes que **não** usamos porque os termos proíbem uso fora de leitor pessoal: os feeds RSS do Google Notícias e do Bing.

## 4. Preços de passagens e alerta de preço

Na tela **Minha viagem**, a seção recolhida **Preços vistos agora** traz os menores preços que usuários do Aviasales encontraram nas últimas ~48 h. Os dados vêm da Aviasales Data API, pelo programa de afiliados gratuito Travelpayouts (`TRAVELPAYOUTS_TOKEN`).

- Consulta: aeroporto de saída do perfil × aeroportos do destino (Granada: GRX, MAD, AGP), no mês da viagem. Sem data informada, usa o mês anterior ao início das aulas. Só ida, em R$, cache de 3 h.
- É referência, não oferta: o preço final, a bagagem e as regras aparecem no site. **Salvar como cotação** cria uma cotação marcada "preço visto, a confirmar".
- **Alerta de preço:** o estudante define um teto em R$. A cada 6 h o servidor confere as rotas de quem ativou. Quando o menor preço visto fica abaixo do teto, avisa ao vivo e guarda o aviso (últimos 10). O aviso só se repete se o preço cair mais ou se já tiverem passado 3 dias.
- Rotas: `GET /api/travel/prices`, `PUT /api/travel/price-alert` `{ ativo, teto }`. Código: `server/flight-prices.js`.

## 5. Anotações da missão

Cada missão tem o card **Minhas anotações**, com três tipos:

- **Anotação:** lembrete livre.
- **Tarefa:** tem caixinha para marcar como feita.
- **Preciso de ajuda:** tem o botão **Perguntar ao Mentor**, que abre o chat já com a dúvida e a missão no contexto, e pode ser marcada como resolvida.

- Só o estudante vê. Anotações **não** concluem objetivos nem a missão.
- O Mentor recebe as anotações abertas da missão em foco, como dado do estudante (nunca como instrução).
- Limite de 40 anotações por missão, 500 caracteres cada.
- Rotas: `POST /api/journeys/:jid/missions/:id/notes` `{ texto, tipo }`, `PUT …/notes/:noteId` `{ texto?, tipo?, feito? }`, `DELETE …/notes/:noteId`.

## 6. Tela mais limpa

- **Missão:** só cabeçalho, progresso e cards. Anotações, **Pergunte ao Mentor** (ou "Preciso de ajuda", sem duplicar) e **Experiências e fontes** viraram cards que abrem em painel.
- **Minha jornada:** Prazos importantes, Situação financeira, O que já aconteceu? e Marcos da jornada são painéis recolhíveis (`FoldPanel`). Fechados, mostram um resumo curto ("próximo em 12 dias", "faltam € 5.000", "2 de 6"). O navegador lembra quais o estudante deixou abertos.

Testes: `tests/live.test.js`.
