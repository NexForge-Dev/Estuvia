# 12 — Comunidade colaborativa

Rede social interna para estudantes internacionais: descobrir uma oportunidade, ver o quanto ela é confiável, salvar e transformá-la numa ação na jornada e na agenda. Usa a mesma autenticação, identidade visual (tokens de `styles.css`, claro/escuro) e persistência do resto da plataforma.

## Arquivos

| Arquivo | Papel |
|---|---|
| `server/content/community.js` | Categorias, naturezas, estados de verificação, motivos de denúncia, grupos iniciais, domínios institucionais, listas de spam/golpe |
| `server/community-engine.js` | Regras puras: análise de links, máscara de dados pessoais, sinais de spam, duplicatas, relevância, estado efetivo de verificação e `communityRadarFeed()` (contrato do Radar) |
| `server/routes/community.js` | API `/api/community/*` (feed, interações, grupos, missões, agenda, moderação, imagens) |
| `public/js/views/community.js` | Telas `#/comunidade[/secao[/id]]` |
| `public/js/views/community-parts.js` | Cartão de publicação, compositor, selos, denúncia |
| `public/js/views/community-mod.js` | Painel de moderação |
| `public/css/community.css` | Estilos (carregado pela própria view) |
| `tests/community.test.js` | 11 testes de integração |

Dados: coleção `community` em `data/db.json` (`posts`, `comments`, `groups`, `reports`, `media`); imagens em `data/media/` (fora de `public/`, servidas só para quem pode ver o post). No usuário: `opportunities` (missões geradas) e eventos `origem: 'comunidade'` em `planner`.

## Confiança da informação

- **Natureza** de cada publicação: relato pessoal, dúvida, dica ou "baseado em fonte oficial". A última **exige** citar um link de domínio institucional e mesmo assim só vira oficial depois de verificada.
- Em categorias sensíveis (documentação e vistos, custo de vida), relatos mostram o aviso "não é orientação oficial" com link para a Central de fontes.
- **Verificação** (oportunidades e orientações oficiais): `Não verificada → Em verificação → Verificada → Informação desatualizada / Rejeitada`. O estudante só pode *pedir* verificação; a mudança de estado é da moderação, com checklist obrigatório (link oficial, requisitos, datas), prazo registrado e nota quando o domínio não é institucional. **Um link não torna nada oficial.**
- Uma verificada com prazo vencido aparece automaticamente como desatualizada. Se o autor editar algo verificado, volta para "Em verificação" e sai do Radar.

## Integrações

- **Radar de Oportunidades**: `communityRadarFeed()` entrega as oportunidades verificadas, publicadas, com prazo vigente e sem duplicatas. O Radar (`server/radar`) as trata como fonte "comunidade" de revisão manual — nunca publica automaticamente como dado oficial.
- **Radar oficial**: ao publicar ou editar uma oportunidade, `findOfficialMatch()` (`server/radar/service.js`) verifica se o programa já está no Radar; se estiver, o autor é avisado e o cartão mostra "ver datas oficiais" (`#/oportunidades/<id>`). Se o módulo do Radar não carregar, a comunidade funciona sem essa checagem.
- **Duplicatas**: mesmo edital (URL normalizada, sem `utm_*`, `www`, barra final) ou instituição+título equivalentes. Na publicação o autor vê a existente e pode publicar mesmo assim (fica marcado para a moderação); na verificação, uma duplicata de outra já verificada é bloqueada.
- **Missões** ("Adicionar à minha jornada"): gera a missão "Avaliar oportunidade" (fonte, cada requisito, prazo, decisão). Decidir "Vou me candidatar" gera as atividades de candidatura. Tela: `#/comunidade/oportunidades`.
- **Agenda AI**: "Prazo na agenda" cria o evento do prazo e um bloco de revisão 7 dias antes. Quando a moderação registra uma **alteração confirmada** no edital (`PUT /mod/posts/:id/opportunity`), a data dos eventos e a missão de todos que acompanham são atualizadas, com aviso na missão.
- **Conteúdo da Missão**: `GET /community/missions/:missaoId` devolve relatos ligados à missão; `#/comunidade/missao/:id` abre o feed da missão com o compositor já vinculado.

## Moderação e segurança

- Moderadores: `MODERATOR_EMAILS` no `.env` (ou `role: 'moderador'` no usuário). Painel em `#/comunidade/moderacao`; toda decisão vai para o histórico da publicação e para o log de auditoria.
- **Spam**: limite por hora (8 posts, 30 comentários) + limitador de taxa; texto repetido em 24 h bloqueado; pontuação por termos de golpe ("visto garantido", "pix"…), excesso de links, caixa alta, conta recente com links. Pontuação alta → "em revisão" (só autor e equipe veem).
- **Links suspeitos**: encurtadores, IP, punycode, TLDs de risco, credenciais na URL, domínio que imita órgão/universidade. Ficam não clicáveis e mandam a publicação para revisão.
- **Dados pessoais**: CPF, NIE/DNI, passaporte, telefone e e-mail pessoal são mascarados antes de gravar; o autor é avisado. Na comunidade só aparecem apelido/primeiro nome e avatar.
- **Denúncias**: uma por pessoa e conteúdo; 3 denúncias abertas tiram o conteúdo do ar até a decisão.
- **Imagens**: PNG/JPEG/WebP/GIF até 2 MB, tipo conferido pelos bytes iniciais; servidas com `nosniff`.
- **LGPD/RGPD**: exportação inclui publicações, comentários, denúncias feitas e grupos; excluir a conta apaga tudo isso e as imagens.

## Próximos passos

- Suporte a outros formatos (vídeo, PDF de edital) usando a mesma tabela `media`.
- Notificações (resposta em comentário, verificação concluída) e menções.
- Migrar `community` para tabelas PostgreSQL junto com o resto da base (ver `03-arquitetura.md`).
