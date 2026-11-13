# Lançamento da Estuvia: checklist de go-live

Runbook curto para colocar a Estuvia no ar. A arquitetura de produção é **Vercel (servidor) + Supabase (banco e arquivos)**. Detalhes: [docs/28-ambientes-dev-prod.md](docs/28-ambientes-dev-prod.md) (ambientes), [docs/29-banco-de-dados.md](docs/29-banco-de-dados.md) (banco), [docs/25-production-readiness.md](docs/25-production-readiness.md) (limites conhecidos).

> **A Estuvia não tem cobrança.** Não há planos, preços nem checkout no código. Hoje ela pode ser lançada como serviço **gratuito** (piloto). Para vender, falta decidir o modelo e implementar o pagamento.

## 1. Arquitetura

- **Vercel** roda `api/index.js` (Express) como função serverless; `vercel.json` manda todas as rotas para ela. O disco da Vercel é efêmero: em produção, `DB_PROVIDER=supabase` e `STORAGE_PROVIDER=supabase` são obrigatórios.
- **Supabase de produção:** projeto `trdpcjvyfieumxakhwop` (eu-west-1), marcado como `production`. Uma tabela por entidade (`supabase/migrations/0002_entidades.sql`), buckets privados `estuvia-documents`, `estuvia-community` e `estuvia-meta`. O servidor acessa só com a chave **secret**; RLS ligada.
- **Desenvolvimento** usa `DB_PROVIDER=json` (`data/db.json`) e nunca aponta para o projeto de produção. As travas estão em `server/database.js` e `server/config.js`.

## 2. Variáveis na Vercel (escopo Production)

| Variável | Para quê |
|---|---|
| `NODE_ENV=production`, `APP_ENV=production` | Cookies `Secure`, HSTS, travas de ambiente |
| `DB_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase` | Persistência |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Projeto de produção (chave só de produção) |
| `SUPABASE_PROD_PROJECT_REF`, `SUPABASE_DEV_PROJECT_REF` | Impedem DEV e PROD de abrir o banco errado |
| `JWT_SECRET`, `DOCUMENTS_KEY` | ≥ 32 caracteres, só de produção. **Sem a `DOCUMENTS_KEY` os documentos ficam ilegíveis:** guarde em dois lugares seguros |
| `ALLOWED_ORIGIN` | URL pública (ex.: `https://app.estuvia.com`): proteção CSRF e links de recuperação de senha |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Conta do painel `#/admin` (senha ≥ 12, letras e números) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Recuperação de senha. Sem elas, "Esqueci a senha" responde 503 |
| `MENTOR_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_DAILY_TOKENS_PER_USER` | Opcional: Mentor com IA. Sem elas, Modo Guiado |
| `YOUTUBE_API_KEY`, `TRAVELPAYOUTS_TOKEN` | Opcional e gratuito: vídeos e preços de passagens |

A lista completa, com comentários, está em `.env.example`. No escopo **Preview**, não deixe nenhuma credencial de produção. Variável nova só vale depois de um **Redeploy**.

Gerar segredos: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (uma vez para cada).

## 3. Deploy

1. `npm run check && npm test` na `dev`; depois leve a `dev` para a `main` (fast-forward) e faça o push. A Vercel publica a `main`.
2. Se alguma migração nova existir em `supabase/migrations/`, aplique-a no SQL Editor do projeto de produção **antes** do push.
3. Confira o deploy na Vercel (Deployments) e rode o smoke test (seção 6).

## 4. Dados do Radar em produção

A Vercel não roda o atualizador automático do Radar (`server/radar/scheduler.js`). Depois do primeiro deploy, como admin, em **Painel admin → Radar** (`#/radar/admin`):

1. Rode **"Catálogo de másteres do DUA"** uma vez (também cria os programas das outras universidades andaluzas).
2. Rode **"Fichas dos másteres no DUA"** cerca de 11 vezes (10 mestrados por vez, ~36 s cada).
3. Repita periodicamente até existir uma rotina agendada (ver `docs/11-radar.md`).

## 5. Antes de abrir ao público (não técnico)

- [ ] Preencher os `[PREENCHER: ...]` de `public/js/views/legal.js` (razão social, CNPJ, endereço, DPO, operadores, transferência internacional, retenção, idade, preço, foro), revisar com advogado e **tirar o aviso "Rascunho"**. Ao mudar o texto, atualize `UPDATED` ali e `LEGAL_VERSION` em `server/content/legal.js`.
- [ ] Decidir com o advogado as questões de `docs/25-production-readiness.md` (retenção de logs, anotações internas na exportação, denúncias de usuários excluídos, dados sensíveis na carteira).
- [ ] Reconfirmar o IPREM do ano nas fontes oficiais.
- [ ] Plano do Supabase: o gratuito pausa por inatividade e não tem backup diário; para público, considere o Pro.
- [ ] Monitor de uptime em `/api/health` (ex.: UptimeRobot).
- [ ] Backup: `npm run db:backup` e `npm run storage:backup` apontando para produção (só leitura; ver docs/28) e **um teste de restauração**.

## 6. Smoke test pós-deploy

1. `https://<domínio>/api/health` → `{"ok":true}`.
2. Landing abre; links Privacidade e Termos no rodapé funcionam.
3. Criar conta (com "Tenho 18 anos ou mais") → onboarding → jornada criada → abrir uma missão.
4. Sair → "Esqueci minha senha" → e-mail chega → link abre → nova senha funciona.
5. Documentos: aceitar o consentimento, enviar um PDF, abrir, excluir; em Documentos → Privacidade, revogar o consentimento.
6. Perfil: baixar os dados; excluir a conta de teste.
7. Admin (`#/admin`): alunos, status da IA, eventos; abrir **Radar** e **Moderação** no menu do painel.
8. No Supabase de produção, a conta de teste apareceu e depois sumiu.
