import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

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
  if (!process.env.DATA_FILE) console.warn('[config] JWT_SECRET não definido — usando segredo local de desenvolvimento (data/.dev-secret).');
}

export const config = {
  appName: process.env.APP_NAME || 'Estuvia',
  port: Number(process.env.PORT) || 3000,
  isProd,
  jwtSecret,
  sessionHours: 8,
  dataFile: process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json'),
  // Imagens da comunidade ficam ao lado da base (fora de public/: são servidas só para usuários logados).
  mediaDir: process.env.MEDIA_DIR || path.join(path.dirname(process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json')), 'media'),
  // Arquivos da carteira de documentos: privados, cifrados (AES-256-GCM) e fora de public/.
  docsDir: process.env.DOCS_DIR || path.join(path.dirname(process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json')), 'docfiles'),
  // Chave dos arquivos: DOCUMENTS_KEY (recomendado em produção, ≥ 32 caracteres) ou derivada do JWT_SECRET.
  // Trocar a chave (ou o sal 'padapal', nome antigo da plataforma) torna os arquivos já guardados ilegíveis.
  docsKey: crypto.hkdfSync('sha256', process.env.DOCUMENTS_KEY || jwtSecret, 'padapal', 'documentos-v1', 32),
  // Moderadores da comunidade (verificação de oportunidades, denúncias). Lista separada por vírgula.
  moderatorEmails: (process.env.MODERATOR_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  publicDir: path.join(here, '..', 'public'),
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  // A IA só é ativada quando há credencial; sem ela o assistente usa a base local (modo offline).
  aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  allowedOrigin: process.env.ALLOWED_ORIGIN || null,
};
