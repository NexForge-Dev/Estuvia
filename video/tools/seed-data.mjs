// Preenche a conta de demonstração com dados FICTÍCIOS pelas APIs reais (finanças, moradia, viagem,
// documentos, agenda e comunidade). Pode rodar de novo: erros de duplicata só são registrados.
import { launch, api, demoAccount, BASE } from './lib.mjs';
import crypto from 'node:crypto';

const acc = demoAccount();
const { browser, context, page } = await launch();
await page.goto(BASE);
const a = api(page);
await a.post('/auth/login', { email: acc.email, senha: acc.senha });
const jid = (await a.get('/journeys')).journeys[0].id;
const q = `?journeyId=${jid}`;
const tryDo = async (label, fn) => { try { await fn(); console.log('ok', label); } catch (e) { console.log('ERRO', label, e.message.slice(0, 220)); } };

// ---------- Finanças (valores ilustrativos) ----------
await tryDo('finance itens', () => a.put(`/finance${q}`, { iniciar: true, perfil: 'equilibrado', informouRecursos: true, itens: {
  matricula: { valor: 1100, moeda: 'EUR', status: 'estimado' }, documentos: { valor: 1800, moeda: 'BRL', status: 'estimado' },
  visto: { valor: 450, moeda: 'BRL', status: 'estimado' }, seguro: { valor: 420, moeda: 'EUR', status: 'estimado' },
  caucao: { valor: 380, moeda: 'EUR', status: 'estimado' } } }));
await tryDo('recurso poupança', () => a.post(`/finance/resources${q}`, { tipo: 'poupanca', descricao: 'Poupança pessoal', valor: 6500, moeda: 'EUR', status: 'disponivel' }));
await tryDo('recurso família', () => a.post(`/finance/resources${q}`, { tipo: 'familiar', descricao: 'Apoio dos pais', valor: 3000, moeda: 'EUR', status: 'prometido', apoiador: 'pais' }));
await tryDo('bolsa', () => a.post(`/finance/scholarships${q}`, { catalogId: 'auip-garcia-lorca' }));

// ---------- Moradia ----------
const casas = [
  { nome: 'Quarto perto da Facultad de Ciencias', tipo: 'quarto', bairro: 'Fuentenueva', aluguel: 340, caucao: 340, contasIncluidas: false, adicionais: 40, moeda: 'EUR' },
  { nome: 'Residência universitária no centro', tipo: 'residencia', bairro: 'Centro', aluguel: 590, caucao: 300, contasIncluidas: true, moeda: 'EUR' },
  { nome: 'Quarto em apartamento no Realejo', tipo: 'quarto', bairro: 'Realejo', aluguel: 310, caucao: 620, contasIncluidas: false, adicionais: 45, taxaAgencia: 150, moeda: 'EUR' },
];
for (const c of casas) await tryDo('moradia ' + c.nome, () => a.post(`/living/housing${q}`, c));

// ---------- Viagem ----------
await tryDo('perfil viagem', () => a.put(`/travel/profile${q}`, { origemIata: 'SSA', dataIda: '2027-09-10', malas: 2 }));
const cotacoes = [
  { rota: 'Salvador → Madri → Granada', percursoId: 'via-madri', voo: 720, bagagem: 0, terrestre: 35, moeda: 'EUR', conexoes: 1, companhia: 'Companhia exemplo', fonte: 'Cotação de exemplo' },
  { rota: 'Salvador → Lisboa → Málaga → Granada', percursoId: 'via-malaga', voo: 640, bagagem: 60, terrestre: 20, moeda: 'EUR', conexoes: 1, companhia: 'Companhia exemplo', fonte: 'Cotação de exemplo' },
];
for (const c of cotacoes) await tryDo('cotação ' + c.rota, () => a.post(`/travel/quotes${q}`, c));
await tryDo('chegada', () => a.put(`/travel/arrival${q}`, { aeroporto: 'Madri-Barajas (MAD)', transporte: 'Ônibus até Granada', enderecoInicial: 'Alojamento temporário nos primeiros dias' }));

// ---------- Documentos: arquivos PDF fictícios (gerados aqui) ----------
const pdf = (title) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 24 Tf 72 760 Td (${title} - DEMO) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const { documents } = await (await page.request.get(`${BASE}/api/content/documents`)).json();
console.log('doc ids:', documents.map((d) => d.id).join(' '));
const pick = (re) => documents.find((d) => re.test(d.id))?.id;
const uploads = [[pick(/passaporte/), 'passaporte-demo.pdf'], [pick(/diploma/), 'diploma-demo.pdf'], [pick(/historico/), 'historico-demo.pdf']];
for (const [id, name] of uploads) {
  if (!id) continue;
  await tryDo('arquivo ' + name, async () => {
    const res = await page.request.post(`${BASE}/api/documents/${id}/files${q}`, { data: pdf(name), headers: { 'X-Requested-With': 'travessia', 'Content-Type': 'application/pdf', 'X-File-Name': name } });
    if (!res.ok()) throw new Error(res.status() + ' ' + (await res.text()));
  });
}
for (const [id, status] of [[pick(/passaporte/), 'pronto'], [pick(/diploma/), 'pronto'], [pick(/historico/), 'em-preparacao']]) if (id) await tryDo('status ' + id, () => a.put(`/documents/${id}${q}`, { status }));

// ---------- Agenda: disponibilidade ----------
await tryDo('disponibilidade', async () => { const p = await a.get('/planner'); console.log(' planner keys', Object.keys(p), JSON.stringify(p.disponibilidade).slice(0, 300)); });

// ---------- Comunidade: publicações de exemplo de dois perfis fictícios ----------
const autores = [{ nome: 'Lucas (demo)', texto: 'Dica para quem vai para Granada: comecei a separar os documentos da candidatura com três meses de antecedência e fez toda a diferença. A Missão 2.7 ajudou a não esquecer nada.', categoria: 'experiencias', natureza: 'dica' },
  { nome: 'Marina (demo)', texto: 'Alguém já passou pela etapa de comprovação financeira do visto? Estou organizando os recursos no planejador e queria saber como vocês apresentaram o apoio da família.', categoria: 'experiencias', natureza: 'duvida' }];
for (const au of autores) {
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage(); await p2.goto(BASE);
  const b = api(p2);
  const email = `${au.nome.split(' ')[0].toLowerCase()}.demo@estuvia.test`;
  const senha = crypto.randomBytes(12).toString('base64url') + '7a';
  await tryDo('conta ' + email, () => b.post('/auth/register', { nome: au.nome.replace(' (demo)', ''), email, senha, aceite: true, maiorIdade: true }));
  await tryDo('post ' + au.nome, () => b.post('/community/posts', { tipo: 'publicacao', categoria: au.categoria, natureza: au.natureza, texto: au.texto, local: { universidadeId: 'ugr', cidade: 'Granada', pais: 'Espanha' } }));
  await ctx.close();
}
await context.close();
await browser.close();
