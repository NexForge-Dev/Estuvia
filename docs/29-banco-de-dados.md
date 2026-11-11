# 29 — Banco de dados (tabelas por entidade)

Com `DB_PROVIDER=supabase`, cada entidade do Estuvia tem a sua tabela no Supabase
(`supabase/migrations/0002_entidades.sql`). Com `DB_PROVIDER=json` (desenvolvimento e testes), nada muda:
continuam os arquivos `data/db.json` e `data/radar.json`.

## Modelo

Toda tabela tem as mesmas colunas de controle, mais colunas tipadas da própria entidade:

| Coluna | Para quê |
| --- | --- |
| `id` | chave primária (o `id` do objeto no app) |
| colunas tipadas | campos consultados, filtrados ou únicos (e-mail, dono, datas, status) |
| `data` (jsonb) | o objeto completo, exatamente como o servidor usa (fonte de verdade) |
| `version` | versão otimista da linha; gravação sobre versão velha é recusada |
| `seq`, `txid`, `ins_seq` | ordem das mudanças, leitura incremental entre instâncias e ordem de inserção |
| `updated_at` | última gravação (preenchido pelo banco) |

Esse modelo é **híbrido** de propósito: estruturas que só o próprio app lê (jornadas, finanças, viagem,
moradia, documentos do usuário) ficam no `data` do usuário, sem precisar remodelar dezenas de estruturas.
O que precisa de integridade ou consulta virou coluna.

### Tabelas

| Tabela | Entidade | Colunas tipadas principais |
| --- | --- | --- |
| `users` | estudante / admin | `email` (único), `role`, `blocked`, `token_version`, `onboarding_concluido`, `created_at`, `consent_at`, `last_seen_at` |
| `community_posts` | post da comunidade | `autor_id` → users, `grupo_id`, `tipo`, `categoria`, `estado_moderacao`, `criado_em` |
| `community_comments` | comentário | `post_id` → posts, `autor_id` → users |
| `community_groups` | grupo | `nome`, `tipo`, `universidade_id`, `oficial` |
| `community_reports` | denúncia | `alvo`, `alvo_id`, `autor_id` → users (vira null), `status` |
| `community_media` | imagem enviada | `owner_id` → users, `post_id`, `mime`, `tamanho` |
| `audit_log` | registro de segurança | `at`, `action`, `user_id` (sem chave estrangeira: sobrevive à exclusão da conta) |
| `analytics` | uso dos módulos | `id = day:AAAA-MM-DD` com `dia`, ou uma linha por contador avulso (ex.: `ai`) |
| `estuvia_meta` | metadados do banco | linha `main` com `ambiente` (marcação DEV × PROD) |
| `radar_sources` | fonte monitorada | `titulo`, `instituicao`, `url`, `metodo`, `estado`, `ativa`, `ultima_consulta` |
| `radar_snapshots` | coleta de uma fonte | `source_id`, `chave`, `versao`, `hash`, `coletado_em` |
| `radar_programs` | programa (máster) | `universidade_id`, `nome`, `codigo`, `tipo_titulo`, `verificado_em` |
| `radar_opportunities` | programa × ano | `program_id`, `universidade_id`, `ano_academico`, `procedimento_id` |
| `radar_windows` | janela de candidatura | `procedimento_id`, `ano_academico`, `fase`, `abertura`, `encerramento` |
| `radar_events` | evento do calendário | `procedimento_id`, `fase`, `tipo`, `inicio`, `fim` |
| `radar_availability` | vagas | `opportunity_id` |
| `radar_revisions` | histórico campo a campo | `entidade`, `entidade_id`, `campo`, `em` |
| `radar_reviews` | fila de revisão | `tipo`, `source_id`, `status` |
| `radar_runs` | execução do atualizador | `source_id`, `inicio`, `fim`, `resultado` |
| `radar_subscriptions` | inscrição do estudante | `user_id` → users, `opportunity_id`, `ativa` |
| `radar_alerts` | alerta enviado | `user_id` → users, `subscription_id`, `opportunity_id` |
| `radar_agenda_links` | vínculo agenda × prazo oficial | `user_id` → users, `planner_event_id`, `opportunity_id` |
| `estuvia_deleted` | exclusões | `tbl`, `row_id` (para as outras instâncias removerem da memória) |

As chaves estrangeiras com `on delete cascade` são uma rede de segurança: a exclusão de conta
(`DELETE /api/me`) já apaga posts, comentários, imagens, inscrições e alertas antes do usuário.

## Como o servidor usa

O código das rotas não mudou: continua usando `users`, `community`, `audit`, `analytics` (`server/store.js`)
e `data()`/`save()` do Radar (`server/radar/db.js`), com as coleções em memória.

- **Gravar** (`server/entities.js`): a cada gravação, cada item é comparado (JSON com chaves ordenadas) com a
  última versão salva; só inserções, atualizações e exclusões reais vão para `estuvia_apply`, numa transação.
  Conflito de versão desfaz o lote inteiro no banco **e na memória**, e quem chamou recebe erro.
- **Sincronizar**: antes de cada requisição `/api`, `estuvia_changes` devolve o que outras instâncias
  gravaram desde a última leitura (por `txid` + xmin do snapshot, para não perder transações que
  confirmaram atrasadas). Resolve o caso da Vercel, com várias instâncias em paralelo.
- **Subir**: a primeira instância com as tabelas vazias importa o conteúdo de `estuvia_state` (só leitura;
  a linha antiga fica como cópia de segurança). Sem linha antiga, em desenvolvimento copia a base JSON local.
  A barreira DEV × PROD é conferida antes de qualquer gravação.

## Aplicar num projeto

1. `npm run db:backup` (cópia somente leitura de tudo).
2. SQL Editor do projeto: colar e rodar `supabase/migrations/0002_entidades.sql` (idempotente, não apaga nada).
3. Publicar o código. Sem a `0002`, o servidor recusa subir e diz qual arquivo aplicar.

## Testes

`tests/entities-supabase.test.js` roda as funções SQL num Postgres real em memória (PGlite) e simula duas
instâncias: importação, ida e volta idêntica, conta criada numa instância visível na outra, conflito de versão,
e-mail duplicado, exclusões, ordem das listas, Radar e a barreira DEV × PROD.
