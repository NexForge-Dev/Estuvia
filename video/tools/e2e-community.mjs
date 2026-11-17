// Teste ponta a ponta da comunidade, pela interface, com três pessoas (autora, leitora e moderadora).
// Roda contra um servidor LOCAL isolado (base JSON temporária). Uso:
//   E2E_URL=http://localhost:4778 node video/tools/e2e-community.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.E2E_URL || 'http://localhost:4778';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('Só contra servidor local.');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-e2e-'));
const PNG = path.join(OUT, 'foto.png');
// PNG 1x1 válido.
fs.writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

const problems = [];
const steps = [];
const ok = (msg) => { steps.push(msg); console.log('  ok', msg); };
const stamp = Date.now().toString(36);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function person(nome, email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[${nome}] erro de JS: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`[${nome}] console: ${m.text()}`); });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 500 && u.includes('/api/')) problems.push(`[${nome}] ${r.status()} em ${r.request().method()} ${u.replace(BASE, '')}`);
  });
  const call = async (method, url, data) => {
    const res = await page.request.fetch(`${BASE}/api${url}`, { method, data, headers: { 'X-Requested-With': 'travessia' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${JSON.stringify(body)}`);
    return body;
  };
  await call('POST', '/auth/register', { nome, email, senha: 'Segura12345', aceite: true, maiorIdade: true })
    .catch((e) => { if (!/409/.test(e.message)) throw e; return call('POST', '/auth/login', { email, senha: 'Segura12345' }); });
  // Onboarding mínimo pelo servidor (o teste é da comunidade, não do onboarding).
  await call('POST', '/journeys', { universidadeId: 'ugr' }).catch(() => {});
  await call('POST', '/me/onboarding/complete', {}).catch(() => {});
  return { page, context, call, nome };
}

async function open(p, hash) {
  // A conexão de eventos em tempo real (/api/events) fica aberta: "networkidle" nunca chega.
  await p.page.goto('about:blank');
  await p.page.goto(`${BASE}/#${hash}`);
  await p.page.locator('main').first().waitFor();
  await p.page.waitForTimeout(1200);
}
const shot = (p, name) => p.page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const card = (p, text) => p.page.locator('.cm-post', { hasText: text }).first();

try {
  const ana = await person('Ana Teste', `ana.${stamp}@e2e.local`);
  const bia = await person('Bia Teste', `bia.${stamp}@e2e.local`);
  const mod = await person('Moderadora', 'mod@e2e.local'); // MODERATOR_EMAILS no servidor de teste

  // 1. Ana publica com imagem, pela interface.
  const TEXTO = `Cheguei em Granada (${stamp}). Dicas de moradia perto da Facultad de Ciencias?`;
  await open(ana, '/comunidade');
  await ana.page.locator('.cm-prompt').click();
  const form = ana.page.locator('form', { has: ana.page.locator('textarea[name="texto"]') });
  const cat = form.locator('select[name="categoria"]');
  const firstCat = await cat.locator('option').nth(1).getAttribute('value');
  await cat.selectOption(firstCat);
  await form.locator('textarea[name="texto"]').fill(TEXTO);
  if (!(await form.locator('.cm-file').isVisible())) await form.locator('details summary').first().click();
  await form.locator('.cm-file').setInputFiles(PNG);
  await form.locator('.cm-thumb img').waitFor({ timeout: 10000 });
  await form.locator('button[type="submit"]').click();
  await card(ana, stamp).waitFor({ timeout: 10000 });
  await card(ana, stamp).locator('.cm-images img').waitFor({ timeout: 10000 });
  ok('Ana publicou um post com imagem pela interface');
  await shot(ana, '1-ana-publicou');

  // 2. Bia vê, curte, salva e comenta.
  await open(bia, '/comunidade');
  const post = card(bia, stamp);
  await post.waitFor({ timeout: 10000 });
  const loaded = await post.locator('.cm-images img').evaluate((img) => img.complete && img.naturalWidth > 0);
  if (!loaded) problems.push('Imagem do post não carregou para a Bia');
  else ok('Bia vê o post e a imagem carrega');
  await post.locator('.cm-action[aria-pressed]').first().click();
  // (A CSP do site proíbe eval: nada de waitForFunction; só esperas por seletor.)
  await card(bia, stamp).locator('.cm-action[aria-pressed="true"]').first().waitFor({ timeout: 10000 });
  ok('Bia curtiu (botão fica marcado)');
  await card(bia, stamp).locator('.cm-action', { hasText: 'Salvar' }).click();
  await card(bia, stamp).locator('.cm-action', { hasText: 'Salvo' }).waitFor({ timeout: 10000 });
  ok('Bia salvou');
  await card(bia, stamp).locator('.cm-action').nth(1).click(); // comentários → abre o post
  await bia.page.locator('#cm-new-comment').waitFor({ timeout: 10000 });
  await bia.page.locator('#cm-new-comment').fill('Procura no bairro Realejo, é perto e mais barato.');
  await bia.page.locator('.cm-comment-form button[type="submit"]').click();
  await bia.page.getByText('Procura no bairro Realejo').waitFor({ timeout: 10000 });
  await bia.page.locator('h2', { hasText: 'Comentários (1)' }).waitFor({ timeout: 5000 });
  ok('Bia comentou no post (contador atualiza para 1)');
  await shot(bia, '2-bia-comentou');

  // 3. Ana vê curtida e comentário; edita o post.
  await open(ana, '/comunidade');
  const anaCard = card(ana, stamp);
  await anaCard.waitFor();
  const counts = await anaCard.locator('.cm-actions .cm-action').allInnerTexts();
  if (counts[0].trim() !== '1' || counts[1].trim() !== '1') problems.push(`Ana deveria ver 1 curtida e 1 comentário, viu ${JSON.stringify(counts.slice(0, 2))}`);
  else ok('Ana vê 1 curtida e 1 comentário');
  await anaCard.locator('[aria-label="Mais opções"]').click();
  await anaCard.locator('.cm-menu-item', { hasText: 'Editar' }).click();
  const edit = ana.page.locator('form', { has: ana.page.locator('textarea[name="texto"]') });
  await edit.locator('textarea[name="texto"]').fill(`${TEXTO} (editado)`);
  await edit.locator('button[type="submit"]').click();
  await ana.page.getByText('(editado)').first().waitFor({ timeout: 10000 });
  ok('Ana editou o post');

  // 4. Bia denuncia um post e a moderação decide.
  await open(bia, '/comunidade');
  const bc = card(bia, stamp);
  await bc.locator('[aria-label="Mais opções"]').click();
  await bc.locator('.cm-menu-item', { hasText: 'Denunciar' }).click();
  const rep = bc.locator('form.cm-report');
  await rep.locator('select[name="motivo"]').selectOption({ index: 1 });
  await rep.locator('button[type="submit"]').click();
  await bia.page.locator('.toast, [role="status"]', { hasText: /Denúncia registrada/ }).first().waitFor({ timeout: 10000 });
  ok('Bia denunciou pela interface');

  await open(mod, '/comunidade/moderacao');
  await mod.page.getByText(stamp).first().waitFor({ timeout: 10000 });
  ok('Moderadora vê a denúncia na fila');
  await shot(mod, '3-moderacao');
  const q = await mod.call('GET', '/community/mod/queue');
  const den = q.denuncias.find((d) => d.trecho.includes(stamp));
  await mod.call('POST', `/community/mod/posts/${den.alvoId}/moderation`, { acao: 'publicar' });
  const after = await mod.call('GET', '/community/mod/queue');
  if (after.denuncias.some((d) => d.alvoId === den.alvoId)) problems.push('Denúncia continuou aberta depois da decisão');
  else ok('Moderadora decidiu e a denúncia saiu da fila');

  // 5. Grupos: Bia entra num grupo pela interface.
  await open(bia, '/comunidade/grupos');
  const joinBtn = bia.page.locator('button', { hasText: /^Participar$/ }).first();
  await joinBtn.click();
  await bia.page.locator('button', { hasText: /^Sair do grupo$/ }).first().waitFor({ timeout: 10000 });
  ok('Bia entrou num grupo');

  // 6. Ana exclui o post (confirmação dentro do cartão, sem diálogo do navegador).
  await open(ana, '/comunidade');
  const ac = card(ana, stamp);
  await ac.locator('[aria-label="Mais opções"]').click();
  await ac.locator('.cm-menu-item', { hasText: 'Excluir' }).click();
  await ac.locator('.cm-confirm button', { hasText: 'Confirmar' }).click();
  await ana.page.locator('.cm-post', { hasText: stamp }).waitFor({ state: 'detached', timeout: 10000 });
  const gone = await bia.call('GET', '/community/posts?ordem=recentes');
  if (gone.posts.some((p) => p.texto.includes(stamp))) problems.push('Post excluído continua no feed da Bia');
  else ok('Ana excluiu o post e ele sumiu para todos');

  // 7. Celular: o feed abre sem rolagem horizontal.
  await bia.page.setViewportSize({ width: 375, height: 800 });
  await open(bia, '/comunidade');
  const overflow = await bia.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`Feed no celular tem rolagem horizontal (${overflow}px)`);
  else ok('Feed no celular (375 px) sem rolagem horizontal');
  await shot(bia, '4-celular');
} catch (e) {
  problems.push(`Falhou: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
}

console.log(`\n${steps.length} passos ok. Capturas em ${OUT}`);
if (problems.length) { console.log('PROBLEMAS:'); problems.forEach((p) => console.log(' -', p)); process.exitCode = 1; }
else console.log('Nenhum problema encontrado.');
