// Conta excluída no meio de uma requisição (outra aba, outro dispositivo ou o admin): users.update devolve null.
// Antes, as rotas seguiam com null e respondiam 500. updateUser lança AccountGoneError, e accountGone
// (registrado no fim de cada roteador) responde 401 e limpa a sessão.
import { users } from '../store.js';
import { clearSession } from '../security.js';

export class AccountGoneError extends Error {
  constructor() { super('Conta não encontrada.'); this.status = 401; }
}

export async function updateUser(id, mutate) {
  const user = await users.update(id, mutate);
  if (!user) throw new AccountGoneError();
  return user;
}

export function accountGone(err, req, res, next) {
  if (!(err instanceof AccountGoneError)) return next(err);
  if (res.headersSent) return res.end();
  clearSession(res);
  res.status(401).json({ error: 'Sua conta não foi encontrada. Entre de novo.' });
}
