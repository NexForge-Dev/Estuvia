// Conta de administrador definida no .env (ADMIN_EMAIL + ADMIN_PASSWORD).
// Na inicialização: cria a conta se não existir; se existir, garante o papel "admin" e
// sincroniza a senha com o .env (trocar ADMIN_PASSWORD e reiniciar troca a senha).
// Se alguém tiver se cadastrado antes com esse e-mail, a senha é trocada pela do .env e todas as
// sessões dessa conta caem: o operador assume a conta. A senha nunca é registrada em log.
import { config } from './config.js';
import { users, audit, newId } from './store.js';
import { hashPassword, verifyPassword } from './security.js';

// Executa uma única vez por processo (chamadas concorrentes não criam duas contas).
let pending = null;
export const ensureAdminAccount = () => (pending ||= syncAdmin());

async function syncAdmin() {
  const { adminEmail: email, adminPassword: senha } = config;
  if (!email && !senha) return null;
  if (!email || !senha) {
    console.warn('[admin] defina ADMIN_EMAIL e ADMIN_PASSWORD juntos no .env para ativar o painel admin.');
    return null;
  }
  const minimo = config.isProd ? 12 : 8;
  if (senha.length < minimo || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    console.warn(`[admin] ADMIN_PASSWORD precisa ter pelo menos ${minimo} caracteres, com letras e números. Conta admin não criada/atualizada.`);
    return null;
  }

  const existing = users.findByEmail(email);
  if (!existing) {
    const now = new Date().toISOString();
    const user = await users.create({
      id: newId(),
      email,
      role: 'admin',
      passwordHash: await hashPassword(senha),
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
      consentAt: now,
      profile: { nome: 'Administrador', apelido: 'Admin', avatar: '🦉', cor: 'turquesa', tema: 'escuro', onboardingConcluido: true },
      journeys: [],
      planner: [],
      choices: [],
      documents: {},
      budget: [],
    });
    await audit.log({ action: 'admin-created', userId: user.id });
    console.log(`  Painel admin: conta ${email} criada (acesse #/admin).`);
    return user;
  }

  const passwordChanged = !(await verifyPassword(senha, existing.passwordHash));
  const passwordHash = passwordChanged ? await hashPassword(senha) : existing.passwordHash;
  if (passwordChanged || existing.role !== 'admin' || existing.blocked) {
    await users.update(existing.id, (u) => {
      u.role = 'admin';
      u.blocked = false;
      if (passwordChanged) { u.passwordHash = passwordHash; u.tokenVersion += 1; }
    });
    if (passwordChanged) await audit.log({ action: 'admin-password-synced', userId: existing.id });
  }
  return existing;
}
