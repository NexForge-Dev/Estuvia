// Segurança e consistência do workflow de candidatura (2ª auditoria, 13/11/2026).
// Usa páginas OFICIAIS reais do DUA (tests/fixtures/dua-oficial, baixadas em 13/11/2026) em vez de dados montados
// com as mesmas premissas do código, e jornadas no formato antigo para checar compatibilidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-seg-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;

const { parse } = await import('../server/radar/connectors/dua-program.js');
const { applicationProcess } = await import('../server/application-process.js');
const { DUA_MASTERES } = await import('../server/content/application-procedures.js');
const { sourceById } = await import('../server/content/sources.js');
const { registerProgramSource } = await import('../server/content/catalog.js');
const { SITUACAO, allMissions, missionById } = await import('../server/content/rounds.js');
const engine = await import('../server/journey-engine.js');

const fixture = (f) => parse(fs.readFileSync(new URL(`./fixtures/dua-oficial/${f}`, import.meta.url), 'utf8'));
const agro = fixture('ficha-214009-agroalimentacion-uca.html');
const doble = fixture('ficha-331202-doble-profesorado-uco.html');

// Programa no formato que o Radar entrega à jornada, montado a partir da ficha oficial real.
const fromFicha = (id, f) => ({
  id, universidadeId: 'uca', nome: f.dados.titulo, duaCodigo: f.dados.codigoDua, ciclo: '2026/27', duracaoMeses: 12, demo: false, radar: true,
  requisitosFicha: f.dados.requisitos, criteriosOriginais: f.dados.baremo.map((c) => ({ original: c.descricao, peso: c.peso })), criterios: f.dados.baremo,
  idioma: (() => { const es = f.dados.idiomasExigidos.find((i) => i.idioma === 'espanhol'); return es ? { status: 'requerido', nivel: es.nivel, certificado: true, fonte: 'O30' } : { status: 'nao-requerido', fonte: 'O30' }; })(),
  requisitos: [],
});
const PROGS = { 'real-agro': fromFicha('real-agro', agro), 'real-doble': fromFicha('real-doble', doble) };
registerProgramSource((id) => PROGS[id] || null);

const user = (extra = {}) => ({ profile: { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'SP', formacao: 'Engenharia', espanhol: 'B1' }, journeys: [], documents: {}, choices: [], ...extra });
const jr = (programaId, extra = {}) => ({ id: 'j', programaId, anoAcademico: '2026/27', missions: {}, dados: {}, ...extra });
const done = (ids) => Object.fromEntries(ids.map((id) => [id, { concluidaEm: '2026-11-01T10:00:00Z', objetivos: {} }]));
const state = (u, j, id) => engine.missionState(missionById(id), engine.buildContext(u, j));

test('ficha oficial real (UCA 214009): dois requisitos obrigatórios de espanhol, vale B2; a Missão 2.5 se aplica', () => {
  assert.equal(agro.ok, true);
  assert.deepEqual(agro.dados.requisitos.filter((r) => r.obrigatorio).map((r) => r.codigo), ['006', '099']);
  const es = agro.dados.idiomasExigidos.find((i) => i.idioma === 'espanhol');
  assert.equal(es.nivel, 'B2');
  const s = state(user(), jr('real-agro'), '2.5');
  assert.notEqual(s.status, 'nao-aplicavel');
});

test('ficha oficial real (UCO 331202, duplo com Profesorado): regra de Profesorado aplicada; requisitos da ficha exibidos', () => {
  const p = applicationProcess(PROGS['real-doble'], { profile: { nacionalidade: 'Brasileira' } });
  assert.ok(p.regrasEspecificas.some((r) => r.id === 'profesorado'));
  assert.equal(p.requisitosEspecificos.length, doble.dados.requisitos.length, 'todos os requisitos da ficha aparecem, com o texto oficial');
});

test('nenhum estudante é bloqueado de uma fase sem regra oficial: só nacionalidade espanhola na Fase 1', () => {
  const perfis = {
    'brasileiro formado': [{ nacionalidade: 'Brasileira' }, {}],
    'brasileiro sem título': [{ nacionalidade: 'Brasileira' }, { diploma: 'nao' }],
    'brasileiro aguardando diploma': [{ nacionalidade: 'Brasileira' }, { diploma: 'aguardando' }],
    'sem nacionalidade': [{}, {}],
    espanhol: [{ nacionalidade: 'Espanhola' }, {}],
  };
  const base = done(['1.1', '1.2', '1.3', '1.5', '2.4', '2.5', '2.6', '2.7', '2.8', '3.1']);
  for (const [nome, [profile, requisitos]] of Object.entries(perfis)) {
    for (const fase of ['1', '2', '3']) {
      const u = user({ profile, requisitos });
      const j = jr('real-agro', { missions: structuredClone(base), situacao: { adjudicacao: 'aguardando' } });
      const proibido = nome === 'espanhol' && fase === '1';
      if (proibido) assert.throws(() => engine.setObjective(u, j, '3.2', 'fase', { valor: fase }), /nacionalidade estrangeira/, `${nome} F${fase}`);
      else assert.doesNotThrow(() => engine.setObjective(u, j, '3.2', 'fase', { valor: fase }), `${nome} F${fase}`);
    }
  }
});

test('nenhuma missão exige documento que não se aplica: certificação PGS só no máster de Psicología General Sanitaria', () => {
  const comDoc = allMissions().filter((m) => (m.documentos || []).includes('certificacao-pgs')).map((m) => m.id);
  assert.deepEqual(comDoc, ['2.8']);
  for (const prog of ['real-agro', 'real-doble']) assert.equal(state(user(), jr(prog), '2.8').status, 'nao-aplicavel', prog);
});

test('nenhuma informação não confirmada aparece como regra oficial', () => {
  const p = applicationProcess(PROGS['real-agro'], { profile: { nacionalidade: 'Brasileira' } });
  for (const d of p.documentos.filter((x) => x.origem === 'oficial')) assert.equal(sourceById(d.fonte)?.tipo, 'oficial', d.docId);
  for (const r of p.regras) assert.equal(sourceById(r.fonte)?.tipo, 'oficial', r.id);
  assert.ok(p.documentosDerivados.every((d) => d.origem === 'derivado'));
  assert.equal(p.fases[0].oferta, 'nao-confirmado', 'oferta da Fase 1 nunca é afirmada');
  assert.ok(p.pendencias.some((x) => x.id === 'fase1'));
  assert.equal(DUA_MASTERES.taxaSolicitacao.status, 'nao-mencionada', 'ausência de taxa nos acordos não vira "não existe taxa"');
});

test('estados coerentes com o BOJA: transições permitidas e recusadas', () => {
  const ok = [['adjudicacao', 'aguardando'], ['adjudicacao', 'admitido-outra-opcao'], ['matricula', 'reservada'], ['matricula', 'nao-iniciada'], ['adjudicacao', 'admitido'], ['matricula', 'vaga-confirmada'], ['matricula', 'matriculado'], ['visto', 'apresentada']];
  const j = jr('real-agro');
  for (const [c, v] of ok) engine.setSituacao(j, c, v);
  assert.throws(() => engine.setSituacao(j, 'adjudicacao', 'lista-espera'), /Volte a matrícula/);
  assert.throws(() => engine.setSituacao(j, 'matricula', 'reservada'), /1ª preferência/);
  for (const [campo, lista] of Object.entries(SITUACAO)) for (const [v] of lista) assert.ok(typeof v === 'string' && v.length < 30, `${campo}:${v}`);
});

test('listas de espera: a Missão 3.10 vale para "lista" e "admitido em outra opção", exige ratificar a cada adjudicação', () => {
  const m = missionById('3.10');
  assert.deepEqual(m.regra.valores, ['lista-espera', 'admitido-outra-opcao']);
  const textos = m.comoExecutar.map((x) => x.texto).join(' ');
  assert.match(textos, /ratificadas em CADA nova adjudicação/);
  assert.match(textos, /confirmar que deseja continuar na lista de espera/);
  for (const v of ['lista-espera', 'admitido-outra-opcao']) assert.notEqual(state(user(), jr('real-agro', { situacao: { adjudicacao: v } }), '3.10').status, 'nao-aplicavel', v);
  for (const v of ['admitido', 'nao-admitido', 'aguardando']) assert.equal(state(user(), jr('real-agro', { situacao: { adjudicacao: v } }), '3.10').status, 'nao-aplicavel', v);
});

test('compatibilidade: jornada no formato anterior continua válida, sem perder conclusões nem dados', () => {
  // Formato de antes desta auditoria: sem faseDua, situação "vaga-confirmada", missões da Rodada 3 concluídas,
  // 7 opções salvas (antes do limite) e documentos com ids antigos.
  const u = user({ choices: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], documents: { passaporte: 'pronto', diploma: 'enviado', idioma: 'pronto' } });
  const j = jr('real-agro', {
    situacao: { adjudicacao: 'admitido', matricula: 'vaga-confirmada', visto: 'preparacao' },
    missions: done(['1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.9']),
    desbloqueios: [{ entidade: 'rodada:2', tipo: 'rodada', motivo: 'pre-requisitos', em: '2026-11-01T10:00:00Z' }, { entidade: 'rodada:3', tipo: 'rodada', motivo: 'pre-requisitos', em: '2026-11-01T10:00:00Z' }, { entidade: 'rodada:4', tipo: 'rodada', motivo: 'pre-requisitos', em: '2026-11-01T10:00:00Z' }],
  });
  const before = JSON.stringify({ missions: j.missions, situacao: j.situacao, dados: j.dados });
  const journey = engine.computeJourney(u, j);
  for (const id of ['3.2', '3.4', '3.6']) assert.equal(journey.rodadas[2].missoes.find((m) => m.id === id).status, 'concluida', `${id} continua concluída`);
  assert.equal(journey.rodadas.find((r) => r.numero === 4).desbloqueada, true);
  assert.equal(journey.situacao.matricula, 'vaga-confirmada', 'valor antigo preservado (rótulo: pagamento a cuenta da Fase 1)');
  assert.equal(JSON.stringify({ missions: j.missions, situacao: { ...j.situacao }, dados: j.dados }), before, 'calcular a jornada não altera os dados gravados');
  assert.ok(engine.missionDetail(u, j, '2.8'), 'missão nova abre sem erro em jornada antiga');
});

// ---------- Programas fora do DUA e pendências institucionais (configuração real de program-channels.js) ----------
const UGR = (id, nome) => ({ id, universidadeId: 'ugr', nome, duaCodigo: null, ciclo: '2026/27', duracaoMeses: 24, demo: false, radar: true, idioma: { status: 'verificar', fonte: 'O10' }, requisitos: [], requisitosFicha: null, criteriosOriginais: null, criterios: null });
Object.assign(PROGS, {
  'ugr-masters-programme-european-studies': UGR('ugr-masters-programme-european-studies', 'Máster Universitario en Estudios Europeos'),
  'ugr-master-universitario-alimentacion-nutricion-salud-food-h-0': UGR('ugr-master-universitario-alimentacion-nutricion-salud-food-h-0', 'Máster Universitario en Alimentación, Nutrición y Salud (Food-H)'),
  'ugr-master-universitario-cirugia-bucal-implantologia': UGR('ugr-master-universitario-cirugia-bucal-implantologia', 'Máster Universitario en Cirugía Bucal e Implantología'),
});
const DUA_ONLY = ['2.4', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.10'];

test('Arqus (Estudios Europeos): nenhuma missão do DUA bloqueia; 3.11 leva ao canal Arqus; Rodada 4 abre com a 3.11', () => {
  const id = 'ugr-masters-programme-european-studies';
  const u = user();
  for (const m of DUA_ONLY) assert.equal(state(u, jr(id), m).status, 'nao-aplicavel', m);
  const d = engine.missionDetail(u, jr(id, { missions: done(['1.1', '1.2', '1.3']), situacao: { adjudicacao: 'aguardando' } }), '3.11');
  assert.equal(d.linkOficial.url, 'https://arqus-alliance.eu/study-in-arqus/joint-masters-programmes/master-european-studies/');
  assert.match(d.definicao.porque, /Distrito Único Andaluz não vale/);
  // Rodada 4: exige 3.6 (não aplicável = resolvida) e 3.11 (concluída), sem depender do DUA.
  const j = jr(id, { missions: done(['1.1', '1.2', '1.3', '1.5', '2.5', '2.6', '2.7', '3.11']) });
  const r4 = engine.roundUnlock(4, engine.buildContext(u, j));
  assert.equal(r4.desbloqueada, true, JSON.stringify(r4.faltam));
});

test('Food-H (Arqus sem canal publicado): fora do DUA, 3.11 aplicável, sem link inventado e com pendência explícita', () => {
  const id = 'ugr-master-universitario-alimentacion-nutricion-salud-food-h-0';
  const p = applicationProcess(PROGS[id], { profile: { nacionalidade: 'Brasileira' } });
  assert.equal(p.canal.status, 'nao-dua-sem-canal');
  assert.equal(p.canal.url, null);
  assert.ok(p.pendencias.some((x) => x.id === 'canal' && /Servicio de Másteres Oficiales/.test(x.texto)));
  const u = user();
  assert.equal(state(u, jr(id), '3.2').status, 'nao-aplicavel');
  const d = engine.missionDetail(u, jr(id, { missions: done(['1.1', '1.2', '1.3']), situacao: { adjudicacao: 'aguardando' } }), '3.11');
  assert.equal(d.linkOficial, null, 'nenhum link é inventado');
  assert.ok(d.acoes.some((a) => a.tipo === 'interna' && /não publicado/.test(a.rotulo)));
});

test('Cirugía Bucal (fora do catálogo do DUA 2026/27): passos do DUA continuam disponíveis com alerta, 3.11 não se aplica', () => {
  const id = 'ugr-master-universitario-cirugia-bucal-implantologia';
  const u = user();
  const j = jr(id, { missions: done(['1.1', '1.2', '1.3']), situacao: { adjudicacao: 'aguardando' } });
  const s13 = state(u, j, '1.3');
  assert.ok(s13.alertas.some((a) => a.chave === 'canal' && /Servicio de Másteres Oficiales/.test(a.texto)));
  assert.notEqual(state(u, j, '3.2').status, 'nao-aplicavel', 'não é escondido: o estudante decide com a universidade');
  assert.equal(state(u, j, '3.11').status, 'nao-aplicavel');
});
