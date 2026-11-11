// Onboarding + criação de jornada.
//   Primeira vez: 6 etapas (origem, formação, idiomas, orçamento, destino, documentos) → revisão → geração.
//   Jornadas seguintes: só o destino (perfil, requisitos, documentos e finanças são reaproveitados).
//
// O que cada resposta alimenta (auditoria em docs/27-onboarding.md):
//   origem    → paisResidencia: regra de visto (missões 5.x em "atenção" fora do Brasil), consulado (UF), documentos
//   formação  → formacao: elegibilidade (Missão 1.4) e objetivo automático da Missão 1.1
//   idiomas   → espanhol/certificado: Missões 2.x de idioma e elegibilidade; inglês: contexto do Mentor
//   orçamento → referência no Planejamento financeiro (não conta como recurso comprovado)
//   destino   → jornada: universidade, mestrado (opcional), ano, início, duração (TIE > 6 meses), progresso anterior
//   documentos→ requisitos: "Sim, já tenho" conclui as missões de providenciar o documento
//
// Rascunho salvo no navegador a cada resposta (sobrevive a recarregar a página); apagado ao concluir.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, invalidate } from '../app.js';
import { getCatalog, getPlaces } from '../data.js';
import { QUIZ_KEY } from './landing.js';
import { Select } from '../components/Select.js';
import { countries, countryCode, countryName, divisionsFor, divisionLabel, PRIORITY_COUNTRIES } from '../data/geo.js';
import { FORMACOES, AREAS, INSTITUTIONS, BUDGET_SHORTCUTS, formacaoEmAndamento } from '../data/academic.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVEL_HINT = { A1: 'Iniciante', A2: 'Básico', B1: 'Intermediário', B2: 'Intermediário alto', C1: 'Avançado', C2: 'Proficiente' };
const LEVEL_TEXT = { nenhum: 'Não falo', 'nao-sei': 'Não sei meu nível', nativo: 'Nativo' };
const CERTS = [['nenhum', 'Não tenho certificação'], ['DELE', 'DELE'], ['SIELE', 'SIELE'], ['outro', 'Outro certificado']];
const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const OUTRO = '__outro__';
const ALL_STEPS = [
  { id: 'origem', titulo: 'De onde você parte', curto: 'Origem', icone: 'home', intro: 'Sua nacionalidade e onde você mora hoje definem o consulado e as regras de visto da sua jornada.' },
  { id: 'formacao', titulo: 'Sua formação', curto: 'Formação', icone: 'cap', intro: 'Seu histórico acadêmico e a área que você quer estudar na Espanha.' },
  { id: 'idiomas', titulo: 'Seus idiomas', curto: 'Idiomas', icone: 'lang', intro: 'Seu nível declarado. Ninguém precisa ter certificado para continuar.' },
  { id: 'orcamento', titulo: 'Seu orçamento', curto: 'Orçamento', icone: 'euro', intro: 'Uma estimativa, em euros, do que você tem para a mobilidade. Pode ser aproximada.' },
  { id: 'destino', titulo: 'Seu destino', curto: 'Destino', icone: 'pin', intro: 'Onde e quando você quer estudar, e em que ponto do processo você está.' },
  { id: 'documentos', titulo: 'Seus documentos', curto: 'Documentos', icone: 'folder', intro: 'Só a situação de cada um. Você não envia nenhum arquivo agora.' },
];
const PERIODS = [['09', 'Setembro'], ['10', 'Outubro'], ['02', 'Fevereiro']];
const DURATIONS = [['6', 'Até 6 meses'], ['12', '1 ano'], ['18', '1 ano e meio'], ['24', '2 anos']];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const eur = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const filled = (v) => typeof v === 'string' && v.trim().length > 0;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function onboardingView() {
  const me = state.me.user;
  const p = me.profile;
  const firstTime = !p.onboardingConcluido;
  const STEPS = firstTime ? ALL_STEPS : ALL_STEPS.filter((s) => s.id === 'destino');
  const [{ universities }, reqs, { journeys }, { etapas }, places] = await Promise.all([
    getCatalog(), api.get('/journeys/requirements'), api.get('/journeys'), api.get('/journeys/progress-stages'), getPlaces().catch(() => null),
  ]);
  const perguntas = reqs.perguntas;
  const year = new Date().getFullYear();
  const cycles = [0, 1, 2, 3].map((i) => `${year + i}/${String((year + i + 1) % 100).padStart(2, '0')}`);
  const takenPrograms = new Set(journeys.map((j) => j.destino.programa?.id).filter(Boolean));
  const openDestinations = new Set(journeys.filter((j) => !j.destino.programa).map((j) => `${j.destino.universidade?.id}|${j.destino.anoAcademico || ''}`));

  // ---------- Rascunho ----------
  const KEY = `estuvia:onboarding:${me.id}:${firstTime ? 'perfil' : 'jornada'}`;
  const known = (v, list) => (list.includes(v) ? v : '');
  const fresh = () => {
    const nat = p.nacionalidade ? countryCode(p.nacionalidade) : null;
    const instKnown = !p.instituicao || INSTITUTIONS.some((i) => i.value === p.instituicao);
    const areaKnown = !p.area || Object.values(AREAS).flat().includes(p.area);
    return {
      v: 1, step: 0, docIndex: 0,
      nacionalidade: nat ? countryName(nat) : (p.nacionalidade || ''), paisResidencia: p.paisResidencia || '', estado: p.estado || '',
      formacao: p.formacao || '', instituicao: p.instituicao || '', instituicaoManual: !instKnown, area: p.area || '', areaManual: !areaKnown,
      espanhol: p.espanhol || '', certificadoEspanhol: p.certificadoEspanhol || '', certificadoNivel: p.certificadoNivel || '', ingles: p.ingles || '',
      orcamentoSituacao: p.orcamentoSituacao || (typeof p.orcamentoDisponivel === 'number' ? 'informado' : ''), orcamentoDisponivel: p.orcamentoDisponivel ?? null,
      universidadeId: '', programaId: '', programaNome: '', anoAcademico: '', inicioPeriodo: '', duracaoOpcao: '', duracaoMeses: null,
      etapa: '', dataEntrada: '', confirmaEtapa: false,
      requisitos: { ...(reqs.respostas || {}) },
      journeyId: null,
    };
  };
  let draft = fresh();
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.v === 1) { draft = { ...draft, ...saved, requisitos: { ...draft.requisitos, ...(saved.requisitos || {}) } }; restored = true; }
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
  draft.step = Math.min(draft.step || 0, STEPS.length); // STEPS.length = tela de revisão
  draft.anoAcademico = known(draft.anoAcademico, cycles);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* sem armazenamento */ } };
  const set = (patch, redraw = true) => { Object.assign(draft, patch); persist(); if (redraw) draw(); else refresh(); };

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
  const docQuestions = () => perguntas.filter((q) => !q.somenteNaEspanha || naEspanha());
  const resCode = () => countryCode(draft.paisResidencia);
  const divisions = () => divisionsFor(draft.paisResidencia);
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
  const langLabel = (v) => LEVEL_TEXT[v] || v || '';
  const certLabel = () => (draft.certificadoEspanhol === 'nenhum' ? 'sem certificação' : draft.certificadoEspanhol ? `${draft.certificadoEspanhol === 'outro' ? 'outro certificado' : draft.certificadoEspanhol}${draft.certificadoNivel ? ` ${draft.certificadoNivel}` : ''}` : '');
  const docKind = (v) => (v === 'tenho' ? 'ok' : v === 'verificar' ? 'check' : 'pending');

  // ---------- Validação (o servidor confere de novo em /me/onboarding/complete) ----------
  function problems(id) {
    const out = [];
    const need = (ok, field, msg) => { if (!ok) out.push({ field, msg }); };
    switch (id) {
      case 'origem':
        need(filled(draft.nacionalidade), 'nacionalidade', 'nacionalidade');
        need(filled(draft.paisResidencia), 'paisResidencia', 'país onde você mora');
        if (divisions()) need(filled(draft.estado) && divisions().options.some((o) => o.value === draft.estado), 'estado', divisions().rotulo.toLowerCase());
        break;
      case 'formacao':
        need(filled(draft.formacao), 'formacao', 'formação acadêmica');
        need(filled(draft.instituicao) && draft.instituicao !== OUTRO, 'instituicao', draft.instituicaoManual ? 'nome da instituição' : 'instituição de origem');
        need(filled(draft.area) && draft.area !== OUTRO, 'area', draft.areaManual ? 'nome da área' : 'área de interesse');
        break;
      case 'idiomas':
        need(filled(draft.espanhol), 'espanhol', 'nível de espanhol');
        need(filled(draft.certificadoEspanhol), 'certificadoEspanhol', 'certificação de espanhol');
        if (draft.certificadoEspanhol && draft.certificadoEspanhol !== 'nenhum') need(LEVELS.includes(draft.certificadoNivel), 'certificadoNivel', 'nível do certificado');
        need(filled(draft.ingles), 'ingles', 'nível de inglês');
        break;
      case 'orcamento':
        need(draft.orcamentoSituacao === 'nao-sei' || (draft.orcamentoSituacao === 'informado' && Number.isFinite(draft.orcamentoDisponivel) && draft.orcamentoDisponivel >= 0), 'orcamento', 'valor aproximado ou "Ainda não sei"');
        break;
      case 'destino':
        need(Boolean(uni()), 'universidadeId', 'universidade');
        need(cycles.includes(draft.anoAcademico), 'anoAcademico', 'ano acadêmico');
        need(Boolean(inicioAulas()) || draft.inicioPeriodo === 'nao-sei', 'inicioPeriodo', 'início das aulas');
        need(draft.duracaoOpcao === 'nao-sei' || (Number.isInteger(draft.duracaoMeses) && draft.duracaoMeses >= 1 && draft.duracaoMeses <= 48), 'duracao', 'duração da estadia');
        need(Boolean(stage()), 'etapa', 'em que ponto você está');
        if (stage() && draft.etapa !== 'inicio') need(draft.confirmaEtapa, 'confirmaEtapa', 'confirmação das etapas já feitas');
        if (naEspanha()) need(/^\d{4}-\d{2}-\d{2}$/.test(draft.dataEntrada || ''), 'dataEntrada', 'data de entrada na Espanha');
        if (uni() && draft.programaId && takenPrograms.has(draft.programaId)) out.push({ field: 'programaId', msg: 'outro mestrado (você já tem uma jornada para este)' });
        if (uni() && !draft.programaId && openDestinations.has(`${draft.universidadeId}|${draft.anoAcademico}`)) out.push({ field: 'universidadeId', msg: 'outro destino ou ano (você já tem uma jornada aqui com o mestrado a definir)' });
        break;
      case 'documentos':
        for (const q of docQuestions()) need(Boolean(draft.requisitos[q.id]), `doc-${q.id}`, `resposta: ${q.pergunta.replace(/^Você já tem (o |a )?/, '').replace('?', '')}`);
        break;
      default:
    }
    return out;
  }
  const stepValid = (i) => !problems(STEPS[i].id).length;
  const firstInvalid = () => STEPS.findIndex((_, i) => !stepValid(i));

  // ---------- Estrutura ----------
  const root = h('div', { class: 'ob' });
  let direction = 0;
  let generatingNow = false;

  function chip(label, { selected, onClick, kind, hint, iconName, disabled, fk } = {}) {
    return h('button', {
      type: 'button', class: `ob-chip${selected ? ' is-selected' : ''}${kind ? ` k-${kind}` : ''}`, 'aria-pressed': String(Boolean(selected)), disabled, onClick,
      dataset: fk ? { fk } : undefined,
    }, iconName ? h('span', { class: 'ob-chip-ic', 'aria-hidden': 'true' }, icon(iconName, { size: 15 })) : null,
    h('span', { class: 'ob-chip-text' }, h('span', {}, label), hint ? h('small', {}, hint) : null),
    selected ? h('span', { class: 'ob-chip-check', 'aria-hidden': 'true' }, icon('check', { size: 14 })) : null);
  }
  const group = (label, children, { hint, fk, id } = {}) => h('div', { class: 'ob-group', role: 'group', 'aria-labelledby': id ? `${id}-lbl` : null, dataset: fk ? { fk } : undefined },
    h('p', { class: 'ob-label', id: id ? `${id}-lbl` : null }, label), hint ? h('p', { class: 'ob-hint' }, hint) : null, children);
  const fieldBox = (label, control, { hint, id } = {}) => h('div', { class: 'ob-field' }, h('label', { class: 'ob-label', id: id ? `${id}-lbl` : null, for: id || null }, label), control, hint ? h('p', { class: 'ob-hint' }, hint) : null);
  const note = (text, kind = 'info', iconName = 'help') => h('div', { class: `ob-note n-${kind}` }, h('span', { class: 'ob-note-ic', 'aria-hidden': 'true' }, icon(iconName, { size: 16 })), h('div', {}, text));
  const sel = (key, opts, extra = {}) => Select({
    id: `ob-${key}`, labelledBy: `ob-${key}-lbl`, value: draft[key] || '', options: opts, ...extra,
    onChange: extra.onChange || ((v) => set({ [key]: v })),
  });

  // ---------- Etapas ----------
  function stepOrigem() {
    const list = countries();
    const prio = PRIORITY_COUNTRIES.map((c) => list.find((x) => x.code === c)).filter(Boolean);
    // Cada país aparece uma vez: os mais comuns no topo, os demais em ordem alfabética.
    const countryOpts = [
      ...prio.map((c) => ({ value: c.nome, label: c.nome, group: 'Mais comuns', keywords: c.code })),
      ...list.filter((c) => !PRIORITY_COUNTRIES.includes(c.code)).map((c) => ({ value: c.nome, label: c.nome, group: 'Outros países', keywords: c.code })),
    ];
    const div = divisions();
    const code = resCode();
    const natCode = countryCode(draft.nacionalidade);
    const consul = code === 'BR' && draft.estado ? places?.consulates?.find((c) => c.estadosConfirmados?.includes(draft.estado)) : null;
    return [
      h('div', { class: 'ob-grid' },
        fieldBox('Nacionalidade', sel('nacionalidade', countryOpts, { searchable: true, placeholder: 'Selecione o país', searchPlaceholder: 'Buscar país…' }), { id: 'ob-nacionalidade', hint: 'O país do seu passaporte.' }),
        fieldBox('País onde você mora hoje', sel('paisResidencia', countryOpts, { searchable: true, placeholder: 'Selecione o país', searchPlaceholder: 'Buscar país…', onChange: (v) => set({ paisResidencia: v, estado: '' }) }), { id: 'ob-paisResidencia', hint: 'Define qual consulado atende o seu visto.' }),
        div ? fieldBox(div.rotulo, sel('estado', div.options, { searchable: true, placeholder: `Selecione ${div.rotulo.toLowerCase().startsWith('reg') || div.rotulo.startsWith('Prov') ? 'a' : 'o'} ${div.rotulo.toLowerCase()}`, searchPlaceholder: 'Buscar…' }), { id: 'ob-estado', hint: div.ajuda }) : null),
      code && draft.paisResidencia ? (code === 'BR'
        ? note(consul ? [h('strong', {}, `${divisionLabel(draft.paisResidencia, draft.estado)}: `), `o visto de estudos de quem mora aqui é pedido no ${consul.nome}. As missões de visto já vêm com esse consulado.`] : 'Com a sua UF, a Estuvia indica o consulado espanhol responsável pelo seu visto de estudos.', 'ok', 'passport')
        : note([h('strong', {}, `Morando em ${draft.paisResidencia}: `), 'a jornada foi calibrada para quem parte do Brasil. As missões de visto ficarão em "atenção" para você conferir com o consulado da Espanha no seu país.'], 'warn', 'alert')) : null,
      natCode && EU.includes(natCode) ? note(['Cidadãos da União Europeia seguem regras de entrada e residência diferentes das do visto de estudos. As missões de visto continuam na sua jornada: confira se elas se aplicam a você.'], 'info', 'help') : null,
    ];
  }

  function stepFormacao() {
    const areaOpts = [...Object.entries(AREAS).flatMap(([g, list]) => list.map((a) => ({ value: a, label: a, group: g }))), { value: OUTRO, label: 'Outra área: vou escrever', pinned: true }];
    const instOpts = [...INSTITUTIONS.map((i) => ({ value: i.value, label: i.label, hint: i.sigla, keywords: i.sigla })), { value: OUTRO, label: 'Não encontrei: vou escrever', pinned: true }];
    const manual = (key, flag, placeholder, max) => {
      const el = h('input', { type: 'text', class: 'ob-input', id: `ob-${key}-manual`, maxlength: max, placeholder, value: draft[key] === OUTRO ? '' : draft[key], autocomplete: 'off', dataset: { fk: `${key}-manual` } });
      el.addEventListener('input', () => set({ [key]: el.value.replace(/^\s+/, ''), [flag]: true }, false));
      const back = h('button', { type: 'button', class: 'ob-linkbtn', onClick: () => set({ [key]: '', [flag]: false }) }, 'Voltar para a lista');
      return h('div', { class: 'ob-manual' }, el, back);
    };
    return [
      group('Formação acadêmica', h('div', { class: 'ob-chips cols-2' }, FORMACOES.map((f) => chip(f.value, { selected: draft.formacao === f.value, hint: f.hint, fk: `formacao-${f.value}`, onClick: () => set({ formacao: f.value }) }))),
        { id: 'ob-formacao', hint: draft.formacao && !FORMACOES.some((f) => f.value === draft.formacao) ? `Valor atual no seu perfil: "${draft.formacao}". Escolha uma opção para padronizar.` : null }),
      h('div', { class: 'ob-grid' },
        fieldBox('Instituição de origem', draft.instituicaoManual
          ? manual('instituicao', 'instituicaoManual', 'Nome da sua universidade ou faculdade', 120)
          : sel('instituicao', instOpts, { searchable: true, placeholder: 'Busque pelo nome ou sigla', searchPlaceholder: 'Ex.: UFBA, USP, PUC…', onChange: (v) => (v === OUTRO ? set({ instituicao: '', instituicaoManual: true }) : set({ instituicao: v })) }),
        { id: draft.instituicaoManual ? 'ob-instituicao-manual' : 'ob-instituicao', hint: draft.instituicaoManual ? 'Escreva o nome completo, como aparece no diploma.' : 'Onde você fez (ou faz) a graduação.' }),
        fieldBox('Área de interesse do mestrado', draft.areaManual
          ? manual('area', 'areaManual', 'Ex.: Gestão Cultural', 80)
          : sel('area', areaOpts, { searchable: true, placeholder: 'Escolha a área', searchPlaceholder: 'Buscar área…', onChange: (v) => (v === OUTRO ? set({ area: '', areaManual: true }) : set({ area: v })) }),
        { id: draft.areaManual ? 'ob-area-manual' : 'ob-area', hint: 'Organizadas pelos ramos de conhecimento das universidades espanholas.' })),
      formacaoEmAndamento(draft.formacao) ? note('Ainda concluindo a graduação? Confira na ficha do mestrado e no calendário do DUA até quando o título precisa estar concluído. A Estuvia mostra isso na Missão 1.4.', 'info', 'calendar') : null,
    ];
  }

  function levelPicker(key, { extra = [] } = {}) {
    return h('div', { class: 'ob-levels', role: 'radiogroup', 'aria-labelledby': `ob-${key}-lbl` },
      [...LEVELS.map((l) => [l, l, LEVEL_HINT[l]]), ...extra].map(([v, label, hint]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(draft[key] === v), class: `ob-level${draft[key] === v ? ' is-selected' : ''}${LEVELS.includes(v) ? '' : ' is-wide'}`,
        dataset: { fk: `${key}-${v}` }, onClick: () => set({ [key]: v }),
      }, h('strong', {}, label), hint ? h('small', {}, hint) : null)));
  }

  function stepIdiomas() {
    return [
      group('Nível de espanhol', levelPicker('espanhol', { extra: [['nenhum', 'Não falo', ''], ['nativo', 'Nativo', ''], ['nao-sei', 'Ainda não sei meu nível', '']] }), { id: 'ob-espanhol', hint: 'Escala do Quadro Europeu (CEFR).' }),
      group('Certificação de espanhol', h('div', { class: 'ob-chips' }, CERTS.map(([v, l]) => chip(l, { selected: draft.certificadoEspanhol === v, fk: `cert-${v}`, onClick: () => set({ certificadoEspanhol: v, certificadoNivel: v === 'nenhum' ? '' : draft.certificadoNivel }) }))), { id: 'ob-certificadoEspanhol', hint: 'Não ter certificado é uma resposta válida.' }),
      draft.certificadoEspanhol && draft.certificadoEspanhol !== 'nenhum' ? group('Nível do certificado', levelPicker('certificadoNivel'), { id: 'ob-certificadoNivel' }) : null,
      group('Nível de inglês', levelPicker('ingles', { extra: [['nenhum', 'Não falo', ''], ['nativo', 'Nativo', ''], ['nao-sei', 'Ainda não sei meu nível', '']] }), { id: 'ob-ingles' }),
      draft.espanhol ? note(draft.espanhol === 'nao-sei'
        ? 'Sem problema. Um teste de nivelamento ajuda a planejar o preparo. Quando você definir o mestrado, a Missão 1.4 mostra o nível que a ficha exige.'
        : 'Cada mestrado define a própria exigência de idioma. Quando você definir o mestrado, a Missão 1.4 compara o seu nível declarado com o que está na ficha oficial.', 'info', 'lang') : null,
    ];
  }

  function stepOrcamento() {
    const amount = h('input', {
      type: 'text', inputmode: 'numeric', class: 'ob-input ob-money-input', id: 'ob-orcamento', autocomplete: 'off', placeholder: '0', 'aria-describedby': 'ob-orcamento-hint',
      value: draft.orcamentoSituacao === 'informado' && Number.isFinite(draft.orcamentoDisponivel) ? new Intl.NumberFormat('pt-BR').format(draft.orcamentoDisponivel) : '', dataset: { fk: 'orcamento' },
    });
    amount.addEventListener('input', () => {
      const digits = amount.value.replace(/\D/g, '').slice(0, 8);
      const n = digits ? Number(digits) : null;
      const caret = amount.value.length - amount.selectionStart;
      amount.value = n === null ? '' : new Intl.NumberFormat('pt-BR').format(n);
      amount.setSelectionRange(Math.max(0, amount.value.length - caret), Math.max(0, amount.value.length - caret));
      set({ orcamentoDisponivel: n, orcamentoSituacao: n === null ? '' : 'informado' }, false);
      for (const b of root.querySelectorAll('.ob-quick button')) b.classList.toggle('is-selected', Number(b.dataset.v) === n);
    });
    const dontKnow = draft.orcamentoSituacao === 'nao-sei';
    return [
      h('div', { class: `ob-money${dontKnow ? ' is-muted' : ''}` },
        h('label', { class: 'ob-label', for: 'ob-orcamento' }, 'Quanto você tem, aproximadamente, para a mobilidade?'),
        h('div', { class: 'ob-money-row' }, h('span', { class: 'ob-money-cur', 'aria-hidden': 'true' }, '€'), dontKnow ? h('span', { class: 'ob-money-empty' }, 'Ainda não sei') : amount),
        h('p', { class: 'ob-hint', id: 'ob-orcamento-hint' }, 'Estimativa em euros: recursos próprios, apoio da família, economias. Não precisa ser exato.'),
        dontKnow ? null : h('div', { class: 'ob-quick', role: 'group', 'aria-label': 'Valores de referência' }, BUDGET_SHORTCUTS.map((v) => h('button', {
          type: 'button', class: draft.orcamentoDisponivel === v && draft.orcamentoSituacao === 'informado' ? 'is-selected' : '', dataset: { v: String(v), fk: `quick-${v}` },
          onClick: () => set({ orcamentoDisponivel: v, orcamentoSituacao: 'informado' }),
        }, `≈ ${eur(v)}`)))),
      h('div', { class: 'ob-chips' }, chip('Ainda não sei meu orçamento', { selected: dontKnow, iconName: 'help', fk: 'orc-nao-sei', onClick: () => set(dontKnow ? { orcamentoSituacao: '', orcamentoDisponivel: null } : { orcamentoSituacao: 'nao-sei', orcamentoDisponivel: null }) })),
      note(dontKnow
        ? 'Tudo bem. O Planejamento financeiro mostra o custo estimado do seu destino e você informa seus recursos quando souber. Nada é considerado como zero.'
        : 'No Planejamento financeiro, esse valor aparece como referência ao lado do custo estimado da cidade. Ele não conta como recurso comprovado: para o visto, vale o que você conseguir comprovar.', 'info', 'euro'),
    ];
  }

  function stepDestino() {
    const u = uni();
    // Quem já escolheu o mestrado (etapa "mestrado-escolhido" ou além) e ainda não o selecionou.
    const iStage = etapas.findIndex((e) => e.id === draft.etapa);
    const wantsProgram = Boolean(u) && !draft.programaId && iStage >= etapas.findIndex((e) => e.id === 'mestrado-escolhido') && iStage > 0;
    const programSlot = h('div', { class: 'ob-program-slot' });
    if (u) {
      programsOf(u.id).then((list) => {
        if (!programSlot.isConnected && !document.body.contains(root)) return;
        const opts = [{ value: '', label: 'Ainda vou escolher (Missão 1.3)' }, ...list.map((pr) => ({ value: pr.id, label: pr.nome, hint: pr.area, disabled: takenPrograms.has(pr.id) }))];
        mount(programSlot, list.length
          ? h('details', { class: 'ob-more', open: Boolean(draft.programaId) || wantsProgram },
            h('summary', {}, icon('book', { size: 15 }), h('span', {}, draft.programaId ? `Mestrado: ${draft.programaNome || 'selecionado'}` : 'Já sei qual mestrado quero (opcional)')),
            h('div', { class: 'ob-more-body' },
              Select({ id: 'ob-programaId', ariaLabel: 'Mestrado (opcional)', value: draft.programaId, options: opts, searchable: true, searchPlaceholder: 'Buscar mestrado…', placeholder: 'Ainda vou escolher',
                onChange: (v, o) => set({ programaId: v, programaNome: v ? o.label : '' }) }),
              h('p', { class: 'ob-hint' }, `${list.length} mestrados oficiais da ${u.sigla} no Radar. Se ainda não decidiu, a jornada começa com "Mestrado a definir" e você escolhe na Missão 1.3.`)))
          : h('p', { class: 'ob-hint' }, `Você define o mestrado na Missão 1.3: os mestrados da ${u.sigla} ainda não estão no Radar.`));
      });
    }
    const periodOpts = draft.anoAcademico ? PERIODS.map(([m, label]) => [m, `${label} de ${m === '02' ? Number(draft.anoAcademico.slice(0, 4)) + 1 : draft.anoAcademico.slice(0, 4)}`]) : [];
    const outra = draft.duracaoOpcao === 'outra';
    const outraInput = outra ? h('input', { type: 'number', class: 'ob-input ob-input-sm', min: 1, max: 48, step: 1, inputmode: 'numeric', 'aria-label': 'Duração em meses', value: draft.duracaoMeses ?? '', dataset: { fk: 'duracao-outra' } }) : null;
    outraInput?.addEventListener('input', () => { const n = Number(outraInput.value); set({ duracaoMeses: Number.isInteger(n) && n > 0 ? n : null }, false); });
    const st = stage();
    const tie = draft.duracaoOpcao === 'nao-sei' ? 'atencao' : draft.duracaoMeses ? (draft.duracaoMeses > 6 ? 'sim' : 'nao') : null;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    const entry = naEspanha() ? h('input', { type: 'date', class: 'ob-input ob-input-date', id: 'ob-dataEntrada', max: today, value: draft.dataEntrada || '', dataset: { fk: 'dataEntrada' } }) : null;
    entry?.addEventListener('change', () => set({ dataEntrada: entry.value }, false));
    entry?.addEventListener('input', () => set({ dataEntrada: entry.value }, false));
    return [
      !firstTime ? note('Seu perfil, seus documentos e suas finanças são reaproveitados. Só falta o destino da nova jornada.', 'ok', 'check') : null,
      group('Universidade de destino', h('div', { class: 'ob-unis' }, universities.map((x) => h('button', {
        type: 'button', class: `ob-uni${draft.universidadeId === x.id ? ' is-selected' : ''}`, 'aria-pressed': String(draft.universidadeId === x.id), dataset: { fk: `uni-${x.id}` },
        onClick: () => set({ universidadeId: x.id, programaId: '', programaNome: '' }),
      }, h('span', { class: `ob-uni-logo is-${x.id}` }, x.logo ? h('img', { src: x.logo, alt: '', loading: 'lazy' }) : x.sigla),
      h('span', { class: 'ob-uni-text' }, h('strong', {}, x.sigla), h('small', {}, x.cidade)),
      draft.universidadeId === x.id ? h('span', { class: 'ob-chip-check', 'aria-hidden': 'true' }, icon('check', { size: 14 })) : null))), { id: 'ob-universidadeId', hint: 'Universidades públicas da Andaluzia (candidatura pelo DUA).' }),
      u ? programSlot : null,
      group('Ano acadêmico', h('div', { class: 'ob-chips' }, cycles.map((c) => chip(c, { selected: draft.anoAcademico === c, fk: `ano-${c}`, onClick: () => set({ anoAcademico: c, inicioPeriodo: draft.inicioPeriodo === 'nao-sei' ? 'nao-sei' : '' }) }))), { id: 'ob-anoAcademico' }),
      group('Início previsto das aulas', draft.anoAcademico
        ? h('div', { class: 'ob-chips' }, [...periodOpts.map(([m, l]) => chip(l, { selected: draft.inicioPeriodo === m, fk: `ini-${m}`, onClick: () => set({ inicioPeriodo: m }) })), chip('Ainda não sei', { selected: draft.inicioPeriodo === 'nao-sei', fk: 'ini-nao-sei', onClick: () => set({ inicioPeriodo: 'nao-sei' }) })])
        : h('p', { class: 'ob-hint' }, 'Escolha o ano acadêmico primeiro.'),
      { id: 'ob-inicioPeriodo', hint: 'Mestrados na Espanha costumam começar em setembro ou outubro; alguns em fevereiro. Confirme no calendário do seu programa.' }),
      group('Duração prevista da estadia', h('div', { class: 'ob-chips' },
        DURATIONS.map(([v, l]) => chip(l, { selected: draft.duracaoOpcao === v, fk: `dur-${v}`, onClick: () => set({ duracaoOpcao: v, duracaoMeses: Number(v) }) })),
        chip('Outra', { selected: outra, fk: 'dur-outra', onClick: () => set({ duracaoOpcao: 'outra', duracaoMeses: null }) }),
        chip('Ainda não sei', { selected: draft.duracaoOpcao === 'nao-sei', fk: 'dur-nao-sei', onClick: () => set({ duracaoOpcao: 'nao-sei', duracaoMeses: null }) })),
      { id: 'ob-duracao' }),
      outra ? h('div', { class: 'ob-inline' }, outraInput, h('span', { class: 'muted' }, 'meses')) : null,
      tie ? note(tie === 'sim' ? 'Estadia de mais de 6 meses: as missões da TIE (cartão de estrangeiro) entram na sua jornada.' : tie === 'nao' ? 'Estadia de até 6 meses: pela regra cadastrada, as missões da TIE não se aplicam.' : 'Sem a duração, as missões da TIE ficam em "atenção" até você confirmar.', tie === 'sim' ? 'info' : 'ok', 'passport') : null,
      group('Em que ponto você está?', h('div', { class: 'ob-stages', role: 'radiogroup', 'aria-labelledby': 'ob-etapa-lbl' }, etapas.map((e, i) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(draft.etapa === e.id), class: `ob-stage${draft.etapa === e.id ? ' is-selected' : ''}${st && etapas.indexOf(st) > i ? ' is-before' : ''}`, dataset: { fk: `etapa-${e.id}` },
        onClick: () => set({ etapa: e.id, confirmaEtapa: false, ...(e.exigeDataEntrada ? {} : { dataEntrada: '' }) }),
      }, h('span', { class: 'ob-stage-dot', 'aria-hidden': 'true' }, draft.etapa === e.id || (st && etapas.indexOf(st) > i) ? icon('check', { size: 12 }) : null), h('span', {}, e.rotulo)))),
      { id: 'ob-etapa', hint: 'Já começou por conta própria? Você não precisa refazer o que já fez.' }),
      wantsProgram ? note('Você disse que já escolheu o mestrado. Se ele estiver em "Já sei qual mestrado quero", selecione-o lá em cima: a exigência de idioma e os prazos dele entram na jornada. Se não estiver, a jornada fica com "Mestrado a definir" e você o define depois pelo Radar.', 'info', 'book') : null,
      naEspanha() ? fieldBox('Quando você entrou na Espanha?', entry, { id: 'ob-dataEntrada', hint: 'O prazo da TIE conta a partir desta data.' }) : null,
      st && st.id !== 'inicio' ? h('label', { class: `ob-confirm${draft.confirmaEtapa ? ' is-on' : ''}`, dataset: { fk: 'confirma' } },
        (() => { const c = h('input', { type: 'checkbox', checked: draft.confirmaEtapa, id: 'ob-confirmaEtapa' }); c.addEventListener('change', () => set({ confirmaEtapa: c.checked })); return c; })(),
        h('span', { class: 'ob-switch', 'aria-hidden': 'true' }),
        h('span', {}, h('strong', {}, 'Confirmo que já fiz essas etapas. '), `Até ${st.missoes} missões anteriores ficam marcadas como "declaradas por mim" (você pode reabrir depois).`)) : null,
    ];
  }

  function stepDocumentos() {
    const list = docQuestions();
    const idx = Math.min(draft.docIndex || 0, list.length);
    const done = idx >= list.length;
    const q = list[idx];
    const dots = h('ol', { class: 'ob-docdots', 'aria-label': 'Perguntas sobre documentos' }, list.map((x, i) => h('li', { class: `${i === idx ? 'is-current' : ''}${draft.requisitos[x.id] ? ` k-${docKind(draft.requisitos[x.id])}` : ''}` },
      h('button', { type: 'button', 'aria-label': `${x.pergunta}${draft.requisitos[x.id] ? ' (respondida)' : ''}`, 'aria-current': i === idx ? 'step' : null, onClick: () => set({ docIndex: i }) }))));
    const choiceIcon = { ok: 'check', check: 'search', pending: 'clock' };
    return [
      h('div', { class: 'ob-doc-head' }, dots, h('span', { class: 'ob-doc-count' }, done ? `${list.length} de ${list.length}` : `${idx + 1} de ${list.length}`)),
      done
        ? h('div', { class: 'ob-doc-done ob-swap' },
          h('p', { class: 'ob-label' }, 'Sua situação documental'),
          h('ul', { class: 'ob-doc-summary' }, list.map((x) => {
            const v = draft.requisitos[x.id];
            const label = x.opcoes.find(([o]) => o === v)?.[1] || 'Sem resposta';
            return h('li', { class: `k-${v ? docKind(v) : 'none'}` }, h('span', { class: 'ob-doc-ic', 'aria-hidden': 'true' }, icon(v ? choiceIcon[docKind(v)] : 'minus', { size: 14 })), h('span', {}, h('strong', {}, x.pergunta.replace(/^Você já tem /, '').replace('?', '')), h('small', {}, label)),
              h('button', { type: 'button', class: 'ob-linkbtn', onClick: () => set({ docIndex: list.indexOf(x) }) }, 'Alterar'));
          })),
          note('Documentos que você já tem não viram missão de providenciar e entram na sua Carteira como prontos. Você pode mudar essas respostas em Meu perfil.', 'ok', 'folder'))
        : h('div', { class: 'ob-doc ob-swap', dataset: { fk: `doc-${q.id}` } },
          h('p', { class: 'ob-doc-q', id: 'ob-doc-q' }, q.pergunta),
          h('div', { class: 'ob-doc-choices', role: 'radiogroup', 'aria-labelledby': 'ob-doc-q' }, q.opcoes.map(([v, l]) => {
            const k = docKind(v);
            const on = draft.requisitos[q.id] === v;
            return h('button', {
              type: 'button', role: 'radio', 'aria-checked': String(on), class: `ob-doc-choice k-${k}${on ? ' is-selected' : ''}`, dataset: { fk: `doc-${q.id}-${v}` },
              onClick: () => {
                draft.requisitos = { ...draft.requisitos, [q.id]: v };
                const next = list.findIndex((x, i) => i > idx && !draft.requisitos[x.id]);
                set({ docIndex: next >= 0 ? next : list.length });
              },
            }, h('span', { class: 'ob-doc-ic', 'aria-hidden': 'true' }, icon(choiceIcon[k], { size: 16 })), h('span', {}, l));
          })),
          idx > 0 ? h('button', { type: 'button', class: 'ob-linkbtn', onClick: () => set({ docIndex: idx - 1 }) }, '← Pergunta anterior') : null),
    ];
  }

  const BODIES = { origem: stepOrigem, formacao: stepFormacao, idiomas: stepIdiomas, orcamento: stepOrcamento, destino: stepDestino, documentos: stepDocumentos };

  // ---------- Resumo ao vivo ("Seu perfil até agora") ----------
  let lastSummary = {};
  function summaryRows() {
    const docs = docQuestions();
    const answered = docs.filter((q) => draft.requisitos[q.id]);
    const have = answered.filter((q) => draft.requisitos[q.id] === 'tenho').length;
    const rows = firstTime ? [
      ['origem', 'home', 'Origem', draft.paisResidencia ? [draft.paisResidencia, draft.estado ? divisionLabel(draft.paisResidencia, draft.estado) : ''].filter(Boolean).join(' · ') : '', draft.nacionalidade && draft.nacionalidade !== draft.paisResidencia ? `Nacionalidade: ${draft.nacionalidade}` : ''],
      ['formacao', 'cap', 'Formação', draft.formacao, draft.instituicao && draft.instituicao !== OUTRO ? draft.instituicao.replace(/^[^-]+ - /, '') : ''],
      ['formacao', 'target', 'Interesse', draft.area && draft.area !== OUTRO ? draft.area : '', ''],
      ['idiomas', 'lang', 'Idiomas', draft.espanhol ? `Espanhol ${langLabel(draft.espanhol)}` : '', [certLabel(), draft.ingles ? `Inglês ${langLabel(draft.ingles)}` : ''].filter(Boolean).join(' · ')],
      ['orcamento', 'euro', 'Orçamento', draft.orcamentoSituacao === 'nao-sei' ? 'Ainda não sei' : draft.orcamentoSituacao === 'informado' && Number.isFinite(draft.orcamentoDisponivel) ? `≈ ${eur(draft.orcamentoDisponivel)}` : '', ''],
    ] : [];
    rows.push(
      ['destino', 'pin', 'Destino', uni() ? `${uni().nome}` : '', [draft.programaNome, uni()?.cidade].filter(Boolean).join(' · ')],
      ['destino', 'calendar', 'Período', draft.anoAcademico ? `${draft.anoAcademico}` : '', [periodLabel() && `Início: ${periodLabel()}`, durationLabel()].filter(Boolean).join(' · ')],
      ['destino', 'flag', 'Situação', stage()?.rotulo || '', naEspanha() && draft.dataEntrada ? `Entrada: ${draft.dataEntrada.split('-').reverse().join('/')}` : ''],
    );
    if (firstTime) rows.push(['documentos', 'folder', 'Documentos', answered.length ? `${have} de ${docs.length} já em mãos` : '', answered.length < docs.length && answered.length ? `${docs.length - answered.length} sem resposta` : '']);
    return rows;
  }
  function summaryPanel() {
    const rows = summaryRows();
    const filledN = rows.filter((r) => r[3]).length;
    const now = {};
    const el = h('aside', { class: 'ob-aside', 'aria-label': 'Seu perfil até agora' },
      h('div', { class: 'ob-aside-head' }, h('p', { class: 'ob-aside-title' }, firstTime ? 'Seu perfil até agora' : 'Sua nova jornada'), h('span', { class: 'ob-aside-count' }, `${filledN}/${rows.length}`)),
      h('ul', { class: 'ob-facts-live' }, rows.map(([, ic, label, value, sub]) => {
        const sig = `${value}|${sub}`;
        now[label] = sig;
        const changed = value && lastSummary[label] !== undefined && lastSummary[label] !== sig;
        return h('li', { class: `${value ? 'is-filled' : ''}${changed ? ' is-new' : ''}` },
          h('span', { class: 'ob-fact-ic', 'aria-hidden': 'true' }, icon(ic, { size: 15 })),
          h('span', { class: 'ob-fact-text' }, h('small', {}, label), value ? h('strong', {}, value) : h('span', { class: 'ob-fact-empty' }, 'A preencher'), value && sub ? h('span', { class: 'ob-fact-sub' }, sub) : null));
      })),
      h('p', { class: 'ob-aside-foot' }, icon('shield', { size: 13 }), 'Só usamos o que você informa aqui. Tudo é editável depois.'));
    lastSummary = now;
    return el;
  }

  // ---------- Desenho ----------
  let asideHost = null;
  let actionsHost = null;
  function actions() {
    const review = draft.step >= STEPS.length;
    const probs = review ? [] : problems(STEPS[draft.step].id);
    const docsMidway = !review && STEPS[draft.step].id === 'documentos' && probs.length;
    const nextLabel = review ? 'Gerar minha jornada' : draft.step === STEPS.length - 1 ? 'Revisar' : 'Continuar';
    return h('div', { class: 'ob-actions' },
      draft.step > 0
        ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => go(draft.step - 1) }, icon('back', { size: 16 }), 'Voltar')
        : h('a', { class: 'btn btn-ghost', href: '#/jornadas' }, firstTime ? 'Fazer depois' : 'Cancelar'),
      h('div', { class: 'ob-actions-right' },
        probs.length && !docsMidway ? h('p', { class: 'ob-missing', id: 'ob-missing', 'aria-live': 'polite' }, icon('alert', { size: 14 }), `Falta: ${probs.map((x) => x.msg).join(', ')}`) : null,
        h('button', {
          class: 'btn btn-cta btn-lg', type: 'button', disabled: probs.length > 0, 'aria-describedby': probs.length ? 'ob-missing' : null,
          onClick: () => (review ? finish() : go(draft.step + 1)),
        }, nextLabel, icon(review ? 'map' : 'arrow', { size: 16 }))));
  }
  function refresh() {
    if (asideHost) mount(asideHost, summaryPanel());
    if (actionsHost) mount(actionsHost, actions());
  }

  function go(next) {
    if (next > draft.step) {
      // Avançar exige as etapas anteriores válidas (o botão já fica desabilitado; isto cobre atalhos).
      const bad = STEPS.findIndex((_, i) => i < next && i >= 0 && i < STEPS.length && !stepValid(i));
      if (bad >= 0 && bad < next) { next = bad; toast('Complete esta etapa para continuar.', 'warn'); }
    }
    direction = next > draft.step ? 1 : -1;
    draft.step = Math.max(0, Math.min(next, STEPS.length));
    persist();
    draw(true);
  }

  function progress() {
    const total = STEPS.length;
    const review = draft.step >= total;
    const pct = review ? 100 : Math.round((draft.step / total) * 100);
    return h('div', { class: 'ob-progress' },
      total > 1 ? h('ol', { class: 'ob-steps', 'aria-label': 'Etapas do cadastro' }, STEPS.map((s, i) => {
        const status = i < draft.step ? (stepValid(i) ? 'done' : 'todo') : i === draft.step ? 'current' : '';
        const canJump = i <= draft.step || (firstInvalid() === -1 || i <= firstInvalid());
        return h('li', { class: status },
          h('button', { type: 'button', disabled: !canJump, 'aria-current': i === draft.step ? 'step' : null, onClick: () => go(i), 'aria-label': `${i + 1}. ${s.curto}${status === 'done' ? ' (concluída)' : ''}` },
            h('span', { class: 'ob-dot' }, status === 'done' ? icon('check', { size: 13 }) : String(i + 1)), h('span', { class: 'ob-step-label' }, s.curto)));
      })) : null,
      total > 1 ? h('div', { class: 'ob-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso do cadastro' }, (() => { const fill = h('span'); fill.style.width = `${pct}%`; return fill; })()) : null);
  }

  function reviewScreen() {
    const rows = summaryRows();
    const edit = (id) => h('button', { type: 'button', class: 'ob-linkbtn', onClick: () => go(STEPS.findIndex((s) => s.id === id)) }, icon('edit', { size: 13 }), 'Editar');
    const sections = STEPS.map((s) => {
      const mine = rows.filter((r) => r[0] === s.id);
      return h('section', { class: 'ob-review-sec' },
        h('div', { class: 'ob-review-head' }, h('span', { class: 'ob-review-ic', 'aria-hidden': 'true' }, icon(s.icone, { size: 16 })), h('h3', {}, s.curto), edit(s.id)),
        h('dl', {}, mine.map(([, , label, value, sub]) => [h('dt', {}, label), h('dd', {}, value || h('span', { class: 'muted' }, 'Não informado'), sub ? h('small', {}, sub) : null)])));
    });
    return [h('div', { class: 'ob-review-grid' }, sections),
      note('Ao gerar, a Estuvia aplica as regras das rodadas ao seu perfil: o que não se aplica sai do caminho e o que você já tem ou já fez fica registrado como declarado por você.', 'info', 'sparkles')];
  }

  function draw(stepChanged = false) {
    if (generatingNow) return;
    const focusKey = document.activeElement?.closest?.('[data-fk]')?.dataset.fk || (document.activeElement?.closest?.('.ui-select') ? document.activeElement.closest('.ui-select').querySelector('.ui-select-trigger')?.id : null);
    const review = draft.step >= STEPS.length;
    const s = STEPS[draft.step];
    const body = h('div', { class: `ob-body${stepChanged && !reduceMotion() ? ` ob-enter-${direction > 0 ? 'fwd' : 'back'}` : ''}` },
      h('header', { class: 'ob-head' },
        h('p', { class: 'eyebrow' }, review ? 'Revisão' : STEPS.length > 1 ? `Etapa ${draft.step + 1} de ${STEPS.length}` : 'Nova jornada'),
        h('h1', { tabindex: '-1', class: 'ob-title' }, review ? 'Sua jornada está quase pronta.' : s.titulo),
        h('p', { class: 'ob-intro' }, review ? 'Confira as informações. Você pode voltar e corrigir qualquer etapa.' : s.intro)),
      h('div', { class: 'ob-content' }, review ? reviewScreen() : BODIES[s.id]()));
    asideHost = h('div', { class: 'ob-aside-host' });
    actionsHost = h('div', { class: 'ob-actions-host' });
    mount(root,
      h('header', { class: 'flow-top' },
        h('a', { class: 'brand', href: '#/', 'aria-label': 'Estuvia, início' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', {}, state.app?.nome || 'Estuvia')),
        h('span', { class: 'flow-top-note' }, firstTime ? 'Cerca de 3 minutos · salvo automaticamente' : 'Nova jornada')),
      progress(),
      h('div', { class: 'ob-layout' }, h('div', { class: 'ob-main' }, body, actionsHost), asideHost));
    refresh();
    if (stepChanged) {
      requestAnimationFrame(() => {
        root.querySelector('.ob-title')?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      });
    } else if (focusKey) {
      const el = root.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`) || document.getElementById(focusKey);
      el?.focus({ preventScroll: true });
    }
  }

  // ---------- Geração ----------
  const TASKS = [
    ['perfil', 'Salvando seu perfil'],
    ['requisitos', 'Registrando seus documentos'],
    ['jornada', 'Montando rodadas e missões'],
    ['anterior', 'Reconhecendo o que você já fez'],
    ['concluir', 'Finalizando'],
  ];
  function generatingScreen(done, failedAt = null, error = null) {
    const tasks = TASKS.filter(([k]) => (firstTime || !['perfil', 'requisitos', 'concluir'].includes(k)) && (k !== 'anterior' || draft.etapa !== 'inicio'));
    return h('div', { class: 'ob-generating', role: 'status', 'aria-live': 'polite' },
      h('span', { class: `gen-orbit${error ? ' is-error' : ''}`, 'aria-hidden': 'true' }, icon(error ? 'alert' : 'compass', { size: 32 })),
      h('h1', {}, error ? 'Não consegui terminar agora' : 'Estamos preparando sua jornada…'),
      h('p', { class: 'muted' }, error ? error : `Aplicando as regras de ${uni()?.sigla || 'seu destino'} ao seu perfil${firstTime && draft.paisResidencia ? ` e ao seu país de residência (${draft.paisResidencia})` : ''}.`),
      h('ul', { class: 'gen-tasks' }, tasks.map(([k, label]) => h('li', { class: done.includes(k) ? 'is-done' : failedAt === k ? 'is-failed' : '' },
        h('span', { class: 'gen-task-ic', 'aria-hidden': 'true' }, done.includes(k) ? icon('check', { size: 13 }) : failedAt === k ? icon('x', { size: 13 }) : h('span', { class: 'gen-spin' })), label))),
      error ? h('div', { class: 'row wrap ob-gen-actions' },
        h('button', { type: 'button', class: 'btn btn-cta', onClick: () => finish() }, icon('refresh', { size: 16 }), 'Tentar novamente'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { generatingNow = false; draft.step = STEPS.length; draw(true); } }, 'Voltar para a revisão')) : null);
  }

  async function finish() {
    if (generatingNow) return; // evita duplo clique / jornada duplicada
    const bad = firstInvalid();
    if (bad >= 0) { toast('Há informações faltando. Levei você até a etapa.', 'warn'); go(bad); return; }
    generatingNow = true;
    const done = [];
    let current = null;
    const show = () => mount(root, generatingScreen(done));
    const minWait = new Promise((r) => setTimeout(r, reduceMotion() ? 300 : 1400));
    try {
      show();
      if (firstTime) {
        current = 'perfil';
        const profile = {
          nacionalidade: draft.nacionalidade.trim(), paisResidencia: draft.paisResidencia.trim(), estado: divisions() ? draft.estado : '',
          formacao: draft.formacao.trim(), instituicao: draft.instituicao.trim(), area: draft.area.trim(),
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
    } catch (e) {
      mount(root, generatingScreen(done, current, e.message || 'Falha de conexão.'));
      toast(e.message || 'Falha de conexão.', 'err');
      generatingNow = false; // libera o "Tentar novamente" (a jornada já criada é reaproveitada via draft.journeyId)
    }
  }

  draw();
  if (restored && draft.step > 0) toast('Retomamos de onde você parou.', 'info');
  return root;
}

// Resumo real da jornada gerada (tudo vem do motor: nada é estimado aqui).
function resultScreen(j) {
  const atual = j.rodadas.find((r) => r.numero === j.rodadaAtual);
  const iniciais = (atual?.missoes || []).filter((m) => ['disponivel', 'atencao', 'em-andamento'].includes(m.status)).slice(0, 4);
  const naoAplicaveis = j.contagem['nao-aplicavel'] || 0;
  const atendidos = j.rodadas.flatMap((r) => r.missoes).filter((m) => m.conclusao === 'requisito-atendido').length;
  const d = j.destino;
  return h('div', { class: 'ob-result' },
    h('header', { class: 'flow-top' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Estuvia, início' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', {}, state.app?.nome || 'Estuvia'))),
    h('div', { class: 'ob-result-card' },
      h('span', { class: 'celebrate-badge' }, icon('map', { size: 28 })),
      h('p', { class: 'eyebrow' }, 'Jornada criada'),
      h('h1', {}, `${d.origem} → ${d.universidade?.nome || 'Andaluzia'}`),
      h('p', { class: 'muted' }, [d.programa?.nome || 'Mestrado a definir (Missão 1.3)', d.anoAcademico, d.cidade].filter(Boolean).join(' · ')),
      h('div', { class: 'ob-result-stats' },
        stat(`Rodada ${j.rodadaAtual}`, atual?.titulo || 'Primeira rodada'),
        stat(String(naoAplicaveis), 'missões não se aplicam ao seu perfil'),
        stat(String((j.progressoAnterior?.missoes || 0) + atendidos), 'missões já reconhecidas como feitas')),
      iniciais.length ? h('div', { class: 'ob-result-list' }, h('p', { class: 'ob-label' }, 'Para começar'),
        h('ul', {}, iniciais.map((m) => h('li', {}, h('a', { href: `#/j/${j.id}/m/${m.id}` }, h('span', { class: 'ob-mid' }, m.label || m.id), h('span', {}, m.titulo), m.status === 'atencao' ? h('span', { class: 'tag tag-warn' }, 'Atenção') : null))))) : null,
      j.progressoAnterior ? h('p', { class: 'ob-result-note' }, icon('check', { size: 14 }), `${j.progressoAnterior.missoes} missão(ões) registradas como "declaradas por mim" pelo ponto em que você está.`) : null,
      atendidos ? h('p', { class: 'ob-result-note' }, icon('folder', { size: 14 }), `${atendidos} missão(ões) concluídas porque você já tem o documento.`) : null,
      d.programa?.demo ? h('p', { class: 'notice' }, 'Este mestrado é um dado demonstrativo do protótipo. Confirme sempre na ficha oficial.') : null,
      h('div', { class: 'row wrap ob-result-actions' },
        j.proximaMissao
          ? h('a', { class: 'btn btn-cta btn-lg', href: `#/j/${j.id}/m/${j.proximaMissao.id}` }, `Começar: ${j.proximaMissao.label} ${j.proximaMissao.titulo}`, icon('arrow', { size: 16 }))
          : null,
        h('a', { class: 'btn btn-ghost', href: `#/j/${j.id}` }, icon('map', { size: 14 }), 'Ver o mapa da jornada'))));
}
const stat = (value, label) => h('div', { class: 'ob-stat' }, h('strong', {}, value), h('span', {}, label));
