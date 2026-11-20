// Onboarding + criação de jornada, UMA PERGUNTA POR TELA (minimalista).
//   Cada tela: barra fina de progresso ("N de M"), voltar, a pergunta e opções grandes. Tocar numa
//   opção avança sozinho; campos de texto/lista têm um único "Continuar". Sem dicas, avisos nem painel.
//   Primeira vez: origem, formação, idiomas, orçamento, destino e documentos → revisão → geração.
//   Jornadas seguintes: só as perguntas de destino (perfil, requisitos e finanças são reaproveitados).
//
// O que cada resposta alimenta (auditoria em docs/27-onboarding.md):
//   origem    → paisResidencia: regra de visto (missões 5.x em "atenção" fora do Brasil), consulado (UF), documentos
//   formação  → formacao: elegibilidade (Missão 1.4) e objetivo automático da Missão 1.1
//   idiomas   → espanhol/certificado: Missões 2.x de idioma e elegibilidade; inglês: contexto do Mentor
//   orçamento → referência no Planejamento financeiro (não conta como recurso comprovado)
//   destino   → jornada: universidade, mestrado (opcional), ano, início, duração (TIE > 6 meses), progresso anterior
//   documentos→ requisitos: "Sim, já tenho" conclui as missões de providenciar o documento
//
// A lista de perguntas é calculada a partir das respostas (ex.: UF só para quem mora num país com
// divisões; nível do certificado só para quem tem um), então o "N de M" é sempre honesto.
// Rascunho salvo no navegador a cada resposta (sobrevive a recarregar a página); apagado ao concluir.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, invalidate } from '../app.js';
import { getCatalog } from '../data.js';
import { QUIZ_KEY } from './landing.js';
import { Select } from '../components/Select.js';
import { countries, countryCode, countryName, divisionsFor, divisionLabel, PRIORITY_COUNTRIES } from '../data/geo.js';
import { FORMACOES, AREAS, INSTITUTIONS, BUDGET_SHORTCUTS, formacaoEmAndamento } from '../data/academic.js';

const DRAFT_VERSION = 2;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVEL_HINT = { A1: 'Iniciante', A2: 'Básico', B1: 'Intermediário', B2: 'Intermediário alto', C1: 'Avançado', C2: 'Proficiente' };
const LEVEL_TEXT = { nenhum: 'Não falo', 'nao-sei': 'Não sei meu nível', nativo: 'Nativo' };
const CERTS = [['nenhum', 'Não tenho'], ['DELE', 'DELE'], ['SIELE', 'SIELE'], ['outro', 'Outro certificado']];
const OUTRO = '__outro__';
const PERIODS = [['09', 'Setembro'], ['10', 'Outubro'], ['02', 'Fevereiro']];
const DURATIONS = [['6', 'Até 6 meses'], ['12', '1 ano'], ['18', '1 ano e meio'], ['24', '2 anos']];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const eur = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const filled = (v) => typeof v === 'string' && v.trim().length > 0;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const onEnter = (el) => el.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  el.closest('.ob')?.querySelector('.ob-continue:not(:disabled)')?.click();
});

export async function onboardingView() {
  const me = state.me.user;
  const p = me.profile;
  const firstTime = !p.onboardingConcluido;
  const [{ universities }, reqs, { journeys }, { etapas }] = await Promise.all([
    getCatalog(), api.get('/journeys/requirements'), api.get('/journeys'), api.get('/journeys/progress-stages'),
  ]);
  const perguntas = reqs.perguntas;
  const BR = countryName('BR');
  const PT = countryName('PT');
  // A partir de setembro o curso do ano já começou: o primeiro ano oferecido é o seguinte.
  const now = new Date();
  const year = now.getFullYear() + (now.getMonth() >= 8 ? 1 : 0);
  const cycles = [0, 1, 2, 3].map((i) => `${year + i}/${String((year + i + 1) % 100).padStart(2, '0')}`);
  const takenPrograms = new Set(journeys.map((j) => j.destino.programa?.id).filter(Boolean));
  const openDestinations = new Set(journeys.filter((j) => !j.destino.programa).map((j) => `${j.destino.universidade?.id}|${j.destino.anoAcademico || ''}`));

  // ---------- Rascunho ----------
  const KEY = `estuvia:onboarding:${me.id}:${firstTime ? 'perfil' : 'jornada'}`;
  const fresh = () => {
    const nat = p.nacionalidade ? countryCode(p.nacionalidade) : null;
    const instKnown = !p.instituicao || INSTITUTIONS.some((i) => i.value === p.instituicao);
    const areaKnown = !p.area || Object.values(AREAS).flat().includes(p.area);
    return {
      v: DRAFT_VERSION, qid: null,
      nacionalidade: nat ? countryName(nat) : (p.nacionalidade || ''), paisResidencia: p.paisResidencia || '', estado: p.estado || '',
      formacao: p.formacao || '', instituicao: p.instituicao || '', instituicaoManual: !instKnown, graduacao: p.graduacao || '', graduacaoVista: false,
      area: p.area || '', areaManual: !areaKnown,
      espanhol: p.espanhol || '', certificadoEspanhol: p.certificadoEspanhol || '', certificadoNivel: p.certificadoNivel || '', ingles: p.ingles || '',
      orcamentoSituacao: p.orcamentoSituacao || (typeof p.orcamentoDisponivel === 'number' ? 'informado' : ''), orcamentoDisponivel: p.orcamentoDisponivel ?? null,
      universidadeId: '', programaId: '', programaNome: '', programaVisto: false, anoAcademico: '', inicioPeriodo: '', duracaoOpcao: '', duracaoMeses: null,
      etapa: '', dataEntrada: '', confirmaEtapa: false,
      requisitos: { ...(reqs.respostas || {}) },
      journeyId: null,
    };
  };
  let draft = fresh();
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    // Versão 1 (etapas agrupadas): aproveita as respostas e recomeça na primeira pergunta sem resposta.
    if (saved && (saved.v === 1 || saved.v === DRAFT_VERSION)) {
      const { step, docIndex, ...answers } = saved;
      draft = { ...draft, ...answers, v: DRAFT_VERSION, qid: saved.v === DRAFT_VERSION ? saved.qid : null, requisitos: { ...draft.requisitos, ...(saved.requisitos || {}) } };
      restored = true;
    }
  } catch { /* sem armazenamento */ }
  if (!restored && firstTime) {
    // Respostas do diagnóstico da landing: só onde o perfil ainda está vazio.
    try {
      const quiz = JSON.parse(localStorage.getItem(QUIZ_KEY) || 'null');
      if (quiz) {
        if (!draft.espanhol && [...LEVELS, 'nenhum', 'nativo'].includes(quiz.espanhol)) draft.espanhol = quiz.espanhol;
        if (etapas.some((e) => e.id === quiz.etapa)) draft.etapa = quiz.etapa;
        if (cycles.includes(quiz.ano)) draft.anoAcademico = quiz.ano;
      }
    } catch { /* sem armazenamento */ }
  }
  if (!cycles.includes(draft.anoAcademico)) draft.anoAcademico = '';
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* sem armazenamento */ } };

  // Programas do Radar por universidade (opcional, carregados sob demanda).
  const programCache = new Map();
  async function programsOf(uid) {
    if (!uid) return [];
    if (!programCache.has(uid)) {
      programCache.set(uid, (async () => {
        const out = new Map();
        let offset = 0;
        for (let page = 0; page < 5; page += 1) {
          const r = await api.get(`/radar/opportunities?universidade=${encodeURIComponent(uid)}&limit=100&offset=${offset}`);
          for (const c of r.items || []) if (!out.has(c.programId)) out.set(c.programId, { id: c.programId, nome: c.programa.nome, area: c.programa.ramos?.[0] || '' });
          offset += (r.items || []).length;
          if (!r.items?.length || offset >= (r.total || 0)) break;
        }
        return [...out.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      })().catch(() => []));
    }
    return programCache.get(uid);
  }

  // ---------- Derivados ----------
  const uni = () => universities.find((u) => u.id === draft.universidadeId) || null;
  const stage = () => etapas.find((e) => e.id === draft.etapa) || null;
  const naEspanha = () => Boolean(stage()?.exigeDataEntrada);
  const divisions = () => divisionsFor(draft.paisResidencia);
  // Diploma coerente com a formação: quem já se formou não vê "Ainda não me formei"; quem ainda
  // está cursando só vê "Ainda não me formei" e "Preciso verificar".
  const diplomaOptions = (opcoes) => {
    if (!filled(draft.formacao)) return opcoes;
    const keep = formacaoEmAndamento(draft.formacao) ? ['nao', 'verificar'] : opcoes.map(([v]) => v).filter((v) => v !== 'nao');
    const out = opcoes.filter(([v]) => keep.includes(v));
    return out.length ? out : opcoes;
  };
  const docQuestions = () => perguntas.filter((q) => !q.somenteNaEspanha || naEspanha())
    .map((q) => (q.id === 'diploma' ? { ...q, opcoes: diplomaOptions(q.opcoes) } : q));
  // Resposta que ficou incoerente depois de mudar a formação volta a ficar em branco.
  const fixDiploma = () => {
    const q = docQuestions().find((x) => x.id === 'diploma');
    const v = draft.requisitos.diploma;
    if (q && v && !q.opcoes.some(([o]) => o === v)) { draft.requisitos = { ...draft.requisitos }; delete draft.requisitos.diploma; }
  };
  fixDiploma();
  const inicioAulas = () => {
    if (!draft.anoAcademico || !/^\d{2}$/.test(draft.inicioPeriodo)) return '';
    const y0 = Number(draft.anoAcademico.slice(0, 4));
    return `${draft.inicioPeriodo === '02' ? y0 + 1 : y0}-${draft.inicioPeriodo}-01`;
  };
  const periodLabel = () => {
    const d = inicioAulas();
    if (d) return `${MONTHS[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
    return draft.inicioPeriodo === 'nao-sei' ? 'Ainda não sei' : '';
  };
  const durationLabel = () => {
    if (draft.duracaoOpcao === 'nao-sei') return 'Ainda não sei';
    if (!draft.duracaoMeses) return '';
    const m = draft.duracaoMeses;
    return m === 6 && draft.duracaoOpcao === '6' ? 'Até 6 meses' : m % 12 === 0 ? `${m / 12} ano${m > 12 ? 's' : ''}` : `${m} meses`;
  };
  const levelLabel = (v) => LEVEL_TEXT[v] || (LEVEL_HINT[v] ? `${v} · ${LEVEL_HINT[v]}` : v || '');
  const instLabel = () => INSTITUTIONS.find((i) => i.value === draft.instituicao)?.label || draft.instituicao;

  // ---------- Peças de tela ----------
  const root = h('div', { class: 'ob' });
  let direction = 1;
  let generatingNow = false;
  let autoTimer = null;
  // Estado efêmero da tela atual (ex.: "Outro país" abriu a lista; veio da revisão). Zera ao trocar de pergunta.
  let local = {};
  let syncContinue = () => {};

  // Opção grande. Tocar grava, mostra a marcação e avança sozinho.
  const option = (label, { selected, onPick, sub, disabled, fk } = {}) => h('button', {
    type: 'button', class: `ob-opt${selected ? ' is-selected' : ''}`, 'aria-pressed': String(Boolean(selected)), disabled,
    dataset: fk ? { fk } : undefined, onClick: () => onPick?.(),
  }, h('span', { class: 'ob-opt-text' }, h('span', {}, label), sub ? h('small', {}, sub) : null),
  h('span', { class: 'ob-opt-check', 'aria-hidden': 'true' }, selected ? icon('check', { size: 16 }) : null));
  const options = (items, cols = 1) => h('div', { class: `ob-opts${cols > 1 ? ` cols-${cols}` : ''}` }, items);
  const link = (label, onClick, fk) => h('button', { type: 'button', class: 'ob-link', dataset: fk ? { fk } : undefined, onClick }, label);
  // soft: some enquanto desativado (telas que já têm opções; o botão só aparece quando a pessoa digita).
  const cont = (enabled, onClick = () => next(), label = 'Continuar', { soft = false } = {}) => h('button', {
    type: 'button', class: `btn btn-cta btn-lg btn-block ob-continue${soft ? ' is-soft' : ''}`, disabled: !enabled, hidden: soft && !enabled, onClick,
  }, label, icon('arrow', { size: 16 }));
  const textInput = (key, { placeholder, max = 120, type = 'text', attrs = {} } = {}) => {
    const el = h('input', { type, class: 'ob-input', maxlength: type === 'text' ? max : null, placeholder, value: draft[key] ?? '', autocomplete: 'off', 'aria-label': placeholder || null, dataset: { fk: `in-${key}` }, ...attrs });
    const save = () => { draft[key] = type === 'text' ? el.value.replace(/^\s+/, '') : el.value; persist(); syncContinue(); };
    el.addEventListener('input', save);
    el.addEventListener('change', save);
    onEnter(el);
    return el;
  };
  const select = (key, opts, extra = {}) => Select({ id: `ob-${key}`, value: draft[key] || '', options: opts, searchable: true, block: true, ...extra });
  const pick = (patch) => {
    Object.assign(draft, patch);
    fixDiploma();
    persist();
    draw();
    clearTimeout(autoTimer);
    const at = draft.qid;
    autoTimer = setTimeout(() => { if (draft.qid === at && !generatingNow) next(); }, reduceMotion() ? 120 : 260);
  };
  const toManual = (key, flag) => { Object.assign(draft, { [key]: '', [flag]: true }); persist(); draw(); root.querySelector('.ob-input')?.focus(); };

  // ---------- Perguntas ----------
  const countryOpts = () => {
    const list = countries();
    const prio = PRIORITY_COUNTRIES.map((c) => list.find((x) => x.code === c)).filter(Boolean);
    return [
      ...prio.map((c) => ({ value: c.nome, label: c.nome, group: 'Mais comuns', keywords: c.code })),
      ...list.filter((c) => !PRIORITY_COUNTRIES.includes(c.code)).map((c) => ({ value: c.nome, label: c.nome, group: 'Outros países', keywords: c.code })),
    ];
  };
  // País: atalhos grandes; "Outro país" abre a lista com busca.
  function countryQuestion(key, quick, patchFor) {
    const open = local.outro || (filled(draft[key]) && !quick.includes(draft[key]));
    return [
      options([
        ...quick.map((c) => option(c, { selected: draft[key] === c, fk: `${key}-${c}`, onPick: () => pick(patchFor(c)) })),
        option('Outro país', { selected: open, fk: `${key}-outro`, onPick: () => { local.outro = true; draw(); root.querySelector(`#ob-${key}`)?.click(); } }),
      ]),
      open ? h('div', { class: 'ob-field' }, select(key, countryOpts(), { ariaLabel: 'País', placeholder: 'Escolha o país', searchPlaceholder: 'Buscar país…', onChange: (v) => pick(patchFor(v)) })) : null,
    ];
  }
  // Lista com busca + "Não encontrei: vou escrever".
  function listOrManual(key, flag, opts, { placeholder, searchPlaceholder, manualPlaceholder, manualLabel }) {
    if (draft[flag]) {
      return [
        h('div', { class: 'ob-field' }, textInput(key, { placeholder: manualPlaceholder })),
        cont(filled(draft[key])),
        link('Voltar para a lista', () => { Object.assign(draft, { [key]: '', [flag]: false }); persist(); draw(); }),
      ];
    }
    return [
      h('div', { class: 'ob-field' }, select(key, [...opts, { value: OUTRO, label: manualLabel, pinned: true }], {
        ariaLabel: placeholder, placeholder, searchPlaceholder, onChange: (v) => (v === OUTRO ? toManual(key, flag) : pick({ [key]: v })),
      })),
      filled(draft[key]) ? cont(true) : null,
    ];
  }
  const levelQuestion = (key) => [
    options(LEVELS.map((l) => option(l, { sub: LEVEL_HINT[l], selected: draft[key] === l, fk: `${key}-${l}`, onPick: () => pick({ [key]: l }) })), 2),
    options([
      option('Não falo', { selected: draft[key] === 'nenhum', fk: `${key}-nenhum`, onPick: () => pick({ [key]: 'nenhum' }) }),
      option('Nativo', { selected: draft[key] === 'nativo', fk: `${key}-nativo`, onPick: () => pick({ [key]: 'nativo' }) }),
    ], 2),
    link(draft[key] === 'nao-sei' ? '✓ Não sei meu nível' : 'Não sei meu nível', () => pick({ [key]: 'nao-sei' }), `${key}-nao-sei`),
  ];

  // Cada pergunta: id, grupo, se aparece, título, rótulo/valor (revisão), se está respondida e o corpo.
  const Q = [
    { id: 'nacionalidade', grupo: 'perfil', rotulo: 'Nacionalidade', titulo: () => 'Qual é a sua nacionalidade?',
      ok: () => filled(draft.nacionalidade), valor: () => draft.nacionalidade,
      corpo: () => countryQuestion('nacionalidade', [BR, PT], (v) => ({ nacionalidade: v })) },
    { id: 'residencia', grupo: 'perfil', rotulo: 'Mora em', titulo: () => 'Em que país você mora hoje?',
      ok: () => filled(draft.paisResidencia), valor: () => draft.paisResidencia,
      corpo: () => countryQuestion('paisResidencia', [...new Set([draft.nacionalidade, BR].filter(filled))], (v) => ({ paisResidencia: v, estado: v === draft.paisResidencia ? draft.estado : '' })) },
    { id: 'estado', grupo: 'perfil', rotulo: 'Estado', mostra: () => Boolean(divisions()), titulo: () => `Em qual ${divisions().rotulo.toLowerCase()} você mora?`,
      ok: () => filled(draft.estado) && divisions().options.some((o) => o.value === draft.estado), valor: () => divisionLabel(draft.paisResidencia, draft.estado),
      corpo: () => [h('div', { class: 'ob-field' }, select('estado', divisions().options, { ariaLabel: divisions().rotulo, placeholder: 'Escolha na lista', searchPlaceholder: 'Buscar…', onChange: (v) => pick({ estado: v }) })),
        filled(draft.estado) ? cont(true) : null] },
    { id: 'formacao', grupo: 'perfil', rotulo: 'Formação', titulo: () => 'Qual é a sua formação?',
      ok: () => filled(draft.formacao), valor: () => draft.formacao,
      corpo: () => options(FORMACOES.map((f) => option(f.value, { selected: draft.formacao === f.value, fk: `formacao-${f.value}`, onPick: () => pick({ formacao: f.value }) }))) },
    { id: 'instituicao', grupo: 'perfil', rotulo: 'Instituição', titulo: () => 'Onde você fez a graduação?',
      ok: () => filled(draft.instituicao) && draft.instituicao !== OUTRO, valor: () => instLabel(),
      corpo: () => listOrManual('instituicao', 'instituicaoManual', INSTITUTIONS.map((i) => ({ value: i.value, label: i.label, hint: i.sigla, keywords: i.sigla })),
        { placeholder: 'Busque pelo nome ou sigla', searchPlaceholder: 'Ex.: UFBA, USP, PUC…', manualPlaceholder: 'Nome da universidade ou faculdade', manualLabel: 'Não encontrei: vou escrever' }) },
    { id: 'graduacao', grupo: 'perfil', rotulo: 'Curso', titulo: () => 'Qual foi o seu curso?', livre: true,
      ok: () => draft.graduacaoVista || filled(draft.graduacao), valor: () => draft.graduacao || 'Não informado',
      corpo: () => [h('div', { class: 'ob-field' }, textInput('graduacao', { placeholder: 'Ex.: Direito, Biologia' })),
        cont(true, () => { draft.graduacaoVista = true; persist(); next(); }),
        link('Pular', () => { Object.assign(draft, { graduacaoVista: true, graduacao: '' }); persist(); next(); }, 'pular')] },
    { id: 'area', grupo: 'perfil', rotulo: 'Área', titulo: () => 'Que área você quer estudar na Espanha?',
      ok: () => filled(draft.area) && draft.area !== OUTRO, valor: () => draft.area,
      corpo: () => listOrManual('area', 'areaManual', Object.entries(AREAS).flatMap(([g, list]) => list.map((a) => ({ value: a, label: a, group: g }))),
        { placeholder: 'Escolha a área', searchPlaceholder: 'Buscar área…', manualPlaceholder: 'Ex.: Gestão Cultural', manualLabel: 'Outra área: vou escrever' }) },
    { id: 'espanhol', grupo: 'perfil', rotulo: 'Espanhol', titulo: () => 'Qual é o seu nível de espanhol?',
      ok: () => filled(draft.espanhol), valor: () => levelLabel(draft.espanhol), corpo: () => levelQuestion('espanhol') },
    { id: 'certificado', grupo: 'perfil', rotulo: 'Certificado', titulo: () => 'Você tem certificado de espanhol?',
      ok: () => filled(draft.certificadoEspanhol), valor: () => CERTS.find(([v]) => v === draft.certificadoEspanhol)?.[1] || '',
      corpo: () => options(CERTS.map(([v, l]) => option(l, { selected: draft.certificadoEspanhol === v, fk: `cert-${v}`,
        onPick: () => pick({ certificadoEspanhol: v, certificadoNivel: v === 'nenhum' ? '' : draft.certificadoNivel }) }))) },
    { id: 'certNivel', grupo: 'perfil', rotulo: 'Nível do certificado', mostra: () => filled(draft.certificadoEspanhol) && draft.certificadoEspanhol !== 'nenhum',
      titulo: () => 'Qual nível o certificado comprova?',
      ok: () => LEVELS.includes(draft.certificadoNivel), valor: () => draft.certificadoNivel,
      corpo: () => options(LEVELS.map((l) => option(l, { selected: draft.certificadoNivel === l, fk: `certnivel-${l}`, onPick: () => pick({ certificadoNivel: l }) })), 3) },
    { id: 'ingles', grupo: 'perfil', rotulo: 'Inglês', titulo: () => 'E o seu inglês?',
      ok: () => filled(draft.ingles), valor: () => levelLabel(draft.ingles), corpo: () => levelQuestion('ingles') },
    { id: 'orcamento', grupo: 'perfil', rotulo: 'Orçamento', titulo: () => 'Quanto você tem, mais ou menos, para essa viagem?',
      ok: () => draft.orcamentoSituacao === 'nao-sei' || (draft.orcamentoSituacao === 'informado' && Number.isFinite(draft.orcamentoDisponivel) && draft.orcamentoDisponivel >= 0),
      valor: () => (draft.orcamentoSituacao === 'nao-sei' ? 'Ainda não sei' : `≈ ${eur(draft.orcamentoDisponivel)}`),
      corpo: () => {
        const quick = draft.orcamentoSituacao === 'informado' && BUDGET_SHORTCUTS.includes(draft.orcamentoDisponivel);
        const typed = draft.orcamentoSituacao === 'informado' && !quick && Number.isFinite(draft.orcamentoDisponivel);
        const amount = h('input', { type: 'text', inputmode: 'numeric', class: 'ob-input', placeholder: 'Outro valor', autocomplete: 'off', 'aria-label': 'Outro valor em euros', dataset: { fk: 'orcamento' },
          value: typed ? new Intl.NumberFormat('pt-BR').format(draft.orcamentoDisponivel) : '' });
        amount.addEventListener('input', () => {
          const digits = amount.value.replace(/\D/g, '').slice(0, 8);
          const n = digits ? Number(digits) : null;
          amount.value = n === null ? '' : new Intl.NumberFormat('pt-BR').format(n);
          Object.assign(draft, { orcamentoDisponivel: n, orcamentoSituacao: n === null ? '' : 'informado' });
          persist();
          for (const b of root.querySelectorAll('.ob-opt.is-selected')) { b.classList.remove('is-selected'); b.setAttribute('aria-pressed', 'false'); }
          syncContinue();
        });
        onEnter(amount);
        return [
          options(BUDGET_SHORTCUTS.map((v) => option(`≈ ${eur(v)}`, { selected: quick && draft.orcamentoDisponivel === v, fk: `quick-${v}`, onPick: () => pick({ orcamentoDisponivel: v, orcamentoSituacao: 'informado' }) })), 2),
          h('div', { class: 'ob-field ob-money' }, h('span', { 'aria-hidden': 'true' }, '€'), amount),
          cont(typed, undefined, undefined, { soft: true }),
          link(draft.orcamentoSituacao === 'nao-sei' ? '✓ Ainda não sei' : 'Ainda não sei', () => pick({ orcamentoSituacao: 'nao-sei', orcamentoDisponivel: null }), 'orc-nao-sei'),
        ];
      } },
    { id: 'universidade', grupo: 'destino', rotulo: 'Universidade', titulo: () => 'Em qual universidade você quer estudar?',
      ok: () => Boolean(uni()), valor: () => (uni() ? `${uni().sigla} · ${uni().cidade}` : ''),
      corpo: () => options(universities.map((x) => option(x.sigla, { sub: x.cidade, selected: draft.universidadeId === x.id, fk: `uni-${x.id}`,
        onPick: () => pick({ universidadeId: x.id, ...(x.id === draft.universidadeId ? {} : { programaId: '', programaNome: '', programaVisto: false }) }) })), 2) },
    { id: 'mestrado', grupo: 'destino', rotulo: 'Mestrado', titulo: () => 'Já sabe qual mestrado quer?',
      ok: () => draft.programaVisto || Boolean(draft.programaId), valor: () => draft.programaNome || 'Escolho depois',
      corpo: () => {
        const slot = h('div', { class: 'ob-field' }, h('p', { class: 'ob-sub' }, 'Carregando mestrados…'));
        programsOf(draft.universidadeId).then((list) => {
          if (!slot.isConnected) return;
          mount(slot, list.length
            ? Select({ id: 'ob-programaId', ariaLabel: 'Mestrado', value: draft.programaId, searchable: true, block: true, placeholder: 'Escolher na lista', searchPlaceholder: 'Buscar mestrado…',
              options: list.map((pr) => ({ value: pr.id, label: pr.nome, hint: pr.area, disabled: takenPrograms.has(pr.id) })),
              onChange: (v, o) => pick({ programaId: v, programaNome: v ? o.label : '', programaVisto: true }) })
            : h('p', { class: 'ob-sub' }, 'Você escolhe o mestrado depois, com a nossa ajuda.'));
        });
        return [slot,
          draft.programaId ? cont(true) : null,
          link(draft.programaVisto && !draft.programaId ? '✓ Ainda não sei: escolho depois' : 'Ainda não sei: escolho depois', () => pick({ programaId: '', programaNome: '', programaVisto: true }), 'mestrado-depois')];
      } },
    { id: 'ano', grupo: 'destino', rotulo: 'Ano', titulo: () => 'Em que ano letivo você quer começar?',
      ok: () => cycles.includes(draft.anoAcademico) && !(!draft.programaId && openDestinations.has(`${draft.universidadeId}|${draft.anoAcademico}`)), valor: () => draft.anoAcademico,
      corpo: () => options(cycles.map((c) => {
        const dup = !draft.programaId && openDestinations.has(`${draft.universidadeId}|${c}`);
        return option(c, { selected: draft.anoAcademico === c, disabled: dup, sub: dup ? 'Já tem uma jornada aqui' : null, fk: `ano-${c}`,
          onPick: () => pick({ anoAcademico: c, inicioPeriodo: draft.inicioPeriodo === 'nao-sei' || c === draft.anoAcademico ? draft.inicioPeriodo : '' }) });
      }), 2) },
    { id: 'inicio', grupo: 'destino', rotulo: 'Início', titulo: () => 'Em que mês começam as aulas?',
      ok: () => Boolean(inicioAulas()) || draft.inicioPeriodo === 'nao-sei', valor: () => periodLabel(),
      corpo: () => [
        options(PERIODS.map(([m, l]) => option(`${l} de ${m === '02' ? Number(draft.anoAcademico.slice(0, 4)) + 1 : draft.anoAcademico.slice(0, 4)}`,
          { selected: draft.inicioPeriodo === m, fk: `ini-${m}`, onPick: () => pick({ inicioPeriodo: m }) }))),
        link(draft.inicioPeriodo === 'nao-sei' ? '✓ Ainda não sei' : 'Ainda não sei', () => pick({ inicioPeriodo: 'nao-sei' }), 'ini-nao-sei')] },
    { id: 'duracao', grupo: 'destino', rotulo: 'Duração', titulo: () => 'Quanto tempo você vai ficar?',
      ok: () => draft.duracaoOpcao === 'nao-sei' || (Number.isInteger(draft.duracaoMeses) && draft.duracaoMeses >= 1 && draft.duracaoMeses <= 48), valor: () => durationLabel(),
      corpo: () => {
        const outra = draft.duracaoOpcao === 'outra';
        const n = outra ? h('input', { type: 'number', class: 'ob-input', min: 1, max: 48, step: 1, inputmode: 'numeric', placeholder: 'Quantos meses?', 'aria-label': 'Duração em meses', value: draft.duracaoMeses ?? '', dataset: { fk: 'duracao-outra' } }) : null;
        if (n) {
          n.addEventListener('input', () => { const v = Number(n.value); draft.duracaoMeses = Number.isInteger(v) && v >= 1 && v <= 48 ? v : null; persist(); syncContinue(); });
          onEnter(n);
        }
        return [
          options([...DURATIONS.map(([v, l]) => option(l, { selected: draft.duracaoOpcao === v, fk: `dur-${v}`, onPick: () => pick({ duracaoOpcao: v, duracaoMeses: Number(v) }) })),
            option('Outra', { selected: outra, fk: 'dur-outra', onPick: () => { Object.assign(draft, { duracaoOpcao: 'outra', duracaoMeses: null }); persist(); draw(); root.querySelector('[data-fk="duracao-outra"]')?.focus(); } })], 2),
          outra ? h('div', { class: 'ob-field' }, n) : null,
          outra ? cont(Number.isInteger(draft.duracaoMeses), undefined, undefined, { soft: true }) : null,
          link(draft.duracaoOpcao === 'nao-sei' ? '✓ Ainda não sei' : 'Ainda não sei', () => pick({ duracaoOpcao: 'nao-sei', duracaoMeses: null }), 'dur-nao-sei'),
        ];
      } },
    { id: 'etapa', grupo: 'destino', rotulo: 'Onde você está', titulo: () => 'Você já começou o processo?',
      ok: () => Boolean(stage()), valor: () => stage()?.rotulo || '',
      corpo: () => options(etapas.map((e) => option(e.rotulo, { selected: draft.etapa === e.id, fk: `etapa-${e.id}`,
        onPick: () => pick({ etapa: e.id, confirmaEtapa: e.id === draft.etapa ? draft.confirmaEtapa : false, ...(e.exigeDataEntrada ? {} : { dataEntrada: '' }) }) }))) },
    { id: 'dataEntrada', grupo: 'destino', rotulo: 'Chegada', mostra: () => naEspanha(), titulo: () => 'Quando você chegou na Espanha?',
      ok: () => /^\d{4}-\d{2}-\d{2}$/.test(draft.dataEntrada || ''), valor: () => (draft.dataEntrada || '').split('-').reverse().join('/'),
      corpo: () => {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
        return [h('div', { class: 'ob-field' }, textInput('dataEntrada', { type: 'date', placeholder: 'Data de chegada', attrs: { max: today } })),
          cont(/^\d{4}-\d{2}-\d{2}$/.test(draft.dataEntrada || ''))];
      } },
    { id: 'confirma', grupo: 'destino', rotulo: 'Etapas já feitas', mostra: () => Boolean(stage()) && draft.etapa !== 'inicio',
      titulo: () => 'Confirma o que você já fez?',
      ok: () => draft.confirmaEtapa, valor: () => (draft.confirmaEtapa ? 'Confirmado' : ''),
      corpo: () => [
        h('p', { class: 'ob-sub' }, `“${stage().rotulo}”: até ${plural(stage().missoes, 'passo fica marcado', 'passos ficam marcados')} como feito por você. Dá para desfazer depois.`),
        options([option('Sim, já fiz isso', { selected: draft.confirmaEtapa, fk: 'confirma', onPick: () => pick({ confirmaEtapa: true }) })]),
        link('Não, quero mudar a resposta', () => goTo('etapa', -1), 'confirma-nao')] },
  ];
  // Uma tela por pergunta de documento (as opções do diploma seguem a formação).
  const docQ = () => docQuestions().map((q) => ({
    id: `doc:${q.id}`, grupo: 'perfil', titulo: () => q.pergunta,
    rotulo: q.pergunta.replace(/^Você já tem (o |a |os |as )?/, '').replace('?', '').replace(/^./, (c) => c.toUpperCase()),
    ok: () => q.opcoes.some(([o]) => o === draft.requisitos[q.id]), valor: () => q.opcoes.find(([o]) => o === draft.requisitos[q.id])?.[1] || '',
    corpo: () => options(q.opcoes.map(([v, l]) => option(l, { selected: draft.requisitos[q.id] === v, fk: `doc-${q.id}-${v}`,
      onPick: () => pick({ requisitos: { ...draft.requisitos, [q.id]: v } }) }))),
  }));
  const REVIEW = 'revisao';
  // Lista atual (depende das respostas). Segunda jornada: só as perguntas de destino.
  const list = () => [...Q, ...docQ()].filter((q) => (firstTime || q.grupo === 'destino') && (!q.mostra || q.mostra()));
  const firstMissing = () => list().find((q) => !q.ok());
  if (!draft.qid || (draft.qid !== REVIEW && !list().some((q) => q.id === draft.qid))) draft.qid = firstMissing()?.id || REVIEW;

  function goTo(qid, dir = 1, extra = {}) {
    clearTimeout(autoTimer);
    direction = dir;
    draft.qid = qid;
    local = { ...extra };
    persist();
    draw(true);
  }
  // Próxima pergunta. Quem veio da revisão volta para ela assim que tudo estiver respondido.
  function next() {
    const L = list();
    const i = L.findIndex((q) => q.id === draft.qid);
    if (i >= 0 && !L[i].ok()) return;
    if (local.fromReview && !firstMissing()) return goTo(REVIEW);
    goTo(L[i + 1]?.id || REVIEW);
  }
  function back() {
    const L = list();
    const i = draft.qid === REVIEW ? L.length : L.findIndex((q) => q.id === draft.qid);
    if (i <= 0) { location.hash = '#/jornadas'; return; }
    goTo(L[i - 1].id, -1);
  }

  // ---------- Desenho ----------
  function reviewBody() {
    const missing = firstMissing();
    return [
      h('ul', { class: 'ob-review' }, list().map((q) => h('li', {},
        h('button', { type: 'button', class: 'ob-review-row', onClick: () => goTo(q.id, -1, { fromReview: true }) },
          h('span', { class: 'ob-review-k' }, q.rotulo),
          h('span', { class: `ob-review-v${q.ok() ? '' : ' is-missing'}` }, q.ok() ? q.valor() : 'Responder'),
          icon('arrow', { size: 14 }))))),
      missing ? cont(true, () => goTo(missing.id), 'Responder o que falta') : cont(true, () => finish(), 'Criar meu plano'),
    ];
  }

  function draw(changed = false) {
    if (generatingNow) return;
    const L = list();
    const review = draft.qid === REVIEW;
    const idx = review ? L.length : Math.max(0, L.findIndex((q) => q.id === draft.qid));
    const q = review ? null : L[idx];
    const pct = review ? 100 : Math.round((idx / Math.max(1, L.length)) * 100);
    const fill = h('span');
    fill.style.width = `${pct}%`;
    const focusKey = changed ? null : document.activeElement?.closest?.('[data-fk]')?.dataset.fk;
    mount(root,
      h('header', { class: 'ob-top' },
        h('button', { type: 'button', class: 'ob-back', 'aria-label': idx === 0 ? 'Sair e fazer depois' : 'Voltar', onClick: back }, icon('back', { size: 20 })),
        h('div', { class: 'ob-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso' }, fill),
        h('span', { class: 'ob-count' }, review ? 'Revisão' : `${idx + 1} de ${L.length}`)),
      h('section', { class: `ob-q${changed && !reduceMotion() ? (direction > 0 ? ' ob-in-fwd' : ' ob-in-back') : ''}`, 'aria-labelledby': 'ob-q-title' },
        h('h1', { class: 'ob-q-title', id: 'ob-q-title', tabindex: '-1' }, review ? 'Está tudo certo?' : q.titulo()),
        h('div', { class: 'ob-q-body' }, review ? reviewBody() : q.corpo())));
    // "Continuar" acompanha o que é digitado sem redesenhar a tela (o cursor não pula).
    syncContinue = () => {
      const btn = root.querySelector('.ob-continue');
      const cur = list().find((x) => x.id === draft.qid);
      if (btn && cur && !cur.livre) { btn.disabled = !cur.ok(); if (btn.classList.contains('is-soft')) btn.hidden = btn.disabled; }
    };
    syncContinue();
    if (changed) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
        const input = root.querySelector('.ob-q-body .ob-input');
        (input && !matchMedia('(pointer: coarse)').matches ? input : root.querySelector('.ob-q-title'))?.focus({ preventScroll: true });
      });
    } else if (focusKey) root.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  // ---------- Geração ----------
  const TASKS = [
    ['perfil', 'Salvando seu perfil'],
    ['requisitos', 'Registrando seus documentos'],
    ['jornada', 'Montando seu caminho'],
    ['anterior', 'Marcando o que você já fez'],
    ['concluir', 'Finalizando'],
  ];
  function generatingScreen(done, failedAt = null, error = null) {
    const tasks = TASKS.filter(([k]) => (firstTime || !['perfil', 'requisitos', 'concluir'].includes(k)) && (k !== 'anterior' || draft.etapa !== 'inicio'));
    return h('div', { class: 'ob-generating', role: 'status', 'aria-live': 'polite' },
      h('span', { class: `gen-orbit${error ? ' is-error' : ''}`, 'aria-hidden': 'true' }, icon(error ? 'alert' : 'compass', { size: 32 })),
      h('h1', {}, error ? 'Não consegui terminar agora' : 'Montando o seu plano…'),
      error ? h('p', { class: 'muted' }, error) : null,
      h('ul', { class: 'gen-tasks' }, tasks.map(([k, label]) => h('li', { class: done.includes(k) ? 'is-done' : failedAt === k ? 'is-failed' : '' },
        h('span', { class: 'gen-task-ic', 'aria-hidden': 'true' }, done.includes(k) ? icon('check', { size: 13 }) : failedAt === k ? icon('x', { size: 13 }) : h('span', { class: 'gen-spin' })), label))),
      error ? h('div', { class: 'row wrap ob-gen-actions' },
        h('button', { type: 'button', class: 'btn btn-cta', onClick: () => finish() }, icon('refresh', { size: 16 }), 'Tentar novamente'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { generatingNow = false; goTo(REVIEW, -1); } }, 'Voltar para a revisão')) : null);
  }

  async function finish() {
    if (generatingNow) return; // evita duplo clique / jornada duplicada
    const missing = firstMissing();
    if (missing) { toast('Falta responder uma pergunta.', 'warn'); goTo(missing.id); return; }
    generatingNow = true;
    const done = [];
    let current = null;
    const show = () => mount(root, generatingScreen(done));
    const minWait = new Promise((r) => setTimeout(r, reduceMotion() ? 300 : 1200));
    try {
      show();
      if (firstTime) {
        current = 'perfil';
        const profile = {
          nacionalidade: draft.nacionalidade.trim(), paisResidencia: draft.paisResidencia.trim(), estado: divisions() ? draft.estado : '',
          formacao: draft.formacao.trim(), instituicao: draft.instituicao.trim(), graduacao: (draft.graduacao || '').trim(), area: draft.area.trim(),
          espanhol: draft.espanhol, certificadoEspanhol: draft.certificadoEspanhol, certificadoNivel: draft.certificadoEspanhol === 'nenhum' ? '' : draft.certificadoNivel, ingles: draft.ingles,
          orcamentoSituacao: draft.orcamentoSituacao, orcamentoDisponivel: draft.orcamentoSituacao === 'informado' ? draft.orcamentoDisponivel : null,
        };
        setMe(await api.put('/me/profile', profile));
        done.push('perfil'); show();
        current = 'requisitos';
        const respostas = Object.fromEntries(docQuestions().map((q) => [q.id, draft.requisitos[q.id]]));
        await api.put('/journeys/requirements', { respostas });
        done.push('requisitos'); show();
      }
      current = 'jornada';
      // Repetição após falha: reaproveita a jornada criada na tentativa anterior (nunca cria outra).
      let journey = null;
      if (draft.journeyId) journey = await api.get(`/journeys/${draft.journeyId}`).then((r) => r.journey).catch(() => null);
      if (!journey) {
        const body = { universidadeId: draft.universidadeId, anoAcademico: draft.anoAcademico, duracaoMeses: draft.duracaoOpcao === 'nao-sei' ? null : draft.duracaoMeses };
        if (draft.programaId) body.programaId = draft.programaId;
        if (inicioAulas()) Object.assign(body, { inicioAulas: inicioAulas(), inicioAulasAproximado: true });
        journey = (await api.post('/journeys', body)).journey;
        draft.journeyId = journey.id;
        persist();
      }
      done.push('jornada'); show();
      if (draft.etapa !== 'inicio') {
        current = 'anterior';
        if (journey.progressoAnterior?.etapa !== draft.etapa) {
          journey = (await api.post(`/journeys/${journey.id}/prior-progress`, { etapa: draft.etapa, confirmo: true, ...(naEspanha() ? { dataEntrada: draft.dataEntrada } : {}) })).journey;
        }
        done.push('anterior'); show();
      }
      if (firstTime) {
        current = 'concluir';
        setMe(await api.post('/me/onboarding/complete', {}));
        done.push('concluir'); show();
      }
      await minWait;
      invalidate();
      try { localStorage.removeItem(KEY); localStorage.removeItem(QUIZ_KEY); } catch { /* sem armazenamento */ }
      mount(root, resultScreen(journey));
      requestAnimationFrame(() => root.querySelector('h1')?.focus({ preventScroll: true }));
    } catch (e) {
      mount(root, generatingScreen(done, current, e.message || 'Falha de conexão.'));
      toast(e.message || 'Falha de conexão.', 'err');
      generatingNow = false; // libera o "Tentar novamente" (a jornada já criada é reaproveitada via draft.journeyId)
    }
  }

  draw(true);
  if (restored && draft.qid !== list()[0]?.id) toast('Retomamos de onde você parou.', 'info');
  return root;
}

// Tela final: título, uma linha, um botão para o primeiro passo ainda não feito e um link discreto.
function resultScreen(j) {
  const prox = j.proximaMissao || null;
  const nome = state.me?.user?.profile?.apelido || state.me?.user?.profile?.nome || '';
  const d = j.destino;
  return h('div', { class: 'ob-result' },
    h('span', { class: 'ob-result-ic', 'aria-hidden': 'true' }, icon('check', { size: 28 })),
    h('h1', { tabindex: '-1' }, nome ? `Pronto, ${nome}!` : 'Pronto!'),
    h('p', { class: 'ob-sub' }, `Seu plano para ${d.universidade?.sigla || 'a Espanha'}${d.anoAcademico ? ` em ${d.anoAcademico}` : ''} está montado.`),
    prox
      ? h('a', { class: 'btn btn-cta btn-lg btn-block ob-result-go', href: `#/j/${j.id}/m/${prox.id}` },
        h('span', { class: 'ob-result-go-text' }, h('small', {}, 'Primeiro passo'), h('strong', {}, prox.titulo)), icon('arrow', { size: 18 }))
      : h('a', { class: 'btn btn-cta btn-lg btn-block', href: `#/j/${j.id}` }, 'Ver meu plano', icon('arrow', { size: 18 })),
    h('a', { class: 'ob-link', href: '#/' }, 'Ir para a página inicial'));
}
