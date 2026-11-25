// Link de redefinição de senha: usado pelo e-mail (routes/auth.js) e pelo painel admin (routes/admin.js).
// O token vale 1 hora, é de uso único e só o hash dele é guardado.
import crypto from 'node:crypto';

export const RESET_TTL_MS = 60 * 60 * 1000;
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const resetLink = (origin, token) => `${origin}/#/redefinir-senha/${token}`;

/**
 * @param {{ admin?: boolean }} [opts] admin: gerado pelo painel (o limite de um e-mail por minuto não se aplica)
 */
export function newResetToken({ admin = false } = {}) {
  const valor = crypto.randomBytes(32).toString('base64url');
  return { valor, registro: { hash: hashToken(valor), expiresAt: Date.now() + RESET_TTL_MS, ...(admin ? { admin: true } : {}) } };
}
