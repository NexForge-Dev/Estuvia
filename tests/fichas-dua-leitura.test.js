// Leitura das fichas oficiais do DUA: casos reais encontrados na conferência das 987 fichas (16/11/2026).
// Cada texto abaixo é copiado da ficha oficial do código indicado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-fichas-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { languageRequirements } = await import('../server/radar/connectors/dua-program.js');
const { applicationProcess } = await import('../server/application-process.js');
const { registerProgramSource } = await import('../server/content/catalog.js');
const engine = await import('../server/journey-engine.js');

const es = (requisitos) => languageRequirements(requisitos).find((i) => i.idioma === 'espanhol') || null;

test('804105 (Estudios de Género): "NO TENDRÁN ACCESO… SIN ACREDITAR… B2" é exigência mesmo sem a marca de obrigatório', () => {
  const r = es([{ codigo: '009', obrigatorio: false, texto: 'QUIENES SEAN EXTRANJEROS DE PAIS DE HABLA NO ESPAÑOLA NO TENDRÁN ACCESO AL MÁSTER SIN ACREDITAR CORRECTO CONOCIMIENTO HABLADO Y ESCRITO DE ESPAÑOL (ACREDITACION NIVEL INTERMEDIO O B2)' }]);
  assert.equal(r?.nivel, 'B2');
});

test('recomendação de espanhol não vira exigência (401507, 807904)', () => {
  assert.equal(es([{ codigo: '006', obrigatorio: false, texto: 'PARA ESTUDIANTES PROCEDENTES DE PAÍSES DONDE EL ESPAÑOL NO SEA LA LENGUA OFICIAL SE RECOMIENDAN CONOCIMIENTOS DE ESPAÑOL DE NIVEL B1' }]), null);
  assert.equal(es([{ codigo: '004', obrigatorio: false, texto: 'ES RECOMENDABLE EL CONOCIMIENTO MÍNIMO DE ESPAÑOL NIVEL B1 PARA EL ALUMNADO EXTRANJERO' }]), null);
});

const BASE = { universidadeId: 'uma', ciclo: '2026/27', duracaoMeses: 12, radar: true, idioma: { status: 'nao-requerido', fonte: 'O30' }, requisitos: [], duaCodigo: '999999', criteriosOriginais: [], criterios: [] };
const BR = { nacionalidade: 'Brasileira' };

test('515204 (Ingeniería Industrial, UMA): título estrangeiro não homologado sem acesso gera o alerta mesmo sem a marca de obrigatório', () => {
  const p = applicationProcess({ ...BASE, id: 't1', nome: 'INGENIERÍA INDUSTRIAL', requisitosFicha: [{ codigo: '004', obrigatorio: false, texto: '004 LAS TITULACIONES UNIVERSITARIAS EXTRANJERAS NO HOMOLOGADAS, NO TENDRÁN ACCESO A ESTE MASTER' }] }, { profile: BR });
  assert.equal(p.flags.exigeTituloHomologadoFicha, true);
  assert.match(p.alertas.homologacao, /HOMOLOGADO/);
});

test('325902 (Caminos): título estrangeiro homologado ao grau habilitante gera o alerta', () => {
  const p = applicationProcess({ ...BASE, id: 't2', nome: 'INGENIERÍA DE CAMINOS, CANALES Y PUERTOS', requisitosFicha: [{ codigo: '004', obrigatorio: false, texto: 'TÍTULO EXTRANJERO DE INGENIERÍA CIVIL O SIMILAR, HOMOLOGADO AL GRADO HABILITANTE DE OBRAS PÚBLICAS (ORDEN CIN/307/2009). EL TÍTULO ORIGINAL DEBE PERMITIR EL ACCESO A MÁSTER. SE APLICA LA PRIORIDAD DE LA MEMORIA DE VERIFICACIÓN.' }] }, { profile: BR });
  assert.equal(p.flags.exigeTituloHomologadoFicha, true);
});

test('819109 (Caminos, US): "título no homologado deben aportar…" é documento, não barreira', () => {
  const p = applicationProcess({ ...BASE, id: 't3', nome: 'INGENIERÍA DE CAMINOS, CANALES Y PUERTOS', requisitosFicha: [{ codigo: '006', obrigatorio: false, texto: 'TITULADOS EXTRANJEROS CON TÍTULO NO HOMOLOGADO DEBEN APORTAR CONTENIDO/PROGRAMAS DE LAS ASIGNATURAS CURSADAS EN SU TITULACIÓN Y TABLA DE EQUIVALENCIA ENTRE LAS MISMAS Y LAS OFERTADAS EN EL GRADO EN INGENIERÍA CIVIL DE LA US (3 PRIMEROS CURSOS).' }] }, { profile: BR });
  assert.equal(p.flags.exigeTituloHomologadoFicha, undefined);
});

test('411502 (Interpretación de Conferencias): "prueba de acceso en todo caso" é etapa própria; "no existiendo pruebas" não é', () => {
  const sim = applicationProcess({ ...BASE, id: 't4', nome: 'INTERPRETACIÓN DE CONFERENCIAS', requisitosFicha: [{ codigo: '007', obrigatorio: false, texto: 'LA ACEPTACIÓN DEL CANDIDATO QUEDARÁ CONDICIONADA A LA APROBACION DE DICHO EXAMEN. LOS CANDIDATOS TENDRÁN QUE HACER LA PRUEBA DE ACCESO EN TODO CASO.' }] }, { profile: BR });
  assert.equal(sim.flags.etapaPropriaFicha, true);
  assert.match(sim.alertas.etapa, /prevê etapa de seleção própria/);
  const nao = applicationProcess({ ...BASE, id: 't5', nome: 'GEOMÁTICA', requisitosFicha: [{ codigo: '006', obrigatorio: false, texto: 'LA SELECCIÓN SE HARÁ EN BASE A LA DOCUMENTACIÓN APORTADA POR EL SOLICITANTE, NO EXISTIENDO PRUEBAS O EXÁMENES DE ADMISIÓN ESPECÍFICAS.' }] }, { profile: BR });
  assert.equal(nao.flags.etapaPropriaFicha, undefined);
  const podera = applicationProcess({ ...BASE, id: 't6', nome: 'FINANZAS', requisitosFicha: [{ codigo: '005', obrigatorio: false, texto: 'LA COMISIÓN ACADÉMICA PODRÁ ENTREVISTARSE, SI LO ESTIMA OPORTUNO, CON ALGUNOS DE LOS ASPIRANTES' }] }, { profile: BR });
  assert.equal(podera.flags.etapaPropriaFicha, undefined, '"podrá" não é etapa obrigatória (o texto continua visível na lista de requisitos)');
});

test('ficha que só diz o nível (404508 "SE LE EXIGIRÁ UN NIVEL DE ESPAÑOL B1"): a Missão 2.5 continua ativa, com atenção', () => {
  const prog = { ...BASE, id: 'teste-b1-sem-forma', universidadeId: 'ugr', idioma: { status: 'requerido', nivel: 'B1', certificado: false, fonte: 'O30', texto: 'A LOS ESTUDIANTES EXTRANJEROS SE LE EXIGIRÁ UN NIVEL DE ESPAÑOL B1' } };
  registerProgramSource((id) => (id === prog.id ? prog : null));
  const user = { profile: { ...BR, paisResidencia: 'Brasil', espanhol: 'B1' }, journeys: [], documents: {}, choices: [] };
  const jr = { id: 'j1', programaId: prog.id, universidadeId: 'ugr', anoAcademico: '2027/28', missions: {}, dados: {} };
  user.journeys.push(jr);
  const j = engine.computeJourney(user, jr);
  const m = j.rodadas.flatMap((r) => r.missoes).find((x) => x.id === '2.5');
  assert.notEqual(m.status, 'nao-aplicavel');
  assert.ok((m.alertas || []).some((a) => /não diz como comprovar/.test(a.texto)), JSON.stringify(m.alertas));
});
