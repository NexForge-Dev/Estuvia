# Migrations do Supabase

Aplique em ordem, no SQL Editor do projeto (desenvolvimento e produção são projetos separados):

| Arquivo | O que faz |
| --- | --- |
| `0001_estuvia_state.sql` | Tabela `estuvia_state` (linhas `main` e `radar`), RLS ligada e acesso só para `service_role`. |

Todas são idempotentes (`if not exists`, `revoke`/`grant` repetíveis) e nunca apagam dados.
Os buckets do Storage (`estuvia-documents`, `estuvia-community`, `estuvia-meta`) são privados e criados
pelo servidor na primeira gravação (`server/storage.js`); não precisam de migration.

`supabase/schema.sql` continua existindo pelo histórico e é equivalente à `0001`.
Procedimento completo: `docs/28-ambientes-dev-prod.md`.
