// Motor da viagem: transforma o que o estudante registrou (cotações, rota escolhida, chegada, moradia)
// num painel: estado, percursos possíveis, comparação, itinerário e plano de chegada.
// Regra: só mostra preço, horário, duração ou companhia que o estudante informou. Desconhecido = null.

import { computeJourney } from './journey-engine.js';
import { programById, universityById } from './content/catalog.js';
import { chosenHousing } from './finance-engine.js';
import { TRAVEL_STATUS, ROUTE_TEMPLATES, BR_AIRPORTS, STATE_AIRPORT, searchLinks, destinationAirports } from './content/travel.js';

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const PARTS = [['voo', 'Voo'], ['bagagem', 'Bagagem'], ['terrestre', 'Transporte até a cidade'], ['transporteLocal', 'Transporte local'], ['pernoite', 'Pernoite'], ['outros', 'Outros']];

export function ensureTravel(user) {
  user.travel ??= {};
  user.travel.opcoes ??= [];
  user.travel.chegada ??= {};
  user.travel.perfil ??= {};
  user.travel.agendaLinks ??= [];
  return user.travel;
}

/** Custo de uma cotação: partes conhecidas, total conhecido e o que ainda falta saber. */
export function quoteCost(o) {
  const partes = PARTS.map(([id, rotulo]) => ({ id, rotulo, valor: num(o[id]) }));
  const conhecidas = partes.filter((p) => p.valor !== null);
  const total = conhecidas.length ? conhecidas.reduce((s, p) => s + p.valor, 0) : null;
  const desconhecidas = [];
  if (num(o.bagagem) === null && !(Number(o.malasIncluidas) > 0)) desconhecidas.push('bagagem');
  const tpl = templateOf(o);
  if (tpl?.terrestre && num(o.terrestre) === null) desconhecidas.push('terrestre');
  return { partes, total, moeda: o.moeda || 'EUR', completo: desconhecidas.length === 0, desconhecidas };
}

const templateOf = (o, cidade = 'Granada') => (ROUTE_TEMPLATES[cidade] || []).find((t) => t.id === o.percursoId) || null;

function guessTemplate(o, cidade) {
  if (o.percursoId) return o.percursoId;
  const t = `${o.rota || ''} ${o.aeroportoChegada || ''}`.toLowerCase();
  if (/m[aá]laga|agp/.test(t)) return 'via-malaga';
  if (/madri|madrid|mad\b/.test(t)) return 'via-madri';
  if (cidade && new RegExp(cidade.toLowerCase()).test(t) || /grx/.test(t)) return 'via-granada';
  return null;
}

export function travelStatus(user, j) {
  const tr = ensureTravel(user);
  const chosen = tr.opcoes.find((o) => o.escolhida);
  if (tr.concluidaEm || j?.chegada) return 'concluida';
  if (chosen?.comprada) return 'comprada';
  if (chosen) return 'escolhida';
  if (tr.opcoes.length) return 'cotacao';
  return 'pesquisando';
}

// Risco e conveniência de cada cotação — nunca recomenda "a mais barata" sem olhar o resto.
function considerations(o, tpl) {
  const out = [];
  const conex = num(o.conexoes);
  if (conex !== null && conex >= 2) out.push({ nivel: 'atencao', texto: `${conex} conexões: mais chances de atraso e de extravio de bagagem.` });
  if (tpl?.terrestre) out.push({ nivel: 'info', texto: 'Inclui um trecho por terra até Granada (ônibus ou trem).' });
  if (o.bilhetesSeparados) out.push({ nivel: 'risco', texto: 'Bilhetes separados: se o primeiro voo atrasar, a companhia não garante o próximo trecho.' });
  if (o.horarioChegada) {
    const h = Number(o.horarioChegada.slice(0, 2));
    if (h >= 22 || h < 6) out.push({ nivel: 'atencao', texto: `Chegada às ${o.horarioChegada}: pode faltar transporte até a cidade e ser preciso um pernoite.` });
  }
  if (o.tarifa === 'nao-reembolsavel') out.push({ nivel: 'atencao', texto: 'Tarifa não reembolsável: só compre com o visto aprovado.' });
  if (num(o.bagagem) === null && !(Number(o.malasIncluidas) > 0)) out.push({ nivel: 'info', texto: 'Bagagem despachada não informada: o total pode subir.' });
  return out;
}

export function computeTravel(user, jid, now = new Date()) {
  const tr = ensureTravel(user);
  const jr = (user.journeys || []).find((x) => x.id === jid) || (user.journeys || [])[0] || null;
  const j = jr ? computeJourney(user, jr, now) : null;
  const program = jr ? programById(jr.programaId) : null;
  const uni = program ? universityById(program.universidadeId) : jr ? universityById(jr.universidadeId) : null;
  const cidade = uni?.cidade || null;
  const p = user.profile || {};
  const perfil = tr.perfil;
  const origemIata = perfil.origemIata || STATE_AIRPORT[p.estado] || null;
  const status = travelStatus(user, j);
  const chosen = tr.opcoes.find((o) => o.escolhida) || null;
  const dataViagem = chosen?.dataViagem || perfil.dataIda || null;
  const dataReferencia = dataViagem || jr?.inicioAulas || null;
  const visto = j?.situacao?.visto || null;

  // ---------- Cotações ----------
  const cotacoes = tr.opcoes.map((o) => {
    const percursoId = guessTemplate(o, cidade);
    const tpl = templateOf({ ...o, percursoId }, cidade);
    return { ...o, percursoId, percursoNome: tpl?.nome || null, custo: quoteCost({ ...o, percursoId }), consideracoes: considerations(o, tpl) };
  });
  // Só cotações completas (com bagagem e trecho por terra conhecidos) disputam o "menor custo".
  // Moedas diferentes não se comparam: a referência é a moeda da primeira cotação completa.
  const completas = cotacoes.filter((c) => c.custo.total !== null && c.custo.completo);
  const moedaComparacao = completas[0] ? completas[0].moeda || 'EUR' : null;
  const comparaveis = completas.filter((c) => (c.moeda || 'EUR') === moedaComparacao);
  const menor = comparaveis.length ? Math.min(...comparaveis.map((c) => c.custo.total)) : null;
  for (const c of cotacoes) c.diferencaParaMenor = c.custo.total !== null && menor !== null && (c.moeda || 'EUR') === moedaComparacao ? c.custo.total - menor : null;

  // ---------- Percursos possíveis (cards) ----------
  const destIatas = destinationAirports(cidade);
  const percursos = (ROUTE_TEMPLATES[cidade] || []).map((t) => {
    const minhas = cotacoes.filter((c) => c.percursoId === t.id);
    const melhor = minhas.filter((c) => c.custo.total !== null).sort((a, b) => a.custo.total - b.custo.total)[0] || null;
    return {
      ...t,
      origem: origemIata ? { iata: origemIata, cidade: BR_AIRPORTS[origemIata] || origemIata } : null,
      cotacoes: minhas.length,
      precoConhecido: melhor ? { total: melhor.custo.total, moeda: melhor.moeda || 'EUR', completo: melhor.custo.completo, cotadoEm: melhor.cotadoEm } : null,
      conexoesInformadas: melhor ? num(melhor.conexoes) : null,
      bagagemIncluida: melhor ? (Number(melhor.malasIncluidas) > 0 ? true : num(melhor.bagagem) !== null ? false : null) : null,
      escolhida: Boolean(chosen && chosen.percursoId === t.id) || Boolean(chosen && guessTemplate(chosen, cidade) === t.id),
      busca: searchLinks({ origem: origemIata, destinoIata: t.aeroportos[0], data: dataReferencia }),
    };
  });

  // ---------- Itinerário ----------
  const moradia = chosenHousing(user);
  const chosenTpl = chosen ? templateOf({ ...chosen, percursoId: guessTemplate(chosen, cidade) }, cidade) : null;
  let itinerario = null;
  if (chosenTpl || chosen) {
    const origemNome = origemIata ? `${BR_AIRPORTS[origemIata] || origemIata}` : 'Sua cidade';
    const etapas = (chosenTpl?.etapas || [{ de: 'origem', para: chosen.aeroportoChegada || 'Destino', meio: 'aviao', rotulo: 'Voo' }]).map((e, i, arr) => ({
      ordem: i + 1,
      de: e.de === 'origem' ? origemNome : e.de,
      para: e.para,
      meio: e.meio,
      rotulo: e.rotulo,
      // Dados do estudante entram só onde se aplicam; o resto fica "a definir".
      data: i === 0 ? chosen?.dataViagem || null : null,
      // Horário de chegada informado vale para o último trecho aéreo.
      horario: i === arr.findLastIndex((x) => x.meio === 'aviao') ? chosen?.horarioChegada || null : null,
      operador: e.meio === 'aviao' ? chosen?.companhia || null : null,
      custo: e.meio === 'aviao' ? (i === 0 ? num(chosen?.voo) : null) : e.meio === 'trem' || e.meio === 'onibus' ? num(chosen?.terrestre) : null,
      status: chosen?.comprada && e.meio === 'aviao' ? 'comprado' : 'planejado',
    }));
    etapas.push({
      ordem: etapas.length + 1, de: cidade || 'Destino', para: moradia ? `Minha moradia: ${moradia.nome}${moradia.bairro ? ` (${moradia.bairro})` : ''}` : 'Minha moradia', meio: 'local',
      rotulo: tr.chegada.meio ? { onibus: 'Ônibus urbano', taxi: 'Táxi', ape: 'A pé', carro: 'Carona / aplicativo', metro: 'Metrô' }[tr.chegada.meio] || 'Transporte local' : 'Transporte local',
      data: null, horario: null, operador: null, custo: num(chosen?.transporteLocal), status: moradia ? 'planejado' : 'a-definir',
    });
    itinerario = { percurso: chosenTpl?.nome || chosen?.rota, etapas, completo: Boolean(chosen?.dataViagem && moradia) };
  }

  // ---------- Chegada ----------
  const aeroportoChegada = chosen?.aeroportoChegada || (chosenTpl ? chosenTpl.aeroportos[0] : null) || tr.chegada.aeroporto || null;
  const chegada = {
    aeroporto: aeroportoChegada,
    data: tr.chegada.data || chosen?.dataViagem || null,
    horario: tr.chegada.horario || chosen?.horarioChegada || null,
    meio: tr.chegada.meio || null,
    transporte: tr.chegada.transporte || null,
    moradia: moradia ? { id: moradia.id, nome: moradia.nome, bairro: moradia.bairro || null, entrada: moradia.entrada || null } : null,
    endereco: tr.chegada.enderecoInicial || null,
    registrada: Boolean(tr.chegada.aeroporto),
    frase: chosenTpl ? (chosenTpl.terrestre ? `Você vai chegar a ${chosenTpl.aeroportos[0] === 'MAD' ? 'Madri' : 'Málaga'} e precisa seguir até ${cidade}.` : `Você vai chegar ao aeroporto de ${cidade} e precisa ir até a cidade.`) : null,
    opcoes: chosenTpl ? chosenTpl.etapas.filter((e) => e.meio !== 'aviao').map((e) => ({ rotulo: e.rotulo, de: e.de, para: e.para })) : [],
    fontes: chosenTpl?.fontes || [],
  };

  // ---------- Visto e recomendação de compra ----------
  const vistoAprovado = visto === 'aprovado';
  const aviso = vistoAprovado ? null : {
    titulo: visto === 'indeferido' ? 'Seu visto foi indeferido.' : 'Seu visto ainda não está confirmado.',
    texto: visto === 'indeferido' ? 'Não compre passagens antes de definir os próximos passos com o consulado.' : 'Você já pode pesquisar viagens, mas comprar uma passagem não reembolsável pode trazer riscos.',
    detalhe: 'Se precisar comprar antes, prefira tarifa com remarcação ou reembolso, e confira as condições antes de pagar.',
    nivel: visto === 'indeferido' ? 'alto' : 'medio',
  };

  return {
    status, statusLabel: TRAVEL_STATUS[status].rotulo, etapasStatus: Object.entries(TRAVEL_STATUS).map(([id, s]) => ({ id, rotulo: s.rotulo, feito: TRAVEL_STATUS[status].ordem >= s.ordem })),
    origem: { iata: origemIata, nome: origemIata ? BR_AIRPORTS[origemIata] || origemIata : null, sugerido: !perfil.origemIata && Boolean(origemIata), cidadePerfil: p.estado || null, pais: p.paisResidencia || 'Brasil' },
    destino: { cidade, pais: uni?.pais || 'Espanha', universidade: uni ? { id: uni.id, nome: uni.nome, sigla: uni.sigla } : null, aeroportos: destIatas, inicioAulas: jr?.inicioAulas || null, journeyId: jr?.id || null },
    dataViagem, dataReferencia, perfil,
    percursos, cotacoes, escolhida: chosen ? cotacoes.find((c) => c.id === chosen.id) : null, menorTotal: menor, moedaComparacao,
    itinerario, chegada, visto: { situacao: visto, aprovado: vistoAprovado, aviso },
    aeroportosBrasil: BR_AIRPORTS,
    missoes: j ? ['6.3', '6.5'].map((id) => { const m = j.rodadas.flatMap((r) => r.missoes).find((x) => x.id === id); return m ? { id, label: m.label, titulo: m.titulo, status: m.status, statusLabel: m.statusLabel, feitos: m.objetivosFeitos, total: m.objetivosTotal } : null; }).filter(Boolean) : [],
  };
}

// ---------- Agenda: compromissos da viagem (o estudante escolhe quais criar) ----------
const AGENDA_STEPS = [
  { chave: 'documentos', dias: -7, titulo: 'Conferir documentos da viagem (passaporte com visto, admissão, seguro, moradia)', inicio: '19:00', fim: '19:45' },
  { chave: 'bagagem', dias: -3, titulo: 'Preparar a bagagem', inicio: '19:00', fim: '20:30' },
  { chave: 'checkin', dias: -1, titulo: 'Fazer o check-in online', inicio: '10:00', fim: '10:30' },
  { chave: 'aeroporto', dias: 0, titulo: 'Sair para o aeroporto', inicio: null, fim: null },
  { chave: 'voo', dias: 0, titulo: 'Voo', inicio: null, fim: null },
  { chave: 'deslocamento', dias: 1, titulo: 'Deslocamento até a cidade de destino', inicio: null, fim: null },
  { chave: 'moradia', dias: 1, titulo: 'Entrada na moradia', inicio: null, fim: null },
];
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Sugestões de compromissos a partir da data da viagem. Horário desconhecido fica para o estudante definir. */
export function agendaSuggestions(user, plan) {
  const base = plan.escolhida?.dataViagem || plan.perfil.dataIda;
  if (!base) return { base: null, itens: [] };
  const exists = new Set(ensureTravel(user).agendaLinks.filter((l) => (user.planner || []).some((e) => e.id === l.eventId)).map((l) => l.chave));
  const cid = plan.destino.cidade || 'destino';
  return {
    base,
    itens: AGENDA_STEPS.map((s) => ({
      chave: s.chave, dias: s.dias, data: addDays(base, s.dias),
      titulo: s.chave === 'voo' ? `Voo${plan.escolhida?.companhia ? ` (${plan.escolhida.companhia})` : ''} para ${plan.chegada.aeroporto || cid}` : s.chave === 'deslocamento' ? `Deslocamento até ${cid}` : s.titulo,
      inicio: s.inicio, fim: s.fim, horarioConhecido: Boolean(s.inicio), jaCriado: exists.has(s.chave),
    })),
  };
}

/** Eventos ligados a uma data de viagem que mudou: proposta de nova data (nada muda sem confirmação). */
export function agendaChanges(user, plan) {
  const base = plan.escolhida?.dataViagem || plan.perfil.dataIda;
  if (!base) return [];
  return ensureTravel(user).agendaLinks.map((l) => {
    const ev = (user.planner || []).find((e) => e.id === l.eventId);
    if (!ev || l.base === base) return null;
    return { eventId: ev.id, titulo: ev.titulo, dataAtual: ev.data, novaData: addDays(base, l.dias), baseAnterior: l.base, baseNova: base, chave: l.chave };
  }).filter(Boolean);
}
