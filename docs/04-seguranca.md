# 04 — Segurança e privacidade

## Controles implementados

| Ameaça | Controle | Onde |
|---|---|---|
| Vazamento de senhas | **scrypt** (N=16384, r=8, p=1), sal aleatório por usuário, comparação em tempo constante | `security.js#hashPassword` |
| Enumeração de contas | Mensagem genérica "E-mail ou senha incorretos" e hash fictício para gastar o mesmo tempo quando o e-mail não existe | `routes/auth.js` |
| Força bruta | Rate limit: 20 tentativas / 15 min em auth, 120 req/min na API, 40 perguntas/h ao assistente | `security.js` |
| Roubo de sessão por XSS | JWT em cookie **httpOnly**, **SameSite=Strict** e **Secure** em produção; expira em 8 h | `issueSession` |
| XSS | CSP restritiva (`script-src 'self'`, sem inline), renderização só com `textContent`, markdown mínimo seguro | `security.js`, `public/js/ui.js` |
| CSRF | SameSite=Strict, cabeçalho obrigatório `X-Requested-With` em métodos de escrita e checagem de `Origin` | `csrfGuard` |
| Clickjacking | `frame-ancestors 'none'` | CSP |
| Sessões esquecidas | "Sair de todos os dispositivos" e troca de senha incrementam `tokenVersion` | `routes/auth.js` |
| Acesso a dados de terceiros | Todas as rotas `/api/me` usam o `id` da sessão; nenhum id vem do cliente | `routes/me.js` |
| Mass assignment | Schemas **zod** `.strict()` rejeitam campos extras (ex.: `isAdmin`) | `routes/me.js` |
| Payloads abusivos | JSON limitado a 50 kb, strings e listas com tamanho máximo | `app.js`, schemas |
| Vazamento de erros | Handler global sem stack trace para o cliente; `x-powered-by` desligado | `app.js` |
| Prompt injection no Guia | System prompt com regra de ignorar instruções do usuário que tentem mudar as regras; respostas limitadas à base | `routes/assistant.js` |
| Corrupção da base | Escrita atômica (arquivo temporário + rename) e serializada | `store.js` |
| Dependências vulneráveis | `npm audit` com 0 vulnerabilidades (zod 4.x) | `package.json` |

## Privacidade (LGPD / RGPD)

- **Minimização:** a plataforma não pede CPF, número de passaporte ou cópias de documentos. O checklist guarda só o **status**.
- **Consentimento:** registrado em `consentAt` no cadastro.
- **Portabilidade:** `GET /api/me/export` devolve todos os dados do usuário em JSON.
- **Eliminação:** `DELETE /api/me` (com reconfirmação de senha) remove a conta definitivamente.
- **Conversa com o Guia:** não é gravada no servidor; fica só na aba do navegador. Com a IA ativa, a pergunta e um contexto resumido do perfil (sem e-mail) são enviados à API da Anthropic.
- **Auditoria:** login, falhas de login, cadastro, troca de senha e exclusão ficam registrados (até 5.000 eventos).

## Checklist antes de produção

- [ ] `NODE_ENV=production` e `JWT_SECRET` forte (o servidor **recusa subir** sem ele)
- [ ] HTTPS (atrás de proxy: `trust proxy` já ativado em produção) e `ALLOWED_ORIGIN` definido
- [ ] Migrar `store.js` para PostgreSQL com backups e criptografia em repouso
- [ ] Rate limit com store compartilhado (Redis) se houver mais de uma instância
- [ ] Política de privacidade e termos revisados por profissional (LGPD/RGPD)
- [ ] Verificação de e-mail e recuperação de senha por e-mail
- [ ] Monitoramento de erros e alertas
- [ ] Revisão de segurança independente (pentest leve)
- [ ] Política de retenção do log de auditoria
