// Graduação do perfil × titulações de acesso da ficha do DUA (Missão 1.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { matchDegree, spanishNames, core } = await import('../public/js/data/degree.js');
const { parse } = await import('../server/radar/connectors/dua-program.js');
const { eligibility } = await import('../server/journey-engine.js');

const ficha = (f) => parse(new TextDecoder('windows-1252').decode(fs.readFileSync(new URL(`../server/radar/seed/${f}`, import.meta.url)))).dados;
const bio = ficha('dua-ficha-404508-biotecnologia.html');
const arq = ficha('dua-ficha-404605-arqueologia.html');

test('núcleo do nome: tira "Grado en"/"Licenciado en" e acentos', () => {
  assert.equal(core('GRADO EN BIOLOGÍA'), 'BIOLOGIA');
  assert.equal(core('LICENCIADO EN QUÍMICA'), 'QUIMICA');
  assert.equal(core('INGENIERO QUÍMICO'), 'INGENIERO QUIMICO');
});

test('curso brasileiro → nomes espanhóis', () => {
  assert.deepEqual(spanishNames('Direito'), ['DERECHO']);
  assert.deepEqual(spanishNames('Ciências Biológicas'), ['BIOLOGIA']);
  assert.deepEqual(spanishNames('Bacharelado em Geologia'), ['GEOLOGIA'], 'fora do dicionário: usa o próprio nome');
  assert.ok(spanishNames('Educação Física').includes('CIENCIAS DE LA ACTIVIDAD FISICA Y DEL DEPORTE'), 'mais específico antes do geral');
  assert.deepEqual(spanishNames(''), []);
});

test('ficha real: preferência pela graduação, com a melhor preferência quando há várias', () => {
  const m = (c, f) => { const r = matchDegree(c, f); return r.tipo === 'lista' ? r.preferencia : r.tipo; };
  assert.equal(m('Biologia', bio), 'alta');
  assert.equal(m('Engenharia Química', bio), 'alta');
  assert.equal(m('Nutrição', bio), 'media');
  assert.equal(m('Física', bio), 'baixa');
  assert.equal(m('Direito', bio), 'fora');
  assert.equal(m('História', arq), 'alta');
  assert.equal(m('Biologia', arq), 'baixa');
  assert.ok(matchDegree('Biologia', bio).nomes.includes('GRADO EN BIOLOGÍA'));
});

test('admissão condicionada e "resto de titulaciones"', () => {
  const f = { titulacoes: [], condicionadas: [{ nome: 'GRADO EN DERECHO', requisitos: ['004'] }], restoComAcesso: ['GRADO EN ECONOMÍA'] };
  assert.deepEqual(matchDegree('Direito', f), { tipo: 'condicionada', exata: true, nomes: ['GRADO EN DERECHO'], requisitos: ['004'] });
  assert.equal(matchDegree('Economia', f).tipo, 'resto');
});

test('elegibilidade: item da graduação só com a lista da ficha', () => {
  const prog = (extra) => ({ idioma: { status: 'nao-requerido', fonte: 'O30' }, outrosIdiomas: [], ...extra });
  const row = (profile, program) => eligibility({ profile, program }).find((i) => i.requisito === 'Graduação aceita pelo máster');
  const lista = { titulacoes: bio.titulacoes, condicionadas: [], restoComAcesso: [], equivalentes: [] };
  assert.equal(row({ formacao: 'Graduação concluída' }, prog({})), undefined, 'sem ficha do DUA: sem item');
  assert.equal(row({ formacao: 'Graduação concluída' }, prog({ titulacoes: lista })).status, 'falta-informar');
  const alta = row({ graduacao: 'Biologia' }, prog({ titulacoes: lista }));
  assert.equal(alta.status, 'pref-alta');
  assert.match(alta.texto, /Grado en Biología/);
  assert.match(alta.texto, /comissão do máster confere/);
  assert.equal(row({ graduacao: 'Física' }, prog({ titulacoes: lista })).status, 'pref-baixa');
  const fora = row({ graduacao: 'Direito' }, prog({ titulacoes: lista }));
  assert.equal(fora.status, 'fora-da-lista');
  assert.match(fora.texto, /Missão 3\.8/);
  const arqLista = { titulacoes: arq.titulacoes, condicionadas: [], restoComAcesso: [], equivalentes: arq.titulacoesEquivalentes };
  assert.match(row({ graduacao: 'Direito' }, prog({ titulacoes: arqLista })).texto, /Titulación Equivalente/i, 'mostra a linha de título equivalente');
  assert.equal(row({ graduacao: 'Biologia' }, prog({ titulacoes: { titulacoes: [], condicionadas: [], restoComAcesso: [], equivalentes: [] } })).status, 'nao-confirmado');
});
