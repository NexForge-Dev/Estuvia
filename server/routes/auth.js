import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { users, audit, newId } from '../store.js';
import { hashPassword, verifyPassword, issueSession, clearSession, requireAuth, authLimiter, DUMMY_HASH, clientInfo } from '../security.js';
import { publicUser } from './me.js';
import { config } from '../config.js';
import { sendEmail } from '../email.js';

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
});

const loginSchema = z.object({
  email: z.email('E-mail inválido.').max(120),
  senha: z.string().min(1).max(128),
});

const firstError = (result) => result.error.issues[0]?.message || 'Dados inválidos.';

router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
  const { nome, email, senha } = parsed.data;

  // O e-mail do admin é reservado: a conta é criada só pelo servidor (ADMIN_EMAIL no .env).
  if (users.findByEmail(email) || (config.adminEmail && email.toLowerCase() === config.adminEmail)) {
    return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Tente entrar.' });
  }

  const now = new Date().toISOString();
  const user = await users.create({
    id: newId(),
    email: email.toLowerCase(),
    passwordHash: await hashPassword(senha),
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
    consentAt: now,
    profile: { nome, apelido: nome.split(' ')[0], avatar: '🎓', cor: 'turquesa', tema: 'escuro' },
    journeys: [],
    planner: [],
    choices: [],
    documents: {},
    budget: [],
  });
  await audit.log({ action: 'register', userId: user.id, ...clientInfo(req) });
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
  const { email, senha } = parsed.data;

  const user = users.findByEmail(email);
  const ok = await verifyPassword(senha, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    await audit.log({ action: 'login-failed', email: email.toLowerCase(), ...clientInfo(req) });
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  if (user.blocked) {
    await audit.log({ action: 'login-blocked', userId: user.id, ...clientInfo(req) });
    return res.status(403).json({ error: 'Sua conta está suspensa. Fale com a equipe Estuvia.' });
  }
  await audit.log({ action: 'login', userId: user.id, ...clientInfo(req) });
  issueSession(res, user);
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
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const RESET_SENT = 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.';

router.post('/forgot-password', authLimiter, async (req, res) => {
  const parsed = z.object({ email: z.email('E-mail inválido.').max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed) });
  // Em produção o link usa só a origem configurada (nunca o Host da requisição, que pode ser forjado).
  const origin = config.allowedOrigin || (config.isProd ? null : `${req.protocol}://${req.get('host')}`);
  if (!origin) return res.status(503).json({ error: 'Recuperação de senha indisponível no momento. Fale com a equipe.' });
  const user = users.findByEmail(parsed.data.email);
  // A senha do administrador vem do .env (admin-seed.js): não é redefinida por e-mail.
  if (!user || user.blocked || user.role === 'admin') return res.json({ ok: true, message: RESET_SENT });
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
  await users.update(user.id, (u) => { u.passwordHash = passwordHash; u.tokenVersion += 1; delete u.passwordReset; });
  await audit.log({ action: 'password-reset', userId: user.id, ...clientInfo(req) });
  clearSession(res);
  res.json({ ok: true });
});

export default router;
