import crypto from 'node:crypto';
import { promisify } from 'node:util';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { users } from './store.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const COOKIE = 'tv_session';

// ---------- Senhas (scrypt + sal individual + comparação em tempo constante) ----------

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (evita enumeração por tempo).
export const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- Sessão (JWT em cookie httpOnly) ----------

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.isProd, sameSite: 'strict', path: '/' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const user = users.findById(payload.sub);
    // tokenVersion permite invalidar todas as sessões (logout geral / troca de senha).
    if (!user || user.tokenVersion !== payload.v) throw new Error('sessão inválida');
    if (user.blocked) {
      clearSession(res);
      return res.status(403).json({ error: 'Sua conta está suspensa. Fale com a equipe Estuvia.' });
    }
    req.user = user;
    trackActivity(req, user);
    next();
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
}

// ---------- Atividade (painel admin: quem está acessando) ----------

export const clientInfo = (req) => ({
  ip: String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64),
  ua: String(req.get('User-Agent') || '').slice(0, 200),
});

// Grava no máximo uma vez por minuto por usuário (evita escrever na base a cada requisição).
const TOUCH_MS = 60 * 1000;
function trackActivity(req, user) {
  const now = Date.now();
  if (user.lastSeenAt && now - Date.parse(user.lastSeenAt) < TOUCH_MS) return;
  const { ip, ua } = clientInfo(req);
  const today = new Date(now).toISOString().slice(0, 10);
  users.touch(user.id, (u) => {
    // Nova "visita" quando volta após 30 min sem atividade.
    if (!u.lastSeenAt || now - Date.parse(u.lastSeenAt) > 30 * 60 * 1000) u.visits = (u.visits || 0) + 1;
    u.lastSeenAt = new Date(now).toISOString();
    u.lastIp = ip;
    u.lastUserAgent = ua;
    u.activeDays = [...new Set([...(u.activeDays || []), today])].slice(-60);
  }).catch(() => {});
}

// Papéis vêm do campo `role` gravado no servidor. O cadastro não verifica e-mail, então conceder
// privilégio só porque o e-mail bate com o .env deixaria qualquer um se cadastrar com o e-mail da
// equipe e virar admin/moderador. A conta ADMIN_EMAIL recebe role "admin" em admin-seed.js.
export const ROLES = ['estudante', 'moderador', 'radar', 'admin'];
export const isAdmin = (user) => user?.role === 'admin';

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Área restrita ao administrador.' });
  next();
}

// Moderação da comunidade: papel "moderador" (ou e-mail em MODERATOR_EMAILS, só fora de produção).
export const isModerator = (user) => user?.role === 'moderador' || (config.emailRoles && config.moderatorEmails.includes(user?.email));

export function requireModerator(req, res, next) {
  if (!isModerator(req.user)) return res.status(403).json({ error: 'Área restrita à moderação.' });
  next();
}

// ---------- Proteção CSRF ----------
// Cookie SameSite=Strict + exigência de cabeçalho customizado em métodos que alteram estado
// (formulários de outros sites não conseguem enviar cabeçalhos customizados) + checagem de Origin.

export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'travessia') {
    return res.status(403).json({ error: 'Requisição bloqueada (CSRF).' });
  }
  const origin = req.get('Origin');
  if (origin) {
    const expected = config.allowedOrigin || `${req.protocol}://${req.get('host')}`;
    if (origin !== expected) return res.status(403).json({ error: 'Origem não permitida.' });
  }
  next();
}

// ---------- Cabeçalhos de segurança ----------

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      // Miniaturas dos vídeos do YouTube (pesquisa do Mentor) e o player sem cookies, só quando o estudante toca.
      'img-src': ["'self'", 'data:', 'https://i.ytimg.com'],
      'frame-src': ['https://www.youtube-nocookie.com'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  hsts: config.isProd ? undefined : false,
});

// ---------- Limites de taxa ----------

// RATE_LIMIT_SCALE (padrão 1) existe só para suítes de teste que fazem muitas chamadas seguidas.
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);
const limiter = (windowMin, limit, message, opts = {}) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, limit: limit * SCALE, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message }, ...opts });
// Rotas autenticadas: limite por conta (várias pessoas atrás do mesmo IP não se bloqueiam; trocar de IP não burla).
const perUser = { keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`) };

export const authLimiter = limiter(15, 20, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
export const assistantLimiter = limiter(60, 40, 'Você atingiu o limite de perguntas por hora. Volte daqui a pouco!', perUser);
export const communityWriteLimiter = limiter(10, 60, 'Você está publicando rápido demais. Aguarde alguns minutos.');
export const documentUploadLimiter = limiter(10, 30, 'Muitos envios de arquivo seguidos. Aguarde alguns minutos.');
export const apiLimiter = limiter(1, 120, 'Muitas requisições. Respire fundo e tente de novo em instantes.');
