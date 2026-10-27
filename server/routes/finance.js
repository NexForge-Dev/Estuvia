// Planejador financeiro inteligente: plano (FinancialPlan), cenários, câmbio, recursos e bolsas.
// Todos os cálculos são do motor determinístico (finance-engine.js); esta rota só valida e persiste.
import { Router } from 'express';
import { z } from 'zod';
import { users, newId } from '../store.js';
import { requireAuth } from '../security.js';
import { computeFinance, ensureFinance } from '../finance-engine.js';
import { RESOURCE_TYPES } from '../content/finance.js';
import { EXPENSE_ITEMS, PROFILE_IDS, CATEGORY_LABEL, RESOURCE_GROUPS } from '../content/costs.js';
import { SCHOLARSHIPS, SCHOLARSHIP_STATUS, APPLICATION_STATUS } from '../content/scholarships.js';
import { refreshRate } from '../fx.js';

const router = Router();
router.use(requireAuth);

const money = z.number().min(0).max(10_000_000);
const moeda = z.enum(['EUR', 'BRL']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const ITEM_IDS = EXPENSE_ITEMS.map((i) => i.id);

const pickJourney = (user, jid) => (user.journeys || []).find((j) => j.id === jid) || (user.journeys || [])[0] || null;

function payload(user, jid) {
  const jr = pickJourney(user, jid);
  return {
    journeyId: jr?.id || null,
    plano: computeFinance(user, jr),
    entrada: { itens: user.finance.itens, cambio: user.finance.cambio || null, spreadPct: user.finance.spreadPct ?? null, partida: user.finance.partida || null, nenhumaBolsaAplicavel: Boolean(user.finance.nenhumaBolsaAplicavel) },
    candidaturas: user.scholarshipApps,
    catalogo: SCHOLARSHIPS,
    statusBolsa: SCHOLARSHIP_STATUS,
    tiposRecurso: RESOURCE_TYPES,
    gruposRecurso: RESOURCE_GROUPS,
    itensDef: EXPENSE_ITEMS,
    categorias: CATEGORY_LABEL,
  };
}

const save = async (req, mutate) => {
  const user = await users.update(req.user.id, (u) => { ensureFinance(u); mutate(u); });
  return payload(user, req.query.journeyId);
};

// A taxa de referência é atualizada em segundo plano (com cache); falha silenciosa = sem taxa automática.
router.get('/', async (req, res) => {
  await refreshRate();
  ensureFinance(req.user);
  res.json(payload(req.user, req.query.journeyId));
});

const itemSchema = z.object({ valor: money.nullable(), moeda, status: z.enum(['estimado', 'confirmado', 'pago']), vencimento: date.or(z.literal('')) }).partial().strict();

router.put('/', async (req, res) => {
  const parsed = z.object({
    perfil: z.enum(PROFILE_IDS).optional(),
    itens: z.partialRecord(z.enum(ITEM_IDS), itemSchema.nullable()).optional(),
    // Compatibilidade com a versão anterior (planilha): custos informados pelo estudante.
    custos: z.partialRecord(z.enum(ITEM_IDS), z.object({ valor: money, moeda }).strict()).optional(),
    cambio: z.number().positive().max(100).nullable().optional(),
    spreadPct: z.number().min(0).max(20).nullable().optional(),
    partida: date.or(z.literal('')).optional(),
    iniciar: z.literal(true).optional(),
    informouRecursos: z.boolean().optional(),
    nenhumaBolsaAplicavel: z.boolean().optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const d = parsed.data;
  res.json(await save(req, (u) => {
    const fin = u.finance;
    if (d.perfil) fin.perfil = d.perfil;
    for (const [id, c] of Object.entries(d.custos || {})) fin.itens[id] = { ...(fin.itens[id] || {}), valor: c.valor, moeda: c.moeda, status: fin.itens[id]?.status || 'estimado' };
    for (const [id, it] of Object.entries(d.itens || {})) {
      if (it === null) delete fin.itens[id]; // volta para a estimativa (ou para "desconhecido")
      else {
        const next = { ...(fin.itens[id] || {}), ...it };
        if (next.vencimento === '') delete next.vencimento;
        next.moeda ??= 'EUR';
        next.status ??= 'estimado';
        fin.itens[id] = next;
      }
    }
    if (d.custos || d.itens) fin.custos = {}; // os itens passam a ser a única fonte
    if (d.cambio !== undefined) { fin.cambio = d.cambio; fin.cambioEm = d.cambio ? new Date().toISOString() : null; }
    if (d.spreadPct !== undefined) fin.spreadPct = d.spreadPct;
    if (d.partida !== undefined) { if (d.partida) fin.partida = d.partida; else delete fin.partida; }
    if (d.iniciar) fin.iniciadoEm ??= new Date().toISOString();
    if (d.informouRecursos !== undefined) fin.informouRecursos = d.informouRecursos;
    if (d.nenhumaBolsaAplicavel !== undefined) fin.nenhumaBolsaAplicavel = d.nenhumaBolsaAplicavel;
  }));
});

// ---------- Cenários (FinancialScenario) ----------
router.post('/scenarios', async (req, res) => {
  const parsed = z.object({ nome: z.string().trim().min(1).max(60), perfil: z.enum(PROFILE_IDS).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dê um nome ao cenário.' });
  if ((req.user.finance?.cenarios || []).length >= 10) return res.status(409).json({ error: 'Você pode salvar até 10 cenários.' });
  res.status(201).json(await save(req, (u) => {
    u.finance.cenarios.push({ id: newId(), nome: parsed.data.nome, perfil: parsed.data.perfil || u.finance.perfil || 'equilibrado', itens: structuredClone(u.finance.itens), criadoEm: new Date().toISOString() });
  }));
});

// Usar um cenário salvo como planejamento principal: copia perfil e valores para o plano atual.
router.put('/scenarios/:id/principal', async (req, res) => {
  const c = (req.user.finance?.cenarios || []).find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Cenário não encontrado.' });
  res.json(await save(req, (u) => { u.finance.perfil = c.perfil; u.finance.itens = structuredClone(c.itens || {}); u.finance.cenarioPrincipal = c.id; }));
});

router.delete('/scenarios/:id', async (req, res) => {
  res.json(await save(req, (u) => {
    u.finance.cenarios = u.finance.cenarios.filter((x) => x.id !== req.params.id);
    if (u.finance.cenarioPrincipal === req.params.id) delete u.finance.cenarioPrincipal;
  }));
});

// ---------- Durante a estadia: gasto realizado (previsto × realizado) ----------
const CATEGORIES = [...new Set(EXPENSE_ITEMS.filter((i) => i.grupo === 'mensal').map((i) => i.categoria))];
router.post('/spending', async (req, res) => {
  const parsed = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido.'), categoria: z.enum(CATEGORIES), valor: money, moeda: moeda.optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if ((req.user.finance?.realizado || []).length >= 600) return res.status(409).json({ error: 'Limite de lançamentos atingido.' });
  res.status(201).json(await save(req, (u) => { u.finance.realizado.push({ id: newId(), moeda: 'EUR', ...parsed.data, criadoEm: new Date().toISOString() }); }));
});
router.delete('/spending/:id', async (req, res) => {
  res.json(await save(req, (u) => { u.finance.realizado = u.finance.realizado.filter((r) => r.id !== req.params.id); }));
});

const resourceSchema = z.object({
  tipo: z.enum(Object.keys(RESOURCE_TYPES)),
  descricao: z.string().trim().min(1).max(100),
  valor: money,
  moeda,
  // disponivel/confirmado contam como garantidos; prometido (= previsto), solicitado e a-verificar não.
  status: z.enum(['disponivel', 'confirmado', 'prometido', 'previsto', 'solicitado', 'a-verificar']),
  origem: z.enum(['rapido']).optional(), // "Quanto dinheiro você já tem?" (entrada rápida do planejador)
  apoiador: z.string().trim().max(80).optional(), // ex.: "padrasto" — sem dados sensíveis
  notas: z.string().trim().max(300).optional(),
}).strict();

router.post('/resources', async (req, res) => {
  const parsed = resourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if ((req.user.finance?.recursos || []).length >= 30) return res.status(409).json({ error: 'Limite de recursos atingido.' });
  res.status(201).json(await save(req, (u) => { u.finance.recursos.push({ id: newId(), ...parsed.data }); u.finance.informouRecursos = true; }));
});

router.put('/resources/:id', async (req, res) => {
  const parsed = resourceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!(req.user.finance?.recursos || []).some((r) => r.id === req.params.id)) return res.status(404).json({ error: 'Recurso não encontrado.' });
  res.json(await save(req, (u) => { Object.assign(u.finance.recursos.find((r) => r.id === req.params.id), parsed.data); }));
});

router.delete('/resources/:id', async (req, res) => {
  res.json(await save(req, (u) => { u.finance.recursos = u.finance.recursos.filter((r) => r.id !== req.params.id); }));
});

// ---------- Bolsas ----------

const DEFAULT_TASKS = ['Ler o edital oficial', 'Verificar elegibilidade', 'Reunir documentos do edital', 'Enviar a candidatura', 'Acompanhar o resultado'];
const GRANTED_TASKS = ['Aceitar a bolsa conforme instruções do edital', 'Organizar a carta de concessão e comprovantes para o visto'];

const appSchema = z.object({
  catalogId: z.enum(SCHOLARSHIPS.map((s) => s.id)).optional(),
  nome: z.string().trim().min(2).max(120).optional(),
  entidade: z.string().trim().max(120).optional(),
  url: z.url().max(300).refine((u) => u.startsWith('https://'), 'Use um link https.').optional().or(z.literal('')),
  prazo: date.optional().or(z.literal('')),
  status: z.enum(APPLICATION_STATUS).optional(),
  cobertura: z.string().trim().max(200).optional(),
  valorTotal: money.optional(),
  moeda: moeda.optional(),
  notas: z.string().trim().max(500).optional(),
}).strict();

router.post('/scholarships', async (req, res) => {
  const parsed = appSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  const cat = SCHOLARSHIPS.find((s) => s.id === parsed.data.catalogId);
  if (!cat && !parsed.data.nome) return res.status(400).json({ error: 'Informe o nome da bolsa.' });
  if ((req.user.scholarshipApps || []).some((a) => cat && a.catalogId === cat.id)) return res.status(409).json({ error: 'Esta bolsa já está salva.' });
  const app = {
    id: newId(), status: 'interesse', moeda: 'EUR',
    nome: cat?.nome, entidade: cat?.entidade, url: cat?.url, cobertura: cat?.cobertura,
    ...parsed.data,
    tarefas: DEFAULT_TASKS.map((texto) => ({ id: newId(), texto, feito: false })),
    salvaEm: new Date().toISOString(),
  };
  res.status(201).json(await save(req, (u) => { u.scholarshipApps.push(app); }));
});

router.put('/scholarships/:id', async (req, res) => {
  const parsed = appSchema.omit({ catalogId: true }).extend({ tarefa: z.object({ id: z.string(), feito: z.boolean() }).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  if (!(req.user.scholarshipApps || []).some((a) => a.id === req.params.id)) return res.status(404).json({ error: 'Bolsa não encontrada.' });
  const { tarefa, ...fields } = parsed.data;
  res.json(await save(req, (u) => {
    const app = u.scholarshipApps.find((a) => a.id === req.params.id);
    // Bolsa concedida: cria as tarefas de aceite e comprovação (Situação C da Agenda).
    if (fields.status === 'concedida' && app.status !== 'concedida') {
      GRANTED_TASKS.forEach((texto) => { if (!app.tarefas.some((t) => t.texto === texto)) app.tarefas.push({ id: newId(), texto, feito: false }); });
    }
    Object.assign(app, fields);
    if (tarefa) { const t = app.tarefas.find((x) => x.id === tarefa.id); if (t) t.feito = tarefa.feito; }
  }));
});

router.delete('/scholarships/:id', async (req, res) => {
  res.json(await save(req, (u) => { u.scholarshipApps = u.scholarshipApps.filter((a) => a.id !== req.params.id); }));
});

export default router;
