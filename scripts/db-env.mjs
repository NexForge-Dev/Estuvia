// Marcação de ambiente do banco Supabase (separação DEV × PROD, ver docs/28-ambientes-dev-prod.md).
//   npm run db:env -- status                       mostra projeto, ambiente marcado e nº de usuários
//   npm run db:env -- mark development --confirmo  grava estuvia_meta.ambiente = "development"
//   npm run db:env -- mark production --confirmo   idem para produção
// Usa SUPABASE_URL/SUPABASE_SECRET_KEY do .env carregado. Nunca troca uma marcação já existente
// (mudar de ambiente é decisão manual, feita no SQL Editor). Grava pela função estuvia_apply (versão otimista),
// então as instâncias do servidor em execução recebem a mudança na próxima sincronização.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [cmd = 'status', target, flag] = process.argv.slice(2);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL e SUPABASE_SECRET_KEY são necessários.'); process.exit(1); }
const ref = new URL(url).hostname.split('.')[0];
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: row, error } = await db.from('estuvia_meta').select('data,version').eq('id', 'main').maybeSingle();
if (error) {
  console.error(/does not exist|Could not find the table/i.test(error.message)
    ? 'As tabelas de entidades não existem neste projeto: aplique supabase/migrations/0002_entidades.sql.'
    : `Falha ao ler: ${error.message}`);
  process.exit(1);
}
const { count, error: cErr } = await db.from('users').select('id', { count: 'exact', head: true });
if (cErr) { console.error(`Falha ao contar usuários: ${cErr.message}`); process.exit(1); }
const marker = row?.data?.ambiente || null;

if (cmd === 'status') {
  console.log(`Projeto: ${ref}`);
  console.log(`Usuários: ${count ?? 0}`);
  console.log(`Ambiente marcado: ${marker || 'nenhum'}`);
  console.log(`APP_ENV deste .env: ${process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')}`);
  process.exit(0);
}
if (cmd !== 'mark' || !['development', 'production'].includes(target)) {
  console.error('Uso: npm run db:env -- status | mark <development|production> --confirmo');
  process.exit(1);
}
if (flag !== '--confirmo') { console.error(`Confirme com --confirmo: o projeto ${ref} passará a aceitar só servidores com APP_ENV=${target}.`); process.exit(1); }
if (marker === target) { console.log(`Já marcado como "${target}".`); process.exit(0); }
if (marker) { console.error(`O banco já está marcado como "${marker}". Não troco marcações: faça isso conscientemente no SQL Editor.`); process.exit(1); }
const meta = { ...(row?.data || {}), ambiente: target, marcadoEm: new Date().toISOString() };
const { error: err } = await db.rpc('estuvia_apply', {
  p_ops: [{ t: 'estuvia_meta', id: 'main', v: row ? Number(row.version) : null, row: { ambiente: target, data: meta } }],
});
if (err) {
  console.error(/estuvia_conflict/.test(err.message) ? 'A marcação mudou durante a operação (servidor gravando). Tente de novo.' : `Falha ao gravar: ${err.message}`);
  process.exit(1);
}
console.log(`Projeto ${ref} marcado como "${target}".`);
