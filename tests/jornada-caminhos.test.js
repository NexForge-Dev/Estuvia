// Jornada completa por mestrado: um estudante simulado percorre as 9 rodadas e todas as missões,
// no caminho feliz e nos caminhos difíceis (não admitido, lista de espera, visto indeferido, pedido na
// Espanha, missão reaberta). Falha se alguma missão travar sem motivo, se alguma rodada nunca abrir ou
// se a tela de detalhe de alguma missão quebrar.
// Missões feitas só de dados de outros módulos (finanças, documentos, moradia, viagem) são marcadas como
// concluídas pela simulação: esses módulos têm testes próprios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estuvia-caminhos-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { PROGRAMAS, ASIA_B2, ARQUEOLOGIA, DIBUJO_B1, UCA_ACUICULTURA } = await import('./fixtures/programas-reais.js');
const { registerProgramSource } = await import('../server/content/catalog.js');
await import('../server/app.js');
const E = await import('../server/journey-engine.js');
const { ROUNDS, missionById } = await import('../server/content/rounds.js');

// Canais especiais (content/program-channels.js): fora do DUA e sem oferta confirmada.
const MITRA = 'ugr-master-erasmus-mundus-migraciones-transnacionales-mitra';
const CIRURGIA = 'ugr-master-universitario-cirugia-bucal-implantologia';
const semFicha = { duaCodigo: null, fichaDuaUrl: null, requisitosFicha: null, criterios: null, criteriosOriginais: null, titulacoes: null, fichaVerificadaEm: null };
const ESPECIAIS = {
  [MITRA]: { ...PROGRAMAS[ARQUEOLOGIA], ...semFicha, id: MITRA, nome: 'Máster Erasmus Mundus en Migraciones Transnacionales (Mitra)' },
  [CIRURGIA]: { ...PROGRAMAS[ARQUEOLOGIA], ...semFicha, id: CIRURGIA, nome: 'Máster Universitario en Cirugía Bucal e Implantología' },
};
registerProgramSource((id) => ESPECIAIS[id] || null);

const MESTRADOS = [ASIA_B2, ARQUEOLOGIA, DIBUJO_B1, UCA_ACUICULTURA, MITRA, CIRURGIA];
const PROFILE = { nacionalidade: 'Brasileira', paisResidencia: 'Brasil', estado: 'BA', formacao: 'História', instituicao: 'UFBA', espanhol: 'C1', certificadoEspanhol: 'dele', certificadoNivel: 'C1', onboardingConcluido: true };
const RESOLVIDA = new Set(['concluida', 'nao-aplicavel', 'ignorada']);
const ABERTA = new Set(['disponivel', 'em-andamento', 'atencao', 'aguardando']);
const FELIZ = { adjudicacao: 'admitido', matricula: 'matriculado', visto: 'aprovado' };

function novoEstudante(programaId) {
  const program = PROGRAMAS[programaId] || ESPECIAIS[programaId];
  const jr = { id: 'j1', criadaEm: new Date().toISOString(), programaId, universidadeId: program.universidadeId, anoAcademico: '2027/28', missions: {}, dados: {}, desbloqueios: [] };
  const user = { id: 'u1', nome: 'Estudante', profile: { ...PROFILE }, requisitos: {}, documents: {}, choices: [programaId], journeys: [jr] };
  E.applyRequirements(user, jr);
  return { user, jr };
}

const missoes = (user, jr) => E.computeJourney(user, jr).rodadas.flatMap((r) => r.missoes);
const statusDe = (user, jr, id) => missoes(user, jr).find((m) => m.id === id).status;

/** Percorre a jornada até não haver mais o que fazer. Retorna os erros encontrados no caminho. */
function percorrer(user, jr, { situacao = FELIZ, rota = 'consulado' } = {}) {
  const erros = [];
  for (let volta = 0; volta < 300; volta++) {
    let andou = false;
    for (const m of missoes(user, jr)) {
      if (!ABERTA.has(m.status)) continue;
      for (const o of missionById(m.id).objetivos) {
        if (o.tipo === 'auto') continue;
        try {
          if (o.tipo === 'situacao') {
            if (jr.situacao[o.campo] !== situacao[o.campo]) { E.setObjective(user, jr, m.id, o.id, { valor: situacao[o.campo] }); andou = true; }
          } else if (o.tipo === 'escolha') {
            if (jr.dados[o.campo]) continue;
            const opcoes = o.campo === 'rotaVisto' ? o.opcoes.filter(([k]) => k === rota) : o.opcoes;
            const ok = opcoes.some(([k]) => { try { E.setObjective(user, jr, m.id, o.id, { valor: k }); return true; } catch { return false; } });
            if (ok) andou = true; else erros.push(`${m.id}/${o.id}: nenhuma opção aceita`);
          } else if (o.tipo === 'data') { if (!jr.dados[o.campo]) { E.setObjective(user, jr, m.id, o.id, { valor: '2027-07-01' }); andou = true; } }
          else if (o.tipo === 'texto') { if (!jr.dados[o.campo]) { E.setObjective(user, jr, m.id, o.id, { valor: 'registro' }); andou = true; } }
          else if (!jr.missions[m.id]?.objetivos?.[o.id]) { E.setObjective(user, jr, m.id, o.id, { feito: true }); andou = true; }
        } catch (e) { erros.push(`${m.id}/${o.id}: ${e.message}`); }
      }
      const agora = missoes(user, jr).find((x) => x.id === m.id);
      if (RESOLVIDA.has(agora.status)) continue;
      if (agora.podeConcluir) {
        try { E.completeMission(user, jr, m.id, true, 'comprovante'); andou = true; } catch (e) { erros.push(`${m.id} concluir: ${e.message}`); }
      } else if (ABERTA.has(agora.status)) {
        // Só restam objetivos automáticos de outros módulos: o estudante os cumpre lá.
        (jr.missions[m.id] ??= { objetivos: {} }).concluidaEm = new Date().toISOString();
        andou = true;
      }
    }
    if (!andou) {
      const pedeChegada = E.computeJourney(user, jr).rodadas.some((r) => !r.desbloqueada && r.desbloqueio.faltam.some((f) => f.acao));
      // Só viaja quem foi admitido e tem o visto aprovado (ou pede a autorização já na Espanha).
      const podeViajar = ['admitido', 'admitido-outra-opcao'].includes(situacao.adjudicacao) && (situacao.visto === 'aprovado' || rota === 'espanha');
      if (podeViajar && pedeChegada && !jr.dados.dataEntrada) { jr.dados.dataEntrada = '2027-09-01'; E.applyRequirements(user, jr); continue; }
      break;
    }
    E.completeAutoMissions(user, jr);
  }
  return erros;
}

function pendencias(user, jr) {
  const j = E.computeJourney(user, jr);
  return {
    rodadasFechadas: j.rodadas.filter((r) => !r.desbloqueada).map((r) => r.numero),
    presas: j.rodadas.flatMap((r) => r.missoes).filter((m) => !RESOLVIDA.has(m.status) && !m.opcional),
    jornada: j,
  };
}

function detalhesAbrem(user, jr) {
  for (const r of ROUNDS) for (const m of r.missoes) assert.doesNotThrow(() => E.missionDetail(user, jr, m.id), `detalhe da missão ${m.id}`);
}

for (const id of MESTRADOS) {
  test(`${id}: caminho feliz pelo consulado chega ao fim`, () => {
    const { user, jr } = novoEstudante(id);
    detalhesAbrem(user, jr);
    assert.deepEqual(percorrer(user, jr), []);
    const p = pendencias(user, jr);
    assert.deepEqual(p.rodadasFechadas, []);
    assert.deepEqual(p.presas.map((m) => `${m.id}:${m.status}`), []);
    assert.equal(p.jornada.status, 'concluida');
    assert.equal(statusDe(user, jr, '4.8'), 'nao-aplicavel');
    assert.equal(statusDe(user, jr, '5.11'), 'nao-aplicavel');
    detalhesAbrem(user, jr);
  });

  test(`${id}: pedido da autorização já na Espanha chega ao fim`, () => {
    const { user, jr } = novoEstudante(id);
    assert.deepEqual(percorrer(user, jr, { rota: 'espanha' }), []);
    const p = pendencias(user, jr);
    assert.equal(jr.dados.rotaVisto, 'espanha');
    assert.deepEqual(p.presas.map((m) => `${m.id}:${m.status}`), []);
    assert.equal(p.jornada.status, 'concluida');
  });
}

test('não admitido: para na matrícula com motivo externo, sem erro, e retoma se a admissão sair depois', () => {
  for (const resultado of ['nao-admitido', 'exige-acao', 'excluido']) {
    const { user, jr } = novoEstudante(ARQUEOLOGIA);
    assert.deepEqual(percorrer(user, jr, { situacao: { ...FELIZ, adjudicacao: resultado } }), [], resultado);
    const p = pendencias(user, jr);
    const m41 = p.presas.find((m) => m.id === '4.1');
    assert.ok(m41, `${resultado}: 4.1 deveria esperar a admissão`);
    // A orientação "Resultado sem vaga" aparece e pode ser seguida (o caminhante a concluiu).
    assert.equal(statusDe(user, jr, '4.8'), 'concluida', `${resultado}: 4.8 deveria orientar o estudante`);
    assert.equal(m41.bloqueioExterno, true, `${resultado}: o bloqueio da 4.1 é a decisão da universidade`);
    // Rodadas 1 a 3 e a trilha de financiamento ficam completas: nada do que dependia do estudante trava.
    for (const m of p.presas) assert.ok(m.rodada >= 4, `${resultado}: ${m.id} não deveria travar`);
    detalhesAbrem(user, jr);
    // A situação muda (ex.: recurso aceito): a jornada segue até o fim.
    E.setSituacao(jr, 'adjudicacao', 'admitido');
    assert.deepEqual(percorrer(user, jr), []);
    assert.equal(pendencias(user, jr).jornada.status, 'concluida', resultado);
  }
});

test('lista de espera: a missão de acompanhar as listas aparece, e a admissão posterior libera a matrícula', () => {
  const { user, jr } = novoEstudante(ASIA_B2);
  assert.deepEqual(percorrer(user, jr, { situacao: { ...FELIZ, adjudicacao: 'lista-espera' } }), []);
  const j = E.computeJourney(user, jr);
  const listas = j.rodadas.flatMap((r) => r.missoes).filter((m) => m.status !== 'nao-aplicavel' && m.rodada === 3);
  assert.ok(listas.length > 0);
  assert.ok(pendencias(user, jr).presas.some((m) => m.id === '4.1' && m.bloqueioExterno));
  E.setSituacao(jr, 'adjudicacao', 'admitido-outra-opcao');
  assert.deepEqual(percorrer(user, jr, { situacao: { ...FELIZ, adjudicacao: 'admitido-outra-opcao' } }), []);
  assert.deepEqual(pendencias(user, jr).presas.map((m) => `${m.id}:${m.status}:${JSON.stringify(m.alertas)}:${JSON.stringify(m.bloqueadaPor)}`), []);
  assert.equal(pendencias(user, jr).jornada.status, 'concluida');
});

test('visto indeferido: para no visto, a Rodada 6 não abre, e o visto aprovado depois leva ao fim', () => {
  const { user, jr } = novoEstudante(DIBUJO_B1);
  assert.deepEqual(percorrer(user, jr, { situacao: { ...FELIZ, visto: 'indeferido' } }), []);
  const p = pendencias(user, jr);
  assert.ok(p.rodadasFechadas.includes(6));
  assert.ok(p.presas.some((m) => m.id === '5.9'));
  assert.equal(statusDe(user, jr, '5.11'), 'concluida', '5.11 deveria orientar sobre o recurso');
  for (const m of p.presas) assert.ok(m.rodada >= 5, `${m.id} não deveria travar com o visto indeferido`);
  detalhesAbrem(user, jr);
  E.setSituacao(jr, 'visto', 'aprovado');
  assert.deepEqual(percorrer(user, jr), []);
  assert.equal(pendencias(user, jr).jornada.status, 'concluida');
});

test('missão reaberta no meio da jornada pode ser concluída de novo', () => {
  const { user, jr } = novoEstudante(UCA_ACUICULTURA);
  assert.deepEqual(percorrer(user, jr), []);
  E.reopenMission(user, jr, '2.4');
  const reaberta = missoes(user, jr).find((m) => m.id === '2.4');
  assert.ok(ABERTA.has(reaberta.status), `2.4 reaberta ficou ${reaberta.status}`);
  // Rodadas já abertas continuam abertas (desbloqueio registrado não volta atrás).
  assert.deepEqual(pendencias(user, jr).rodadasFechadas, []);
  assert.deepEqual(percorrer(user, jr), []);
  assert.equal(pendencias(user, jr).jornada.status, 'concluida');
});

test('canais especiais mostram o aviso certo', () => {
  const mitra = novoEstudante(MITRA);
  assert.match(E.processFor(mitra.user, mitra.jr).alertas.canal, /NÃO usa o Distrito Único Andaluz/);
  const cir = novoEstudante(CIRURGIA);
  assert.match(E.processFor(cir.user, cir.jr).alertas.canal, /não aparece no catálogo do DUA/);
});

test('orientação de visto negado só vale para o pedido pelo consulado; a de resultado sem vaga, só para o DUA', () => {
  const es = novoEstudante(ARQUEOLOGIA);
  es.jr.dados.rotaVisto = 'espanha';
  E.setSituacao(es.jr, 'adjudicacao', 'admitido');
  E.setSituacao(es.jr, 'visto', 'indeferido');
  assert.equal(statusDe(es.user, es.jr, '5.11'), 'nao-aplicavel');
  const em = novoEstudante(MITRA);
  E.setSituacao(em.jr, 'adjudicacao', 'nao-admitido');
  assert.equal(statusDe(em.user, em.jr, '4.8'), 'nao-aplicavel');
  const dua = novoEstudante(ARQUEOLOGIA);
  E.setSituacao(dua.jr, 'adjudicacao', 'exige-acao');
  assert.notEqual(statusDe(dua.user, dua.jr, '4.8'), 'nao-aplicavel');
  const det = E.missionDetail(dua.user, dua.jr, '4.8');
  assert.ok(JSON.stringify(det).includes('10 dias'));
});

test('entrega dos originais fica depois da chegada (não bloqueia o visto) e o diploma pede apostila antes de viajar', async () => {
  const objetivos = (id) => missionById(id).objetivos.map((o) => o.texto).join(' | ');
  assert.doesNotMatch(objetivos('4.6'), /originais/i, '4.6 vem antes do visto: não pode exigir entrega presencial');
  assert.match(objetivos('7.3'), /originais/i);
  assert.match(JSON.stringify(missionById('2.2').comoExecutar), /Apostila da Haia/);
  assert.match(objetivos('6.4'), /diploma original apostilado/);
  assert.match(objetivos('5.5'), /toda a estadia/);
  const { SOURCES } = await import('../server/content/sources.js');
  for (const id of ['2.2', '4.3', '4.6', '7.3']) {
    const texto = JSON.stringify(missionById(id));
    for (const ref of texto.match(/\bO\d+\b/g) || []) assert.ok(SOURCES.some((s) => s.id === ref), `${id} cita ${ref}, que não existe`);
  }
});
