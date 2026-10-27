// Minha Viagem (missões 6.3–6.5): painel, perfil da viagem, cotações (com leitura do LINK, sem buscar
// nada fora), rota escolhida/comprada, chegada e compromissos da Agenda — sempre com confirmação.
// Trabalha sobre o mesmo user.travel das rotas /living/travel/* (que continuam válidas).
import { Router } from 'express';
import { z } from 'zod';
import { users, newId } from '../store.js';
import { requireAuth } from '../security.js';
import { ensureFinance, computeFinance } from '../finance-engine.js';
import { computeTravel, ensureTravel, agendaSuggestions, agendaChanges } from '../travel-engine.js';
import { BR_AIRPORTS } from '../content/travel.js';
import { pricesForUser } from '../flight-prices.js';

const router = Router();
router.use(requireAuth);

const money = z.number().min(0).max(100_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');
const https = z.url('Link inválido.').max(600).refine((u) => u.startsWith('https://'), 'Use um link https.');
const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use o código do aeroporto (3 letras).');

const jidOf = (req) => (typeof req.query.journeyId === 'string' ? req.query.journeyId : undefined);
function payload(user, jid) {
  ensureFinance(user);
  ensureTravel(user);
  const plano = computeTravel(user, jid);
  const fin = computeFinance(user, (user.journeys || []).find((j) => j.id === jid) || (user.journeys || [])[0] || null);
  const passagens = fin.itens?.find((i) => i.id === 'passagens') || null;
  return {
    ...plano,
    financeiro: passagens ? { valorEur: passagens.valorEur, status: passagens.status, origem: passagens.origemTipo, nota: passagens.nota || null } : null,
    agenda: { sugestoes: agendaSuggestions(user, plano), alteracoes: agendaChanges(user, plano) },
    alertaPreco: user.travel.alertaPreco || null,
  };
}
const save = async (req, res, mutate, status = 200) => {
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); ensureTravel(u); mutate(u); });
  res.status(status).json(payload(user, jidOf(req)));
};
const bad = (res, parsed) => res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });

router.get('/', (req, res) => res.json(payload(req.user, jidOf(req))));

// Busca guiada: só o necessário. O destino vem da jornada.
router.put('/profile', (req, res) => {
  const parsed = z.object({
    origemIata: iata.optional(), dataIda: date.or(z.literal('')).optional(), dataFlexivel: z.boolean().optional(),
    malas: z.number().int().min(0).max(6).optional(), orcamento: money.nullable().optional(), moeda: z.enum(['EUR', 'BRL']).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  if (parsed.data.origemIata && !BR_AIRPORTS[parsed.data.origemIata]) return res.status(400).json({ error: 'Aeroporto de origem não reconhecido.' });
  return save(req, res, (u) => { u.travel.perfil = { ...u.travel.perfil, ...parsed.data, atualizadoEm: new Date().toISOString() }; });
});

// Leitura do LINK colado (sem acessar o site): extrai o que a própria URL informa.
export function parseFlightLink(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const out = { site: host, origem: null, destino: null, data: null, extraido: [] };
  const full = (yy) => (yy.length === 2 ? `20${yy}` : yy);
  let m = /\/(?:transporte\/passagens-aereas|transport\/flights)\/([a-z]{3,4})\/([a-z]{3,4})\/(\d{2})(\d{2})(\d{2})/i.exec(u.pathname); // Skyscanner
  if (m) Object.assign(out, { origem: m[1].toUpperCase(), destino: m[2].toUpperCase(), data: `${full(m[3])}-${m[4]}-${m[5]}` });
  m = !out.origem && /\/flights\/([A-Z]{3})(?:,[A-Z]{3})*-([A-Z]{3})(?:,[A-Z]{3})*\/(\d{4}-\d{2}-\d{2})/i.exec(u.pathname); // Kayak
  if (m) Object.assign(out, { origem: m[1].toUpperCase(), destino: m[2].toUpperCase(), data: m[3] });
  const qs = u.searchParams;
  for (const [k, field] of [['origin', 'origem'], ['from', 'origem'], ['departure', 'origem'], ['destination', 'destino'], ['to', 'destino'], ['arrival', 'destino']]) {
    const v = qs.get(k);
    if (!out[field] && v && /^[A-Za-z]{3}$/.test(v)) out[field] = v.toUpperCase();
  }
  for (const k of ['date', 'departureDate', 'outboundDate', 'depart']) { const v = qs.get(k); if (!out.data && v && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.data = v; }
  if (out.origem) out.extraido.push('origem');
  if (out.destino) out.extraido.push('destino');
  if (out.data) out.extraido.push('data');
  out.percursoId = out.destino === 'MAD' ? 'via-madri' : out.destino === 'AGP' ? 'via-malaga' : out.destino === 'GRX' ? 'via-granada' : null;
  return out;
}

router.post('/quotes/parse-link', (req, res) => {
  const parsed = z.object({ link: https }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const r = parseFlightLink(parsed.data.link);
  if (!r) return res.status(400).json({ error: 'Link inválido.' });
  res.json({ ...r, aviso: r.extraido.length ? 'Lemos apenas o que está escrito no próprio link. Preço, horários e bagagem você confere no site.' : 'Não conseguimos ler dados deste link. Preencha só o preço e a data, o resto pode ficar para depois.' });
});

const quoteSchema = z.object({
  rota: z.string().trim().min(3).max(120),
  percursoId: z.enum(['via-madri', 'via-malaga', 'via-granada']).nullable().optional(),
  link: https.optional().or(z.literal('')),
  voo: money.nullable().optional(), bagagem: money.nullable().optional(), terrestre: money.nullable().optional(),
  transporteLocal: money.nullable().optional(), pernoite: money.nullable().optional(), outros: money.nullable().optional(),
  moeda: z.enum(['EUR', 'BRL']).optional(),
  dataViagem: date.optional().or(z.literal('')), horarioChegada: time.optional().or(z.literal('')), aeroportoChegada: z.string().trim().max(60).optional(),
  companhia: z.string().trim().max(60).optional(), conexoes: z.number().int().min(0).max(5).nullable().optional(), malasIncluidas: z.number().int().min(0).max(4).nullable().optional(),
  bilhetesSeparados: z.boolean().optional(), tarifa: z.enum(['flexivel', 'nao-reembolsavel', 'desconhecida']).optional(),
  duracao: z.string().trim().max(60).optional(), fonte: z.string().trim().max(200).optional(), notas: z.string().trim().max(300).optional(),
}).strict();
const clean = (d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v !== undefined));

router.post('/quotes', (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  if ((req.user.travel?.opcoes || []).length >= 20) return res.status(409).json({ error: 'Limite de cotações atingido.' });
  const d = clean(parsed.data);
  if (d.link && !d.fonte) d.fonte = new URL(d.link).hostname.replace(/^www\./, '');
  // "voo" é obrigatório nas rotas antigas: aqui, preço desconhecido fica null (nunca 0).
  return save(req, res, (u) => { u.travel.opcoes.push({ id: newId(), moeda: 'EUR', escolhida: false, comprada: false, voo: null, cotadoEm: new Date().toISOString().slice(0, 10), ...d }); }, 201);
});

router.put('/quotes/:id', (req, res) => {
  const parsed = quoteSchema.partial().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  if (!(req.user.travel?.opcoes || []).some((o) => o.id === req.params.id)) return res.status(404).json({ error: 'Cotação não encontrada.' });
  return save(req, res, (u) => {
    const o = u.travel.opcoes.find((x) => x.id === req.params.id);
    for (const [k, v] of Object.entries(parsed.data)) { if (v === '' || v === null) delete o[k]; else o[k] = v; }
    o.atualizadoEm = new Date().toISOString();
  });
});

router.delete('/quotes/:id', (req, res) => save(req, res, (u) => { u.travel.opcoes = u.travel.opcoes.filter((o) => o.id !== req.params.id); }));

router.post('/quotes/:id/choose', (req, res) => {
  if (!(req.user.travel?.opcoes || []).some((o) => o.id === req.params.id)) return res.status(404).json({ error: 'Cotação não encontrada.' });
  return save(req, res, (u) => { u.travel.opcoes.forEach((o) => { o.escolhida = o.id === req.params.id; if (!o.escolhida) o.comprada = false; }); });
});

// "Comprei a passagem": decisão do estudante (a Estuvia não compra nada).
router.post('/quotes/:id/purchase', (req, res) => {
  const parsed = z.object({ comprada: z.boolean(), tarifa: z.enum(['flexivel', 'nao-reembolsavel', 'desconhecida']).optional(), confirmo: z.literal(true) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Confirme a compra.' });
  if (!(req.user.travel?.opcoes || []).some((o) => o.id === req.params.id)) return res.status(404).json({ error: 'Cotação não encontrada.' });
  return save(req, res, (u) => {
    u.travel.opcoes.forEach((o) => { if (o.id !== req.params.id) { o.escolhida = false; o.comprada = false; } });
    const o = u.travel.opcoes.find((x) => x.id === req.params.id);
    Object.assign(o, { escolhida: true, comprada: parsed.data.comprada, compradaEm: parsed.data.comprada ? new Date().toISOString() : null, ...(parsed.data.tarifa ? { tarifa: parsed.data.tarifa } : {}) });
  });
});

router.put('/arrival', (req, res) => {
  const parsed = z.object({
    aeroporto: z.string().trim().max(100).optional(), data: date.optional().or(z.literal('')), horario: time.optional().or(z.literal('')),
    meio: z.enum(['onibus', 'trem', 'taxi', 'ape', 'carro', 'metro']).optional(), transporte: z.string().trim().max(200).optional(),
    enderecoInicial: z.string().trim().max(200).optional(), conexoes: z.string().trim().max(200).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return save(req, res, (u) => { u.travel.chegada = { ...u.travel.chegada, ...parsed.data }; });
});

// Marca a viagem como concluída (ou desfaz). A chegada oficial continua sendo registrada na jornada (7.1).
router.post('/done', (req, res) => {
  const parsed = z.object({ concluida: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  return save(req, res, (u) => { if (parsed.data.concluida) u.travel.concluidaEm = new Date().toISOString(); else delete u.travel.concluidaEm; });
});

// ---------- Preços de passagens (Aviasales via Travelpayouts, gratuito) e alerta de preço ----------
// Menores preços vistos por usuários nas últimas ~48 h: referência, não oferta. Nada é comprado aqui.
router.get('/prices', async (req, res) => {
  const quando = typeof req.query.quando === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(req.query.quando) ? req.query.quando : undefined;
  res.json(await pricesForUser(req.user, jidOf(req), { quando }));
});

router.put('/price-alert', (req, res) => {
  const parsed = z.object({ ativo: z.boolean(), teto: z.number().min(100, 'Informe um teto a partir de R$ 100.').max(100_000).nullable().optional() }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  if (parsed.data.ativo && !(parsed.data.teto > 0)) return res.status(400).json({ error: 'Informe o preço máximo (em R$) para o alerta.' });
  return save(req, res, (u) => {
    const atual = u.travel.alertaPreco || {};
    u.travel.alertaPreco = { ...atual, ativo: parsed.data.ativo, teto: parsed.data.teto ?? atual.teto ?? null, moeda: 'BRL', journeyId: jidOf(req) || atual.journeyId || null, atualizadoEm: new Date().toISOString() };
    if (!parsed.data.ativo) delete u.travel.alertaPreco.ultimoAviso;
  });
});

// ---------- Agenda: só cria/altera o que o estudante confirmou ----------
const agendaItem = z.object({ chave: z.enum(['documentos', 'bagagem', 'checkin', 'aeroporto', 'voo', 'deslocamento', 'moradia']), data: date, inicio: time, fim: time, titulo: z.string().trim().min(1).max(120) }).strict().refine((i) => i.fim > i.inicio, 'O fim precisa ser depois do início.');
const DIAS = { documentos: -7, bagagem: -3, checkin: -1, aeroporto: 0, voo: 0, deslocamento: 1, moradia: 1 };
const CAT = { documentos: 'documentacao', bagagem: 'viagem', checkin: 'viagem', aeroporto: 'viagem', voo: 'viagem', deslocamento: 'viagem', moradia: 'viagem' };

router.post('/agenda', (req, res) => {
  const parsed = z.object({ itens: z.array(agendaItem).min(1).max(7) }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const plan = computeTravel(req.user, jidOf(req));
  const base = plan.escolhida?.dataViagem || plan.perfil.dataIda;
  if (!base) return res.status(409).json({ error: 'Informe a data da viagem antes de criar os compromissos.' });
  const jid = plan.destino.journeyId;
  return save(req, res, (u) => {
    u.planner ??= [];
    for (const it of parsed.data.itens) {
      const old = u.travel.agendaLinks.find((l) => l.chave === it.chave && u.planner.some((e) => e.id === l.eventId));
      if (old) continue; // sem duplicar
      const ev = { id: newId(), origem: 'viagem', titulo: it.titulo, categoria: CAT[it.chave], data: it.data, inicio: it.inicio, fim: it.fim, ...(jid ? { journeyId: jid, missaoId: it.chave === 'documentos' ? '6.4' : '6.5' } : {}), criadoEm: new Date().toISOString() };
      u.planner.push(ev);
      u.travel.agendaLinks.push({ eventId: ev.id, chave: it.chave, dias: DIAS[it.chave], base });
    }
  }, 201);
});

router.post('/agenda/changes', (req, res) => {
  const parsed = z.object({ aceitar: z.array(z.string().max(60)).max(10), recusar: z.array(z.string().max(60)).max(10).default([]) }).strict().safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const plan = computeTravel(req.user, jidOf(req));
  const changes = agendaChanges(req.user, plan);
  return save(req, res, (u) => {
    for (const c of changes) {
      const link = u.travel.agendaLinks.find((l) => l.eventId === c.eventId);
      if (parsed.data.aceitar.includes(c.eventId)) { const e = u.planner.find((x) => x.id === c.eventId); if (e) e.data = c.novaData; link.base = c.baseNova; }
      if (parsed.data.recusar.includes(c.eventId)) link.base = c.baseNova; // mantém a data e para de perguntar
    }
  });
});

export default router;
