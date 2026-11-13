// Lista (e, só com --aplicar, invalida) revisões do Radar que registram "mudança" sem mudança: valor anterior
// igual ao novo. Caso conhecido: 37 revisões de 13/11/2026 criadas antes da correção da ordem das chaves do jsonb
// (commit e9c740a). Invalidar = marcar como registrada por engano; nada é apagado (continua no histórico).
//
// Uso (somente leitura, padrão):  ESTUVIA_URL=... ESTUVIA_ADMIN_EMAIL=... ESTUVIA_ADMIN_PASSWORD=... node scripts/radar-invalidar-revisoes.mjs
// Aplicar (pede aprovação antes):  node scripts/radar-invalidar-revisoes.mjs --aplicar
const aplicar = process.argv.includes('--aplicar');
const base = (process.env.ESTUVIA_URL || '').trim().replace(/\/+$/, '');
const email = (process.env.ESTUVIA_ADMIN_EMAIL || '').trim();
const senha = (process.env.ESTUVIA_ADMIN_PASSWORD || '').replace(/[\r\n]+$/, '');
if (!base || !email || !senha) { console.error('Defina ESTUVIA_URL, ESTUVIA_ADMIN_EMAIL e ESTUVIA_ADMIN_PASSWORD.'); process.exit(1); }
let cookie = '';
const call = async (method, url, body) => {
  const res = await fetch(`${base}/api${url}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const login = await call('POST', '/auth/login', { email, senha });
if (login.status !== 200) { console.error(`Login recusado (${login.status}).`); process.exit(1); }
const { data } = await call('GET', '/radar/admin/revisions/suspeitas');
const lista = data.revisoes || [];
console.log(`${lista.length} revisão(ões) com antes = depois:`);
for (const r of lista) console.log(`  ${r.em}  ${r.entidadeId}  ${r.campo}  [${String(r.anterior).slice(0, 60)}]  por ${r.por}  id ${r.id}`);
if (!aplicar) { console.log('\nNada foi alterado (somente leitura). Para invalidar, rode com --aplicar.'); process.exit(0); }
let ok = 0;
for (const r of lista) {
  const x = await call('POST', `/radar/admin/revisions/${r.id}/invalidate`, { motivo: 'Alteração falsa: antes e depois iguais (ordem das chaves do jsonb; corrigido em e9c740a). Mantida no histórico como invalidada.' });
  if (x.status === 200) ok += 1; else console.error(`  falhou ${r.id}: HTTP ${x.status} ${x.data.error || ''}`);
}
console.log(`${ok} de ${lista.length} invalidada(s). Nenhuma foi apagada.`);
if (ok < lista.length) process.exitCode = 1;
