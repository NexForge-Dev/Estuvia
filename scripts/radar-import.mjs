// Coleta fontes oficiais NESTE computador e importa as páginas no Radar de outro ambiente.
//
// Para que serve: o site da Junta de Andalucía (DUA) recusa conexões de servidores em nuvem, como os da
// Vercel. Aqui a coleta roda com o mesmo pipeline do servidor, numa base temporária (JSON), gravando cada
// resposta. Depois as páginas vão para POST /api/radar/admin/import do ambiente de destino, que as processa
// pelo pipeline normal (server/radar/replay.js). Só páginas públicas das fontes oficiais; nenhum dado pessoal.
//
// Uso:
//   ESTUVIA_URL=https://app.exemplo.com ESTUVIA_ADMIN_EMAIL=... ESTUVIA_ADMIN_PASSWORD=... npm run radar:import
//   npm run radar:import -- --fontes dua-catalogo,dua-fichas     (padrão: dua-calendario,boja,dua-catalogo,dua-fichas)
//   npm run radar:import -- --salvar coleta.json                 (só coleta e salva; não envia)
//   npm run radar:import -- --arquivo coleta.json                (envia uma coleta salva)
//   npm run radar:import -- --agendado --estado <pasta>          (modo do Agendador de Tarefas: ver abaixo)
//
// Modo agendado: a base local fica em <pasta> (não é apagada) e cada execução coleta só as fontes VENCIDAS
// dos hosts bloqueados (--hosts, padrão www.juntadeandalucia.es), no lote e na frequência de cada fonte
// (server/radar/registry.js). Rodando de hora em hora: ~16 consultas ao DUA por vez; as fichas inteiras se
// renovam em menos de 2 dias. Use uma conta com o papel "Equipe do Radar", não a do admin.
// A conta precisa ser admin ou ter o papel "Equipe do Radar". A coleta respeita robots.txt e espera 4 s
// entre requisições ao mesmo site (as ~400 fichas do DUA levam cerca de 30 min).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const FONTES = (opt('fontes') || 'dua-calendario,boja,dua-catalogo,dua-fichas').split(',').map((s) => s.trim()).filter(Boolean);
const AGENDADO = args.includes('--agendado');
const ESTADO = opt('estado');
const HOSTS = (opt('hosts') || 'www.juntadeandalucia.es').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const MAX_LOTE_BYTES = 3_000_000; // abaixo do limite de 4,5 MB por requisição da Vercel (e de 4 MB da rota)

async function collect() {
  // Base temporária e isolada: nada daqui toca o banco de desenvolvimento nem o de produção.
  if (AGENDADO && !ESTADO) throw new Error('--agendado exige --estado <pasta> (a base local que guarda o que já foi coletado).');
  const tmp = ESTADO ? path.resolve(ESTADO) : fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-radar-import-'));
  fs.mkdirSync(tmp, { recursive: true });
  Object.assign(process.env, {
    DB_PROVIDER: 'json', STORAGE_PROVIDER: 'local', RADAR_SCHEDULER: 'off', RADAR_IMPORT_ONLY_HOSTS: '',
    DATA_FILE: path.join(tmp, 'db.json'), RADAR_DATA_FILE: path.join(tmp, 'radar.json'),
    DOTENV_CONFIG_PATH: path.join(tmp, 'sem-env'),
  });
  const { initStore } = await import('../server/store.js');
  const { initRadarStore, flushRadar } = await import('../server/radar/db.js');
  const { initRadar } = await import('../server/radar/service.js');
  const { runSource, dueSources } = await import('../server/radar/pipeline.js');
  const { decode } = await import('../server/radar/http.js');
  await initStore(); await initRadarStore(); await initRadar();

  const paginas = {}; // fonte → páginas
  const robots = {};
  let atual = null;
  const recorder = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const u = new URL(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';
    if (u.pathname === '/robots.txt') {
      if (res.ok) robots[u.origin] = new TextDecoder().decode(buf);
    } else if (res.status < 400) {
      (paginas[atual] ??= []).push({
        url: u.href, method: String(opts.method || 'GET').toUpperCase(), body: opts.body ?? null, status: res.status,
        ...(res.headers.get('location') ? { location: res.headers.get('location') } : {}),
        text: res.status >= 300 ? '' : decode(buf, contentType), coletadoEm: new Date().toISOString(),
      });
    }
    return new Response(buf, { status: res.status, headers: res.headers });
  };
  const hostOf = (s) => { try { return new URL(s.url).hostname.toLowerCase(); } catch { return ''; } };
  const fontes = AGENDADO ? dueSources().filter((s) => HOSTS.includes(hostOf(s))).map((s) => s.id) : FONTES;
  if (AGENDADO) console.log(`${new Date().toISOString()} fontes vencidas: ${fontes.join(', ') || 'nenhuma'}`);
  for (const fonte of fontes) {
    atual = fonte;
    const t0 = Date.now();
    const run = await runSource(fonte, { fetchImpl: recorder, lote: AGENDADO ? null : Infinity });
    console.log(`coleta ${fonte}: ${run.resultado} · ${run.itens} página(s) · ${(paginas[fonte] || []).length} gravada(s)${run.erro ? ` · ${run.erro}` : ''} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await flushRadar();
  if (!ESTADO) fs.rmSync(tmp, { recursive: true, force: true });
  return { robots, paginas, fontes };
}

// Agrupa as páginas em lotes. No catálogo do DUA, as fases de uma universidade vão sempre juntas.
function lotes(fonte, pags) {
  const grupo = (p) => (fonte === 'dua-catalogo' ? new URLSearchParams(p.body || '').get('univpet') : `${p.method} ${p.url} ${p.body || ''}`);
  const grupos = new Map();
  for (const p of pags) { const g = grupo(p); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(p); }
  const out = [];
  let cur = []; let bytes = 0;
  for (const g of grupos.values()) {
    const size = g.reduce((n, p) => n + p.text.length * 1.1 + 500, 0);
    if (cur.length && bytes + size > MAX_LOTE_BYTES) { out.push(cur); cur = []; bytes = 0; }
    cur.push(...g); bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function upload(coleta) {
  const { robots, paginas } = coleta;
  // trim: um espaço ou TAB sobrando no arquivo .env (comum ao colar) faria o login falhar.
  const base = (process.env.ESTUVIA_URL || '').trim().replace(/\/+$/, '');
  const email = (process.env.ESTUVIA_ADMIN_EMAIL || '').trim();
  const senha = (process.env.ESTUVIA_ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '');
  if (!base || !email || !senha) throw new Error('Defina ESTUVIA_URL, ESTUVIA_ADMIN_EMAIL e ESTUVIA_ADMIN_PASSWORD.');
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(`${base}/api${url}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const login = await call('POST', '/auth/login', { email, senha });
  if (login.status !== 200) throw new Error(`Login recusado (${login.status}): ${login.data.error || ''}`);
  for (const fonte of (coleta.fontes || FONTES)) {
    const ls = lotes(fonte, paginas[fonte] || []);
    for (const [i, lote] of ls.entries()) {
      const t0 = Date.now();
      const r = await call('POST', '/radar/admin/import', { fonte, robots, paginas: lote });
      const run = r.data.run || {};
      console.log(`importação ${fonte} ${i + 1}/${ls.length}: HTTP ${r.status} · ${run.resultado || r.data.error} · ${run.itens ?? 0} página(s) · ${run.mudancas ?? 0} mudança(s)${run.erro ? ` · ${run.erro}` : ''} · ${Math.round((Date.now() - t0) / 1000)} s`);
      if (r.status >= 400) throw new Error('Importação interrompida.');
    }
  }
}

const arquivo = opt('arquivo');
const coleta = arquivo ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : await collect();
const salvar = opt('salvar');
if (salvar) { fs.writeFileSync(salvar, JSON.stringify(coleta)); console.log(`coleta salva em ${salvar}`); }
else if (!Object.values(coleta.paginas).some((l) => l.length)) console.log('nada novo para enviar.');
else await upload(coleta);
