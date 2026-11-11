# Migrations do Supabase

Aplique em ordem, no SQL Editor do projeto (desenvolvimento e produção são projetos separados):

| Arquivo | O que faz |
| --- | --- |
| `0001_estuvia_state.sql` | Tabela `estuvia_state` (linhas `main` e `radar`): modelo antigo, hoje só lido uma vez para importar e mantido como cópia de segurança. |
| `0002_entidades.sql` | Uma tabela por entidade (`users`, `community_*`, `audit_log`, `analytics`, `estuvia_meta`, `radar_*`), triggers de versão/sequência, `estuvia_deleted` e as funções `estuvia_apply` e `estuvia_changes`. RLS ligada e acesso só para `service_role`. |

**Aplique a `0002` antes de publicar o código que a usa**: sem ela o servidor recusa subir e diz qual arquivo aplicar.
Na primeira subida com as tabelas vazias, o servidor importa sozinho o conteúdo de `estuvia_state`.

Todas são idempotentes (`if not exists`, `revoke`/`grant` repetíveis) e nunca apagam dados.
Os buckets do Storage (`estuvia-documents`, `estuvia-community`, `estuvia-meta`) são privados e criados
pelo servidor na primeira gravação (`server/storage.js`); não precisam de migration.

`supabase/schema.sql` continua existindo pelo histórico e é equivalente à `0001`.
Procedimento completo: `docs/28-ambientes-dev-prod.md`.
