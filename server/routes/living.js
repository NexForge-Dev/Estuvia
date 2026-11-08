// "Meu novo lar" (HousingOption) e planejamento de viagem (TravelPlan).
// A plataforma organiza o que o estudante encontrou: não busca nem extrai anúncios, não afirma que
// um anúncio é seguro e não inventa preços ou horários.
import { Router } from 'express';
import { z } from 'zod';
import { users, newId } from '../store.js';
import { requireAuth } from '../security.js';
import { ensureFinance, routeTotal } from '../finance-engine.js';
import { programById, universityById } from '../content/catalog.js';
import { DESTINATION_ASSUMPTIONS } from '../content/costs.js';
import { sourceById } from '../content/sources.js';
import { ANTIFRAUDE, HOUSING_TYPES, HOUSING_STATUS, LEGACY_STATUS, PREFERENCES, SEARCH_SOURCES, normStatus, siteOf } from '../content/housing.js';
import { decorate, compareHousing } from '../housing-engine.js';

const router = Router();
router.use(requireAuth);

const money = z.number().min(0).max(1_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const https = z.url('Link inválido.').max(400).refine((u) => u.startsWith('https://'), 'Use um link https.');

export { ANTIFRAUDE };
const STATUS_IDS = [...Object.keys(HOUSING_STATUS), ...Object.keys(LEGACY_STATUS)];
const housingSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  tipo: z.enum(Object.keys(HOUSING_TYPES)),
  bairro: z.string().trim().max(100).optional(),
  aluguel: money,
  caucao: money.nullable().optional(),
  inclusas: z.string().trim().max(200).optional(),
  contasIncluidas: z.boolean().optional(),
  adicionais: money.nullable().optional(),
  taxaAgencia: money.nullable().optional(),
  moeda: z.enum(['EUR', 'BRL']).optional(),
  entrada: date.optional().or(z.literal('')),
  duracaoContrato: z.string().trim().max(60).optional(),
  link: https.optional().or(z.literal('')),
  distancia: z.string().trim().max(60).optional(),
  notas: z.string().trim().max(1500).optional(),
  status: z.enum(STATUS_IDS).optional(),
  checklist: z.partialRecord(z.enum(ANTIFRAUDE.map((a) => a.id)), z.boolean()).optional(),
  // Resposta do "Conferir antes de pagar": ok (resposta segura) · alerta (sinal de risco) · null (não sei).
  respostas: z.partialRecord(z.enum(ANTIFRAUDE.map((a) => a.id)), z.enum(['ok', 'alerta']).nullable()).optional(),
}).strict();

// Destino da jornada (cidade, universidade, duração) — não perguntamos de novo.
function destination(user, jid) {
  const jr = (user.journeys || []).find((j) => j.id === jid) || (user.journeys || [])[0] || null;
  const program = jr ? programById(jr.programaId) : null;
  const uni = program ? universityById(program.universidadeId) : jr ? universityById(jr.universidadeId) : null;
  const cidade = uni?.cidade || null;
  const meses = Number(jr?.duracaoMeses) || program?.duracaoMeses || 12;
  const faixa = cidade && DESTINATION_ASSUMPTIONS[cidade]?.moradia;
  return {
    journeyId: jr?.id || null, cidade, pais: uni?.pais || 'Espanha', universidade: uni ? { id: uni.id, nome: uni.nome, sigla: uni.sigla } : null, meses,
    // Faixas de orçamento só onde há fonte (hoje: quarto compartilhado em Granada, UGR).
    faixas: faixa ? { quarto: [{ id: 'ate', rotulo: `Até € ${faixa.faixa.min}`, max: faixa.faixa.min }, { id: 'meio', rotulo: `€ ${faixa.faixa.min}–${faixa.faixa.max}`, min: faixa.faixa.min, max: faixa.faixa.max }, { id: 'acima', rotulo: `Acima de € ${faixa.faixa.max}`, min: faixa.faixa.max }], fonte: [sourceById(faixa.fonte), sourceById(faixa.fonteExtra)].filter(Boolean).map((x) => ({ id: x.id, orgao: x.orgao, url: x.url })), nota: faixa.nota } : null,
    busca: (cidade && SEARCH_SOURCES[cidade]) || null,
  };
}

const reply = (user, jid) => {
  const dest = destination(user, jid);
  return {
    housing: (user.housing || []).map((h) => decorate(h, dest.meses)),
    travel: user.travel, antifraude: ANTIFRAUDE, tipos: HOUSING_TYPES, situacoes: HOUSING_STATUS, preferencias: PREFERENCES,
    busca: user.housingSearch || {}, destino: dest,
  };
};

router.get('/', (req, res) => { ensureFinance(req.user); res.json(reply(req.user, req.query.journeyId)); });

// Preferências da busca guiada (tipo, orçamento, o que importa) — persistidas para a próxima visita.
router.put('/search', async (req, res) => {
  const parsed = z.object({ tipo: z.enum(Object.keys(HOUSING_TYPES)).nullable().optional(), orcamentoMax: money.nullable().optional(), preferencias: z.array(z.enum(Object.keys(PREFERENCES))).max(10).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preferências inválidas.' });
  const user = await users.update(req.user.id, (u) => { u.housingSearch = { ...(u.housingSearch || {}), ...parsed.data, atualizadoEm: new Date().toISOString() }; });
  res.json(reply(user, req.query.journeyId));
});

function applyAnswers(item, respostas = {}) {
  item.checklist ??= {};
  item.sinais ??= {};
  for (const [id, v] of Object.entries(respostas)) {
    item.checklist[id] = v === 'ok';
    item.sinais[id] = v === 'alerta';
  }
}

router.post('/housing', async (req, res) => {
  const parsed = housingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if ((req.user.housing || []).length >= 40) return res.status(409).json({ error: 'Limite de opções atingido.' });
  const { respostas, ...data } = parsed.data;
  const item = { id: newId(), moeda: 'EUR', checklist: {}, sinais: {}, ...data, status: normStatus(data.status), fonte: data.link ? siteOf(data.link) : null, criadoEm: new Date().toISOString() };
  applyAnswers(item, respostas);
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); u.housing.push(item); });
  res.status(201).json({ ...reply(user, req.query.journeyId), criado: item.id });
});

router.put('/housing/:id', async (req, res) => {
  const parsed = housingSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!(req.user.housing || []).some((x) => x.id === req.params.id)) return res.status(404).json({ error: 'Opção não encontrada.' });
  const user = await users.update(req.user.id, (u) => {
    const { checklist, respostas, ...rest } = parsed.data;
    if (rest.status) rest.status = normStatus(rest.status);
    // Só uma moradia escolhida por vez: o custo dela alimenta o planejamento financeiro.
    if (rest.status === 'escolhida') u.housing.forEach((x) => { if (x.status === 'escolhida') x.status = 'contrato'; });
    const item = u.housing.find((x) => x.id === req.params.id);
    Object.assign(item, rest);
    if (rest.link !== undefined) item.fonte = rest.link ? siteOf(rest.link) : null;
    if (checklist) item.checklist = { ...item.checklist, ...checklist };
    applyAnswers(item, respostas);
    item.atualizadoEm = new Date().toISOString();
  });
  res.json(reply(user, req.query.journeyId));
});

router.delete('/housing/:id', async (req, res) => {
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); u.housing = u.housing.filter((x) => x.id !== req.params.id); });
  res.json(reply(user, req.query.journeyId));
});

// Comparação de 2 ou 3 opções (cálculo no servidor; a interface só mostra).
router.post('/compare', async (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().max(60)).min(2).max(3) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Escolha 2 ou 3 opções para comparar.' });
  const list = parsed.data.ids.map((id) => (req.user.housing || []).find((x) => x.id === id)).filter(Boolean);
  if (list.length < 2) return res.status(404).json({ error: 'Opções não encontradas.' });
  const dest = destination(req.user, req.query.journeyId);
  await users.update(req.user.id, (u) => { u.housingSearch = { ...(u.housingSearch || {}), comparadoEm: new Date().toISOString() }; });
  res.json({ comparacao: compareHousing(list, dest.meses) });
});

const routeSchema = z.object({
  rota: z.string().trim().min(3).max(120),
  voo: money,
  bagagem: money.optional(),
  terrestre: money.optional(),
  moeda: z.enum(['EUR', 'BRL']).optional(),
  duracao: z.string().trim().max(60).optional(),
  fonte: z.string().trim().max(200).optional(), // onde a cotação foi feita (informada pelo estudante)
  cotadoEm: date.optional(),
  notas: z.string().trim().max(300).optional(),
}).strict();

router.post('/travel/routes', async (req, res) => {
  const parsed = routeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  // Mesmo limite das cotações em /travel/quotes (as duas rotas gravam em user.travel.opcoes).
  if ((req.user.travel?.opcoes || []).length >= 20) return res.status(409).json({ error: 'Limite de cotações atingido.' });
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); u.travel.opcoes.push({ id: newId(), moeda: 'EUR', escolhida: false, cotadoEm: new Date().toISOString().slice(0, 10), ...parsed.data }); });
  res.status(201).json(reply(user));
});

router.put('/travel/routes/:id', async (req, res) => {
  const parsed = routeSchema.partial().extend({ escolhida: z.boolean().optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!(req.user.travel?.opcoes || []).some((o) => o.id === req.params.id)) return res.status(404).json({ error: 'Rota não encontrada.' });
  const user = await users.update(req.user.id, (u) => {
    if (parsed.data.escolhida) u.travel.opcoes.forEach((o) => { o.escolhida = false; });
    Object.assign(u.travel.opcoes.find((o) => o.id === req.params.id), parsed.data);
  });
  res.json(reply(user));
});

router.delete('/travel/routes/:id', async (req, res) => {
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); u.travel.opcoes = u.travel.opcoes.filter((o) => o.id !== req.params.id); });
  res.json(reply(user));
});

router.put('/travel/arrival', async (req, res) => {
  const parsed = z.object({
    aeroporto: z.string().trim().max(100).optional(),
    conexoes: z.string().trim().max(200).optional(),
    transporte: z.string().trim().max(200).optional(),
    enderecoInicial: z.string().trim().max(200).optional(),
    data: date.optional().or(z.literal('')),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); u.travel.chegada = { ...u.travel.chegada, ...parsed.data }; });
  res.json(reply(user));
});

export { routeTotal };
export default router;
