// E2E local (JSON temporário). Uso: node run.mjs <baseUrl>
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Avell JP/Desktop/projetos/depois/estuvia/video/tools/package.json');
const { chromium } = require('playwright-core');
const BASE = process.argv[2];
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => require('fs').existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const results = []; const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(cond ? 'OK  ' : 'FALHA', name, extra); };

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = []; const bad = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) bad.push(`${r.status()} ${r.url()}`); });
  await page.goto(BASE + '/#/');
  const api = (method, url, body) => page.evaluate(async ([m, u, b]) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' }, body: b ? JSON.stringify(b) : undefined, credentials: 'same-origin' }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; }, [method, url, body]);
  const reg = await api('POST', '/auth/register', { nome: 'Teste E2E', email, senha: 'SenhaForte!2026x', aceite: true, maiorIdade: true });
  return { ctx, page, api, errors, bad, reg };
}

const A = await session('aluna.e2e@example.com');
ok('cadastro', A.reg.s === 201 || A.reg.s === 200, String(A.reg.s));
const prof = await A.api('PUT', '/me/profile', { paisResidencia: 'Brasil', estado: 'SP' });
ok('perfil (país/estado)', prof.s < 400, `${prof.s} ${prof.j?.error || ''}`);
const jr = await A.api('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28', duracaoMeses: 12 });
ok('criar jornada', jr.s === 201, `${jr.s} ${jr.j?.error || ''}`);
const jid = jr.j?.journey?.id;
await A.api('POST', '/finance/resources', { tipo: 'poupanca', descricao: 'Poupança', valor: 8000, moeda: 'EUR', status: 'disponivel' });
const fin = await A.api('PUT', '/finance', { itens: { matricula: { valor: 3000, moeda: 'EUR', status: 'confirmado' } }, iniciar: true });
ok('finanças salvas', fin.s < 400, `${fin.s} ${fin.j?.error || ''}`);
const plan = await A.api('GET', '/finance');
const v = plan.j?.plano?.visto || plan.j?.visto;
ok('visto desconta matrícula não paga', v && v.descontoMatricula === 3000 && v.recursosConsiderados === 5000, JSON.stringify(v && { d: v.descontoMatricula, r: v.recursosConsiderados, f: v.falta }));
const m58 = await A.api('GET', `/journeys/${jid}/missions/5.8`);
ok('missão 5.8 traz prazo oficial do visto', JSON.stringify(m58.j || {}).includes('silêncio negativo'), String(m58.s));
const m81 = await A.api('GET', `/journeys/${jid}/missions/8.1`);
ok('missão 8.1 traz regra da TIE', JSON.stringify(m81.j || {}).includes('Comisaría'), String(m81.s));
const docs = await A.api('GET', '/documents');
ok('documentos carregam', docs.s === 200, String(docs.s));
const docsTxt = JSON.stringify(docs.j || {});
ok('seguro com regra oficial', docsTxt.includes('seguradora autorizada a operar na Espanha'));
ok('equivalência de nota com fonte O31', docsTxt.includes('notamedia.uni@ciencia.gob.es') || docsTxt.includes('DENM'));

const pages = ['/', '/jornadas', `/j/${jid}`, '/mestrados', '/documentos', '/financiamento', '/agenda', '/novo-lar', '/viagem', '/perfil', '/fontes', '/oportunidades', '/conquistas', '/comunidade', '/mentor'];
for (const p of pages) {
  const before = A.errors.length;
  await A.page.goto(BASE + '/#' + p); await A.page.waitForTimeout(1500);
  const txt = await A.page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText);
  ok(`página ${p}`, A.errors.length === before && !/Página não encontrada|Algo deu errado/.test(txt) && txt.length > 50, A.errors.slice(before).join(' | ').slice(0, 200));
}
await A.page.goto(BASE + '/#/financiamento'); await A.page.waitForTimeout(1500);
ok('financiamento mostra desconto da matrícula', (await A.page.innerText('body')).includes('matrícula ainda não paga'));
// celular
await A.page.setViewportSize({ width: 390, height: 844 });
for (const p of ['/', '/documentos', '/financiamento', `/j/${jid}`]) {
  await A.page.goto(BASE + '/#' + p); await A.page.waitForTimeout(1200);
  const w = await A.page.evaluate(() => document.documentElement.scrollWidth);
  ok(`celular sem rolagem horizontal ${p}`, w <= 392, `scrollWidth=${w}`);
}
// permissões
const B = await session('outro.e2e@example.com');
const cross = await B.api('GET', `/journeys/${jid}`);
ok('outro estudante não lê a jornada alheia', cross.s === 404 || cross.s === 403, String(cross.s));
const adm = await B.api('GET', '/admin/users');
ok('estudante não acessa admin', adm.s === 401 || adm.s === 403 || adm.s === 404, String(adm.s));
const anon = await browser.newContext(); const ap = await anon.newPage(); await ap.goto(BASE + '/#/');
const an = await ap.evaluate(async () => (await fetch('/api/journeys')).status);
ok('anônimo não lê jornadas', an === 401, String(an));
const csrf = await ap.evaluate(async () => (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
ok('POST sem cabeçalho anti-CSRF bloqueado', csrf === 403, String(csrf));
ok('sem erro 5xx na API', A.bad.length + B.bad.length === 0, [...A.bad, ...B.bad].join(' ').slice(0, 300));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} OK`);
require('fs').writeFileSync(process.argv[3], JSON.stringify(results, null, 1));
await browser.close();
