# Lançamento da Estuvia: checklist de go-live

Checklist curto para colocar a Estuvia no ar. Os detalhes técnicos estão em [docs/25-production-readiness.md](docs/25-production-readiness.md).

> **Atenção: a Estuvia não tem cobrança.** Não há planos, preços nem checkout no código. Hoje ela pode ser lançada como serviço **gratuito** (piloto). Para vender, falta decidir o modelo (assinatura, pagamento único, B2B) e implementar o pagamento.

## 1. Banco de dados: decisão obrigatória antes do deploy

A Estuvia guarda tudo em arquivos JSON (`data/db.json`, `data/radar.json`) e os documentos cifrados em `data/docfiles/`. Isso significa:

- **Um único processo, em um único servidor, com disco persistente.** Não use hospedagem com disco efêmero (Vercel, Netlify, Heroku sem add-on, Render/Railway sem volume, Cloud Run): **os dados somem a cada deploy ou reinício.**
- Opções que funcionam como estão:
  - VPS (Hetzner, DigitalOcean, Lightsail, Oracle) com Node 22 + PM2/systemd + Nginx/Caddy (HTTPS);
  - Render com **Persistent Disk**, Railway com **Volume** ou Fly.io com **Volume**, sempre com **1 instância** e o volume montado em `data/` (ou `DATA_FILE`, `RADAR_DATA_FILE`, `DOCS_DIR`, `MEDIA_DIR` apontando para ele).
- Backup diário do volume (snapshot do provedor ou cópia de `data/` para um storage externo) e teste de restauração antes de abrir para o público.
- Para escalar além de um piloto (centenas de usuários ativos ou mais de um servidor), migre `server/store.js` para PostgreSQL (ex.: Supabase/Neon). A interface do store é isolada, mas é trabalho de desenvolvimento.

## 2. Contas e chaves

| Serviço | Para quê | Variáveis |
|---|---|---|
| Hospedagem com disco persistente | Rodar o servidor (ver §1) | `NODE_ENV=production`, `PORT` |
| Domínio + HTTPS | Endereço público | `ALLOWED_ORIGIN=https://app.seudominio.com` |
| Segredos (gere localmente) | Sessões e cifra dos documentos | `JWT_SECRET` (≥ 32), `DOCUMENTS_KEY` (≥ 32; **guarde cópia segura: sem ela os documentos ficam ilegíveis**) |
| Resend (resend.com) | E-mail de recuperação de senha | `RESEND_API_KEY`, `EMAIL_FROM` (domínio verificado no Resend) |
| Conta admin | Painel `#/admin` | `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12, letras e números) |
| Anthropic (opcional) | Mentor com IA | `MENTOR_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `MENTOR_MODEL`, `AI_DAILY_TOKENS_PER_USER` |
| YouTube Data API (opcional, grátis) | Vídeos no Mentor | `YOUTUBE_API_KEY` |
| Travelpayouts (opcional, grátis) | Preços de passagens | `TRAVELPAYOUTS_TOKEN` |

Gerar segredos: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (uma vez para cada).

O servidor **não sobe** em produção sem `JWT_SECRET` e `DOCUMENTS_KEY`, e avisa no log quando faltam `ALLOWED_ORIGIN`, Resend ou a conta admin. A lista completa está em `.env.example`.

## 3. Deploy (exemplo em VPS)

```bash
git clone <repo> estuvia && cd estuvia
npm ci --omit=dev
cp .env.example .env    # preencha os valores de produção (NODE_ENV=production)
npm run check && npm test
pm2 start server/index.js --name estuvia && pm2 save
```

Coloque Nginx ou Caddy na frente com HTTPS apontando para `PORT`. Não rode mais de uma instância.

## 4. Antes de abrir ao público (não técnico)

- [ ] Preencher todos os `[PREENCHER: ...]` em `public/js/views/legal.js` (Política de Privacidade e Termos: razão social, CNPJ, endereço, DPO, operadores, prazo de retenção, foro) e revisar com advogado.
- [ ] Decidir as questões jurídicas listadas em docs/25 (retenção de logs, anotações internas na exportação, texto do consentimento dos documentos).
- [ ] Confirmar o IPREM 2026 (ainda "pendente") e revisar fontes oficiais.
- [ ] Se for vender: definir modelo de preço e implementar pagamento (não existe no código).

## 5. Smoke test pós-deploy

1. `https://app.seudominio.com/api/health` → `{"ok":true}`.
2. Landing abre; links Privacidade e Termos no rodapé funcionam.
3. Criar conta → onboarding → jornada criada → abrir uma missão.
4. Sair → "Esqueci minha senha" → e-mail chega → link abre → nova senha funciona.
5. Documentos: aceitar o consentimento, enviar um PDF, abrir e excluir.
6. Perfil: exportar dados; excluir a conta de teste.
7. Entrar como admin (`#/admin`): ver alunos, status da IA e eventos.
8. Reiniciar o processo e confirmar que os dados continuam lá (prova do disco persistente).
9. Configurar monitor de uptime em `/api/health` e backup diário de `data/`.
