// Base verificada de jurisdições consulares (server/content/places.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSULATES, CONSULAR_JURISDICTIONS, UF_NOMES, consulateForState, consulateResult } from '../server/content/places.js';

test('jurisdições: cada estado do Brasil tem exatamente uma repartição', () => {
  const ufs = Object.keys(UF_NOMES);
  assert.equal(ufs.length, 27);
  for (const uf of ufs) assert.equal(CONSULATES.filter((c) => c.estadosConfirmados.includes(uf)).length, 1, uf);
  assert.equal(CONSULAR_JURISDICTIONS.length, 27);
  for (const j of CONSULAR_JURISDICTIONS) {
    assert.equal(j.pais, 'Brasil');
    assert.equal(j.servico, 'visto-estudos');
    assert.match(j.fonteUrl, /^https:\/\/www\.exteriores\.gob\.es\//);
    assert.match(j.verificadoEm, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(j.contatos.email.endsWith('@maec.es'));
  }
});

test('consulado: Paraíba → Salvador, com contatos, link direto do visto e fonte', () => {
  const r = consulateResult('PB');
  assert.equal(r.status, 'encontrado');
  assert.equal(r.consulado.nome, 'Consulado Geral da Espanha em Salvador da Bahia');
  assert.equal(r.estado.nome, 'Paraíba');
  assert.equal(r.consulado.email, 'cog.salvador.vis@maec.es');
  assert.equal(r.consulado.emailEspecificoVistos, true);
  assert.match(r.consulado.vistoEstudosUrl, /salvadordebahia\/es\/ServiciosConsulares.*Visado\+de\+estudios/);
  assert.match(r.fonte.url, /salvadordebahia\/es\/Consulado\/Paginas\/Demarcaci/);
  assert.equal(consulateForState('PB').id, 'salvador');
  assert.equal(consulateResult('MG').consulado.id, 'rio-de-janeiro');
  assert.equal(consulateResult('PR').consulado.id, 'sao-paulo');
  assert.equal(consulateResult('SC').consulado.id, 'porto-alegre');
  assert.equal(consulateResult('AM').consulado.id, 'brasilia');
});

test('consulado: e-mail geral não é apresentado como e-mail de vistos', () => {
  const sp = consulateResult('SP').consulado;
  assert.equal(sp.emailEspecificoVistos, false);
  assert.equal(sp.emailRotulo, 'E-mail geral do consulado');
  assert.equal(consulateForState('SP').emailVistos, undefined);
});

test('consulado: sem dado confirmado não inventa — devolve o procedimento oficial', () => {
  assert.equal(consulateResult('').status, 'sem-estado');
  const x = consulateResult('XX');
  assert.equal(x.status, 'nao-confirmado');
  assert.equal(x.consulado, undefined);
  assert.match(x.procedimento.url, /exteriores\.gob\.es\/Embajadas\/brasilia/);
  const pt = consulateResult('PB', { pais: 'Portugal' });
  assert.equal(pt.status, 'fora-do-brasil');
  assert.equal(pt.consulado, undefined);
  assert.equal(consulateResult('PB', { pais: 'brasil' }).status, 'encontrado');
});
