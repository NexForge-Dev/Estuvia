import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// Em produção os arquivos da carteira exigem chave própria: derivá-la do JWT_SECRET faria uma troca
// do segredo das sessões tornar todos os documentos ilegíveis.
if (isProd && (process.env.DOCUMENTS_KEY || '').length < 32) {
  throw new Error('DOCUMENTS_KEY ausente ou curta (mínimo 32 caracteres). Defina-a no .env (e guarde com backup) antes de subir em produção.');
}

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProd) {
    throw new Error('JWT_SECRET ausente ou curto (mínimo 32 caracteres). Defina-o no .env antes de subir em produção.');
  }
  // Em desenvolvimento geramos um segredo local (data/.dev-secret, fora do git) para que
  // as sessões sobrevivam a reinícios do servidor.
  const secretFile = path.join(here, '..', 'data', '.dev-secret');
  try {
    jwtSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    jwtSecret = crypto.randomBytes(48).toString('hex');
    try {
      fs.mkdirSync(path.dirname(secretFile), { recursive: true });
      fs.writeFileSync(secretFile, jwtSecret, { mode: 0o600 });
    } catch { /* sem disco gravável: segue com segredo em memória */ }
  }
  if (!process.env.DATA_FILE) console.warn('[config] JWT_SECRET não definido, usando segredo local de desenvolvimento (data/.dev-secret).');
}

export const config = {
  appName: process.env.APP_NAME || 'Estuvia',
  port: Number(process.env.PORT) || 3000,
  isProd,
  jwtSecret,
  sessionHours: 8,
  dataFile: process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json'),
  databaseProvider: process.env.DB_PROVIDER || 'json',
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  // Secret key fica só no servidor. A publishable key não pode gravar com segurança usando a autenticação própria do Estuvia.
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  // Imagens da comunidade ficam ao lado da base (fora de public/: são servidas só para usuários logados).
  mediaDir: process.env.MEDIA_DIR || path.join(path.dirname(process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json')), 'media'),
  // Arquivos da carteira de documentos: privados, cifrados (AES-256-GCM) e fora de public/.
  docsDir: process.env.DOCS_DIR || path.join(path.dirname(process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json')), 'docfiles'),
  // Chave dos arquivos: DOCUMENTS_KEY (recomendado em produção, ≥ 32 caracteres) ou derivada do JWT_SECRET.
  // Trocar a chave (ou o sal 'padapal', nome antigo da plataforma) torna os arquivos já guardados ilegíveis.
  docsKey: crypto.hkdfSync('sha256', process.env.DOCUMENTS_KEY || jwtSecret, 'padapal', 'documentos-v1', 32),
  // Moderadores da comunidade (verificação de oportunidades, denúncias). Lista separada por vírgula.
  // Só vale FORA de produção (o cadastro não verifica e-mail; em produção o admin concede o papel no painel).
  moderatorEmails: (process.env.MODERATOR_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Papéis por lista de e-mail (MODERATOR_EMAILS, RADAR_ADMIN_EMAILS): desenvolvimento e testes apenas.
  emailRoles: !isProd,
  // Conta de administrador (painel #/admin). Criada/atualizada na inicialização a partir do .env.
  // Em produção a senha precisa de pelo menos 12 caracteres (ver admin-seed.js).
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null,
  adminPassword: process.env.ADMIN_PASSWORD || null,
  publicDir: path.join(here, '..', 'public'),
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  // A IA só é ativada quando há credencial; sem ela o assistente usa a base local (modo offline).
  aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  allowedOrigin: process.env.ALLOWED_ORIGIN || null,
};

if (isProd && (process.env.MODERATOR_EMAILS || process.env.RADAR_ADMIN_EMAILS)) {
  console.warn('[config] MODERATOR_EMAILS/RADAR_ADMIN_EMAILS são ignorados em produção: conceda papéis em #/admin (Usuários → Papel).');
}
if (isProd) {
  // Avisos de configuração de produção (não impedem a inicialização, mas quebram fluxos se ignorados).
  if (!process.env.ALLOWED_ORIGIN) console.warn('[config] ALLOWED_ORIGIN não definido: defina a origem pública (ex.: https://app.seudominio.com). Sem ela a recuperação de senha fica desligada.');
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) console.warn('[config] RESEND_API_KEY/EMAIL_FROM não definidos: a recuperação de senha por e-mail não funciona.');
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) console.warn('[config] ADMIN_EMAIL/ADMIN_PASSWORD não definidos: não haverá conta de administrador.');
}
