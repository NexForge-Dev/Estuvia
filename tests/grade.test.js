import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-grade-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { duaGrade, profileGrade, usesGrade, fmtNota, NOTA_SEM_ESCALA } = await import('../public/js/data/grade.js');
const { eligibility } = await import('../server/journey-engine.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fórmula do DUA: Ce = 5 + 5 × (Co − Cm) / (CM − Cm)', () => {
  assert.deepEqual(duaGrade({ nota: 8, max: 10, min: 6 }), { ok: true, valor: 7.5 });
  assert.deepEqual(duaGrade({ nota: 10, max: 10, min: 5 }), { ok: true, valor: 10 });
  assert.deepEqual(duaGrade({ nota: 7, max: 10, min: 7 }), { ok: true, valor: 5 }, 'média igual à mínima vale 5');
  assert.deepEqual(duaGrade({ nota: 82, max: 100, min: 60 }), { ok: true, valor: 7.75 }, 'escala 0 a 100');
  assert.deepEqual(duaGrade({ nota: '8,2', max: '10', min: '5' }), { ok: true, valor: 8.2 }, 'aceita vírgula decimal');
  assert.deepEqual(duaGrade({ nota: 3.1, max: 4, min: 2 }), { ok: true, valor: 7.75 }, 'escala livre (CR 0 a 4)');
  assert.equal(duaGrade({ nota: 7.123, max: 10, min: 6 }).valor, 6.404, 'três casas, como as notas de corte');
});

test('fórmula do DUA: valores incoerentes são recusados com explicação', () => {
  assert.match(duaGrade({ nota: 11, max: 10, min: 5 }).erro, /não pode passar da nota máxima/);
  assert.match(duaGrade({ nota: 4, max: 10, min: 5 }).erro, /abaixo da mínima/);
  assert.match(duaGrade({ nota: 8, max: 5, min: 5 }).erro, /maior que a mínima/);
  assert.match(duaGrade({ nota: 8, max: 10 }).erro, /Informe/);
  assert.equal(duaGrade({ nota: 'abc', max: 10, min: 5 }).ok, false);
});

test('nota do perfil: sem nota, calculada e inválida; formatação pt-BR', () => {
  assert.equal(profileGrade({}).status, 'sem-nota');
  assert.equal(profileGrade({}).semEscala, NOTA_SEM_ESCALA);
  const g = profileGrade({ notaMedia: 8, notaMaxima: 10, notaMinima: 6 });
  assert.equal(g.status, 'calculada');
  assert.equal(g.valor, 7.5);
  assert.equal(profileGrade({ notaMedia: 8, notaMaxima: 10 }).status, 'invalida');
  assert.equal(fmtNota(7.5, 2), '7,50');
  assert.equal(fmtNota(6), '6');
  assert.equal(fmtNota(5.5625, 3), '5,563');
});

test('critério que usa a nota: descrição traduzida ou original do DUA', () => {
  assert.ok(usesGrade('Nota média do histórico'));
  assert.ok(usesGrade('NOTA MEDIA DEL EXPEDIENTE'));
  assert.ok(usesGrade('Valoración del expediente académico y currículum'));
  assert.ok(!usesGrade('Entrevista'));
  assert.ok(!usesGrade('Currículo'));
});

const prog = (extra) => ({ idioma: { status: 'nao-requerido', fonte: 'O30' }, outrosIdiomas: [], ...extra });
const gradeRow = (items) => items.find((i) => i.requisito === 'Nota média na escala espanhola');

test('elegibilidade: item da nota só quando a ficha usa a nota, com o peso e a regra de ausência', () => {
  const base = { formacao: 'Graduação concluída', espanhol: 'B2' };
  const semNota = gradeRow(eligibility({ profile: base, program: prog({ criterios: [{ descricao: 'Nota média do histórico', peso: 60 }, { descricao: 'Entrevista', peso: 40 }] }) }));
  assert.equal(semNota.status, 'falta-informar');
  assert.match(semNota.texto, /vale 60% da seleção/);
  assert.match(semNota.texto, /considera 5,00/);
  assert.equal(semNota.fonte, 'O1');

  const com = gradeRow(eligibility({ profile: { ...base, notaMedia: 8, notaMaxima: 10, notaMinima: 6 }, program: prog({ criterios: [{ descricao: 'Nota media del expediente', peso: 100 }], somenteNotaExpediente: true }) }));
  assert.equal(com.status, 'declarado');
  assert.match(com.texto, /só pela nota média/);
  assert.match(com.texto, /equivale a 7,50/);

  assert.equal(gradeRow(eligibility({ profile: base, program: prog({ criterios: [{ descricao: 'Entrevista', peso: 100 }] }) })), undefined, 'seleção sem nota: sem item');
  assert.equal(gradeRow(eligibility({ profile: base, program: prog({ criterios: null }) })), undefined, 'sem ficha: sem item');
});

test('perfil: salva a nota, exige os três campos juntos, recusa incoerência e apaga com null', async () => {
  let cookie = '';
  const req = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'travessia', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await req('POST', '/auth/register', { nome: 'Ana Nota', email: 'ana-nota@exemplo.com', senha: 'segura123', aceite: true })).status, 201);
  const ok = await req('PUT', '/me/profile', { notaMedia: 8.2, notaMaxima: 10, notaMinima: 6 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.profile.notaMedia, 8.2);
  const parcial = await req('PUT', '/me/profile', { notaMedia: null });
  assert.equal(parcial.status, 400);
  assert.match(parcial.data.error, /juntas/);
  const ruim = await req('PUT', '/me/profile', { notaMedia: 11 });
  assert.equal(ruim.status, 400);
  assert.match(ruim.data.error, /nota máxima/);
  assert.equal((await req('PUT', '/me/profile', { notaMedia: '8' })).status, 400, 'só número');
  const apagada = await req('PUT', '/me/profile', { notaMedia: null, notaMaxima: null, notaMinima: null });
  assert.equal(apagada.status, 200);
  assert.equal(apagada.data.user.profile.notaMedia, null);
  assert.equal((await req('PUT', '/me/profile', { apelido: 'Ana' })).status, 200, 'outros campos seguem salvando sem nota');
});
