// Avança a jornada de demonstração pelas APIs reais: conclui as missões da Rodada 1 e parte da 2.
import { launch, api, demoAccount, BASE } from './lib.mjs';
const acc = demoAccount();
const { browser, page } = await launch();
await page.goto(BASE);
const a = api(page);
await a.post('/auth/login', { email: acc.email, senha: acc.senha });
const jid = (await a.get('/journeys')).journeys[0].id;

async function finish(mid) {
  let m = (await a.get(`/journeys/${jid}/missions/${mid}`));
  m = m.mission || m;
  if (m.status === 'concluida') return console.log(mid, 'já concluída');
  for (const o of m.objetivos) {
    if (o.feito || o.tipo === 'auto') continue;
    let body = { feito: true };
    if (o.opcoes?.length) body = { valor: Array.isArray(o.opcoes[0]) ? o.opcoes[0][0] : (o.opcoes[0].id ?? o.opcoes[0].valor ?? o.opcoes[0]) };
    else if (o.tipo === 'data') body = { valor: '2026-11-05' };
    else if (o.tipo === 'texto') body = { valor: 'Registrado na demonstração' };
    try { await a.put(`/journeys/${jid}/missions/${mid}/objectives/${o.id}`, body); }
    catch (e) { console.log(' obj', mid, o.id, o.tipo, JSON.stringify(o.opcoes)?.slice(0, 120), e.message.slice(0, 160)); }
  }
  try { await a.post(`/journeys/${jid}/missions/${mid}/complete`, { confirmo: true }); console.log(mid, 'concluída'); }
  catch (e) { console.log(mid, 'não concluiu:', e.message.slice(0, 200)); }
}
const targets = process.argv.slice(2);
for (const mid of targets) await finish(mid);
const j = (await a.get(`/journeys/${jid}`)).journey;
console.log('progresso', Math.round(j.progresso * 100) + '%', 'rodada atual', j.rodadaAtual?.numero ?? j.rodadaAtual, 'próxima', j.proximaMissao?.label);
console.log(j.rodadas.map((r) => r.numero + ':' + r.status + ' ' + (r.missoes || []).map((m) => m.id + '/' + m.status).join(',')).join('\n'));
await browser.close();
