// Auditoria do processo de candidatura de TODOS os mestrados.
//
// Para cada mestrado, resolve o processo com server/application-process.js (o mesmo código que a jornada usa)
// e classifica: canal confirmado no catálogo do DUA? ficha coletada? fases com oferta confirmadas?
// regras oficiais específicas? requisitos obrigatórios da ficha?
//
// Entradas (somente leitura):
//   --dump <arquivo>   detalhes públicos das oportunidades (GET /api/radar/opportunities/:id de um ambiente)
//                      sem --dump, usa os programas do Radar local (data/radar.json)
//   --saida <prefixo>  grava <prefixo>.json (detalhe por mestrado) e <prefixo>.md (resumo)
//
// Oferta por fase: em 13/11/2026 o catálogo público do DUA devolveu a MESMA lista (byte a byte) nas consultas
// das Fases 1, 2 e 3 das 10 universidades. Não há fonte pública da oferta da Fase 1 por máster: ela fica como
// "não confirmada" para todos (server/application-process.js).
//
// Uso: node scripts/audit-candidaturas.mjs --dump prod.json --saida auditoria

import fs from 'node:fs';
import { applicationProcess } from '../server/application-process.js';
import { PROGRAMS } from '../server/content/catalog.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dumpFile = arg('--dump');
const saida = arg('--saida') || 'auditoria-candidaturas';
const radar = JSON.parse(fs.readFileSync(new URL('../data/radar.json', import.meta.url), 'utf8'));
const CICLO = '2026/2027';

// ---------- Programas ----------
const calendario = {
  windows: radar.windows.filter((w) => w.anoAcademico === CICLO && w.confirmacao === 'confirmado'),
  events: radar.events.filter((e) => e.anoAcademico === CICLO && e.confirmacao === 'confirmado'),
};

function fromDump(o) {
  const a = o.admissao;
  const codigo = a?.codigoDua || (o.programId.startsWith('dua-') ? o.programa.codigo : null);
  return {
    id: o.programId, universidadeId: o.universidade?.id, nome: o.programa.nome, url: o.programa.webPropria || o.programa.fichaUrl,
    duaCodigo: codigo, fichaDuaUrl: a?.url || null,
    requisitosFicha: a ? a.requisitos.map(({ codigo: c, texto, obrigatorio }) => ({ codigo: c, texto, obrigatorio })) : null,
    criteriosOriginais: a ? a.criterios.map((c) => ({ original: c.original, peso: c.peso })) : null,
    criterios: a ? a.criterios : null,
    fichaVerificadaEm: a?.verificadaEm || null,
    idiomas: a?.idiomas || [],
  };
}
function fromLocal(p) {
  return {
    id: p.id, universidadeId: p.universidadeId, nome: p.nome, url: p.fichaUrl, duaCodigo: p.duaCodigo || null,
    requisitosFicha: p.fichaDua ? p.fichaDua.requisitos : null,
    criteriosOriginais: p.fichaDua ? p.fichaDua.baremo.map((c) => ({ original: c.descricao, peso: c.peso })) : null,
    fichaVerificadaEm: p.fichaDua?.verificadaEm || null, idiomas: p.fichaDua?.idiomasExigidos || [],
  };
}

const dump = dumpFile ? JSON.parse(fs.readFileSync(dumpFile, 'utf8')) : null;
const programas = [
  ...(dump ? dump.detalhes.map(fromDump) : radar.programs.filter((p) => !p.ausenteNoCatalogo).map(fromLocal)),
  ...PROGRAMS.map((p) => ({ ...p })), // demonstrativos do catálogo local
];

// ---------- Auditoria ----------
// "Antes": a jornada era a mesma para todos e não tratava estes pontos. Lacunas gerais valem para todos os reais.
const LACUNAS_GERAIS = [
  'Fase 1: pagamento a cuenta de 400 € na matrícula (O1 art. 6) não aparecia; a Rodada 4 tratava "confirmar vaga" e taxas como etapas genéricas.',
  'Limite de 6 másteres por solicitação (O1 art. 3; O2 art. 14.1) não era validado.',
  'Data-limite para o título concluído e a expedição paga, por fase (O1 Anexo I; O2 Anexo I), não existia como etapa nem prazo.',
  'Obrigação de agir após CADA lista (matrícula, reserva ou confirmação) e a perda do direito por omissão (O1 art. 6; O2 art. 14.7) não estavam explícitas.',
  'Alegações/revisão após cada lista (O1 art. 10; O2 art. 17) não eram mencionadas.',
  'Situação "admitido em outra opção, em lista nas preferidas" não existia: quem reservava ficava sem a Missão 3.10.',
  'Matrícula apresentada como definitiva, sem a conferência posterior dos documentos (O1 art. 11; O2 art. 16).',
  'Prazos oficiais de todas as fases eram aplicados à jornada, inclusive de fases vencidas ou que o estudante não usaria.',
  'Não informava que, com título estrangeiro, o título precisa estar concluído em qualquer fase (a exceção dos requisitos 4 e 5 do art. 2 de O2 vale só para graduação em universidade espanhola ou PARS andaluz). Correção da 2ª auditoria: a 1ª versão aplicava essa exceção a todos.',
];

const resultados = programas.map((prog) => {
  const proc = applicationProcess(prog, { calendario, profile: { nacionalidade: 'Brasileira' } });
  const problemas = [];
  if (prog.demo) problemas.push('Programa demonstrativo (não é um mestrado real).');
  else {
    if (proc.canal.status !== 'confirmado') problemas.push('Canal de candidatura não confirmado: o mestrado não está vinculado ao catálogo do DUA, mas a jornada mandava candidatar-se no DUA sem aviso.');
    if (!proc.flags.fichaColetada) problemas.push('Ficha do DUA não coletada: critérios, requisitos obrigatórios e graduações aceitas não confirmados.');
    const obrig = proc.requisitosEspecificos.filter((r) => r.obrigatorio);
    const naoIdioma = obrig.filter((r) => !(prog.idiomas || []).some((i) => i.codigo === r.codigo));
    if (naoIdioma.length) problemas.push(`${naoIdioma.length} requisito(s) obrigatório(s) da ficha que não eram exibidos nas missões (só os de idioma apareciam): ${naoIdioma.map((r) => r.codigo).join(', ')}.`);
    for (const r of proc.regrasEspecificas) problemas.push(`Regra oficial específica ausente da jornada: ${r.id} (${r.fonte} ${r.artigo}).`);
  }
  return {
    id: prog.id, universidade: prog.universidadeId, nome: prog.nome, codigoDua: prog.duaCodigo || null,
    verificacao: proc.verificacao, canal: proc.canal.status, fichaColetada: proc.flags.fichaColetada,
    fases: proc.fases.map((f) => ({ fase: f.fase, oferta: f.oferta })),
    requisitosObrigatorios: proc.requisitosEspecificos.filter((r) => r.obrigatorio).length,
    documentosDerivados: proc.documentosDerivados.map((d) => d.id),
    regrasEspecificas: proc.regrasEspecificas.map((r) => r.id),
    pendencias: proc.pendencias.filter((p) => !p.geral).map((p) => p.id),
    problemas,
    fontes: [...proc.procedimento.fontes.map((s) => s.url), prog.fichaDuaUrl].filter(Boolean),
  };
});

const reais = resultados.filter((r) => r.verificacao !== 'demo');
const conta = (fn) => reais.filter(fn).length;
const porUniv = {};
for (const r of reais) {
  const u = (porUniv[r.universidade] ??= { total: 0, confirmado: 0, parcial: 0, semCanal: 0, semFicha: 0, comObrigatorios: 0 });
  u.total += 1; u[r.verificacao] += 1;
  if (r.requisitosObrigatorios) u.comObrigatorios += 1;
  if (r.canal !== 'confirmado') u.semCanal += 1;
  if (!r.fichaColetada) u.semFicha += 1;
}
const resumo = {
  geradoEm: new Date().toISOString(),
  fonteProgramas: dump ? `dump ${dump.coletadoEm}` : 'data/radar.json',
  total: resultados.length,
  reais: reais.length,
  demonstrativos: resultados.length - reais.length,
  corretosAntes: 0,
  comCorrecao: reais.length,
  lacunasGerais: LACUNAS_GERAIS,
  confirmados: conta((r) => r.verificacao === 'confirmado'),
  parciais: conta((r) => r.verificacao === 'parcial'),
  canalNaoConfirmado: conta((r) => r.canal !== 'confirmado'),
  semFicha: conta((r) => !r.fichaColetada),
  fase1NaoConfirmada: conta((r) => r.fases[0].oferta === 'nao-confirmado'),
  comRequisitosObrigatorios: conta((r) => r.requisitosObrigatorios > 0),
  comRegraEspecifica: reais.filter((r) => r.regrasEspecificas.length).map((r) => ({ id: r.id, nome: r.nome, regras: r.regrasEspecificas })),
  porUniversidade: porUniv,
};

fs.writeFileSync(`${saida}.json`, JSON.stringify({ resumo, mestrados: resultados }, null, 1));
const md = [
  `# Auditoria dos processos de candidatura`,
  ``,
  `Gerado em ${resumo.geradoEm} a partir de ${resumo.fonteProgramas}.`,
  ``,
  `- Mestrados auditados: **${resumo.total}** (${resumo.reais} reais + ${resumo.demonstrativos} demonstrativos)`,
  `- Corretos antes da correção: **${resumo.corretosAntes}** (as lacunas gerais abaixo afetavam todos)`,
  `- Processo confirmado em fontes oficiais (canal + ficha): **${resumo.confirmados}**`,
  `- Processo parcialmente confirmado: **${resumo.parciais}** (canal não confirmado: ${resumo.canalNaoConfirmado}; sem ficha: ${resumo.semFicha})`,
  `- Oferta de vagas na Fase 1 não confirmada por fonte oficial: ${resumo.fase1NaoConfirmada} (nenhuma fonte pública a informa por máster)`,
  `- Com requisitos de cumprimento obrigatório na ficha: ${resumo.comRequisitosObrigatorios}`,
  `- Com regra oficial específica: ${resumo.comRegraEspecifica.length} (${Object.entries(resumo.comRegraEspecifica.flatMap((x) => x.regras).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {})).map(([k, n]) => `${k}: ${n}`).join('; ')})`,
  ``,
  `## Por universidade`,
  ``,
  `| Universidade | Total | Confirmados | Parciais | Canal não confirmado | Sem ficha | Com requisitos obrigatórios |`,
  `|---|---|---|---|---|---|---|`,
  ...Object.entries(porUniv).sort().map(([u, x]) => `| ${u.toUpperCase()} | ${x.total} | ${x.confirmado} | ${x.parcial} | ${x.semCanal} | ${x.semFicha} | ${x.comObrigatorios} |`),
  ``,
  `## Lacunas gerais corrigidas (valiam para todos os mestrados)`,
  ``,
  ...LACUNAS_GERAIS.map((l) => `- ${l}`),
  ``,
  `## Mestrados com problemas específicos`,
  ``,
  ...resultados.filter((r) => r.problemas.length).map((r) => `- **${r.nome}** (${(r.universidade || '').toUpperCase()}${r.codigoDua ? `, DUA ${r.codigoDua}` : ''}): ${r.problemas.join(' ')}`),
].join('\n');
fs.writeFileSync(`${saida}.md`, md);
console.log(JSON.stringify({ ...resumo, lacunasGerais: resumo.lacunasGerais.length, comRegraEspecifica: resumo.comRegraEspecifica.length }, null, 1));
