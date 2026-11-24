// Backup e restauração do banco e do Storage (produção). Tudo aqui só LÊ o Supabase.
// A restauração é um arquivo SQL (restoreSql): o mesmo que a conferência executa num Postgres isolado (verifyDump).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// Pais antes dos filhos (chaves estrangeiras). Igual a COLUMNS em server/entities.js (tests/backup.test.js confere).
export const TABLES = [
  'users', 'community_posts', 'community_comments', 'community_groups', 'community_reports', 'community_media',
  'audit_log', 'analytics', 'estuvia_meta',
  'radar_sources', 'radar_snapshots', 'radar_programs', 'radar_opportunities', 'radar_windows', 'radar_events',
  'radar_availability', 'radar_revisions', 'radar_reviews', 'radar_runs', 'radar_subscriptions', 'radar_alerts', 'radar_agenda_links',
];
export const MIGRATIONS = ['0001_estuvia_state.sql', '0002_entidades.sql', '0003_permissoes.sql', '0004_email_unico.sql'];
const STAMPED = new Set(['seq', 'ins_seq', 'txid', 'updated_at']); // o banco refaz ao inserir
const PAGE = 200; // linhas do Radar são grandes: páginas maiores estouram o tempo-limite do Supabase

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const rowKey = (r) => JSON.stringify(sortKeys({ id: r.id, version: Number(r.version), data: r.data }));
/** Impressão digital do conteúdo de uma tabela: não depende da ordem das linhas nem das chaves. */
export const fingerprint = (rows) => sha(rows.map(rowKey).sort().join('\n'));

// ---------------------------------------------------------------- banco

async function dumpTable(db, table) {
  const rows = [];
  // Por chave (id > último), não por deslocamento: uma exclusão no meio da leitura não faz pular linhas.
  for (let last = null; ;) {
    let q = db.from(table).select('*').order('id').limit(PAGE);
    if (last !== null) q = q.gt('id', last);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
    last = data.at(-1).id;
  }
}

export async function dumpDatabase(db, { projeto }) {
  const tabelas = {};
  // Filhos antes dos pais: um post criado durante a cópia não deixa comentário sem dono.
  for (const t of [...TABLES].reverse()) {
    tabelas[t] = await dumpTable(db, t);
    tabelas[t].sort((a, b) => Number(a.ins_seq) - Number(b.ins_seq)); // ordem de inserção (as listas dependem dela)
  }
  return { projeto, geradoEm: new Date().toISOString(), tabelas };
}

const literal = (s) => `'${s.replace(/'/g, "''")}'`;

/** SQL que recria tudo num projeto NOVO (depois das migrations). Para sem mudar nada se já houver usuários. */
export function restoreSql(dump) {
  const out = [
    `-- Restauração da Estuvia: cópia de ${dump.geradoEm} (projeto ${dump.projeto}).`,
    '-- Aplique antes as migrations de supabase/migrations, num projeto VAZIO.',
    'begin;',
    'set local standard_conforming_strings = on;',
    "do $$ begin if exists (select 1 from public.users) then raise exception 'O banco de destino já tem usuários: restauração cancelada.'; end if; end $$;",
  ];
  for (const t of TABLES) {
    const rows = dump.tabelas[t] || [];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !STAMPED.has(c));
    if (cols.some((c) => !/^[a-z_]+$/.test(c))) throw new Error(`${t}: nome de coluna inesperado`);
    for (let i = 0; i < rows.length; i += 50) {
      const part = rows.slice(i, i + 50).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
      out.push(`insert into public.${t} (${cols.join(', ')}) select ${cols.join(', ')} from jsonb_populate_recordset(null::public.${t}, ${literal(JSON.stringify(part))}::jsonb);`);
    }
  }
  out.push('commit;', '');
  return out.join('\n');
}

/** Restaura num Postgres isolado (PGlite, em memória) e compara linha a linha com a cópia. */
export async function verifyDump(dump, { migrationsDir }) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  try {
    await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for (const f of MIGRATIONS) await pg.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
    await pg.exec(restoreSql(dump));
    const tabelas = {};
    for (const t of TABLES) {
      const { rows } = await pg.query(`select id, version, data, ins_seq from public.${t} order by ins_seq`);
      const original = dump.tabelas[t] || [];
      if (rows.length !== original.length) throw new Error(`${t}: ${original.length} linha(s) na cópia, ${rows.length} depois de restaurar`);
      if (fingerprint(rows) !== fingerprint(original)) throw new Error(`${t}: conteúdo diferente depois de restaurar`);
      if (rows.some((r, i) => r.id !== original[i].id)) throw new Error(`${t}: ordem diferente depois de restaurar`);
      tabelas[t] = { linhas: rows.length, impressao: fingerprint(original) };
    }
    return tabelas;
  } finally {
    await pg.close();
  }
}

// ---------------------------------------------------------------- arquivos (Storage)

async function listAll(db, bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data || []) {
      const nome = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push({ nome, em: item.updated_at || item.created_at || null, tamanho: item.metadata?.size ?? null });
      else files.push(...(await listAll(db, bucket, nome)));
    }
    if (!data || data.length < 1000) return files;
  }
}

/** Copia os arquivos por conteúdo (arquivos/<sha256>); o que não mudou desde a cópia anterior não é baixado de novo. */
export async function copyStorage(db, buckets, dir, anteriores = []) {
  const store = path.join(dir, 'arquivos');
  fs.mkdirSync(store, { recursive: true });
  const known = new Map(anteriores.map((f) => [`${f.bucket}/${f.nome}`, f]));
  const out = [];
  for (const bucket of buckets) {
    const { error } = await db.storage.getBucket(bucket);
    if (error) {
      // Só "não encontrado" é bucket ausente; erro de rede ou de credencial não pode virar cópia "vazia".
      if (/not found/i.test(error.message) || String(error.statusCode || error.status) === '404') continue;
      throw new Error(`${bucket}: ${error.message}`);
    }
    for (const f of await listAll(db, bucket)) {
      const prev = known.get(`${bucket}/${f.nome}`);
      if (prev && f.em && prev.em === f.em && prev.tamanho === f.tamanho && fs.existsSync(path.join(store, prev.sha256))) { out.push(prev); continue; }
      const { data, error: err } = await db.storage.from(bucket).download(f.nome);
      if (err) throw new Error(`${bucket}/${f.nome}: ${err.message}`);
      const buf = Buffer.from(await data.arrayBuffer());
      if (f.tamanho !== null && buf.length !== f.tamanho) throw new Error(`${bucket}/${f.nome}: baixou ${buf.length} de ${f.tamanho} bytes`);
      const sha256 = sha(buf);
      fs.writeFileSync(path.join(store, sha256), buf, { mode: 0o600 });
      out.push({ bucket, ...f, sha256 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- cópias em disco

const NAME = /^copia-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
export const copyName = (d = new Date()) => `copia-${d.toISOString().slice(0, 19).replace(/:/g, '-')}`;
const copyTime = (n) => Date.parse(n.slice(6).replace(/T(\d\d)-(\d\d)-(\d\d)$/, 'T$1:$2:$3Z'));

/** Cópias completas (com manifesto), da mais antiga para a mais nova. */
export function listCopies(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => NAME.test(n) && fs.existsSync(path.join(dir, n, 'manifesto.json'))).sort()
    .map((n) => ({ nome: n, em: copyTime(n), manifesto: JSON.parse(fs.readFileSync(path.join(dir, n, 'manifesto.json'), 'utf8')) }));
}

/** Grava numa pasta temporária e só renomeia no fim: uma cópia interrompida nunca parece completa. */
export function saveCopy(dir, nome, dump, manifesto) {
  const tmp = path.join(dir, `${nome}.parcial`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const gz = zlib.gzipSync(JSON.stringify(dump));
  fs.writeFileSync(path.join(tmp, 'banco.json.gz'), gz, { mode: 0o600 });
  fs.writeFileSync(path.join(tmp, 'manifesto.json'), JSON.stringify({ ...manifesto, bancoSha256: sha(gz) }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, path.join(dir, nome));
}

/** Lê a cópia do disco conferindo a integridade do banco e de cada arquivo. */
export function readCopy(dir, nome) {
  const manifesto = JSON.parse(fs.readFileSync(path.join(dir, nome, 'manifesto.json'), 'utf8'));
  const gz = fs.readFileSync(path.join(dir, nome, 'banco.json.gz'));
  if (sha(gz) !== manifesto.bancoSha256) throw new Error(`${nome}: banco.json.gz corrompido`);
  for (const f of manifesto.arquivos) {
    const p = path.join(dir, 'arquivos', f.sha256);
    if (!fs.existsSync(p) || sha(fs.readFileSync(p)) !== f.sha256) throw new Error(`${nome}: arquivo ${f.bucket}/${f.nome} ausente ou corrompido`);
  }
  return { manifesto, dump: JSON.parse(zlib.gunzipSync(gz).toString('utf8')) };
}

/**
 * Apaga cópias com mais de `dias` dias e os arquivos que nenhuma cópia restante usa. Sempre mantém as `minimo` mais novas.
 * Dados de conta excluída somem daqui no mesmo prazo (LGPD): mude os dois juntos na política de privacidade.
 */
export function prune(dir, { dias = 30, minimo = 3, agora = Date.now() } = {}) {
  const copies = listCopies(dir);
  const old = copies.slice(0, Math.max(0, copies.length - minimo)).filter((c) => agora - c.em > dias * 86400000);
  for (const c of old) fs.rmSync(path.join(dir, c.nome), { recursive: true });
  const used = new Set(listCopies(dir).flatMap((c) => c.manifesto.arquivos.map((f) => f.sha256)));
  const store = path.join(dir, 'arquivos');
  if (fs.existsSync(store)) for (const f of fs.readdirSync(store)) if (/^[0-9a-f]{64}$/.test(f) && !used.has(f)) fs.rmSync(path.join(store, f));
  return old.map((c) => c.nome);
}

/** Queda brusca (tabela esvaziada ou usuários pela metade): guarda a cópia, mas não apaga as antigas. */
export function suspicious(antes, depois) {
  if (!antes) return [];
  return Object.entries(antes).filter(([t, a]) => {
    const d = depois[t]?.linhas ?? 0;
    return (a.linhas >= 3 && d === 0) || (t === 'users' && a.linhas >= 4 && d < a.linhas / 2);
  }).map(([t, a]) => `${t}: ${a.linhas} → ${depois[t]?.linhas ?? 0}`);
}
