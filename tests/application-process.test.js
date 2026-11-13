// Processo de candidatura por mestrado (server/application-process.js) e sua aplicação nas missões.
// Cobre: canal, fases × perfil, documentos oficiais, requisitos da ficha, regras de mestrados específicos,
// validação antes de avançar, estados de candidatura, persistência e prazos por fase.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-proc-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.RATE_LIMIT_SCALE = '20';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { applicationProcess } = await import('../server/application-process.js');
const { DUA_MASTERES, PROGRAM_SPECIFIC } = await import('../server/content/application-procedures.js');
const { sourceById } = await import('../server/content/sources.js');
const { registerProgramSource } = await import('../server/content/catalog.js');
const engine = await import('../server/journey-engine.js');
const { missionById, ADMITIDO } = await import('../server/content/rounds.js');
const { createApp } = await import('../server/app.js');
const { flush } = await import('../server/store.js');

// Programas de teste no formato de programForJourney (Radar).
const BASE = { universidadeId: 'ugr', ciclo: '2026/27', duracaoMeses: 12, demo: false, radar: true, idioma: { status: 'nao-requerido', fonte: 'O30' }, requisitos: [] };
const FAKE = {
  'teste-dua': { ...BASE, id: 'teste-dua', nome: 'MÁSTER DE TESTE', duaCodigo: '999001', fichaDuaUrl: 'https://exemplo.invalid/ficha',
    requisitosFicha: [{ codigo: '001', texto: 'ES IMPRESCINDIBLE PRESENTAR CERTIFICADO DE PRÁCTICAS', obrigatorio: true }, { codigo: '002', texto: 'SE VALORARÁ LA EXPERIENCIA', obrigatorio: false }],
    criteriosOriginais: [{ original: 'CURRICULUM VITAE', peso: 40 }, { original: 'ENTREVISTA PERSONAL', peso: 20 }, { original: 'NOTA MEDIA DEL EXPEDIENTE', peso: 40 }],
    criterios: [{ descricao: 'Currículo', peso: 40 }, { descricao: 'Entrevista', peso: 20 }, { descricao: 'Nota média do histórico', peso: 40 }], fichaVerificadaEm: '2026-11-13T10:00:00Z' },
  'teste-pgs': { ...BASE, id: 'teste-pgs', nome: 'PSICOLOGÍA GENERAL SANITARIA', duaCodigo: '999002', requisitosFicha: [], criteriosOriginais: [], criterios: [] },
  'teste-sem-dua': { ...BASE, id: 'teste-sem-dua', nome: 'Máster Universitario Erasmus Mundus de Teste', duaCodigo: null, requisitosFicha: null, criteriosOriginais: null, criterios: null },
};
registerProgramSource((id) => FAKE[id] || null);

const CAL = {
  windows: [1, 2, 3].map((fase, i) => ({ fase, abertura: ['2026-01-13', '2026-06-17', '2026-09-08'][i], encerramento: ['2026-01-29', '2026-06-26', '2026-09-15'][i] })),
  events: [{ fase: 1, tipo: 'pagamento-titulo', inicio: '2026-01-29', fim: '2026-01-29', rotulo: 'Fecha límite título' }],
};
const BR = { nacionalidade: 'Brasileira' };

// ---------- Conteúdo: toda regra tem fonte existente, artigo e data ----------

test('procedimento: toda regra cita uma fonte oficial cadastrada, com artigo e data de conferência', () => {
  const regras = [DUA_MASTERES.maxPedidos, DUA_MASTERES.taxaSolicitacao, DUA_MASTERES.idiomaDocumentos, ...DUA_MASTERES.regras, ...DUA_MASTERES.documentos,
    ...DUA_MASTERES.fases.flatMap((f) => [f.quem, f.titulo, f.pagamento, f.listaEsperaSeguinte].filter(Boolean)), ...PROGRAM_SPECIFIC];
  for (const r of regras) {
    assert.ok(r.texto, 'texto');
    assert.equal(sourceById(r.fonte)?.tipo, 'oficial', `fonte oficial: ${r.texto.slice(0, 40)}`);
    assert.ok(r.artigo, `artigo: ${r.texto.slice(0, 40)}`);
    assert.match(r.revisadoEm, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(DUA_MASTERES.maxPedidos.valor, 6);
  assert.equal(DUA_MASTERES.fases[0].pagamento.valor, 400);
});

// ---------- Resolução por mestrado ----------

test('mestrado do DUA com ficha: canal e ficha confirmados; requisitos obrigatórios e documentos dos critérios', () => {
  const p = applicationProcess(FAKE['teste-dua'], { calendario: CAL, profile: BR });
  assert.equal(p.verificacao, 'confirmado');
  assert.equal(p.canal.status, 'confirmado');
  assert.deepEqual(p.requisitosEspecificos.filter((r) => r.obrigatorio).map((r) => r.codigo), ['001']);
  assert.deepEqual(p.documentosDerivados.map((d) => d.id).sort(), ['cv', 'entrevista']);
  assert.ok(p.documentosDerivados.every((d) => d.origem === 'derivado'), 'dedução nunca aparece como regra oficial');
  assert.equal(p.fases[0].janela.abertura, '2026-01-13');
  assert.equal(p.fases[0].dataLimiteTitulo.data, '2026-01-29');
  assert.equal(p.fases[0].oferta, 'nao-confirmado', 'nenhuma fonte pública informa a oferta da Fase 1 por máster');
  assert.ok(p.pendencias.some((x) => x.id === 'fase1'));
  assert.deepEqual(p.fasesPossiveis, [1, 2, 3]);
  assert.ok(!p.alertas.canal && !p.alertas.ficha);
  assert.deepEqual(p.documentos.filter((d) => d.obrigatorio === true).map((d) => d.docId), ['passaporte', 'diploma', 'historico', 'acesso-pos']);
});

test('mestrado sem vínculo com o DUA: canal e ficha não confirmados, com alertas e pendências', () => {
  const p = applicationProcess(FAKE['teste-sem-dua'], { calendario: CAL, profile: BR });
  assert.equal(p.verificacao, 'parcial');
  assert.equal(p.canal.status, 'nao-confirmado');
  assert.ok(p.alertas.canal && p.alertas.ficha);
  assert.ok(p.pendencias.some((x) => x.id === 'canal') && p.pendencias.some((x) => x.id === 'ficha'));
  assert.ok(p.fases.every((f) => f.oferta === 'canal-nao-confirmado'));
});

test('regra específica: Psicología General Sanitaria exige a certificação da Orden CNU/1309/2018 (não "homologação")', () => {
  const p = applicationProcess(FAKE['teste-pgs'], { profile: BR });
  assert.ok(p.flags.exigeResolucaoPGS);
  const doc = p.documentos.find((d) => d.docId === 'certificacao-pgs');
  assert.ok(doc?.obrigatorio);
  assert.match(doc.texto, /Orden CNU\/1309\/2018/);
  assert.doesNotMatch(doc.texto, /homologa/i);
  assert.equal(applicationProcess(FAKE['teste-dua'], { profile: BR }).flags.exigeResolucaoPGS, undefined);
  const duplo = applicationProcess({ ...FAKE['teste-dua'], nome: 'PSICOLOGÍA GENERAL SANITARIA + ESTUDIOS AVANZADOS EN CEREBRO Y CONDUCTA' }, { profile: BR });
  assert.ok(duplo.flags.exigeResolucaoPGS, 'duplo segue o máster habilitante (O2 art. 12.1)');
});

test('Profesorado: só o Máster en Profesorado de ESO/Bachillerato (e duplos), nunca "…para profesorado de español"', () => {
  const casos = {
    'PROFESORADO EN ESO, BACHILLERATO, F.P. O ENSEÑANZA IDIOMAS (ESP: MATEMÁTICAS)': true,
    'FORMACIÓN DEL PROFESORADO EN ESO, BACHILLERATO, F.P. O ENSEÑANZA IDIOMAS (ESP: FÍSICA Y QUÍMICA)': true,
    'Máster Universitario en Profesorado de Enseñanza Secundaria Obligatoria y Bachillerato, Formación Profesional y Enseñanzas de Idiomas': true,
    'MATEMÁTICAS + PROFESORADO EN ESO, BACHILLERATO, F.P. O ENSEÑANZA IDIOMAS (ESP: MATEMÁTICAS)': true,
    'ENSEÑANZA DE LA LENGUA Y LA LITERATURA ESPAÑOLAS PARA PROFESORADO DE ESPAÑOL COMO LENGUA EXTRANJERA (A DISTANCIA)': false,
  };
  for (const [nome, esperado] of Object.entries(casos)) {
    const p = applicationProcess({ ...FAKE['teste-dua'], nome }, { profile: BR });
    assert.equal(p.regrasEspecificas.some((r) => r.id === 'profesorado'), esperado, nome);
  }
});

test('fases × perfil: Fase 1 só para estrangeiros; sem título, NÃO existe atalho pela Fase 3 com título estrangeiro', () => {
  const es = applicationProcess(FAKE['teste-dua'], { profile: { nacionalidade: 'Espanhola' } });
  assert.equal(es.fases[0].perfil.status, 'nao');
  assert.deepEqual(es.fasesPossiveis, [2, 3]);
  // Requisitos 4 e 5 do art. 2 (O2): só graduação em universidade espanhola ou PARS andaluz.
  const semTitulo = applicationProcess(FAKE['teste-dua'], { calendario: CAL, profile: BR, requisitos: { diploma: 'nao' } });
  assert.deepEqual(semTitulo.fasesPossiveis, [1, 2, 3], 'nenhuma fase é proibida: o título pode ficar pronto até a data-limite');
  for (const f of semTitulo.fases) {
    assert.equal(f.perfil.status, 'verificar');
    assert.match(f.perfil.texto, /universidade espanhola ou PARS/);
  }
  assert.match(semTitulo.fases[0].perfil.texto, /29\/01\/2026/, 'mostra a data-limite oficial da fase');
  assert.match(DUA_MASTERES.fases[2].quem.texto, /universidade ESPANHOLA com no máximo 9 ECTS/);
  assert.equal(applicationProcess(FAKE['teste-dua'], { profile: {} }).fases[0].perfil.status, 'verificar');
  const decl = applicationProcess(FAKE['teste-dua'], { profile: BR, faseDeclarada: '1' });
  assert.equal(decl.faseDeclarada, 1);
  assert.ok(decl.fases[0].declarada);
  assert.match(decl.alertas.fase, /Confirme no portal/);
});

test('ciclo: jornada de 2027/28 usa os acordos de 2026/27 só como referência, com pendência e alerta', () => {
  const p = applicationProcess(FAKE['teste-dua'], { profile: BR, cicloJornada: '2027/28' });
  assert.ok(p.pendencias.some((x) => x.id === 'ciclo'));
  assert.match(p.alertas.ciclo, /2027\/2028/);
  assert.equal(applicationProcess(FAKE['teste-dua'], { profile: BR, cicloJornada: '2026/27' }).alertas.ciclo, undefined);
});

test('canais conferidos individualmente: Erasmus Mundus/Arqus fora do DUA, variantes e código manual', async () => {
  const { CHANNELS, MANUAL_DUA_LINKS } = await import('../server/content/program-channels.js');
  assert.equal(Object.keys(CHANNELS).length, 28, 'os 28 mestrados da UGR sem vínculo automático');
  for (const c of Object.values(CHANNELS)) assert.ok(c.evidencia?.url && c.evidencia?.consultadoEm, 'toda configuração tem evidência');
  const mitra = applicationProcess({ ...BASE, id: 'ugr-master-erasmus-mundus-migraciones-transnacionales-mitra', nome: 'Mitra', duaCodigo: null }, { profile: BR });
  assert.equal(mitra.canal.status, 'nao-dua');
  assert.equal(mitra.verificacao, 'confirmado');
  assert.ok(mitra.fases.every((f) => f.oferta === 'nao-dua'));
  assert.equal(mitra.regrasEspecificas.length, 0);
  assert.ok(!mitra.pendencias.some((x) => x.id === 'fase1' || x.id === 'ficha'), 'nada de DUA para um máster fora do DUA');
  const food = applicationProcess({ ...BASE, id: 'ugr-master-universitario-alimentacion-nutricion-salud-food-h-0', nome: 'Food-H', duaCodigo: null }, { profile: BR });
  assert.equal(food.canal.status, 'nao-dua-sem-canal');
  assert.ok(food.pendencias.some((x) => x.id === 'canal'));
  const prof = applicationProcess({ ...BASE, id: 'ugr-master-universitario-profesorado-ensenanza-secundaria-obligatoria-bachillerato-formacion-p', nome: 'Máster Universitario en Profesorado de Enseñanza Secundaria Obligatoria', duaCodigo: null }, { profile: BR });
  assert.equal(prof.canal.status, 'confirmado');
  assert.equal(prof.canal.variantes.length, 47);
  assert.ok(prof.pendencias.some((x) => x.id === 'variante'));
  const bucal = applicationProcess({ ...BASE, id: 'ugr-master-universitario-cirugia-bucal-implantologia', nome: 'Cirugía Bucal', duaCodigo: null }, { profile: BR });
  assert.equal(bucal.canal.status, 'nao-confirmado');
  assert.equal(bucal.verificacao, 'parcial');
  assert.equal(MANUAL_DUA_LINKS['ugr-master-universitario-abogacia-procura'], '492208');
});

test('programa demonstrativo nunca aparece como processo real', () => {
  const p = applicationProcess({ id: 'demo', nome: 'Demo', demo: true }, { profile: BR });
  assert.equal(p.verificacao, 'demo');
  assert.equal(p.canal.status, 'demo');
});

// ---------- Missões: aplicabilidade e alertas por mestrado ----------

const user = (extra = {}) => ({ profile: { ...BR, paisResidencia: 'Brasil', estado: 'BA', formacao: 'Psicologia', espanhol: 'B2' }, journeys: [], documents: {}, choices: [], ...extra });
const jr = (programaId, extra = {}) => ({ id: 'j', programaId, anoAcademico: '2026/27', missions: {}, dados: {}, ...extra });
const state = (u, j, id) => engine.missionState(missionById(id), engine.buildContext(u, j));

test('Missão 2.8 (certificação PGS) só se aplica ao mestrado cuja regra oficial a exige', () => {
  assert.equal(state(user(), jr('teste-dua'), '2.8').status, 'nao-aplicavel');
  assert.notEqual(state(user(), jr('teste-pgs'), '2.8').status, 'nao-aplicavel');
  assert.match(state(user(), jr('teste-pgs'), '2.8').info, /Orden CNU\/1309\/2018/);
});

test('canal não confirmado deixa as missões do DUA em atenção, sem esconder o passo', () => {
  const u = user();
  const j = jr('teste-sem-dua', { situacao: { adjudicacao: 'aguardando' } });
  const s = state(u, j, '1.3');
  assert.ok(s.alertas.some((a) => a.chave === 'canal'));
  assert.ok(!state(u, jr('teste-dua'), '1.3').alertas.some((a) => a.chave === 'canal'));
});

test('detalhe da missão traz o processo do mestrado só nas missões de candidatura', () => {
  const u = user();
  const j = jr('teste-dua');
  assert.equal(engine.missionDetail(u, j, '3.2').processo.programa.id, 'teste-dua');
  assert.equal(engine.missionDetail(u, j, '6.1').processo, undefined);
  const fase = engine.missionDetail(u, j, '3.2').objetivos.find((o) => o.id === 'fase');
  assert.equal(fase.tipo, 'escolha');
  assert.deepEqual(fase.opcoes.map(([v]) => v), ['1', '2', '3']);
});

test('limite de 6 opções é objetivo automático (o DUA aceita até 6 pedidos)', () => {
  const seis = ['a', 'b', 'c', 'd', 'e', 'f'];
  const ok = engine.missionDetail(user({ choices: seis }), jr('teste-dua'), '3.4').objetivos.find((o) => o.id === 'limite');
  const sete = engine.missionDetail(user({ choices: [...seis, 'g'] }), jr('teste-dua'), '3.4').objetivos.find((o) => o.id === 'limite');
  assert.equal(ok.feito, true);
  assert.equal(sete.feito, false);
});

// ---------- Estados de candidatura e transições ----------

test('estados: admitido em outra opção abre a matrícula E a lista de espera; reserva só nesse caso', () => {
  assert.deepEqual(ADMITIDO, ['admitido', 'admitido-outra-opcao']);
  const u = user();
  const j = jr('teste-dua');
  engine.setSituacao(j, 'adjudicacao', 'admitido');
  assert.throws(() => engine.setSituacao(j, 'matricula', 'reservada'), /1ª preferência, a ação é a matrícula/);
  engine.setSituacao(j, 'adjudicacao', 'admitido-outra-opcao');
  assert.notEqual(state(u, j, '3.10').status, 'nao-aplicavel', 'continua nas listas preferidas');
  assert.equal(state(u, j, '4.1').bloqueioExterno, false, 'matrícula liberada');
  engine.setSituacao(j, 'matricula', 'reservada');
  assert.equal(j.situacao.matricula, 'reservada');
});

test('transições incoerentes são recusadas: sem vaga não há matrícula; visto exige admissão', () => {
  const j = jr('teste-dua');
  assert.throws(() => engine.setSituacao(j, 'matricula', 'matriculado'), /admissão/);
  assert.throws(() => engine.setSituacao(j, 'visto', 'apresentada'), /admissão/);
  engine.setSituacao(j, 'adjudicacao', 'admitido');
  engine.setSituacao(j, 'matricula', 'matriculado');
  assert.throws(() => engine.setSituacao(j, 'adjudicacao', 'excluido'), /Volte a matrícula/);
  engine.setSituacao(j, 'matricula', 'nao-iniciada');
  engine.setSituacao(j, 'adjudicacao', 'excluido');
  assert.equal(j.situacao.adjudicacao, 'excluido');
  assert.ok(state(user(), j, '3.9').alertas.some((a) => a.tipo === 'externo'), 'exclusão vira atenção na adjudicação');
  assert.equal(j.situacaoRegistro.adjudicacao.origem, 'declarado', 'origem da decisão externa registrada');
});

// ---------- API: validação no servidor e persistência ----------

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

async function doMission(c, jid, id) {
  const m = (await c('GET', `/journeys/${jid}/missions/${id}`)).data.mission;
  for (const o of m.objetivos.filter((x) => !x.feito && x.tipo === 'check')) await c('PUT', `/journeys/${jid}/missions/${id}/objectives/${o.id}`, { feito: true });
  const r = await c('POST', `/journeys/${jid}/missions/${id}/complete`, { confirmo: true });
  assert.equal(r.status, 200, `concluir ${id}: ${JSON.stringify(r.data.error)}`);
}

test('API: fase escolhida é validada no servidor, persistida e refletida no processo', async () => {
  const c = client();
  await c('POST', '/auth/register', { nome: 'Ana Teste', email: 'ana-proc@exemplo.com', senha: 'segura123', aceite: true, maiorIdade: true });
  await c('PUT', '/me/profile', { ...user().profile, nacionalidade: 'Espanhola', onboardingConcluido: true });
  const jid = (await c('POST', '/journeys', { programaId: 'teste-dua', anoAcademico: '2026/27' })).data.journey.id;
  assert.equal((await c('PUT', '/me/choices', { choices: ['teste-dua'] })).status, 200);
  for (const id of ['1.1', '1.2', '1.3']) await doMission(c, jid, id);
  await c('PUT', `/journeys/${jid}/situacao`, { campo: 'adjudicacao', valor: 'aguardando' }); // libera a Rodada 3
  await doMission(c, jid, '3.1');
  const f1 = await c('PUT', `/journeys/${jid}/missions/3.2/objectives/fase`, { valor: '1' });
  assert.equal(f1.status, 409, 'nacionalidade espanhola não concorre na Fase 1');
  assert.match(f1.data.error, /nacionalidade estrangeira/);
  assert.equal((await c('PUT', `/journeys/${jid}/missions/3.2/objectives/fase`, { valor: '9' })).status, 400, 'opção fora da lista');
  assert.equal((await c('PUT', `/journeys/${jid}/missions/3.2/objectives/fase`, { valor: '2' })).status, 200);
  const m = (await c('GET', `/journeys/${jid}/missions/3.2`)).data.mission;
  assert.equal(m.objetivos.find((o) => o.id === 'fase').valor, '2', 'persistida');
  assert.equal(m.processo.faseDeclarada, 2);
  assert.ok(m.processo.fases[1].declarada);
  assert.equal((await c('PUT', '/me/choices', { choices: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).status, 400, 'a API já recusa mais de 6 opções');
});

test('motor: escolha da fase recusa só o que a regra oficial proíbe e persiste a válida', () => {
  const u = user({ requisitos: { diploma: 'nao' } });
  const j = jr('teste-dua', { situacao: { adjudicacao: 'aguardando' } });
  for (const id of ['1.1', '1.2', '1.3', '1.5', '2.4', '2.5', '2.6', '2.7', '2.8', '3.1']) j.missions[id] = { concluidaEm: new Date().toISOString(), objetivos: {} };
  assert.throws(() => engine.setObjective(u, j, '3.2', 'fase', { valor: '7' }), /Opção inválida/);
  engine.setObjective(u, j, '3.2', 'fase', { valor: '1' }); // brasileiro sem título ainda: pode, se concluir até 29/01
  assert.equal(j.dados.faseDua, '1');
  assert.equal(engine.processFor(u, j).faseDeclarada, 1);
  assert.equal(engine.processFor(u, j).fases[0].perfil.status, 'verificar');
  const es = user({ profile: { nacionalidade: 'Espanhola' } });
  assert.throws(() => engine.setObjective(es, jr('teste-dua', { missions: j.missions, situacao: j.situacao }), '3.2', 'fase', { valor: '1' }), /nacionalidade estrangeira/);
});

test('idioma: com dois requisitos obrigatórios de espanhol (B1 e B2), vale o nível mais alto', async () => {
  const { languageRequirements } = await import('../server/radar/connectors/dua-program.js');
  const r = languageRequirements([
    { codigo: '006', obrigatorio: true, texto: 'LOS ALUMNOS EXTRANJEROS PROCEDENTES DE PAÍSES DONDE EL CASTELLANO NO SEA LA LENGUA OFICIAL DEBERÁN ACREDITAR UN NIVEL B1 SEGÚN EL MARCO EUROPEO DE REFERENCIA PARA LAS LENGUAS' },
    { codigo: '099', obrigatorio: true, texto: 'QUIENES SEAN EXTRANJEROS DE PAIS DE HABLA NO ESPAÑOLA NO TENDRÁN ACCESO AL MÁSTER SIN ACREDITAR CORRECTO CONOCIMIENTO HABLADO Y ESCRITO DE ESPAÑOL (ACREDITACION NIVEL INTERMEDIO O B2)' },
  ]);
  const es = r.find((x) => x.idioma === 'espanhol');
  assert.equal(es.nivel, 'B2');
  assert.equal(es.codigo, '099');
});

test('mestrado fora do DUA: passos do DUA viram "não aplicável" e a Missão 3.11 leva ao canal do programa', () => {
  const MITRA = 'ugr-master-erasmus-mundus-migraciones-transnacionales-mitra';
  FAKE[MITRA] = { ...BASE, id: MITRA, nome: 'Máster Universitario Erasmus Mundus en Migraciones Transnacionales (Mitra)', duaCodigo: null, requisitosFicha: null, criteriosOriginais: null, criterios: null };
  const u = user();
  const j = jr(MITRA);
  for (const id of ['2.4', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.10']) assert.equal(state(u, j, id).status, 'nao-aplicavel', id);
  assert.notEqual(state(u, j, '3.11').status, 'nao-aplicavel');
  const d = engine.missionDetail(u, j, '3.11');
  assert.equal(d.linkOficial.url, 'https://www.master-mitra.eu/');
  assert.equal(state(u, jr('teste-dua'), '3.11').status, 'nao-aplicavel', 'mestrado do DUA não tem a 3.11');
  assert.notEqual(state(u, jr('teste-dua'), '3.6').status, 'nao-aplicavel');
});
