import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { users, audit, newId } from '../store.js';
import { hashPassword, verifyPassword, needsRehash, issueSession, clearSession, requireAuth, authLimiter, dummyHash, clientInfo } from '../security.js';
import { publicUser } from './me.js';
import { config } from '../config.js';
import { LEGAL_VERSION, MIN_AGE } from '../content/legal.js';
import { sendEmail, emailEnabled } from '../email.js';

const router = Router();

const password = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128)
  .regex(/[A-Za-z]/, 'A senha precisa ter ao menos uma letra.')
  .regex(/[0-9]/, 'A senha precisa ter ao menos um número.');

const registerSchema = z.object({
  nome: z.string().trim().min(2, 'Diga como podemos te chamar.').max(60),
  email: z.email('E-mail inválido.').max(120),
  senha: password,
  aceite: z.literal(true, { error: 'É preciso aceitar os termos e a política de privacidade.' }),
  maiorIdade: z.literal(true, { error: `A Estuvia é só para maiores de ${MIN_AGE} anos.` }),
});

const loginSchema = z.object({
  email: z.email('E-mail inválido.').max(120),
  senha: z.string().min(1).max(128),
});

const firstError = (result) => result.error.issues[0]?.message || 'Dados inválidos.';

// Bloqueio por conta: o limite por IP (authLimiter) é contado em cada instância da Vercel e não segura
// quem troca de IP. Este fica no registro do estudante (persistido), então vale para todas as instâncias.
const LOCK_FAILS = 10;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const lockedUntil = (u) => (u?.loginLock?.ate && Date.parse(u.loginLock.ate) > Date.now() ? Date.parse(u.loginLock.ate) : 0);

// Dispositivo conhecido (OWASP, "device cookies"): o bloqueio acima também travava o dono da conta. Qualquer um
// que soubesse o e-mail errava a senha 10 vezes e deixava o estudante (ou o admin) sem entrar por 15 min, sem fim.
// Quem já entrou neste navegador recebe um cookie assinado e, com a senha certa, entra mesmo durante o bloqueio.
// O cookie não autentica nada sozinho: só dispensa o bloqueio por excesso de tentativas.
export const DEVICE_COOKIE = 'tv_device';
const DEVICE_DAYS = 180;
const deviceToken = (user) => crypto.createHmac('sha256', config.jwtSecret).update(`device:${user.id}:${user.createdAt || ''}`).digest('base64url');
// Erros a partir de um dispositivo conhecido têm contador próprio: um cookie copiado não dá tentativas infinitas.
const deviceFails = (u) => (u?.loginFalhasDispositivo && Date.now() - Date.parse(u.loginFalhasDispositivo.desde) < LOCK_WINDOW_MS ? u.loginFalhasDispositivo.n : 0);
function knownDevice(req, user) {
  const got = req.cookies?.[DEVICE_COOKIE];
  if (!user || typeof got !== 'string' || deviceFails(user) >= LOCK_FAILS) return false;
  const want = deviceToken(user);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
function rememberDevice(res, user) {
  res.cookie(DEVICE_COOKIE, deviceToken(user), {
    httpOnly: true, secure: config.isProd, sameSite: 'strict', maxAge: DEVICE_DAYS * 24 * 3600 * 1000, path: '/api/auth',
  });
}

async function registerFailure(user, { trusted = false } = {}) {
  const now = Date.now();
  await users.touch(user.id, (u) => {
    if (trusted) {
      const d = deviceFails(u) ? u.loginFalhasDispositivo : { n: 0, desde: new Date(now).toISOString() };
      d.n += 1;
      u.loginFalhasDispositivo = d;
    }
    const f = u.loginFalhas && now - Date.parse(u.loginFalhas.desde) < LOCK_WINDOW_MS ? u.loginFalhas : { n: 0, desde: new Date(now).toISOString() };
    f.n += 1;
    if (f.n >= LOCK_FAILS) { u.loginLock = { ate: new Date(now + LOCK_MS).toISOString() }; delete u.loginFalhas; }
    else u.loginFalhas = f;
  });
}

router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
  const { nome, email, senha } = parsed.data;

  // O e-mail do admin é reservado: a conta é criada só pelo servidor (ADMIN_EMAIL no .env).
  if (users.findByEmail(email) || (config.adminEmail && email.toLowerCase() === config.adminEmail)) {
    return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Tente entrar.' });
  }

  // O hash é assíncrono: dois envios simultâneos (duplo clique) passavam pela checagem acima e criavam
  // duas contas com o mesmo e-mail. Confere de novo logo antes de gravar (sem await entre os dois).
  const passwordHash = await hashPassword(senha);
  if (users.findByEmail(email)) return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Tente entrar.' });
  const now = new Date().toISOString();
  const user = await users.create({
    id: newId(),
    email: email.toLowerCase(),
    passwordHash,
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
    consentAt: now,
    termsVersion: LEGAL_VERSION,
    ageConfirmedAt: now,
    profile: { nome, apelido: nome.split(' ')[0], avatar: '🎓', cor: 'turquesa', tema: 'escuro' },
    journeys: [],
    planner: [],
    choices: [],
    documents: {},
    budget: [],
  });
  await audit.log({ action: 'register', userId: user.id, ...clientInfo(req) });
  issueSession(res, user);
  rememberDevice(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
  const { email, senha } = parsed.data;

  const user = users.findByEmail(email);
  const until = lockedUntil(user);
  const trusted = knownDevice(req, user);
  if (until && !trusted) {
    await audit.log({ action: 'login-locked', userId: user.id, ...clientInfo(req) });
    const min = Math.max(1, Math.ceil((until - Date.now()) / 60000));
    return res.status(429).json({ error: `Muitas tentativas erradas nesta conta. Tente de novo em ${min} min ou use "Esqueci minha senha".` });
  }
  const ok = await verifyPassword(senha, user ? user.passwordHash : await dummyHash());
  if (!user || !ok) {
    await audit.log({ action: 'login-failed', email: email.toLowerCase(), ...clientInfo(req) });
    if (user) await registerFailure(user, { trusted });
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  if (user.loginFalhas || user.loginLock || user.loginFalhasDispositivo) await users.touch(user.id, (u) => { delete u.loginFalhas; delete u.loginLock; delete u.loginFalhasDispositivo; });
  // Hash antigo (parâmetros mais fracos): refaz agora que temos a senha correta. Não muda tokenVersion,
  // então nenhuma sessão aberta cai. Uma falha aqui não impede o login.
  if (needsRehash(user.passwordHash)) {
    try {
      const passwordHash = await hashPassword(senha);
      await users.touch(user.id, (u) => { u.passwordHash = passwordHash; });
    } catch (err) {
      console.error('[auth] rehash falhou:', err?.message || err);
    }
  }
  if (user.blocked) {
    await audit.log({ action: 'login-blocked', userId: user.id, ...clientInfo(req) });
    return res.status(403).json({ error: 'Sua conta está suspensa. Fale com a equipe Estuvia.' });
  }
  await audit.log({ action: 'login', userId: user.id, ...clientInfo(req), ...(until ? { durante: 'bloqueio', dispositivo: 'conhecido' } : {}) });
  issueSession(res, user);
  rememberDevice(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// Encerra a sessão em todos os dispositivos.
router.post('/logout-all', requireAuth, async (req, res) => {
  await users.update(req.user.id, (u) => { u.tokenVersion += 1; });
  clearSession(res);
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const parsed = z.object({ atual: z.string().min(1).max(128), nova: password }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
  if (!(await verifyPassword(parsed.data.atual, req.user.passwordHash))) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  const passwordHash = await hashPassword(parsed.data.nova);
  const user = await users.update(req.user.id, (u) => { u.passwordHash = passwordHash; u.tokenVersion += 1; });
  await audit.log({ action: 'password-changed', userId: user.id });
  issueSession(res, user);
  res.json({ ok: true });
});

// ---------- Recuperação de senha por e-mail ----------
// Resposta sempre igual (não revela se o e-mail tem conta). O token vale 1 hora, só é guardado como hash
// e é de uso único; redefinir a senha encerra todas as sessões abertas.
const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const RESET_SENT = 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.';

router.post('/forgot-password', authLimiter, async (req, res) => {
  const parsed = z.object({ email: z.email('E-mail inválido.').max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
  // Em produção o link usa só a origem configurada (nunca o Host da requisição, que pode ser forjado).
  const origin = config.allowedOrigin || (config.isProd ? null : `${req.protocol}://${req.get('host')}`);
  // Sem provedor de e-mail em produção o envio sempre falharia: responde 503 para TODOS os e-mails, antes de
  // procurar a conta. (Antes, só e-mails com conta recebiam 503, o que revelava quem está cadastrado.)
  if (!origin || (config.isProd && !emailEnabled())) return res.status(503).json({ error: 'Recuperação de senha indisponível no momento. Fale com a equipe.' });
  const user = users.findByEmail(parsed.data.email);
  // A senha do administrador vem do .env (admin-seed.js): não é redefinida por e-mail.
  if (!user || user.blocked || user.role === 'admin') return res.json({ ok: true, message: RESET_SENT });
  // No máximo um e-mail por minuto por conta (o limite por IP não impede encher a caixa de alguém trocando de IP).
  // O link anterior continua valendo; a resposta é a mesma.
  if (user.passwordReset && user.passwordReset.expiresAt - RESET_TTL_MS > Date.now() - RESET_COOLDOWN_MS) return res.json({ ok: true, message: RESET_SENT });
  const token = crypto.randomBytes(32).toString('base64url');
  await users.update(user.id, (u) => { u.passwordReset = { hash: hashToken(token), expiresAt: Date.now() + RESET_TTL_MS }; });
  const link = `${origin}/#/redefinir-senha/${token}`;
  const sent = await sendEmail({
    to: user.email,
    subject: `${config.appName}: crie uma nova senha`,
    text: `Olá! Recebemos um pedido para redefinir a senha da sua conta ${config.appName}.

Para criar uma nova senha, abra o link abaixo (vale por 1 hora):
${link}

Se não foi você, ignore este e-mail: sua senha continua a mesma.`,
  });
  await audit.log({ action: 'password-reset-requested', userId: user.id, enviado: sent, ...clientInfo(req) });
  if (!sent) return res.status(503).json({ error: 'Não conseguimos enviar o e-mail agora. Tente novamente em alguns minutos.' });
  res.json({ ok: true, message: RESET_SENT });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const parsed = z.object({ token: z.string().min(20).max(100), senha: password }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
  const hash = hashToken(parsed.data.token);
  const user = users.all().find((u) => u.passwordReset?.hash === hash);
  if (!user || user.passwordReset.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Este link é inválido ou expirou. Peça um novo em "Esqueci minha senha".' });
  }
  const passwordHash = await hashPassword(parsed.data.senha);
  // Uso único: outro pedido com o mesmo link pode ter terminado enquanto o hash era calculado.
  if (users.findById(user.id)?.passwordReset?.hash !== hash) {
    return res.status(400).json({ error: 'Este link é inválido ou expirou. Peça um novo em "Esqueci minha senha".' });
  }
  await users.update(user.id, (u) => { u.passwordHash = passwordHash; u.tokenVersion += 1; delete u.passwordReset; delete u.loginFalhas; delete u.loginLock; delete u.loginFalhasDispositivo; });
  await audit.log({ action: 'password-reset', userId: user.id, ...clientInfo(req) });
  clearSession(res);
  res.json({ ok: true });
});

export default router;
