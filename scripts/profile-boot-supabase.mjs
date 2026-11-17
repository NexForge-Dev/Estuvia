// Simula a inicialização no modo Supabase (tabelas por entidade) contra um Postgres local (PGlite), com volume
// parecido com o de produção e latência de rede artificial por chamada. Nunca toca em banco remoto.
//   node scripts/profile-boot-supabase.mjs            (semeia num diretório temporário e mede)
//   RTT_MS=150 MBPS=10 node scripts/profile-boot-supabase.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const phase = process.argv[2];
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.PROFILE_DIR || path.join(os.tmpdir(), 'estuvia-profile-boot');

if (!phase) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  for (const p of ['seed', 'measure']) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), p], { stdio: 'inherit', env: { ...process.env, PROFILE_DIR: work } });
    if (r.status) process.exit(r.status);
  }
  process.exit(0);
}

Object.assign(process.env, {
  DB_PROVIDER: 'supabase', STORAGE_PROVIDER: 'local', APP_ENV: 'development', NODE_ENV: 'development',
  SUPABASE_URL: 'https://perfilref.supabase.co', SUPABASE_SECRET_KEY: 'chave-de-teste',
  SUPABASE_PROD_PROJECT_REF: '', SUPABASE_DEV_PROJECT_REF: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '',
  DATA_FILE: path.join(work, 'db.json'), RADAR_DATA_FILE: path.join(work, 'radar.json'), MEDIA_DIR: path.join(work, 'media'),
  DOC_RULES_FILE: path.join(work, 'document-rules.json'), DOTENV_CONFIG_PATH: path.join(work, 'sem-env'),
});

if (phase === 'seed') {
  // Volume aproximado de produção: 941 mestrados, ~2 oportunidades por mestrado, ~1 snapshot por ficha.
  const radar = JSON.parse(fs.readFileSync(path.join(root, 'data', 'radar.json'), 'utf8'));
  const grow = (list, n) => Array.from({ length: n }, (_, i) => ({ ...structuredClone(list[i % list.length]), id: `${list[i % list.length].id}-x${i}` }));
  Object.assign(radar, {
    programs: grow(radar.programs, 941), opportunities: grow(radar.opportunities, 1882), snapshots: grow(radar.snapshots, 1100),
    runs: grow(radar.runs, 400), revisions: grow(radar.revisions, 300), events: grow(radar.events, 90),
    subscriptions: [], alerts: [], agendaLinks: [],
  });
  fs.writeFileSync(process.env.RADAR_DATA_FILE, JSON.stringify(radar));
  const main = JSON.parse(fs.readFileSync(path.join(root, 'data', 'db.json'), 'utf8'));
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(main));
}

const { PGlite } = await import('@electric-sql/pglite');
const pg = new PGlite(path.join(work, 'pg'));
if (phase === 'seed') {
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await pg.exec(['0001_estuvia_state.sql', '0002_entidades.sql', '0003_permissoes.sql'].map((f) => fs.readFileSync(path.join(root, 'supabase', 'migrations', f), 'utf8')).join('\n'));
}
const database = await import('../server/database.js');
const asService = (sql, params) => pg.transaction(async (tx) => { await tx.query('set local role service_role'); return (await tx.query(sql, params)).rows; });

const RTT = phase === 'measure' ? Number(process.env.RTT_MS ?? 120) : 0;
const BYTES_PER_MS = (Number(process.env.MBPS ?? 10) * 1e6) / 1000;
const stats = { calls: 0, bytes: 0 };
const net = async (result) => {
  if (!RTT) return result;
  const size = JSON.stringify(result ?? null).length;
  stats.calls += 1; stats.bytes += size;
  await new Promise((r) => setTimeout(r, RTT + size / BYTES_PER_MS));
  return result;
};
database.setRpcForTests(async (name, args) => {
  try {
    if (name === 'estuvia_apply') return net((await asService('select public.estuvia_apply($1::jsonb) as r', [JSON.stringify(args.p_ops)]))[0].r);
    if (name === 'estuvia_changes') return net((await asService('select public.estuvia_changes($1::bigint, $2::text[]) as r', [args.p_since, args.p_tables]))[0].r);
    throw new Error(`rpc desconhecida: ${name}`);
  } catch (e) { if (e.code) throw e; throw database.rpcError(e.message); }
});
database.setPageReaderForTests(async (table, after, limit) => net(await asService(`select id, version, seq, ins_seq, data from public.${table} where ins_seq > $1 order by ins_seq limit $2`, [after, limit])));
database.setLegacyReaderForTests(async () => null);

const t0 = performance.now();
const lap = (() => { let last = t0; return (label) => { const now = performance.now(); console.log(`${label.padEnd(40)} ${(now - last).toFixed(0).padStart(6)} ms  (total ${(now - t0).toFixed(0)} ms)`); last = now; }; })();

if (phase === 'seed') {
  const { initStore } = await import('../server/store.js');
  const { initRadarStore } = await import('../server/radar/db.js');
  await initStore();
  await initRadarStore();
  const n = (await pg.query('select (select count(*) from radar_programs) p, (select count(*) from radar_opportunities) o, (select count(*) from radar_snapshots) s, (select count(*) from users) u')).rows[0];
  console.log(`semeado: ${n.p} programas, ${n.o} oportunidades, ${n.s} snapshots, ${n.u} usuários`);
} else {
  console.log(`latência simulada: ${RTT} ms por chamada + ${process.env.MBPS ?? 10} MB/s`);
  const entry = await import('../api/index.js');
  lap('import api/index.js');
  if (process.env.HEALTH) {
    const res = { statusCode: 0, setHeader() {}, end(b) { this.body = b; } };
    await entry.default({ method: 'GET', url: '/api/health' }, res);
    lap(`/api/health a frio → ${res.statusCode} ${res.body}`);
  }
  await entry.boot();
  lap('boot() completo (bases + rotas + Radar)');
  console.log(`chamadas ao "Supabase": ${stats.calls}, ${(stats.bytes / 1e6).toFixed(1)} MB`);
}
await pg.close();
