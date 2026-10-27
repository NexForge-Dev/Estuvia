// Utilidades compartilhadas da produção do vídeo.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TOOLS = path.dirname(fileURLToPath(import.meta.url));
export const VIDEO = path.join(TOOLS, '..');
export const SHOTS = path.join(VIDEO, 'assets', 'screens');
export const BASE = process.env.DEMO_URL || 'http://localhost:3100';
fs.mkdirSync(SHOTS, { recursive: true });

// Conta de demonstração fictícia; a senha é gerada e fica só em demo-data/ (fora do git e do vídeo).
const accFile = path.join(TOOLS, 'demo-data', 'demo-account.json');
export function demoAccount() {
  if (fs.existsSync(accFile)) return JSON.parse(fs.readFileSync(accFile, 'utf8'));
  const acc = { nome: 'Ana', email: 'ana.demo@estuvia.test', senha: crypto.randomBytes(12).toString('base64url') };
  fs.writeFileSync(accFile, JSON.stringify(acc, null, 2));
  return acc;
}

export async function launch({ width = 1600, height = 900, scale = 1.5 } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'dark', bypassCSP: true });
  // Só para a gravação: esconde o contorno de foco do <main> (aparece ao trocar de tela).
  await context.addInitScript(() => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'main:focus,main:focus-visible{outline:none!important}'; document.head.append(st); }));
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  return { browser, context, page };
}

export async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 700);
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: Boolean(opts.fullPage), clip: opts.clip });
  console.log('shot', name);
  return file;
}

export const api = (page) => {
  const call = async (method, url, data) => {
    const res = await page.request.fetch(`${BASE}/api${url}`, { method, data, headers: { 'X-Requested-With': 'travessia' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${JSON.stringify(body)}`);
    return body;
  };
  return { get: (u) => call('GET', u), post: (u, d) => call('POST', u, d ?? {}), put: (u, d) => call('PUT', u, d ?? {}), del: (u) => call('DELETE', u) };
};

export async function go(page, hash) {
  // Carga completa a cada tela: mudar só o hash não recarrega o app (nem a sessão).
  await page.goto('about:blank');
  await page.goto(`${BASE}/#${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
}
