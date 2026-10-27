// Acompanhamento de cada estudante (painel admin): engajamento, jornadas e inscrições, documentos,
// finanças, bolsas, moradia, viagem, agenda, comunidade, Radar, Mentor e sinais de risco.
// Reaproveita os mesmos motores que o estudante vê (journey/finance), então os números batem.
import { computeJourney } from './journey-engine.js';
import { chosenHousing, chosenRoute } from './finance-engine.js';
import { SITUACAO } from './content/rounds.js';
import { DOCUMENTS, DOC_STATUS_LABEL } from './content/documents.js';
import { programById } from './content/catalog.js';
import { communityExport } from './routes/community.js';
import { myRadar } from './radar/service.js';
import { audit } from './store.js';
import { userUsage } from './usage.js';

const DAY = 864e5;
const label = (campo, v) => SITUACAO[campo]?.find(([k]) => k === v)?.[1] || v || '—';
export const daysSince = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);

// Ordem de avanço da candidatura (para resumir várias jornadas na melhor situação).
const ADJ_RANK = { 'nao-enviada': 0, 'exige-acao': 1, aguardando: 2, 'lista-espera': 3, 'nao-admitido': 1, admitido: 4 };

function journeyInfo(user, jr) {
  const j = computeJourney(user, jr);
  const atual = j.rodadas.find((r) => r.numero === j.rodadaAtual);
  const sit = j.situacao || {};
  return {
    id: j.id,
    criadaEm: j.criadaEm,
    universidade: j.destino.universidade?.nome || '—',
    sigla: j.destino.universidade?.sigla || null,
    programa: j.destino.programa?.nome || '—',
    demo: Boolean(j.destino.programa?.demo),
    cidade: j.destino.cidade,
    anoAcademico: j.destino.anoAcademico,
    status: j.status,
    progresso: Math.round(j.progresso * 100),
    rodadaAtual: atual ? `${atual.numero}. ${atual.titulo}` : '—',
    missoes: { concluidas: j.contagem.concluida || 0, aplicaveis: j.contagem.aplicaveis, atencao: j.contagem.atencao || 0, aguardando: j.contagem.aguardando || 0 },
    proximaMissao: j.proximaMissao ? `${j.proximaMissao.label} ${j.proximaMissao.titulo}` : null,
    prazos: j.prazos.map((p) => ({ titulo: p.titulo || p.rotulo, data: p.data, diasRestantes: p.diasRestantes, origem: p.origem })),
    inscricao: {
      candidatura: sit.adjudicacao || 'nao-enviada', candidaturaLabel: label('adjudicacao', sit.adjudicacao || 'nao-enviada'),
      matricula: sit.matricula || 'nao-iniciada', matriculaLabel: label('matricula', sit.matricula || 'nao-iniciada'),
      visto: sit.visto || 'preparacao', vistoLabel: label('visto', sit.visto || 'preparacao'),
    },
    financas: j.financas,
    rodadas: j.rodadas.filter((r) => !r.transversal).map((r) => ({ numero: r.numero, titulo: r.titulo, status: r.status, progresso: Math.round(r.progresso * 100), concluidas: r.concluidas, total: r.total })),
  };
}

const safeJourneys = (user) => (user.journeys || []).map((jr) => {
  try { return journeyInfo(user, jr); } catch (err) { return { id: jr.id, erro: `não foi possível calcular: ${err.message}` }; }
});

// Sinais de atenção para o admin agir (ordem: mais grave primeiro).
function alerts(user, journeys) {
  const out = [];
  const semEntrar = daysSince(user.lastSeenAt || user.createdAt);
  if (user.blocked) out.push({ nivel: 'alto', texto: 'Conta suspensa.' });
  for (const j of journeys) {
    if (j.erro) continue;
    const nome = j.sigla || j.universidade;
    j.prazos.filter((p) => p.diasRestantes < 0 && p.origem !== 'declarado').forEach((p) => out.push({ nivel: 'alto', texto: `${nome}: prazo vencido há ${-p.diasRestantes} dia(s) — ${p.titulo}.` }));
    j.prazos.filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 7).forEach((p) => out.push({ nivel: 'medio', texto: `${nome}: prazo em ${p.diasRestantes} dia(s) — ${p.titulo}.` }));
    if (j.inscricao.candidatura === 'exige-acao') out.push({ nivel: 'alto', texto: `${nome}: candidatura exige ação ou revisão.` });
    if (['doc-adicional', 'indeferido'].includes(j.inscricao.visto)) out.push({ nivel: 'alto', texto: `${nome}: visto — ${j.inscricao.vistoLabel}.` });
    if (j.financas?.informouRecursos && j.financas.deficit > 0) out.push({ nivel: 'medio', texto: `${nome}: faltam € ${Math.round(j.financas.deficit).toLocaleString('pt-BR')} para o orçamento/visto.` });
    if (j.missoes.atencao) out.push({ nivel: 'medio', texto: `${nome}: ${j.missoes.atencao} missão(ões) pedindo atenção.` });
  }
  if (semEntrar >= 30) out.push({ nivel: 'alto', texto: `Sem entrar há ${semEntrar} dias.` });
  else if (semEntrar >= 7) out.push({ nivel: 'medio', texto: `Sem entrar há ${semEntrar} dias.` });
  const correcao = Object.entries(user.documents || {}).filter(([, st]) => st === 'correcao').length;
  if (correcao) out.push({ nivel: 'medio', texto: `${correcao} documento(s) precisando de correção.` });
  if (!user.profile?.onboardingConcluido) out.push({ nivel: 'baixo', texto: 'Ainda não concluiu o cadastro inicial (onboarding).' });
  if (!journeys.length) out.push({ nivel: 'baixo', texto: 'Ainda não criou nenhuma jornada.' });
  const rank = { alto: 0, medio: 1, baixo: 2 };
  return out.sort((a, b) => rank[a.nivel] - rank[b.nivel]);
}

// Resumo para a lista de estudantes (uma linha por pessoa).
export function studentRow(user) {
  const journeys = safeJourneys(user).filter((j) => !j.erro);
  const best = journeys.reduce((b, j) => (!b || ADJ_RANK[j.inscricao.candidatura] > ADJ_RANK[b.inscricao.candidatura] ? j : b), null);
  const al = alerts(user, journeys);
  return {
    diasSemEntrar: daysSince(user.lastSeenAt || user.createdAt),
    progresso: journeys.length ? Math.max(...journeys.map((j) => j.progresso)) : null,
    inscricao: best ? best.inscricao : null,
    destino: best ? `${best.sigla || best.universidade} · ${best.programa}` : null,
    alertas: al.length,
    alertaAlto: al.some((a) => a.nivel === 'alto'),
  };
}

// Visão geral das inscrições de todos (seção "Inscrições" do painel).
export function enrollmentOverview(all) {
  const count = (campo) => Object.fromEntries(SITUACAO[campo].map(([k, l]) => [k, { label: l, total: 0 }]));
  const res = { candidatura: count('adjudicacao'), matricula: count('matricula'), visto: count('visto'), jornadas: 0, destinos: {} };
  for (const u of all) {
    for (const j of safeJourneys(u)) {
      if (j.erro) continue;
      res.jornadas += 1;
      res.candidatura[j.inscricao.candidatura] && (res.candidatura[j.inscricao.candidatura].total += 1);
      res.matricula[j.inscricao.matricula] && (res.matricula[j.inscricao.matricula].total += 1);
      res.visto[j.inscricao.visto] && (res.visto[j.inscricao.visto].total += 1);
      const key = `${j.sigla || j.universidade} · ${j.programa}`;
      res.destinos[key] = (res.destinos[key] || 0) + 1;
    }
  }
  res.destinos = Object.entries(res.destinos).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nome, total]) => ({ nome, total }));
  return res;
}

// Ficha completa de um estudante.
export function studentReport(user) {
  const p = user.profile || {};
  const journeys = safeJourneys(user);
  const comm = (() => { try { return communityExport(user.id); } catch { return null; } })();
  const radar = (() => { try { return myRadar(user); } catch { return null; } })();
  const logins = audit.recent(5000, (e) => e.userId === user.id && e.action === 'login');
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
  const docs = DOCUMENTS.map((d) => ({ id: d.id, nome: d.nome, etapa: d.etapa, status: user.documents?.[d.id] || 'pendente', statusLabel: DOC_STATUS_LABEL[user.documents?.[d.id] || 'pendente'] || user.documents?.[d.id], atualizadoEm: user.docRecords?.[d.id]?.atualizadoEm || null }));
  const fin = user.finance || {};
  const house = chosenHousing(user);
  const route = chosenRoute(user);

  return {
    perfil: {
      nome: p.nome, apelido: p.apelido, avatar: p.avatar, email: user.email,
      nacionalidade: p.nacionalidade, paisResidencia: p.paisResidencia, estado: p.estado,
      formacao: p.formacao, instituicao: p.instituicao, area: p.area,
      espanhol: p.espanhol, ingles: p.ingles, certificadoEspanhol: p.certificadoEspanhol, certificadoNivel: p.certificadoNivel,
      situacaoCandidatura: p.situacaoCandidatura, situacaoVisto: p.situacaoVisto, orcamentoDisponivel: p.orcamentoDisponivel ?? null,
      porque: p.porque, metaPessoal: p.metaPessoal, onboardingConcluido: Boolean(p.onboardingConcluido),
    },
    engajamento: {
      cadastro: user.createdAt, ultimoAcesso: user.lastSeenAt || null, diasSemEntrar: daysSince(user.lastSeenAt || user.createdAt),
      diasDesdeCadastro: daysSince(user.createdAt), visitas: user.visits || 0, diasAtivos: (user.activeDays || []).length,
      diasAtivosLista: (user.activeDays || []).slice(-30), logins: logins.length, ultimoLogin: logins[0]?.at || null,
      modulos: userUsage(user), mentor: user.aiUso?.mentor || null, assistente: user.aiUso?.assistente || null,
    },
    alertas: alerts(user, journeys),
    jornadas: journeys,
    opcoesMestrado: (user.choices || []).map((id) => { const pr = programById(id); return pr ? pr.nome : id; }),
    documentos: {
      lista: docs,
      resumo: docs.reduce((acc, d) => ({ ...acc, [d.status]: (acc[d.status] || 0) + 1 }), {}),
    },
    financas: {
      recursos: (fin.recursos || []).map((r) => ({ descricao: r.descricao, tipo: r.tipo, valor: r.valor, moeda: r.moeda, status: r.status })),
      informouRecursos: Boolean(fin.informouRecursos),
      bolsas: (user.scholarshipApps || []).map((b) => ({ nome: b.nome, entidade: b.entidade, status: b.status, salvaEm: b.salvaEm })),
    },
    moradia: { opcoes: (user.housing || []).length, escolhida: house ? { titulo: house.nome || 'Moradia escolhida', bairro: house.bairro || null } : null },
    viagem: { opcoes: (user.travel?.opcoes || []).length, escolhida: route ? { titulo: route.companhia || 'Rota escolhida', comprada: Boolean(route.comprada) } : null, origem: user.travel?.perfil?.origemIata || null, dataIda: user.travel?.perfil?.dataIda || null },
    agenda: {
      total: (user.planner || []).length,
      proximos7dias: (user.planner || []).filter((t) => t.data >= today && t.data <= in7).map((t) => ({ titulo: t.titulo, data: t.data, inicio: t.inicio })).sort((a, b) => `${a.data}${a.inicio}`.localeCompare(`${b.data}${b.inicio}`)),
    },
    conquistas: Object.keys(user.conquistas || {}).length,
    comunidade: comm ? { publicacoes: comm.publicacoes.length, comentarios: comm.comentarios.length, grupos: comm.grupos.length } : null,
    radar: radar ? { acompanhando: radar.acompanhando.length, alertasNaoLidos: radar.naoLidas } : null,
    notas: (user.adminNotes || []).slice().reverse(),
  };
}
