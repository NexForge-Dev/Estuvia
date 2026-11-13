// Persistência por entidade no Supabase (migration 0002_entidades.sql).
//
// O servidor continua trabalhando com as coleções em memória (users, community, radar…), como sempre.
// Este módulo traduz essas coleções em linhas: cada item vira uma linha com o objeto completo em `data`
// e colunas tipadas para consulta. A cada gravação, compara cada item com a última versão salva e envia
// só o que mudou (inserções, atualizações, exclusões) numa transação, com versão otimista por linha.
// A sincronização traz o que outras instâncias gravaram (estuvia_changes, por txid/xmin).

import { rpc, readEntityPage } from './database.js';

// ~1 a 5 MB por página no Radar (programas com ficha do DUA, snapshots). ENTITY_PAGE_ROWS só para testes.
const pageRows = () => Number(process.env.ENTITY_PAGE_ROWS) || 200;
const FAR_FUTURE = Number.MAX_SAFE_INTEGER; // p_since além de qualquer txid: estuvia_changes devolve só o cursor

// ---------------------------------------------------------------- conversões para colunas tipadas

const ts = (v) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const int = (v) => (Number.isInteger(v) && Math.abs(v) < 2 ** 31 ? v : null);
const txt = (v) => (v == null ? null : typeof v === 'string' ? v : typeof v === 'object' ? null : String(v));
const bool = (v) => (v == null ? null : !!v);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

/** Colunas tipadas de cada tabela, extraídas do objeto. `data` (o objeto inteiro) é acrescentado depois. */
export const COLUMNS = {
  users: (u) => ({
    email: txt(u.email), role: txt(u.role), blocked: !!u.blocked, token_version: int(u.tokenVersion),
    onboarding_concluido: !!u.profile?.onboardingConcluido, created_at: ts(u.createdAt), consent_at: ts(u.consentAt),
    last_seen_at: ts(u.lastSeenAt),
  }),
  community_posts: (p) => ({
    autor_id: txt(p.autorId), grupo_id: txt(p.grupoId), tipo: txt(p.tipo), categoria: txt(p.categoria),
    estado_moderacao: txt(p.moderacao?.estado), criado_em: ts(p.criadoEm),
  }),
  community_comments: (c) => ({ post_id: txt(c.postId), autor_id: txt(c.autorId), estado_moderacao: txt(c.moderacao?.estado), criado_em: ts(c.criadoEm) }),
  community_groups: (g) => ({ nome: txt(g.nome), tipo: txt(g.tipo), universidade_id: txt(g.universidadeId), oficial: !!g.oficial, criado_em: ts(g.criadoEm) }),
  community_reports: (r) => ({ alvo: txt(r.alvo), alvo_id: txt(r.alvoId), autor_id: txt(r.autorId), status: txt(r.status), criado_em: ts(r.criadoEm) }),
  community_media: (m) => ({ owner_id: txt(m.ownerId), post_id: txt(m.postId), mime: txt(m.mime), tamanho: int(m.tamanho), criado_em: ts(m.criadoEm) }),
  audit_log: (e) => ({ at: ts(e.at), action: txt(e.action), user_id: txt(e.userId) }),
  analytics: (_v, id) => ({ dia: day(id.startsWith('day:') ? id.slice(4) : null) }),
  estuvia_meta: (m) => ({ ambiente: txt(m.ambiente) }),
  radar_sources: (s) => ({ titulo: txt(s.titulo), instituicao: txt(s.instituicao), url: txt(s.url), metodo: txt(s.metodo), estado: txt(s.estado), ativa: bool(s.ativa), ultima_consulta: ts(s.ultimaConsulta) }),
  radar_snapshots: (s) => ({ source_id: txt(s.sourceId), chave: txt(s.chave), versao: int(s.versao), hash: txt(s.hash), coletado_em: ts(s.coletadoEm) }),
  radar_programs: (p) => ({ universidade_id: txt(p.universidadeId), nome: txt(p.nome), codigo: txt(p.codigo), tipo_titulo: txt(p.tipoTitulo), source_id: txt(p.sourceId), verificado_em: ts(p.verificadoEm) }),
  radar_opportunities: (o) => ({ program_id: txt(o.programId), universidade_id: txt(o.universidadeId), tipo: txt(o.tipo), ano_academico: txt(o.anoAcademico), procedimento_id: txt(o.procedimentoId), criada_em: ts(o.criadaEm) }),
  radar_windows: (w) => ({ procedimento_id: txt(w.procedimentoId), ano_academico: txt(w.anoAcademico), fase: int(w.fase), abertura: txt(w.abertura), encerramento: txt(w.encerramento), source_id: txt(w.sourceId) }),
  radar_events: (e) => ({ procedimento_id: txt(e.procedimentoId), ano_academico: txt(e.anoAcademico), fase: int(e.fase), tipo: txt(e.tipo), inicio: txt(e.inicio), fim: txt(e.fim), source_id: txt(e.sourceId) }),
  radar_availability: (a) => ({ opportunity_id: txt(a.opportunityId) }),
  radar_revisions: (r) => ({ entidade: txt(r.entidade), entidade_id: txt(r.entidadeId), campo: txt(r.campo), em: ts(r.em) }),
  radar_reviews: (r) => ({ tipo: txt(r.tipo), source_id: txt(r.sourceId), status: txt(r.status), criada_em: ts(r.criadaEm) }),
  radar_runs: (r) => ({ source_id: txt(r.sourceId), inicio: ts(r.inicio), fim: ts(r.fim), resultado: txt(r.resultado) }),
  radar_subscriptions: (s) => ({ user_id: txt(s.userId), opportunity_id: txt(s.opportunityId), ativa: bool(s.ativa), criada_em: ts(s.criadaEm) }),
  radar_alerts: (a) => ({ user_id: txt(a.userId), subscription_id: txt(a.subscriptionId), opportunity_id: txt(a.opportunityId) }),
  radar_agenda_links: (l) => ({ user_id: txt(l.userId), planner_event_id: txt(l.plannerEventId), opportunity_id: txt(l.opportunityId) }),
};

// ---------------------------------------------------------------- coleções em memória

/** Coleção sobre uma lista de objetos com `id`. `getList` é chamado a cada uso (o código pode reatribuir a lista). */
export function arrayCollection(table, getList, setList) {
  return {
    table,
    entries() {
      const seen = new Map();
      for (const item of getList()) if (item && item.id != null) seen.set(String(item.id), item);
      return seen;
    },
    put(id, obj) {
      const list = getList();
      const i = list.findIndex((x) => x && String(x.id) === id);
      if (i >= 0) list[i] = obj; else list.push(obj);
    },
    del(id) {
      setList(getList().filter((x) => !x || String(x.id) !== id));
    },
  };
}

/** Coleção sobre um objeto { chave: valor } (ex.: analytics), com ids derivados das chaves. */
export function mapCollection(table, { entries, put, del }) {
  return { table, entries, put, del };
}

// ---------------------------------------------------------------- comparação estável

// JSON com chaves ordenadas: o jsonb do Postgres reordena chaves, então a comparação não pode depender da ordem.
export function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (typeof value.toJSON === 'function') return stable(value.toJSON()); // Date, Buffer: igual ao JSON.stringify
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stable(v))).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

const MAX_BATCH_OPS = 200;
const MAX_BATCH_BYTES = 2_000_000;

/**
 * Sincronizador de um conjunto de coleções (a base principal usa um, o Radar outro).
 * `order` define a ordem de gravação (chaves estrangeiras): pais primeiro nas inserções, por último nas exclusões.
 */
export function createEntityStore(collections, { label }) {
  const byTable = new Map(collections.map((c) => [c.table, c]));
  const tables = collections.map((c) => c.table);
  const saved = new Map(tables.map((t) => [t, new Map()])); // id -> { json, version, seq }
  let cursor = null; // xmin da última leitura (null = nunca carregou)

  function applyIncoming(changes) {
    const events = [];
    for (const [t, rows] of Object.entries(changes.rows || {})) for (const r of rows) events.push({ kind: 'row', t, ...r });
    for (const d of changes.deleted || []) events.push({ kind: 'del', ...d });
    events.sort((a, b) => Number(a.seq) - Number(b.seq));
    let applied = 0;
    for (const e of events) {
      const col = byTable.get(e.t);
      if (!col) continue;
      const known = saved.get(e.t);
      const id = String(e.id);
      const prev = known.get(id);
      if (prev && prev.seq != null && Number(prev.seq) >= Number(e.seq)) continue; // já aplicado
      if (e.kind === 'del') {
        if (!prev) continue;
        col.del(id);
        known.delete(id);
        applied++;
        continue;
      }
      const json = stable(e.data);
      if (!prev || prev.json !== json) { col.put(id, e.data); applied++; }
      known.set(id, { json, version: Number(e.version), seq: Number(e.seq) });
    }
    if (changes.seq != null) cursor = Math.max(cursor ?? 0, Number(changes.seq));
    return applied;
  }

  /**
   * Carga inicial: traz todas as linhas. Devolve o número de linhas carregadas.
   * Primeiro pega só o cursor (estuvia_changes com p_since no futuro não devolve linhas), depois lê cada tabela
   * em páginas. O que for gravado durante a leitura volta no próximo sync (txid >= cursor); reaplicar é inofensivo.
   */
  async function load({ replace = false } = {}) {
    const head = await rpc('estuvia_changes', { p_since: FAR_FUTURE, p_tables: tables });
    const rows = {};
    let n = 0;
    for (const t of tables) {
      rows[t] = [];
      for (let after = -1; ;) {
        const page = await readEntityPage(t, after, pageRows());
        if (page === null) return loadAllAtOnce();
        rows[t].push(...page);
        n += page.length;
        if (page.length < pageRows()) break;
        after = Number(page.at(-1).ins_seq);
      }
    }
    // Recarga (replace): o que a memória conhece e o banco não tem mais foi excluído por outra instância.
    const deleted = [];
    if (replace) {
      for (const t of tables) {
        const ids = new Set(rows[t].map((r) => r.id));
        for (const id of saved.get(t).keys()) if (!ids.has(id)) deleted.push({ t, id, seq: head.seq });
      }
    }
    applyIncoming({ seq: head.seq, rows, deleted });
    return n;
  }

  // Sem leitor paginado (testes que só simulam as funções SQL): tudo numa chamada, como antes.
  async function loadAllAtOnce() {
    const changes = await rpc('estuvia_changes', { p_since: 0, p_tables: tables });
    let n = 0;
    for (const r of Object.values(changes.rows || {})) n += r.length;
    applyIncoming(changes);
    return n;
  }

  /** Traz o que outras instâncias gravaram desde a última leitura. Devolve quantas mudanças aplicou. */
  async function sync() {
    if (cursor === null) return 0;
    try {
      return applyIncoming(await rpc('estuvia_changes', { p_since: cursor, p_tables: tables }));
    } catch (err) {
      // Mudanças demais desde a última leitura (ex.: importação de todas as fichas do DUA) estouram o tempo-limite
      // de uma consulta só. Sem isto o cursor não avança e a instância fica presa com dados velhos.
      if (!/statement timeout/i.test(err.message)) throw err;
      console.warn(`[${label}] mudanças demais para sincronizar de uma vez; recarregando em páginas.`);
      return load({ replace: true });
    }
  }

  function diff() {
    const upserts = [];
    const deletes = [];
    for (const t of tables) {
      const col = byTable.get(t);
      const known = saved.get(t);
      const current = col.entries();
      for (const [id, obj] of current) {
        const json = stable(obj);
        const prev = known.get(id);
        if (prev && prev.json === json) continue;
        const row = { ...COLUMNS[t](obj, id), data: JSON.parse(json) };
        upserts.push({ op: { t, id, v: prev ? prev.version : null, row }, json, size: json.length });
      }
      for (const [id, prev] of known) if (!current.has(id)) deletes.push({ op: { t, id, v: prev.version, del: true }, size: 64 });
    }
    // Inserções/atualizações na ordem das tabelas (pais antes); exclusões na ordem inversa (filhos antes).
    deletes.reverse();
    return [...upserts, ...deletes];
  }

  /** Grava tudo o que difere da última versão salva. Rejeita em conflito (nada do lote é gravado). */
  async function persist() {
    const pending = diff();
    if (!pending.length) return 0;
    const batches = [];
    let cur = [];
    let bytes = 0;
    for (const p of pending) {
      if (cur.length && (cur.length >= MAX_BATCH_OPS || bytes + p.size > MAX_BATCH_BYTES)) { batches.push(cur); cur = []; bytes = 0; }
      cur.push(p);
      bytes += p.size;
    }
    if (cur.length) batches.push(cur);
    for (const batch of batches) {
      try {
        await rpc('estuvia_apply', { p_ops: batch.map((p) => p.op) });
      } catch (err) {
        // Conflito: o banco recusou o lote inteiro. Desfaz essas mudanças na memória (como a transação fez),
        // senão elas seriam reenviadas e recusadas em toda gravação seguinte. Erros de rede: mantém para tentar de novo.
        if (err.code === 'ESTUVIA_CONFLICT') {
          for (const { op } of batch) {
            const col = byTable.get(op.t);
            const prev = saved.get(op.t).get(op.id);
            if (prev) col.put(op.id, JSON.parse(prev.json)); else col.del(op.id);
          }
        }
        throw err;
      }
      for (const { op, json } of batch) {
        const known = saved.get(op.t);
        if (op.del) known.delete(op.id);
        else known.set(op.id, { json, version: op.v == null ? 1 : op.v + 1, seq: known.get(op.id)?.seq ?? null });
      }
    }
    return pending.length;
  }

  const isEmpty = () => [...saved.values()].every((m) => m.size === 0);

  return { load, sync, persist, isEmpty, tables, label, _saved: saved };
}
