// Persistência opcional no Supabase para este backend Express.
// O estado atual do MVP é JSON; cada domínio usa uma linha JSONB com controle otimista de versão.

import { config } from './config.js';

const TABLE = 'estuvia_state';
let clientPromise = null;

export const usesSupabase = () => config.databaseProvider === 'supabase';

export const projectRef = (url) => { try { return new URL(url).hostname.split('.')[0]; } catch { return ''; } };

/**
 * Isolamento DEV × PROD (função pura, coberta por testes).
 * 1) Pela URL: o ambiente não pode apontar para o projeto Supabase reservado ao outro.
 * 2) Pela marcação gravada no próprio banco (state.meta.ambiente): banco marcado para um ambiente
 *    nunca é aberto por outro. Banco sem marcação: produção só se marca sozinha se estiver VAZIA
 *    (projeto novo); nos demais casos só avisa (marcar é um passo explícito: npm run db:env -- mark).
 * Retorna { ok, erro?, aviso?, marcar? }.
 */
export function checkDatabaseEnvironment({ appEnv, ref, prodRef, devRef, marker, users = 0 }) {
  if (appEnv !== 'production' && prodRef && ref === prodRef) return { ok: false, erro: `Ambiente "${appEnv}" apontando para o banco de PRODUÇÃO (${ref}). Use o projeto de desenvolvimento no .env.` };
  if (appEnv === 'production' && devRef && ref === devRef) return { ok: false, erro: `Produção apontando para o banco de DESENVOLVIMENTO (${ref}). Configure o projeto de produção nas variáveis do servidor.` };
  if (marker && marker !== appEnv) return { ok: false, erro: `O banco ${ref} está marcado como "${marker}" e este servidor roda como "${appEnv}". Nada foi lido nem gravado.` };
  if (marker) return { ok: true };
  if (appEnv === 'production' && users === 0) return { ok: true, marcar: 'production' };
  return { ok: true, aviso: `Banco ${ref} sem marcação de ambiente. Depois de separar DEV e PROD, marque-o: npm run db:env -- mark ${appEnv}` };
}

/** Barreira por URL aplicada a TODO cliente Supabase (banco e Storage), antes de qualquer acesso. */
export function assertProjectAllowed() {
  const r = checkDatabaseEnvironment({ appEnv: config.appEnv, ref: projectRef(config.supabaseUrl), prodRef: config.supabaseProdRef, devRef: config.supabaseDevRef, marker: null, users: 1 });
  if (!r.ok) throw new Error(`[ambiente] ${r.erro}`);
}

async function client() {
  if (!usesSupabase()) return null;
  if (!config.supabaseUrl) throw new Error('SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) não definido.');
  assertProjectAllowed();
  if (!config.supabaseSecretKey) throw new Error('SUPABASE_SECRET_KEY não definido. Use a chave secret do projeto; nunca a publishable key.');
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
  return clientPromise;
}

async function readRow(db, id) {
  const { data, error } = await db.from(TABLE).select('state,version').eq('id', id).maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data || null;
}

/** Carrega uma linha; na primeira execução migra a cópia JSON local sem apagá-la. */
export async function loadState(id, fallback) {
  if (!usesSupabase()) return { state: fallback, version: null };
  const db = await client();
  const row = await readRow(db, id);
  if (row) return { state: row.state, version: Number(row.version) };

  const { data, error } = await db.from(TABLE).insert({ id, state: fallback, version: 1 }).select('state,version').single();
  if (!error) return { state: data.state, version: Number(data.version) };
  // Outro processo pode ter inicializado a linha entre o SELECT e o INSERT.
  if (error.code === '23505') {
    const raced = await readRow(db, id);
    if (raced) return { state: raced.state, version: Number(raced.version) };
  }
  throw new Error(`Supabase: ${error.message}`);
}

/** Salva somente se a versão ainda for a que este processo carregou, evitando sobrescritas silenciosas. */
export async function saveState(id, state, expectedVersion) {
  if (!usesSupabase()) return null;
  const db = await client();
  const nextVersion = expectedVersion + 1;
  const { data, error } = await db.from(TABLE)
    .update({ state, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select('version')
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!data) throw new Error(`Conflito ao salvar ${id} no Supabase: a linha mudou em outra instância. Reinicie o servidor para recarregar a versão atual.`);
  return Number(data.version);
}
