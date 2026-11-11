// Marcação de ambiente do banco Supabase (separação DEV × PROD, ver docs/28-ambientes-dev-prod.md).
//   npm run db:env -- status                       mostra projeto, ambiente marcado e nº de usuários
//   npm run db:env -- mark development --confirmo  grava state.meta.ambiente = "development"
//   npm run db:env -- mark production --confirmo   idem para produção
// Usa SUPABASE_URL/SUPABASE_SECRET_KEY do .env carregado. Nunca troca uma marcação já existente
// (mudar de ambiente é decisão manual, feita no SQL Editor). A gravação usa a versão otimista da linha.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [cmd = 'status', target, flag] = process.argv.slice(2);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL e SUPABASE_SECRET_KEY são necessários.'); process.exit(1); }
const ref = new URL(url).hostname.split('.')[0];
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: row, error } = await db.from('estuvia_state').select('state,version').eq('id', 'main').maybeSingle();
if (error) { console.error(`Falha ao ler: ${error.message}`); process.exit(1); }
const marker = row?.state?.meta?.ambiente || null;

if (cmd === 'status') {
  console.log(`Projeto: ${ref}`);
  console.log(`Linha main: ${row ? `versão ${row.version}, ${(row.state.users || []).length} usuário(s)` : 'ainda não existe (o servidor cria na 1ª execução)'}`);
  console.log(`Ambiente marcado: ${marker || 'nenhum'}`);
  console.log(`APP_ENV deste .env: ${process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')}`);
  process.exit(0);
}
if (cmd !== 'mark' || !['development', 'production'].includes(target)) {
  console.error('Uso: npm run db:env -- status | mark <development|production> --confirmo');
  process.exit(1);
}
if (flag !== '--confirmo') { console.error(`Confirme com --confirmo: o projeto ${ref} passará a aceitar só servidores com APP_ENV=${target}.`); process.exit(1); }
if (!row) { console.error('A linha main ainda não existe: suba o servidor uma vez neste banco antes de marcar.'); process.exit(1); }
if (marker === target) { console.log(`Já marcado como "${target}".`); process.exit(0); }
if (marker) { console.error(`O banco já está marcado como "${marker}". Não troco marcações: faça isso conscientemente no SQL Editor.`); process.exit(1); }
const state = { ...row.state, meta: { ...(row.state.meta || {}), ambiente: target, marcadoEm: new Date().toISOString() } };
const { data: saved, error: err } = await db.from('estuvia_state').update({ state, version: Number(row.version) + 1, updated_at: new Date().toISOString() })
  .eq('id', 'main').eq('version', row.version).select('version').maybeSingle();
if (err) { console.error(`Falha ao gravar: ${err.message}`); process.exit(1); }
if (!saved) { console.error('A linha mudou durante a operação (servidor gravando). Tente de novo.'); process.exit(1); }
console.log(`Projeto ${ref} marcado como "${target}" (versão ${saved.version}).`);
console.log('Atenção: servidores em execução com a versão anterior em memória vão falhar na próxima gravação (conflito de versão) e precisam ser reiniciados.');
