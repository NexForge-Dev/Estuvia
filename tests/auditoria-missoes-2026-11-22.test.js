// Auditoria de missões e rodadas (22/11/2026): a Missão 2.5 não pode virar beco sem saída.
// Quando a ficha do mestrado não confirma a exigência de espanhol, o objetivo automático "certificado atende
// ao nível" não tinha com o que comparar e nunca era cumprido; como a 2.5 é pré-requisito da Rodada 3,
// a jornada parava ali para a maioria dos mestrados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-idioma-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;

const { registerProgramSource } = await import('../server/content/catalog.js');
const { missionById } = await import('../server/content/rounds.js');
const engine = await import('../server/journey-engine.js');

const base = { universidadeId: 'ugr', nome: 'Máster de teste', duracaoMeses: 12, radar: true, requisitos: [] };
const PROGS = {
  'sem-ficha': { ...base, id: 'sem-ficha', idioma: { status: 'verificar', fonte: 'O10' } },
  'sem-forma': { ...base, id: 'sem-forma', idioma: { status: 'requerido', nivel: 'B2', certificado: false, fonte: 'O30' } },
  'b2-cert': { ...base, id: 'b2-cert', idioma: { status: 'requerido', nivel: 'B2', certificado: true, fonte: 'O30' } },
};
registerProgramSource((id) => PROGS[id] || null);

const user = (profile = {}) => ({ profile: { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'SP', formacao: 'Engenharia', espanhol: 'B1', ...profile }, journeys: [], documents: {}, choices: [] });
const done = (ids) => Object.fromEntries(ids.map((id) => [id, { concluidaEm: '2026-11-01T10:00:00Z', objetivos: {} }]));
const jr = (programaId) => ({ id: 'j', programaId, anoAcademico: '2027/28', missions: done(['1.1', '1.2', '1.3', '1.4', '1.5']), dados: {} });
const state = (u, j, id = '2.5') => engine.missionState(missionById(id), engine.buildContext(u, j));
const atende = (s) => s._objetivos.find((o) => o.id === 'atende').feito;

test('ficha sem exigência confirmada: a 2.5 pode sair do caminho depois de falar com a coordenação', () => {
  const u = user();
  const j = jr('sem-ficha');
  const s = state(u, j);
  assert.equal(s.status, 'atencao');
  assert.equal(s.dispensavel, true);
  assert.equal(atende(s), false, 'sem certificado declarado, nada a marcar sozinho');
  engine.setMissionFlags(u, j, '2.5', { naoAplicavel: true });
  const after = state(u, j);
  assert.equal(after.status, 'nao-aplicavel', 'deixa de travar a Rodada 3');
  assert.match(after.motivoNaoAplicavel, /coordenação/);
  engine.setMissionFlags(u, j, '2.5', { naoAplicavel: false });
  assert.equal(state(u, j).status, 'atencao', 'e dá para voltar atrás');
});

test('ficha sem nível: o certificado declarado cumpre o objetivo automático', () => {
  const s = state(user({ certificadoEspanhol: 'DELE', certificadoNivel: 'B1' }), jr('sem-ficha'));
  assert.equal(atende(s), true);
});

test('ficha com nível mas sem dizer como comprovar: também dispensável pela coordenação', () => {
  assert.equal(state(user(), jr('sem-forma')).dispensavel, true);
});

test('exigência confirmada na ficha (B2 com certificado): continua obrigatória, sem atalho', () => {
  const u = user();
  const j = jr('b2-cert');
  assert.equal(state(u, j).dispensavel, false);
  assert.throws(() => engine.setMissionFlags(u, j, '2.5', { naoAplicavel: true }), /necessária/);
  assert.equal(atende(state(user({ certificadoEspanhol: 'DELE', certificadoNivel: 'B1' }), j)), false, 'B1 não atende B2');
  assert.equal(atende(state(user({ certificadoEspanhol: 'DELE', certificadoNivel: 'C1' }), j)), true);
  // Outras missões necessárias continuam sem o botão "não se aplica".
  assert.throws(() => engine.setMissionFlags(u, j, '2.4', { naoAplicavel: true }), /necessária/);
});

test('pedido da autorização na Espanha: a Rodada 6 espera a matrícula (não abre já na Rodada 1)', () => {
  const u = user({ certificadoEspanhol: 'DELE', certificadoNivel: 'C1' });
  const j = { ...jr('b2-cert'), dados: { rotaVisto: 'espanha' } };
  j.missions['5.10'] = { concluidaEm: '2026-11-01T10:00:00Z', objetivos: {} };
  const r6 = () => engine.roundUnlock(6, engine.buildContext(u, j));
  assert.equal(state(u, j, '5.9').status, 'nao-aplicavel', 'na rota Espanha o visto do consulado não se aplica');
  assert.equal(r6().desbloqueada, false, 'sem matrícula, nada de "Preparando minha mudança"');
  assert.ok(r6().faltam.some((f) => f.id === '4.6'));
  j.missions['4.6'] = { concluidaEm: '2026-11-02T10:00:00Z', objetivos: {} };
  assert.equal(r6().desbloqueada, true, 'matriculado: a mudança começa');
});
