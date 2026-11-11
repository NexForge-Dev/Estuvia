// Persistência opcional no Supabase para este backend Express.
// Uma tabela por entidade (supabase/migrations/0002_entidades.sql); a tradução coleções ↔ linhas fica em entities.js.

import { config } from './config.js';

const LEGACY_TABLE = 'estuvia_state'; // modelo antigo (0001): só leitura, para importar
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

// ---------------------------------------------------------------- entidades (0002_entidades.sql)

let rpcOverride = null;
/** Apenas para testes: substitui as chamadas ao Supabase (ex.: PGlite executando as mesmas funções SQL). */
export function setRpcForTests(fn) { rpcOverride = fn; }

/** Chama uma função SQL (estuvia_apply / estuvia_changes). Conflitos de versão chegam com código ESTUVIA_CONFLICT. */
export async function rpc(name, args) {
  if (rpcOverride) return rpcOverride(name, args);
  const db = await client();
  if (!db) throw new Error("Supabase não configurado.");
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const err = new Error(/estuvia_conflict/.test(error.message)
      ? `Os dados mudaram em outra instância do servidor. Tente novamente. (${error.message})`
      : `Supabase: ${error.message}`);
    if (/estuvia_conflict/.test(error.message)) err.code = "ESTUVIA_CONFLICT";
    if (/function .*estuvia_(apply|changes).* does not exist|Could not find the function/i.test(error.message)) err.code = "ESTUVIA_NO_SCHEMA";
    throw err;
  }
  return data;
}

let legacyOverride = null;
/** Apenas para testes. */
export function setLegacyReaderForTests(fn) { legacyOverride = fn; }

/**
 * Lê (sem gravar nada) uma linha da tabela antiga estuvia_state ("main" ou "radar"), usada só para importar
 * os dados para as tabelas de entidades na primeira subida. Devolve o estado ou null se não existir.
 */
export async function readLegacyState(id) {
  if (legacyOverride) return legacyOverride(id);
  const db = await client();
  const { data, error } = await db.from(LEGACY_TABLE).select("state").eq("id", id).maybeSingle();
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null; // projeto criado já com a 0002
    throw new Error(`Supabase: ${error.message}`);
  }
  return data?.state ?? null;
}
