import { Router } from 'express';
import { z } from 'zod';
import { users, audit, newId } from '../store.js';
import { hashPassword, verifyPassword, issueSession, clearSession, requireAuth, authLimiter, DUMMY_HASH, clientInfo } from '../security.js';
import { publicUser } from './me.js';
import { config } from '../config.js';

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

export default router;
