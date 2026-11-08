// Auditoria do planejador: preço desconhecido não vira zero, taxa de agência entra no orçamento,
// câmbio antigo vem marcado, bolsa não concedida não conta como dinheiro disponível.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-fin-audit-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.FX_PROVIDER = 'off';

const { computeFinance, exchange } = await import('../server/finance-engine.js');
const { setRateForTests, rateIsStale, refreshRate } = await import('../server/fx.js');

after(() => { setRateForTests(null); fs.rmSync(tmp, { recursive: true, force: true }); });

const NOW = new Date('2026-10-24T12:00:00Z');
const journey = { id: 'j1', programaId: 'ugr-demo-eng', anoAcademico: '2027/28', duracaoMeses: 12, missions: {}, dados: {} };
const user = (finance = {}, extra = {}) => ({ profile: {}, documents: {}, finance: { ...finance }, ...extra });
const item = (f, id) => f.itens.find((i) => i.id === id);

test('rota escolhida sem preço do voo não vira "passagens = € 0"', () => {
  const f = computeFinance(user({}, { travel: { opcoes: [{ id: 'r', rota: 'REC → MAD', voo: null, escolhida: true }], chegada: {} } }), journey, NOW);
  assert.equal(item(f, 'passagens').valorEur, null);
  assert.ok(f.faltamInformar.includes('passagens'));
  // O estudante ainda pode informar o valor enquanto a cotação não tem preço.
  const g = computeFinance(user({ itens: { passagens: { valor: 900, moeda: 'EUR', status: 'estimado' } } }, { travel: { opcoes: [{ id: 'r', rota: 'REC → MAD', escolhida: true }], chegada: {} } }), journey, NOW);
  assert.equal(item(g, 'passagens').valorEur, 900);
  assert.equal(item(g, 'passagens').origemTipo, 'usuario');
});

test('taxa de agência da moradia escolhida entra uma vez no orçamento e não é reembolsável', () => {
  const housing = [{ id: 'h', nome: 'Piso Centro', status: 'escolhida', aluguel: 300, contasIncluidas: true, caucao: 300, taxaAgencia: 150, moeda: 'EUR' }];
  const sem = computeFinance(user({}, { housing: [{ ...housing[0], taxaAgencia: null }] }), journey, NOW);
  const com = computeFinance(user({}, { housing }), journey, NOW);
  const taxa = item(com, 'taxaAgencia');
  assert.equal(taxa.valorEur, 150);
  assert.equal(taxa.grupo, 'instalacao');
  assert.equal(taxa.reembolsavel, false);
  assert.equal(item(sem, 'taxaAgencia'), undefined);
  assert.equal(com.orcamento - sem.orcamento, 150);
  assert.equal(com.custoDefinitivo - sem.custoDefinitivo, 150, 'não é descontada como caução');
});

test('sem provedor de câmbio: nenhuma taxa inventada e real fica fora da soma', async () => {
  setRateForTests(null);
  assert.equal(await refreshRate(), null, 'FX_PROVIDER=off não busca nada');
  const f = computeFinance(user({ recursos: [{ id: 'a', tipo: 'poupanca', descricao: 'Poupança', valor: 6000, moeda: 'BRL', status: 'disponivel' }] }), journey, NOW);
  assert.equal(f.cambio, null);
  assert.equal(f.recursos[0].valorEur, null);
  assert.equal(f.confirmados, 0);
  assert.equal(f.gruposRecursos.disponivel.semCambio, 1);
});

test('taxa de referência antiga (falha ao renovar) vem marcada como desatualizada', () => {
  const fresh = { taxa: 6, data: '2026-10-23', obtidoEm: '2026-10-24T10:00:00Z', fonte: 'BCE', url: 'https://www.frankfurter.app/' };
  assert.equal(rateIsStale(fresh, NOW), false);
  assert.equal(rateIsStale({ ...fresh, obtidoEm: '2026-10-21T10:00:00Z' }, NOW), true, 'obtida há mais de 24 h');
  assert.equal(rateIsStale({ ...fresh, data: '2026-10-10' }, NOW), true, 'cotação do BCE com mais de 5 dias');
  assert.equal(rateIsStale({ ...fresh, obtidoEm: 'lixo' }, NOW), true, 'data ilegível não passa por recente');
  setRateForTests({ ...fresh, obtidoEm: '2026-10-20T10:00:00Z', data: '2026-10-20' });
  const fx = exchange({}, NOW);
  assert.equal(fx.taxa, 6);
  assert.equal(fx.desatualizada, true);
  assert.equal(computeFinance(user(), journey, NOW).cambioInfo.desatualizada, true);
  // Taxa informada pelo estudante não depende do provedor.
  assert.equal(exchange({ cambio: 6.2 }, NOW).origem, 'manual');
  setRateForTests(null);
});

test('bolsa ainda não concedida não conta como dinheiro disponível (nem para o visto)', () => {
  const apps = (status) => [{ id: 'b1', nome: 'Bolsa X', status, valorTotal: 9000, moeda: 'EUR' }];
  const enviada = computeFinance(user({ informouRecursos: true }, { scholarshipApps: apps('enviada') }), journey, NOW);
  assert.equal(enviada.confirmados, 0);
  assert.equal(enviada.previstos, 9000);
  assert.equal(enviada.visto.falta, enviada.exigenciaVisto);
  const recurso = computeFinance(user({ recursos: [{ id: 'r', tipo: 'bolsa', descricao: 'Bolsa Y', valor: 5000, moeda: 'EUR', status: 'solicitado' }] }), journey, NOW);
  assert.equal(recurso.confirmados, 0);
  const concedida = computeFinance(user({}, { scholarshipApps: apps('concedida') }), journey, NOW);
  assert.equal(concedida.confirmados, 9000);
});
