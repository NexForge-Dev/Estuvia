import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada, sem rede e sem IA.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RADAR_SCHEDULER = 'off';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
delete process.env.MENTOR_PROVIDER;

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const { initRadar } = await import('../server/radar/service.js');
const { parseFlightLink } = await import('../server/routes/travel.js');

let server;
let base;
before(async () => {
  await initRadar();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

let cookie = '';
const req = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json() };
};
let uid;
let jid;
const say = (mensagem) => req('POST', '/mentor/message', { mensagem, contexto: { journeyId: jid } });

test('setup', async () => {
  const r = await req('POST', '/auth/register', { nome: 'Bia Lima', email: 'bia@viagem.dev', senha: 'segura123', aceite: true });
  uid = r.data.user.id;
  await req('PUT', '/me/profile', { estado: 'PE', paisResidencia: 'Brasil' });
  jid = (await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28', inicioAulas: '2027-09-20' })).data.journey.id;
});

test('painel inicial: destino da jornada, origem sugerida, percursos sem preço inventado', async () => {
  const { status, data } = await req('GET', '/travel');
  assert.equal(status, 200);
  assert.equal(data.status, 'pesquisando');
  assert.equal(data.destino.cidade, 'Granada');
  assert.equal(data.destino.universidade.sigla, 'UGR');
  assert.equal(data.origem.iata, 'REC');
  assert.equal(data.origem.sugerido, true);
  assert.deepEqual(data.percursos.map((p) => p.id), ['via-madri', 'via-malaga', 'via-granada']);
  assert.ok(data.percursos.every((p) => p.precoConhecido === null), 'sem cotação → sem preço (a tela mostra "Preço a consultar")');
  assert.ok(data.percursos.every((p) => p.fontes.length));
  assert.equal(data.itinerario, null);
  assert.match(data.visto.aviso.titulo, /não está confirmado/);
});

test('busca guiada salva só o necessário e gera links de pesquisa contextualizados', async () => {
  const { data } = await req('PUT', '/travel/profile', { origemIata: 'REC', dataIda: '2027-09-10', malas: 2, orcamento: null });
  assert.equal(data.origem.sugerido, false);
  const madri = data.percursos.find((p) => p.id === 'via-madri');
  assert.ok(madri.busca.some((b) => b.url.includes('skyscanner') && b.url.includes('/rec/mad/270910/')));
  assert.equal((await req('PUT', '/travel/profile', { origemIata: 'XXX' })).status, 400);
});

test('link colado: lê só o que está na URL (sem buscar o site)', () => {
  assert.deepEqual(parseFlightLink('https://www.skyscanner.com.br/transporte/passagens-aereas/rec/mad/270901/').extraido, ['origem', 'destino', 'data']);
  const k = parseFlightLink('https://www.kayak.com.br/flights/REC-AGP/2027-09-01?sort=bestflight_a');
  assert.equal(k.destino, 'AGP');
  assert.equal(k.percursoId, 'via-malaga');
  assert.deepEqual(parseFlightLink('https://www.google.com/travel/flights?tfs=abc').extraido, []);
});

test('cotações: poucos campos, desconhecido ≠ zero, incompleta não vira a "mais barata"', async () => {
  let r = await req('POST', '/travel/quotes', { rota: 'Recife → Madri → Granada', percursoId: 'via-madri', voo: 650, bagagem: 80, terrestre: 35, dataViagem: '2027-09-10', link: 'https://www.skyscanner.com.br/x' });
  assert.equal(r.status, 201);
  r = await req('POST', '/travel/quotes', { rota: 'Recife → Málaga → Granada', percursoId: 'via-malaga', voo: 600, dataViagem: '2027-09-10', conexoes: 2, horarioChegada: '23:30', bilhetesSeparados: true });
  r = await req('POST', '/travel/quotes', { rota: 'Só sei o nome', dataViagem: '2027-09-10' });
  const d = r.data;
  assert.equal(d.status, 'cotacao');
  const [madri, malaga, semPreco] = d.cotacoes;
  assert.equal(madri.custo.total, 765);
  assert.equal(madri.custo.completo, true);
  assert.equal(madri.diferencaParaMenor, 0, 'a mais barata entre as COMPLETAS');
  assert.equal(malaga.custo.completo, false);
  assert.deepEqual(malaga.custo.desconhecidas, ['bagagem', 'terrestre']);
  assert.equal(malaga.diferencaParaMenor, -165, 'mostra a diferença, mas não ganha "menor custo"');
  assert.ok(malaga.consideracoes.some((c) => c.nivel === 'risco'), 'bilhetes separados');
  assert.ok(malaga.consideracoes.some((c) => /23:30/.test(c.texto)), 'chegada tarde → pernoite');
  assert.equal(semPreco.custo.total, null, 'sem preço: null, nunca 0');
  assert.equal(semPreco.voo, null);
  assert.equal(d.percursos.find((p) => p.id === 'via-madri').precoConhecido.total, 765);
});

test('escolher rota: itinerário até a moradia, chegada pela rota, custo estimado no financeiro', async () => {
  let { data } = await req('GET', '/travel');
  const madri = data.cotacoes.find((c) => c.percursoId === 'via-madri');
  data = (await req('POST', `/travel/quotes/${madri.id}/choose`)).data;
  assert.equal(data.status, 'escolhida');
  assert.equal(data.itinerario.etapas.at(-1).meio, 'local');
  assert.equal(data.itinerario.etapas.at(-1).status, 'a-definir', 'sem moradia escolhida');
  assert.equal(data.chegada.aeroporto, 'MAD');
  assert.match(data.chegada.frase, /Madri e precisa seguir até Granada/);
  assert.equal(data.financeiro.status, 'estimado', 'cotação ≠ compra');
  assert.equal(Math.round(data.financeiro.valorEur), 765);
  // Moradia escolhida no "Meu novo lar" é reaproveitada no último trecho.
  await req('POST', '/living/housing', { nome: 'Quarto no Realejo', tipo: 'quarto', bairro: 'Realejo', aluguel: 300, status: 'escolhida' });
  data = (await req('GET', '/travel')).data;
  assert.match(data.itinerario.etapas.at(-1).para, /Quarto no Realejo/);
  assert.equal(data.chegada.moradia.nome, 'Quarto no Realejo');
});

test('agenda: cria só o que foi confirmado, sem duplicar; mudança de data vira proposta', async () => {
  let { data } = await req('GET', '/travel');
  assert.equal(data.agenda.sugestoes.base, '2027-09-10');
  assert.equal(data.agenda.sugestoes.itens.find((i) => i.chave === 'voo').horarioConhecido, false, 'horário do voo não é inventado');
  const before = (users.findById(uid).planner || []).length;
  data = (await req('POST', '/travel/agenda', { itens: [{ chave: 'bagagem', data: '2027-09-07', inicio: '19:00', fim: '20:30', titulo: 'Preparar a bagagem' }] })).data;
  data = (await req('POST', '/travel/agenda', { itens: [{ chave: 'bagagem', data: '2027-09-07', inicio: '19:00', fim: '20:30', titulo: 'Preparar a bagagem' }] })).data;
  const planner = users.findById(uid).planner;
  assert.equal(planner.length, before + 1, 'não duplica');
  assert.equal(planner.at(-1).origem, 'viagem');
  // Voo remarcado: a agenda NÃO muda sozinha.
  data = (await req('PUT', `/travel/quotes/${data.escolhida.id}`, { dataViagem: '2027-09-12' })).data;
  assert.equal(data.agenda.alteracoes.length, 1);
  assert.equal(data.agenda.alteracoes[0].novaData, '2027-09-09');
  assert.equal(users.findById(uid).planner.at(-1).data, '2027-09-07');
  data = (await req('POST', '/travel/agenda/changes', { aceitar: [data.agenda.alteracoes[0].eventId] })).data;
  assert.equal(users.findById(uid).planner.at(-1).data, '2027-09-09');
  assert.equal(data.agenda.alteracoes.length, 0);
});

test('comprar: exige confirmação; custo vira confirmado; status "comprada"', async () => {
  const { data } = await req('GET', '/travel');
  assert.equal((await req('POST', `/travel/quotes/${data.escolhida.id}/purchase`, { comprada: true })).status, 400);
  const r = await req('POST', `/travel/quotes/${data.escolhida.id}/purchase`, { comprada: true, tarifa: 'flexivel', confirmo: true });
  assert.equal(r.data.status, 'comprada');
  assert.equal(r.data.financeiro.status, 'confirmado');
});

test('rotas antigas /living/travel continuam funcionando', async () => {
  const r = await req('POST', '/living/travel/routes', { rota: 'Recife → Granada (cotação antiga)', voo: 900 });
  assert.equal(r.status, 201);
  const d = (await req('GET', '/travel')).data;
  assert.ok(d.cotacoes.some((c) => c.rota.includes('cotação antiga')));
});

test('Mentor consulta a viagem salva e não inventa preço nem horário', async () => {
  const tools = (await req('GET', '/mentor/tools')).data.ferramentas.map((t) => t.name);
  assert.ok(tools.includes('get_travel_plan'));
  let r = await say('Compensa mais ir por Madri ou Málaga?');
  assert.equal(r.data.intencao, 'viagem-rota');
  r = await say('Quanto vou gastar com bagagem?');
  assert.equal(r.data.intencao, 'viagem-bagagem');
  assert.match(r.data.texto, /€ 80/);
  assert.match(r.data.texto, /não foi informada/);
  r = await say('Essa conexão é muito curta?');
  assert.equal(r.data.intencao, 'viagem-conexao');
  assert.match(r.data.texto, /Não tenho o tempo exato de conexão/);
  r = await say('Como chego do aeroporto até minha casa?');
  assert.equal(r.data.intencao, 'viagem-chegada');
  assert.match(r.data.texto, /Quarto no Realejo/);
  r = await say('Minha passagem mudou, reorganiza minha viagem.');
  assert.equal(r.data.intencao, 'viagem-mudou');
  r = await say('Qual é a melhor forma de chegar a Granada?');
  assert.equal(r.data.intencao, 'viagem-rota');
  assert.ok(r.data.cartoes.some((c) => c.tipo === 'viagem'));
});
