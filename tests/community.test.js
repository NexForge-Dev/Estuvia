import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Base isolada; a moderadora é definida por MODERATOR_EMAILS antes de carregar a configuração.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-community-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MODERATOR_EMAILS = 'mod@exemplo.com';
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { securityHeaders, csrfGuard } = await import('../server/security.js');
const { default: authRoutes } = await import('../server/routes/auth.js');
const { default: communityRoutes, communityRadarFeed } = await import('../server/routes/community.js');
const { users, flush } = await import('../server/store.js');

let server;
let base;

// Monta só o necessário (auth + comunidade), como em server/app.js.
before(async () => {
  // Seed oficial do Radar (catálogo UGR + DUA), para testar o aviso "já está no Radar oficial".
  await (await import('../server/radar/service.js')).initRadar();
  const app = express();
  app.use(securityHeaders, express.json({ limit: '50kb' }), cookieParser());
  const api = express.Router();
  api.use(csrfGuard);
  api.use('/auth', authRoutes);
  api.use('/community', communityRoutes);
  app.use('/api', api);
  server = app.listen(0);
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
  return async (method, url, body, { raw, type } = {}) => {
    const headers = { 'Content-Type': type || 'application/json', 'X-Requested-With': 'travessia' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

async function account(nome, email) {
  const req = client();
  const r = await req('POST', '/auth/register', { nome, email, senha: 'segura123', aceite: true, maiorIdade: true });
  assert.equal(r.status, 201);
  // Contas "antigas" para não acionar o sinal de conta recém-criada publicando links.
  await users.update(r.data.user.id, (u) => { u.createdAt = '2026-01-01T00:00:00.000Z'; });
  return req;
}

const future = (days) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const OPPORTUNITY = {
  tipo: 'oportunidade',
  categoria: 'bolsas',
  texto: 'Saiu o edital! Confiram os requisitos no site oficial.',
  local: { universidadeId: 'ugr', pais: 'Espanha' },
  oportunidade: {
    instituicao: 'Fundación Carolina',
    titulo: 'Bolsas de pós-graduação para mestrado na Espanha',
    prazo: future(40),
    requisitos: ['Graduação concluída', 'Nacionalidade de país iberoamericano'],
    linkOficial: 'https://www.fundacioncarolina.es/becas/postgrado?utm_source=zap',
  },
};

let ana; let bia; let caio; let mod; let opId;

test('publicação de texto: dados pessoais mascarados, feed e filtros', async () => {
  ana = await account('Ana Souza', 'ana@exemplo.com');
  bia = await account('Bia Lima', 'bia@exemplo.com');
  caio = await account('Caio Reis', 'caio@exemplo.com');
  mod = await account('Moderadora', 'mod@exemplo.com');

  const r = await ana('POST', '/community/posts', {
    tipo: 'publicacao', categoria: 'moradia', texto: 'Achei quarto perto da Facultad. Meu CPF é 123.456.789-09, me liga +55 11 98765-4321.',
    local: { cidade: 'Granada', pais: 'Espanha' }, grupoId: 'estudantes-em-granada',
  });
  assert.equal(r.status, 201);
  assert.doesNotMatch(r.data.post.texto, /123\.456|98765/);
  assert.ok(r.data.avisos.some((a) => a.includes('CPF')));
  assert.equal(r.data.post.autor.nome, 'Ana'); // apelido do cadastro; e-mail nunca é exposto
  assert.equal(r.data.post.autor.email, undefined);
  assert.equal(r.data.post.verificacao, null);

  const feed = await bia('GET', '/community/posts?cidade=granada&categoria=moradia');
  assert.equal(feed.data.posts.length, 1);
  assert.equal((await bia('GET', '/community/posts?categoria=bolsas')).data.posts.length, 0);
  assert.equal((await bia('GET', '/community/posts?grupo=estudantes-em-granada')).data.posts.length, 1);
});

test('orientação "oficial" exige fonte institucional; link sozinho não verifica', async () => {
  const semFonte = await ana('POST', '/community/posts', {
    tipo: 'publicacao', categoria: 'documentacao-vistos', natureza: 'orientacao-oficial', texto: 'O visto exige seguro saúde, veja https://blog-qualquer.com/visto',
  });
  assert.equal(semFonte.status, 400);
  const comFonte = await ana('POST', '/community/posts', {
    tipo: 'publicacao', categoria: 'documentacao-vistos', natureza: 'orientacao-oficial', texto: 'Requisitos do visto: https://www.exteriores.gob.es/Consulados/salvadordebahia',
  });
  assert.equal(comFonte.status, 201);
  assert.equal(comFonte.data.post.links[0].nivel, 'institucional');
  assert.equal(comFonte.data.post.verificacao.status, 'nao-verificada');
});

test('link suspeito e spam vão para revisão e ficam fora do feed público', async () => {
  const r = await caio('POST', '/community/posts', {
    tipo: 'publicacao', categoria: 'documentacao-vistos', texto: 'VISTO GARANTIDO! clique aqui https://bit.ly/visto-facil e chama no zap',
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.post.moderacao.estado, 'em-revisao');
  assert.ok(r.data.post.links[0].motivos.length);
  const feed = await bia('GET', '/community/posts?categoria=documentacao-vistos');
  assert.ok(!feed.data.posts.some((p) => p.id === r.data.post.id));
  assert.equal((await caio('GET', `/community/posts/${r.data.post.id}`)).status, 200);
  // Repetir o mesmo texto é bloqueado.
  const again = await caio('POST', '/community/posts', { tipo: 'publicacao', categoria: 'documentacao-vistos', texto: 'VISTO GARANTIDO! clique aqui https://bit.ly/visto-facil e chama no zap' });
  assert.equal(again.status, 409);
});

test('oportunidade: duplicata detectada, curtir, salvar, comentar e compartilhar', async () => {
  const r = await ana('POST', '/community/posts', OPPORTUNITY);
  assert.equal(r.status, 201);
  opId = r.data.post.id;
  assert.equal(r.data.post.verificacao.status, 'nao-verificada');

  // Mesmo edital (link com parâmetros de rastreio diferentes) → aviso de duplicata.
  const dup = await bia('POST', '/community/posts', { ...OPPORTUNITY, texto: 'Olhem essa bolsa', oportunidade: { ...OPPORTUNITY.oportunidade, linkOficial: 'https://fundacioncarolina.es/becas/postgrado/' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.duplicata.id, opId);

  assert.equal((await bia('POST', `/community/posts/${opId}/like`)).data.post.curtidas, 1);
  assert.equal((await bia('POST', `/community/posts/${opId}/save`)).data.post.salvei, true);
  assert.equal((await bia('GET', '/community/posts?salvos=1')).data.posts.length, 1);
  const cm = await bia('POST', `/community/posts/${opId}/comments`, { texto: 'Alguém sabe se aceita diploma em andamento?' });
  assert.equal(cm.status, 201);
  const share = await bia('POST', `/community/posts/${opId}/share`);
  assert.match(share.data.link, new RegExp(opId));
  const detail = await caio('GET', `/community/posts/${opId}`);
  assert.equal(detail.data.comentarios.length, 1);
  assert.equal(detail.data.post.compartilhamentos, 1);
});

test('verificação: só moderação verifica, com checklist; Radar só recebe verificadas', async () => {
  assert.equal((await bia('GET', '/community/mod/queue')).status, 403);
  assert.equal(communityRadarFeed().length, 0);

  assert.equal((await bia('POST', `/community/posts/${opId}/verification-request`)).data.post.verificacao.status, 'em-verificacao');
  const queue = await mod('GET', '/community/mod/queue');
  assert.ok(queue.data.verificacao.some((p) => p.id === opId));

  const semChecklist = await mod('POST', `/community/mod/posts/${opId}/verification`, { status: 'verificada' });
  assert.equal(semChecklist.status, 400);
  const ok = await mod('POST', `/community/mod/posts/${opId}/verification`, { status: 'verificada', nota: 'Conferido no site', checklist: { linkOficial: true, requisitos: true, datas: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.post.verificacao.status, 'verificada');

  const radar = await bia('GET', '/community/radar');
  assert.equal(radar.data.itens.length, 1);
  assert.equal(radar.data.itens[0].postId, opId);
  assert.equal(communityRadarFeed()[0].origem, 'comunidade');
});

test('jornada e agenda: missão de avaliação, candidatura e prazo atualizado após alteração confirmada', async () => {
  const add = await bia('POST', `/community/posts/${opId}/journey`, {});
  assert.equal(add.status, 201);
  const op = add.data.oportunidade;
  assert.ok(op.missao.objetivos.some((o) => o.id === 'decisao'));
  assert.equal((await bia('POST', `/community/posts/${opId}/journey`, {})).status, 409);

  const decided = await bia('PUT', `/community/my-opportunities/${op.id}`, { decisao: 'candidatar' });
  assert.equal(decided.data.oportunidades[0].atividades.length, 4);

  const agenda = await bia('POST', `/community/posts/${opId}/agenda`, {});
  assert.equal(agenda.status, 201);
  assert.equal(agenda.data.criados, 2);
  assert.equal(agenda.data.aviso, null);

  const novoPrazo = future(55);
  const change = await mod('PUT', `/community/mod/posts/${opId}/opportunity`, { prazo: novoPrazo, nota: 'Edital retificado: prazo prorrogado.' });
  assert.equal(change.status, 200);
  assert.deepEqual(change.data.campos, ['prazo']);
  assert.equal(change.data.estudantesAtualizados, 1);

  const biaUser = users.findByEmail('bia@exemplo.com');
  const prazo = biaUser.planner.find((e) => e.oportunidadeId === opId && e.oportunidadeTipo === 'prazo');
  assert.equal(prazo.data, novoPrazo);
  assert.equal(biaUser.opportunities[0].alteracao.campos[0], 'prazo');
});

test('edição do autor tira a oportunidade do Radar até nova verificação', async () => {
  const r = await ana('PUT', `/community/posts/${opId}`, { ...OPPORTUNITY, oportunidade: { ...OPPORTUNITY.oportunidade, prazo: future(60) } });
  assert.equal(r.status, 200);
  assert.equal(r.data.post.verificacao.status, 'em-verificacao');
  assert.equal((await bia('GET', '/community/radar')).data.itens.length, 0);
});

test('denúncias: três denúncias tiram do ar; moderação decide', async () => {
  const p = await caio('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Post que vai ser denunciado' });
  const id = p.data.post.id;
  assert.equal((await caio('POST', `/community/posts/${id}/report`, { motivo: 'spam' })).status, 400);
  for (const who of [ana, bia, mod]) assert.equal((await who('POST', `/community/posts/${id}/report`, { motivo: 'spam' })).status, 201);
  assert.equal((await ana('POST', `/community/posts/${id}/report`, { motivo: 'spam' })).status, 409);
  assert.equal((await ana('GET', `/community/posts/${id}`)).status, 404);

  const queue = await mod('GET', '/community/mod/queue');
  assert.equal(queue.data.denuncias.filter((d) => d.alvoId === id).length, 3);
  assert.equal((await mod('POST', `/community/mod/posts/${id}/moderation`, { acao: 'publicar' })).status, 200);
  assert.equal((await ana('GET', `/community/posts/${id}`)).status, 200);
  assert.equal((await mod('GET', '/community/mod/queue')).data.denuncias.filter((d) => d.alvoId === id).length, 0);
});

test('grupos: entrar, sair e criar', async () => {
  const groups = await bia('GET', '/community/groups');
  assert.ok(groups.data.grupos.some((g) => g.nome === 'Brasileiros na UGR'));
  assert.equal((await bia('POST', '/community/groups/brasileiros-na-ugr/join')).data.grupo.participo, true);
  assert.equal((await bia('POST', '/community/groups/brasileiros-na-ugr/join')).data.grupo.participo, false);
  const g = await bia('POST', '/community/groups', { nome: 'Bolsas em Portugal', tipo: 'pais', pais: 'Portugal' });
  assert.equal(g.status, 201);
  assert.equal(g.data.grupo.id, 'bolsas-em-portugal');
  assert.equal((await caio('POST', '/community/groups', { nome: 'Bolsas em Portugal', tipo: 'pais', pais: 'Portugal' })).status, 409);
});

test('imagens: só imagens reais, servidas apenas a quem pode ver', async () => {
  const fake = await ana('POST', '/community/media', null, { raw: Buffer.from('<svg onload=alert(1)>aaaaaaaaaaaaaa'), type: 'image/png' });
  assert.equal(fake.status, 400);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const up = await ana('POST', '/community/media', null, { raw: png, type: 'image/png' });
  assert.equal(up.status, 201);
  // Ainda não publicada: só a dona vê.
  assert.equal((await bia('GET', `/community/media/${up.data.id}`)).status, 404);
  const post = await ana('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'Vista da Alhambra', imagens: [up.data.id] });
  assert.equal(post.status, 201);
  const img = await bia('GET', `/community/media/${up.data.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  // Imagem de outra pessoa não pode ser anexada.
  assert.equal((await bia('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', texto: 'roubando', imagens: [up.data.id] })).status, 400);
});

test('experiências por missão: só relatos publicados, priorizando a universidade', async () => {
  await ana('POST', '/community/posts', { tipo: 'publicacao', categoria: 'documentacao-vistos', natureza: 'relato-pessoal', missaoId: '5.2', texto: 'No consulado de Salvador levei tudo traduzido e deu certo.', local: { universidadeId: 'us' } });
  await bia('POST', '/community/posts', { tipo: 'publicacao', categoria: 'documentacao-vistos', natureza: 'dica', missaoId: '5.2', texto: 'Dica: agende cedo, as vagas somem rápido.', local: { universidadeId: 'ugr' } });
  assert.equal((await ana('POST', '/community/posts', { tipo: 'publicacao', categoria: 'experiencias', missaoId: 'x', texto: 'oi' })).status, 400);
  const r = await caio('GET', '/community/missions/5.2?universidadeId=ugr&limit=5');
  assert.equal(r.status, 200);
  assert.equal(r.data.relatos.length, 2);
  assert.equal(r.data.relatos[0].universidadeId, 'ugr');
  assert.match(r.data.relatos[0].url, /^#\/comunidade\/post\//);
  assert.equal((await caio('GET', '/community/posts?missao=5.2')).data.posts.length, 2);
});

test('oportunidade de programa que já está no Radar oficial recebe o link oficial', async () => {
  const r = await caio('POST', '/community/posts', {
    tipo: 'oportunidade', categoria: 'vagas-mestrado', texto: 'Abriram as inscrições deste máster!', local: { universidadeId: 'ugr' },
    oportunidade: { instituicao: 'Universidad de Granada', titulo: 'Máster Universitario en Desarrollo del Software', prazo: future(20), linkOficial: 'https://masteres.ugr.es/informacion/titulaciones/master-universitario-desarrollo-software-1' },
  });
  assert.equal(r.status, 201);
  assert.match(r.data.post.radarOficial.url, /^#\/oportunidades\//);
  assert.ok(r.data.avisos.some((a) => a.includes('Radar oficial')));
});
