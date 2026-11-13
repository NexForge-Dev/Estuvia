# 28 — Ambientes DEV × PROD

**Situação em 13/11/2026:** produção **separada**. A Vercel usa o projeto `trdpcjvyfieumxakhwop` (eu-west-1), marcado como `production`, já com uma tabela por entidade. O projeto antigo `pomtzhzoxwwnxztwwmft` não existe mais (só restou o backup do banco de 11/11, sem o Storage). O desenvolvimento local usa `DB_PROVIDER=json`. As seções abaixo registram como a separação foi feita; o passo a passo de lançamento está em `LANCAMENTO.md`.

_Situação anterior (11/11/2026, mantida como histórico):_ produção **ainda não está separada**. O `.env` local usa `DB_PROVIDER=supabase` apontando para o projeto `pomtzhzoxwwnxztwwmft`, e a linha `main` desse projeto recebia gravações durante a auditoria (versão 372 → 374 em minutos). Não foi possível verificar daqui quais variáveis a Vercel usa (não há Vercel CLI nesta máquina), mas tudo indica que desenvolvimento e o ambiente publicado compartilham o mesmo banco.

Decisão: o projeto atual (`pomtzhzoxwwnxztwwmft`) passa a ser **só de desenvolvimento**. Produção ganha um projeto Supabase **novo e vazio**.

## 1. Arquitetura de persistência

- `server/store.js` (usuários, auditoria, comunidade, uso) e `server/radar/db.js` (Radar): estado JSON em memória, gravado inteiro a cada escrita.
- `DB_PROVIDER=json`: arquivos em `data/` (`db.json`, `radar.json`). `DB_PROVIDER=supabase`: uma tabela por entidade, com versão otimista por linha (`supabase/migrations/0002_entidades.sql`, `server/entities.js`; ver `docs/29-banco-de-dados.md`). A marcação de ambiente fica em `estuvia_meta`.
- Arquivos (documentos cifrados, imagens da comunidade, regras editoriais): disco local ou Supabase Storage (buckets privados `estuvia-documents`, `estuvia-community`, `estuvia-meta`, criados pelo servidor).
- Autenticação é própria (JWT em cookie), não usa Supabase Auth. O banco só é acessado pelo servidor com a chave **secret**; RLS ligada e nenhum acesso para `anon`/`authenticated` (`supabase/migrations/`).
- `npm test` sempre roda com JSON em pasta temporária e sem `.env` (`scripts/test.mjs`): os testes nunca tocam um banco real.

## 2. Barreiras implementadas

| Barreira | Onde | Efeito |
|---|---|---|
| `APP_ENV` (`development`/`production`/`test`) coerente com `NODE_ENV` | `server/config.js` | Não sobe com `APP_ENV=production` sem `NODE_ENV=production` (e vice-versa). |
| Referências dos projetos: `SUPABASE_DEV_PROJECT_REF` e `SUPABASE_PROD_PROJECT_REF` | `assertProjectAllowed()` em `server/database.js`, chamada em **todo** cliente Supabase (banco e Storage) | DEV apontando para o projeto de PROD (ou o contrário) é recusado **antes de qualquer leitura**. Testado: `[ambiente] Ambiente "development" apontando para o banco de PRODUÇÃO…`. |
| Marcação no próprio banco: `state.meta.ambiente` | `initStore()` + `checkDatabaseEnvironment()` | Banco marcado para um ambiente nunca é aberto por outro. Produção só se marca sozinha se o banco estiver **vazio** (projeto novo). Banco com dados e sem marcação: só aviso; marcar é explícito (`npm run db:env`). |
| Sem cópia de dados pessoais para PROD | `initStore()` e `initRadarStore()` | Na primeira execução, a linha nova recebe a cópia da base local **só fora de produção**. Em produção: `main` começa vazia; no Radar só os dados públicos (programas, prazos, fontes), sem inscrições, alertas e vínculos de agenda. |

Testes: `tests/db-environments.test.js`.

## 3. Ferramentas

```bash
npm run db:backup                         # backup SOMENTE LEITURA de todas as tabelas → data/backups/ (fora do git)
npm run db:env -- status                  # projeto, ambiente marcado, nº de usuários
npm run db:env -- mark development --confirmo
```

`db:env mark` nunca troca uma marcação existente e usa a versão otimista: servidores já rodando com a versão anterior em memória falham na próxima gravação (conflito) e precisam ser reiniciados.

**Backup feito em 11/11/2026:** `data/backups/supabase-pomtzhzoxwwnxztwwmft-2026-11-11T00-01-52-392Z.json` (linhas `main` v372, 7 usuários, e `radar` v18). Contém dados pessoais: não versionar, não enviar, guardar com cuidado. **Não inclui** os arquivos do Storage.

## 4. O que precisa ser feito manualmente (painéis)

Nada abaixo foi feito ainda: depende de acesso aos painéis do Supabase e da Vercel.

1. **Backup do Storage do projeto atual** (documentos cifrados e imagens): Supabase → Storage → baixar os buckets `estuvia-documents`, `estuvia-community`, `estuvia-meta`, ou usar a CLI do Supabase. Os documentos só abrem com a `DOCUMENTS_KEY` do ambiente que os cifrou.
2. **Criar o projeto de produção** no Supabase (região próxima dos usuários, ex.: São Paulo). Anotar a referência `<ref>`.
3. No **SQL Editor do projeto novo**, aplicar, em ordem, `supabase/migrations/0001_estuvia_state.sql` e `0002_entidades.sql`.
4. Em *Project Settings → API keys*, criar uma chave **secret** só para produção. Nunca reutilizar a de desenvolvimento.
5. Na **Vercel → Settings → Environment Variables**, escopo **Production**:
   - `NODE_ENV=production`, `APP_ENV=production`, `DB_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`
   - `SUPABASE_URL=https://<ref-prod>.supabase.co`, `SUPABASE_SECRET_KEY=<secret de prod>`
   - `SUPABASE_PROD_PROJECT_REF=<ref-prod>`, `SUPABASE_DEV_PROJECT_REF=pomtzhzoxwwnxztwwmft`
   - **Novos** `JWT_SECRET` e `DOCUMENTS_KEY` (≥ 32 caracteres, diferentes dos de DEV; guardar a `DOCUMENTS_KEY` com backup), `ALLOWED_ORIGIN`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `RESEND_API_KEY`/`EMAIL_FROM`, chaves de IA se usadas.
   - Remover das variáveis de *Preview* qualquer credencial de produção (previews devem usar DEV ou JSON).
6. **Deploy** de produção. Na primeira subida o servidor encontra o banco vazio, cria as linhas e marca `ambiente = production` (log: `Banco <ref> vazio marcado como "production"`).
7. Conferir: `GET /api/health` em produção, criar uma conta de teste, gerar uma jornada e checar no Supabase de **produção** que a linha `main` mudou (e que a de DEV não mudou).
8. **Só depois** de produção estar no projeto novo, no `.env` local:
   - `APP_ENV=development`, `SUPABASE_DEV_PROJECT_REF=pomtzhzoxwwnxztwwmft`, `SUPABASE_PROD_PROJECT_REF=<ref-prod>`
   - rodar `npm run db:env -- mark development --confirmo` (com o servidor local parado).
   A partir daí, nenhum servidor de produção abre o banco de DEV, e o DEV se recusa a abrir o de PROD.

**Dados existentes:** os 7 usuários do banco atual **não** foram copiados para produção. Migrar contas reais exige decisão e autorização (LGPD: finalidade, consentimento, aviso aos titulares). Se for decidido migrar, faça a partir do backup, de forma seletiva, e registre o procedimento.

**Ordem importa:** marcar o banco atual como `development` antes de mover a produção derrubaria a produção atual na próxima reinicialização com o código novo (o servidor recusaria abrir o banco). Por isso o passo 8 vem por último.
