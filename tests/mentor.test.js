import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada, Radar com o HTML oficial salvo, sem rede e sem IA: o Mentor roda no Modo Guiado.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mentor-'));
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
const { setProvider } = await import('../server/mentor/providers/index.js');
const { parseDate, parseMoney, parseTime, matchMission } = await import('../server/mentor/parse.js');
const { retrieve } = await import('../server/mentor/knowledge.js');

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

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}

let req;
let jid;
let uid;
const say = (mensagem, contexto = {}) => req('POST', '/mentor/message', { mensagem, contexto: { journeyId: jid, ...contexto } });
const confirm = (p, body) => req('POST', `/mentor/actions/${p.id}/confirm`, body || {});
const plannerCount = () => (users.findById(uid).planner || []).length;

test('setup: estudante com perfil e jornada', async () => {
  req = client();
  const r = await req('POST', '/auth/register', { nome: 'Ana Souza', email: 'ana@mentor.dev', senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal(r.status, 201);
  uid = r.data.user.id;
  await req('PUT', '/me/profile', { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'BA', formacao: 'Ciência da Computação', area: 'Computação', espanhol: 'B1', onboardingConcluido: true });
  const j = await req('POST', '/journeys', { programaId: 'ugr-demo-eng', anoAcademico: '2027/28' });
  assert.equal(j.status, 201);
  jid = j.data.journey.id;
  // Estudante que já escolheu o mestrado e fez o planejamento inicial: Rodada 2 (documentos) liberada.
  assert.equal((await req('POST', `/journeys/${jid}/prior-progress`, { etapa: 'mestrado-escolhido', confirmo: true })).status, 200);
  await users.update(uid, (u) => { u.journeys[0].missions['1.5'] = { objetivos: {}, concluidaEm: new Date().toISOString(), declarada: true }; });
  const jj = await req('GET', `/journeys/${jid}`);
  assert.ok(jj.data.journey.rodadas.find((r) => r.numero === 2).desbloqueada);
});

// ---------- Unidades: interpretação determinística ----------

test('parse: datas relativas, horários e valores', () => {
  const today = '2026-10-24'; // sábado
  assert.equal(parseDate('amanhã', today), '2026-10-25');
  assert.equal(parseDate('sexta-feira', today), '2026-10-30');
  assert.equal(parseDate('dia 05/11', today), '2026-11-05');
  assert.equal(parseDate('dia 3 de janeiro', today), '2027-01-03', 'data passada sem ano vai para o próximo ano');
  assert.equal(parseTime('às 10h'), '10:00');
  assert.equal(parseTime('14:30'), '14:30');
  assert.deepEqual(parseMoney('tenho €2.000 guardados'), { valor: 2000, moeda: 'EUR' });
  assert.deepEqual(parseMoney('R$ 3.500,50'), { valor: 3500.5, moeda: 'BRL' });
  assert.deepEqual(parseMoney('3 mil euros'), { valor: 3000, moeda: 'EUR' });
  assert.equal(parseMoney('dia 12'), null, 'número solto não é dinheiro');
  assert.equal(matchMission('solicitar meu histórico').id, '2.3');
  assert.equal(matchMission('conferir meu visto').id, '5.9', 'Missão 5.9 — Conferir o visto aprovado');
  assert.equal(matchMission('pedir o visto').id, '5.7');
});

test('base de conhecimento: trechos com procedência e natureza', () => {
  const r = retrieve('preciso homologar meu diploma');
  assert.ok(r.length);
  const c = r[0].chunk;
  assert.ok(['oficial', 'pratica', 'experiencia', 'estimativa'].includes(c.natureza));
  assert.ok('verificadoEm' in c && 'confirmacao' in c && 'fonte' in c);
});

// ---------- Estado inicial e ferramentas ----------

test('GET /mentor: Modo Guiado identificado, sem fingir IA generativa', async () => {
  const r = await req('GET', '/mentor');
  assert.equal(r.status, 200);
  assert.equal(r.data.modo, 'guiado');
  assert.match(r.data.nome, /Modo Guiado/);
  assert.equal(r.data.acoesRapidas.length, 10);
  const t = await req('GET', '/mentor/tools');
  const names = t.data.ferramentas.map((f) => f.name);
  for (const n of ['get_user_journey', 'get_current_mission', 'get_pending_missions', 'get_user_availability', 'get_calendar_events', 'propose_weekly_schedule', 'create_calendar_event', 'update_calendar_event', 'get_financial_summary', 'calculate_financial_gap', 'update_financial_resource', 'search_scholarships', 'search_master_programs', 'get_verified_deadlines', 'subscribe_to_opportunity', 'get_required_documents', 'update_mission_progress', 'draft_email', 'get_housing_options', 'compare_housing_options', 'get_official_sources']) {
    assert.ok(names.includes(n), `ferramenta ${n}`);
  }
  assert.ok(t.data.ferramentas.every((f) => f.entrada.type === 'object' && f.saida && f.efeito));
  assert.ok(t.data.ferramentas.filter((f) => f.efeito === 'escrita').every((f) => f.confirmacao));
  assert.equal(await (await req('GET', '/mentor')).status, 200);
  assert.equal((await client()('POST', '/mentor/message', { mensagem: 'oi' })).status, 401, 'exige login');
});

// ---------- Agenda: proposta → confirmação → evento real ----------

test('"Agenda para amanhã a tarefa de solicitar meu histórico": propõe, não grava antes, cria depois', async () => {
  const before = plannerCount();
  const r = await say('Agenda para amanhã a tarefa de solicitar meu histórico.');
  assert.equal(r.status, 200);
  assert.equal(r.data.intencao, 'agendar');
  assert.ok(r.data.proposta, 'devolve uma proposta');
  assert.match(r.data.texto, /Missão 2\.3/);
  assert.match(r.data.texto, /Confirma\?/);
  assert.equal(plannerCount(), before, 'nada gravado antes da confirmação');
  // A proposta fica no registro do estudante (persistido), não na memória do processo:
  // na Vercel, a confirmação pode chegar a outra instância.
  assert.ok(users.findById(uid).mentorPropostas?.[r.data.proposta.id], 'proposta gravada no estudante');
  const c = await confirm(r.data.proposta);
  assert.equal(c.status, 200);
  assert.equal(c.data.ok, true);
  assert.equal(users.findById(uid).mentorPropostas?.[r.data.proposta.id], undefined, 'confirmada sai do registro');
  assert.equal(plannerCount(), before + 1);
  const ev = users.findById(uid).planner.at(-1);
  assert.equal(ev.missaoId, '2.3');
  assert.equal(ev.origem, 'mentor');
  assert.match(c.data.texto, /Pronto/);
  // Uso único: a mesma proposta não executa duas vezes.
  const again = await confirm(r.data.proposta);
  assert.equal(again.status, 410);
  assert.equal(plannerCount(), before + 1);
});

test('"Marca para sexta-feira às 10h a tarefa de conferir meu visto": missão bloqueada não é agendada', async () => {
  const r = await say('Marca para sexta-feira às 10h a tarefa de conferir meu visto');
  assert.equal(r.data.intencao, 'agendar');
  assert.equal(r.data.proposta, null);
  assert.match(r.data.texto, /bloqueada/);
});

test('tarefa livre com horário + "passe essa tarefa para sexta" move o compromisso', async () => {
  const r = await say('Agende para amanhã às 15h a tarefa de ligar para a secretaria da faculdade');
  assert.ok(r.data.proposta);
  assert.match(r.data.texto, /15h/);
  await confirm(r.data.proposta);
  const ev = { ...users.findById(uid).planner.at(-1) }; // cópia: a base é mutada no lugar
  assert.equal(ev.inicio, '15:00');
  const m = await say('Passe essa tarefa para depois de amanhã.');
  assert.equal(m.data.intencao, 'mover-evento');
  assert.ok(m.data.proposta, m.data.texto);
  const c = await confirm(m.data.proposta);
  assert.equal(c.data.ok, true);
  const moved = users.findById(uid).planner.find((e) => e.id === ev.id);
  const next = new Date(`${ev.data}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  assert.equal(moved.data, next.toISOString().slice(0, 10), 'um dia depois');
  assert.equal(moved.inicio, '15:00', 'mantém o horário');
});

test('proposta vencida (30 min) não executa nem aparece', async () => {
  const before = plannerCount();
  const r = await say('Agende para amanhã a Missão 2.1');
  assert.ok(r.data.proposta);
  users.findById(uid).mentorPropostas[r.data.proposta.id].expiraEm = Date.now() - 1000;
  assert.equal((await req('GET', `/mentor/actions/${r.data.proposta.id}`)).status, 404);
  assert.equal((await confirm(r.data.proposta)).status, 410);
  assert.equal(plannerCount(), before);
  assert.equal(users.findById(uid).mentorPropostas[r.data.proposta.id], undefined, 'a limpeza remove a vencida');
});

test('cancelar proposta não altera nada e fica no histórico do estudante', async () => {
  const before = plannerCount();
  const r = await say('Agende para amanhã a Missão 2.1');
  assert.ok(r.data.proposta);
  await req('POST', `/mentor/actions/${r.data.proposta.id}/cancel`);
  assert.equal(plannerCount(), before);
  assert.equal((await confirm(r.data.proposta)).status, 410);
  const mem = await req('GET', '/mentor/memory');
  assert.ok(mem.data.historico.some((h) => h.resultado === 'cancelada'));
  assert.ok(mem.data.historico.some((h) => h.resultado === 'executada' && h.ferramenta === 'create_calendar_event'));
});

test('"Organize minha semana": proposta visual, edição antes de salvar, eventos agenda-ai', async () => {
  const r = await say('Organiza minha semana');
  assert.equal(r.data.intencao, 'semana');
  if (!r.data.proposta) { assert.match(r.data.texto, /horários livres|missões liberadas/); return; }
  const card = r.data.cartoes.find((c) => c.tipo === 'agenda-semana');
  assert.ok(card.itens.length >= 1);
  const before = plannerCount();
  const first = r.data.proposta.passos[0];
  assert.equal(first.ferramenta, 'create_calendar_event');
  // O estudante mantém só o primeiro bloco.
  const itens = card.itens.slice(0, 1).map(({ titulo, categoria, data, inicio, fim, journeyId, missaoId, prioridade, motivo }) => ({ titulo, categoria, data, inicio, fim, journeyId, missaoId, prioridade, motivo }));
  const c = await confirm(r.data.proposta, { edicoes: { 0: { itens } } });
  assert.equal(c.data.ok, true, c.data.texto);
  assert.equal(plannerCount(), before + 1);
  assert.equal(users.findById(uid).planner.at(-1).origem, 'agenda-ai');
});

test('"Quais são minhas pendências de amanhã?" consulta a agenda real', async () => {
  const r = await say('Quais são minhas pendências de amanhã?');
  assert.equal(r.data.intencao, 'pendencias-dia');
  const card = r.data.cartoes.find((c) => c.tipo === 'eventos');
  assert.ok(card.eventos.some((e) => e.missaoId === '2.3'), 'mostra o evento criado antes');
});

// ---------- Missões: regras do backend preservadas ----------

test('"Qual é minha próxima missão?" e missões pendentes vêm do motor da jornada', async () => {
  const r = await say('Qual é a minha próxima missão?');
  assert.equal(r.data.intencao, 'proximo');
  assert.ok(r.data.cartoes.find((c) => c.tipo === 'missao'));
  const p = await say('Quais missões faltam?');
  assert.equal(p.data.intencao, 'missoes');
  assert.ok(p.data.cartoes[0].grupos.length);
});

test('"Terminei de preparar meu passaporte": conclui pela regra do motor, com documento', async () => {
  const r = await say('Terminei de preparar meu passaporte.');
  assert.equal(r.data.intencao, 'terminei');
  assert.ok(r.data.proposta, r.data.texto);
  const tools = r.data.proposta.passos.map((s) => s.ferramenta);
  assert.ok(tools.includes('update_document_status'));
  assert.ok(tools.includes('update_mission_progress'));
  const c = await confirm(r.data.proposta);
  assert.equal(c.data.ok, true, c.data.texto);
  const u = users.findById(uid);
  assert.equal(u.documents.passaporte, 'pronto');
  assert.ok(u.journeys[0].missions['2.1'].concluidaEm);
  const evs = c.data.resultados.flatMap((x) => x.dados?.eventos || []);
  assert.ok(evs.some((e) => e.tipo === 'missao-concluida'));
});

test('dependência obrigatória não é ignorada; evidência obrigatória é exigida', async () => {
  // 3.6 depende de missões anteriores: o motor recusa e o Mentor explica.
  const r = await say('Terminei a missão 3.6, comprovante ABC123');
  assert.equal(r.data.proposta?.passos.some((s) => s.ferramenta === 'update_mission_progress') ?? false, false);
  assert.match(r.data.texto, /bloqueada|não dá para concluir|Ainda não/i);
  // Chamada direta à ferramenta pelo orquestrador também respeita a regra (camada de segurança).
  const { useTool, makeCtx } = await import('../server/mentor/tools/index.js');
  const t = await useTool(makeCtx(users.findById(uid), { journeyId: jid }), 'update_mission_progress', { journeyId: jid, missaoId: '3.6', operacao: 'concluir' });
  assert.equal(t.ok, false);
  assert.ok(['evidencia', 'regra'].includes(t.erro.codigo));
});

test('"Estou esperando meu diploma ficar pronto" marca aguardando terceiros', async () => {
  const r = await say('Estou esperando meu diploma ficar pronto.');
  assert.equal(r.data.intencao, 'aguardando');
  assert.ok(r.data.proposta);
  await confirm(r.data.proposta);
  assert.equal(users.findById(uid).journeys[0].missions['2.2'].aguardando, true);
});

test('memória: "não consegui meu histórico" → lembrar → "consegui o histórico" retoma o contexto', async () => {
  const r = await say('Não consegui meu histórico acadêmico.');
  assert.equal(r.data.intencao, 'nao-consegui');
  assert.match(r.data.texto, /portal acadêmico/);
  assert.equal(r.data.proposta.passos[0].ferramenta, 'remember_note');
  await confirm(r.data.proposta);
  assert.equal((await req('GET', '/mentor/memory')).data.notas.filter((n) => !n.resolvidaEm).length, 1);
  const r2 = await say('Consegui o histórico!');
  assert.equal(r2.data.intencao, 'terminei');
  assert.match(r2.data.texto, /tinha me contado/);
  const tools = r2.data.proposta.passos.map((s) => s.ferramenta);
  assert.ok(tools.includes('resolve_note'));
  assert.ok(tools.includes('update_document_status'));
  const c = await confirm(r2.data.proposta);
  assert.equal(c.data.ok, true, c.data.texto);
  assert.equal((await req('GET', '/mentor/memory')).data.notas.filter((n) => !n.resolvidaEm).length, 0);
  assert.equal(users.findById(uid).documents.historico, 'pronto');
});

test('contexto da missão: "Não sei fazer isso." dentro da missão 2.3 não responde genericamente', async () => {
  const r = await say('Não sei fazer isso.', { missaoId: '2.3' });
  assert.equal(r.data.intencao, 'dificuldade');
  assert.match(r.data.texto, /2\.3|histórico/i);
});

// ---------- Finanças ----------

test('finanças: sem recursos pergunta; "tenho €2.000" simula sem gravar; apoio prometido não conta', async () => {
  const r = await say('Não tenho dinheiro suficiente para ir.');
  assert.equal(r.data.intencao, 'financas');
  assert.match(r.data.texto, /dinheiro guardado|alguém que possa ajudar/);
  const t = await say('Tenho €2.000 guardados. Quanto falta?');
  assert.equal(t.data.intencao, 'tenho-dinheiro');
  assert.equal((users.findById(uid).finance?.recursos || []).length, 0, 'simulação não grava');
  await confirm(t.data.proposta);
  const f = await say('Meu padrasto vai ajudar com €3.000.');
  assert.equal(f.data.intencao, 'apoio-familiar');
  assert.match(f.data.texto, /não conta como dinheiro garantido/);
  await confirm(f.data.proposta);
  const rec = users.findById(uid).finance.recursos;
  assert.deepEqual(rec.map((x) => x.status), ['disponivel', 'previsto']);
  const g = await say('Quanto dinheiro ainda falta?');
  const card = g.data.cartoes.find((c) => c.tipo === 'financas');
  assert.equal(card.garantidos, 2000, 'só o disponível conta');
  assert.equal(card.naoGarantidos, 3000);
  assert.equal(card.deficit, Math.max(0, card.necessario - 2000));
  const e = await say('Como consigo economizar €100 por mês?');
  assert.equal(e.data.intencao, 'economizar');
});

test('bolsas: nunca afirma edital aberto sem confirmação', async () => {
  const r = await say('Procure bolsas que aceitam brasileiros.');
  assert.equal(r.data.intencao, 'bolsas');
  assert.match(r.data.texto, /nenhuma bolsa da nossa base está com edital aberto confirmado|edital aberto confirmado/);
  assert.match(r.data.texto, /Nenhuma bolsa cobre automaticamente/);
});

// ---------- Radar ----------

test('Radar: "quando abre" não inventa datas; "avise-me" cria acompanhamento após confirmação', async () => {
  const r = await say('Quando abre o mestrado em Desenvolvimento de Software?');
  assert.equal(r.data.intencao, 'quando-abre');
  const o = r.data.cartoes[0].itens[0];
  assert.match(o.programa, /Software/i);
  if (!o.abertura) assert.match(r.data.texto, /não encontrei um calendário oficial confirmado/);
  const a = await say('Avise-me quando abrirem as candidaturas do mestrado em Desenvolvimento de Software');
  assert.equal(a.data.intencao, 'avise-me');
  const c = await confirm(a.data.proposta);
  assert.equal(c.data.ok, true);
  const me = await req('GET', '/radar/me');
  assert.ok(me.data.acompanhando.some((x) => /Software/i.test(x.programa.nome)));
  const dup = await say('Avise-me quando abrirem as candidaturas do mestrado em Desenvolvimento de Software');
  assert.equal(dup.data.proposta, null, 'não duplica');
  const ab = await say('Quais inscrições estão abertas?');
  assert.equal(ab.data.intencao, 'inscricoes-abertas');
  const comp = await say('Encontre mestrados compatíveis com Ciência da Computação.');
  assert.equal(comp.data.intencao, 'mestrados');
  assert.ok(comp.data.cartoes[0]?.itens.length);
});

test('"Como me inscrevo no mestrado?" explica o DUA e consulta o Radar', async () => {
  const r = await say('Como me inscrevo no mestrado?');
  assert.equal(r.data.intencao, 'como-inscrever');
  assert.match(r.data.texto, /Distrito Único Andaluz/);
});

// ---------- Documentos, moradia, e-mail, limites ----------

test('documentos pendentes e "Já tenho meu diploma" (pronto ≠ validado)', async () => {
  const r = await say('Quais documentos ainda faltam?');
  assert.equal(r.data.intencao, 'documentos');
  assert.ok(r.data.cartoes[0].itens.length);
  const d = await say('Já tenho meu diploma.');
  assert.ok(d.data.proposta);
  const st = d.data.proposta.passos.find((s) => s.ferramenta === 'update_document_status');
  assert.ok(st.avisos.some((a) => /não significa que a universidade ou o consulado validaram/.test(a)));
});

test('moradia: busca externa é limitação clara; anúncio suspeito aponta sinais sem dizer "seguro"', async () => {
  const r = await say('Encontre opções de quartos em Granada.');
  assert.equal(r.data.intencao, 'indisponivel');
  const s = await say('Esse anúncio parece suspeito? "Quarto lindo no centro por 150 euros. Estou morando na Inglaterra, pague a reserva por Western Union antes de ver e envio as chaves pelo correio."');
  assert.equal(s.data.intencao, 'anuncio-suspeito');
  assert.ok(s.data.cartoes[0].sinais.length >= 2);
  assert.doesNotMatch(s.data.texto, /é seguro/);
});

test('e-mail: só rascunho; pedido de envio vira limitação', async () => {
  const r = await say('Prepare um e-mail para o coordenador do meu mestrado.');
  assert.equal(r.data.intencao, 'email');
  const card = r.data.cartoes.find((c) => c.tipo === 'email');
  assert.equal(card.enviado, false);
  assert.match(card.corpo, /Estimado/);
  const c = await say('Escreva para o consulado perguntando quais documentos preciso');
  assert.equal(c.data.intencao, 'email');
  assert.match(c.data.cartoes[0].corpo, /visado/);
  const s = await say('Envie esse e-mail para o coordenador por mim');
  assert.equal(s.data.intencao, 'indisponivel');
});

test('consulado: resultado estruturado da base verificada (perfil e estado citado)', async () => {
  const r = await say('Qual é o meu consulado?');
  assert.equal(r.data.intencao, 'consulado');
  const card = r.data.cartoes[0];
  assert.equal(card.tipo, 'consulado');
  assert.equal(card.status, 'encontrado');
  assert.equal(card.consulado.id, 'salvador');
  assert.equal(card.consulado.email, 'cog.salvador.vis@maec.es');
  assert.match(card.consulado.vistoEstudosUrl, /Visado\+de\+estudios/);
  assert.match(card.fonte.url, /exteriores\.gob\.es.*Demarcaci/);
  assert.ok(card.fonte.verificadoEm);
  // Estado citado na mensagem tem prioridade sobre o perfil (BA).
  const pb = await say('Qual consulado atende PB?');
  assert.equal(pb.data.cartoes[0].consulado.id, 'salvador');
  assert.equal(pb.data.cartoes[0].estado.nome, 'Paraíba');
  const mg = await say('qual o consulado de quem mora em Minas Gerais?');
  assert.equal(mg.data.cartoes[0].consulado.id, 'rio-de-janeiro');
  // "E-mail ao consulado" continua indo para o rascunho.
  const e = await say('Escreva para o consulado perguntando quais documentos preciso');
  assert.equal(e.data.intencao, 'email');
});

test('carteira de documentos: faltando, como conseguir, já tenho, apostila, visto e organizar arquivos', async () => {
  const f = await say('Quais documentos estão faltando?');
  assert.equal(f.data.intencao, 'documentos');
  assert.ok(f.data.cartoes[0].proximo?.rota.startsWith('/documentos/'));
  assert.ok(f.data.cartoes[0].itens.every((d) => d.rota));
  const g = await say('Como consigo meu histórico?');
  assert.equal(g.data.intencao, 'como-conseguir-documento');
  assert.equal(g.data.cartoes[0].tipo, 'documento');
  assert.equal(g.data.cartoes[0].id, 'historico');
  assert.ok(g.data.cartoes[0].comoObter.length >= 2);
  assert.equal(g.data.cartoes[0].rota, '/documentos/historico');
  const p = await say('Já tenho meu passaporte. O que faço?');
  assert.equal(p.data.intencao, 'terminei');
  // Já registrado → não cria proposta repetida; senão, propõe marcar como pronto (com confirmação).
  assert.ok(p.data.proposta ? p.data.proposta.passos.some((s) => s.ferramenta === 'update_document_status' && s.entrada.documentoId === 'passaporte') : /já está registrado/.test(p.data.texto));
  const a = await say('Preciso apostilar meu diploma?');
  assert.equal(a.data.intencao, 'apostila');
  assert.match(a.data.texto, /quando a lista oficial pedir/);
  assert.match(a.data.texto, /Consulado Geral da Espanha em Salvador/);
  assert.doesNotMatch(a.data.texto, /não precisa apostilar|precisa sim/i);
  const v = await say('Quais documentos preciso para o visto?');
  assert.ok(['visto', 'documentos'].includes(v.data.intencao));
  const o = await say('Me ajuda a organizar meus arquivos');
  assert.equal(o.data.intencao, 'organizar-arquivos');
  assert.match(o.data.texto, /não abro nem analiso/);
  // "Organize minha semana" continua indo para a agenda.
  assert.notEqual((await say('Organize minha semana.')).data.intencao, 'organizar-arquivos');
});

test('chegada: registrar exige visto aprovado (regra do motor)', async () => {
  const r = await say('Cheguei a Granada. E agora?');
  assert.equal(r.data.intencao, 'chegada');
  assert.equal(r.data.proposta, null);
  assert.match(r.data.texto, /visto/i);
});

test('pergunta fora do alcance: limitação clara, sem inventar', async () => {
  const r = await say('Qual é a capital da Mongólia e quanto custa um camelo?');
  assert.equal(r.data.compreendido, false);
  assert.match(r.data.texto, /não sei responder isso com segurança/);
});

// ---------- Permissões, proatividade e controle de dados ----------

test('permissão desativada bloqueia a ferramenta; reativar libera', async () => {
  await req('PUT', '/mentor/preferences', { permissoes: { financas: false } });
  const r = await say('Quanto dinheiro falta para eu conseguir ir?');
  assert.match(r.data.texto, /desativou o acesso/);
  await req('PUT', '/mentor/preferences', { permissoes: { financas: true } });
  const ok = await say('Quanto dinheiro falta para eu conseguir ir?');
  assert.ok(ok.data.cartoes.some((c) => c.tipo === 'financas'));
});

test('avisos proativos vêm de regras e podem ser dispensados ou desligados', async () => {
  const r = await req('GET', '/mentor/insights');
  assert.equal(r.status, 200);
  for (const a of r.data.avisos) assert.match(a.origem, /^regra:/);
  if (r.data.avisos[0]) {
    await req('POST', `/mentor/insights/${r.data.avisos[0].id}/dismiss`);
    assert.ok(!(await req('GET', '/mentor/insights')).data.avisos.some((a) => a.id === r.data.avisos[0].id));
  }
  await req('PUT', '/mentor/preferences', { preferencias: { proativo: false } });
  assert.equal((await req('GET', '/mentor/insights')).data.avisos.length, 0);
  await req('PUT', '/mentor/preferences', { preferencias: { proativo: true } });
});

test('"O que o Mentor sabe": contexto minimizado, sem e-mail; apagar memória', async () => {
  const r = await req('GET', '/mentor/memory');
  assert.doesNotMatch(r.data.contexto, /ana@mentor\.dev/);
  assert.match(r.data.conversas, /não grava as conversas/);
  await req('DELETE', '/mentor/memory');
  const after2 = await req('GET', '/mentor/memory');
  assert.equal(after2.data.notas.length, 0);
  assert.equal(after2.data.historico.length, 0);
});

// ---------- Fase 2/3: provedor de IA (falso) — escritas viram proposta; falha degrada ----------

test('agente com IA: ferramenta de escrita gera proposta e NÃO executa; leitura vira cartão', async () => {
  const calls = [];
  setProvider({
    id: 'fake', nome: 'Fake', disponivel: true,
    async chat({ messages, tools }) {
      calls.push(messages.length);
      assert.ok(tools.some((t) => t.name === 'create_calendar_event'));
      if (calls.length === 1) return { texto: '', chamadas: [{ id: 't1', nome: 'get_pending_missions', input: {} }, { id: 't2', nome: 'create_calendar_event', input: { itens: [{ titulo: 'Revisar documentos', categoria: 'documentacao', data: '2099-01-02', inicio: '10:00', fim: '10:30' }] } }], parada: 'tool_use' };
      const last = messages.at(-1);
      assert.equal(last.role, 'tool');
      assert.match(last.resultados[1].conteudo, /AINDA NÃO EXECUTADO/);
      return { texto: 'Preparei o compromisso. Confirma?', chamadas: [], parada: 'end_turn' };
    },
  });
  const before = plannerCount();
  const r = await say('organize algo para mim');
  assert.equal(r.data.modo, 'ia');
  assert.ok(r.data.proposta);
  assert.ok(r.data.cartoes.some((c) => c.tipo === 'missoes'));
  assert.equal(plannerCount(), before, 'nada executado sem confirmação');
  await confirm(r.data.proposta);
  assert.equal(plannerCount(), before + 1);
  // Provedor falha → resposta do Modo Guiado com aviso.
  setProvider({ id: 'down', nome: 'Down', disponivel: true, async chat() { throw new Error('timeout'); } });
  const d = await say('Quais missões faltam?');
  assert.equal(d.data.modo, 'guiado');
  assert.match(d.data.aviso, /IA está indisponível/);
  setProvider(null);
});
