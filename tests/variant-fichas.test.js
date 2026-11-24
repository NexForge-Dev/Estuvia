// Mestrado com vários códigos no DUA: cada grupo mostra a sua ficha (content/variant-fichas.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANT_FICHAS } from '../server/content/variant-fichas.js';
import { CHANNELS } from '../server/content/program-channels.js';
import { filterPrograms } from '../public/js/data/programs.js';

test('as fichas por código batem com os códigos do canal e os pesos somam 100', () => {
  for (const [id, v] of Object.entries(VARIANT_FICHAS)) {
    assert.deepEqual(v.variantes.map((x) => x.codigo).sort(), CHANNELS[id].variantes.map((x) => x.codigo).sort());
    for (const x of v.variantes) {
      assert.equal(x.ficha.baremo.reduce((s, c) => s + c.peso, 0), 100);
      assert.ok(x.ficha.titulacoes.length && x.ficha.requisitos.some((r) => r.obrigatorio));
      for (const c of x.ficha.condicionadas) for (const r of c.requisitos) assert.ok(x.ficha.requisitos.some((y) => y.codigo === r), 'requisito citado existe');
    }
  }
});

test('o Radar mostra os dois grupos, as vagas e os pesos comuns', async () => {
  const { data } = await import('../server/radar/db.js');
  const { programCatalog, opportunityDetail } = await import('../server/radar/service.js');
  const [id] = Object.keys(VARIANT_FICHAS);
  const d = data();
  d.programs.push({ id, universidadeId: 'ugr', nome: 'Máster de teste', ramos: [] });
  d.opportunities.push({ id: `${id}--2027-2028`, programId: id, universidadeId: 'ugr', tipo: 'mestrado', anoAcademico: '2027/2028', procedimentoId: 'dua-masteres' });
  const o = opportunityDetail(`${id}--2027-2028`);
  assert.deepEqual(o.admissaoVariantes.map((v) => [v.codigoDua, v.modalidade, v.vagas]), [['410800', 'presencial', 30], ['410815', 'hibrida', 20]]);
  assert.match(o.requisitos.find((r) => r.tipo === 'idioma').texto, /espanhol B1/);
  assert.equal(o.vagas.ofertadas, '30 presenciais + 20 híbridas');
  const p = programCatalog().programas.find((x) => x.id === id);
  assert.deepEqual(p.criterios.map((c) => c.peso), [50, 40, 10]);
  // Na ficha, "Administración y Dirección de Empresas" tem preferência alta, mas o título equivalente é condicionado.
  const comCurso = programCatalog({ user: { profile: { graduacao: 'Administração' }, journeys: [] } }).programas.find((x) => x.id === id);
  assert.equal(comCurso.graduacao.tipo, 'condicionada');
  assert.equal(filterPrograms([p], { modalidade: 'hibrida' }).length, 1);
  assert.equal(filterPrograms([p], { q: '410815' }).length, 1);
});
