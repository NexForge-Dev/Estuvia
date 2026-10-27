// Onboarding + criação de jornada. Primeira vez: perfil completo (Missão 1.1) e destino.
// Jornadas seguintes: apenas o destino (o perfil é compartilhado).
import { h, mount, toast, field, select } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, invalidate, go } from '../app.js';
import { getCatalog } from '../data.js';
import { QUIZ_KEY } from './landing.js';

const LEVELS = [['nenhum', 'Nenhum'], ['A1', 'A1'], ['A2', 'A2'], ['B1', 'B1'], ['B2', 'B2'], ['C1', 'C1'], ['C2', 'C2'], ['nativo', 'Nativo']];
const ESTADOS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const ALL_STEPS = [
  { id: 'origem', titulo: 'De onde você parte', icone: 'home' },
  { id: 'formacao', titulo: 'Sua formação', icone: 'book' },
  { id: 'idiomas', titulo: 'Idiomas', icone: 'lang' },
  { id: 'situacao', titulo: 'Seu orçamento', icone: 'euro' },
  { id: 'destino', titulo: 'Seu destino', icone: 'pin' },
  { id: 'tenho', titulo: 'O que você já tem', icone: 'folder' },
];

export async function onboardingView() {
  const { universities, programs } = await getCatalog();
  const p = state.me.user.profile;
  const firstTime = !p.onboardingConcluido;
  const STEPS = firstTime ? ALL_STEPS : ALL_STEPS.filter((s) => s.id === 'destino');
  const { perguntas } = await api.get('/journeys/requirements');
  const requisitos = {};
  const year = new Date().getFullYear();
  const cycles = [0, 1, 2, 3].map((i) => `${year + i}/${String((year + i + 1) % 100).padStart(2, '0')}`);
  const existing = new Set((await api.get('/journeys')).journeys.map((j) => j.destino.programa?.id));
  const { etapas } = await api.get('/journeys/progress-stages');

  const draft = {
    nacionalidade: p.nacionalidade || 'Brasileira', paisResidencia: p.paisResidencia || 'Brasil', estado: p.estado || '',
    formacao: p.formacao || '', instituicao: p.instituicao || '', area: p.area || '',
    espanhol: p.espanhol || 'nenhum', certificadoEspanhol: p.certificadoEspanhol || 'nenhum', certificadoNivel: p.certificadoNivel || '', ingles: p.ingles || 'nenhum',
    situacaoCandidatura: p.situacaoCandidatura || 'nao-iniciada', situacaoVisto: p.situacaoVisto || 'nao-iniciado', orcamentoDisponivel: p.orcamentoDisponivel ?? null,
    universidadeId: 'ugr', programaId: '', anoAcademico: cycles[1], inicioAulas: '', duracaoMeses: null,
    etapa: 'inicio', dataEntrada: '', confirmaEtapa: false,
  };
  // Respostas do diagnóstico da landing: só no primeiro onboarding e só onde o perfil ainda está vazio.
  let quiz = null;
  try { quiz = firstTime ? JSON.parse(localStorage.getItem(QUIZ_KEY) || 'null') : null; } catch { /* sem armazenamento */ }
  if (quiz) {
    if (!p.espanhol && LEVELS.some(([v]) => v === quiz.espanhol)) draft.espanhol = quiz.espanhol;
    if (etapas.some((e) => e.id === quiz.etapa)) draft.etapa = quiz.etapa;
    if (cycles.includes(quiz.ano)) draft.anoAcademico = quiz.ano;
  }
  let step = 0;
  const root = h('div', { class: 'onboarding' });

  const bind = (input, key, num = false) => {
    const set = () => { draft[key] = num ? (input.value === '' ? null : Number(input.value)) : input.value; };
    input.addEventListener('input', set);
    input.addEventListener('change', () => { set(); draw(); });
    return input;
  };
  const input = (key, attrs = {}) => bind(h('input', { name: key, value: draft[key] ?? '', ...attrs }), key, attrs.type === 'number');
  const sel = (key, options) => bind(select(key, options, draft[key] ?? ''), key);

  function stepBody() {
    switch (STEPS[step].id) {
      case 'origem':
        return [
          h('p', { class: 'lead-sm' }, 'Vamos montar uma jornada feita para você. Leva cerca de 2 minutos e tudo pode ser editado depois.'),
          h('div', { class: 'grid-2' },
            field('Nacionalidade', input('nacionalidade', { maxlength: 40 })),
            field('País onde você mora hoje', input('paisResidencia', { maxlength: 40 }), 'Define qual consulado atende o seu visto.'),
            draft.paisResidencia === 'Brasil' ? field('Estado', sel('estado', [['', 'Selecione'], ...ESTADOS.map((e) => [e, e])])) : null),
          draft.paisResidencia && draft.paisResidencia !== 'Brasil' ? h('p', { class: 'notice' }, 'A jornada foi calibrada para quem parte do Brasil. As missões de visto ficarão em "atenção" para você conferir com o consulado do seu país.') : null,
        ];
      case 'formacao':
        return [h('div', { class: 'grid-2' },
          field('Graduação', input('formacao', { maxlength: 120, placeholder: 'Ex.: Engenharia Civil' })),
          field('Instituição de origem', input('instituicao', { maxlength: 120, placeholder: 'Ex.: Universidade Federal da Bahia' })),
          field('Área de interesse do mestrado', input('area', { maxlength: 80, placeholder: 'Ex.: Engenharia e Arquitetura' })))];
      case 'idiomas':
        return [h('div', { class: 'grid-2' },
          field('Seu nível de espanhol', sel('espanhol', LEVELS)),
          field('Certificado de espanhol', sel('certificadoEspanhol', [['nenhum', 'Não tenho'], ['DELE', 'DELE'], ['SIELE', 'SIELE'], ['outro', 'Outro']])),
          draft.certificadoEspanhol !== 'nenhum' ? field('Nível do certificado', sel('certificadoNivel', [['', 'Selecione'], ...LEVELS.slice(1)])) : null,
          field('Seu nível de inglês', sel('ingles', LEVELS)))];
      case 'situacao':
        return [
          h('p', { class: 'lead-sm' }, 'Quanto você tem, mais ou menos, para estudar fora? Não tem problema se for pouco ou nada: a Estuvia ajuda a encontrar caminhos.'),
          field('Orçamento disponível (€, aproximado)', input('orcamentoDisponivel', { type: 'number', min: 0, step: 100, placeholder: 'Opcional' }), 'Você detalha recursos, apoio da família e bolsas depois.')];
      case 'destino': {
        const list = programs.filter((pr) => pr.universidadeId === draft.universidadeId);
        return [
          !firstTime ? h('p', { class: 'lead-sm' }, 'Escolha o destino da nova jornada. Seu perfil, documentos e finanças são reaproveitados.') : null,
          h('div', { class: 'grid-2' },
            field('Universidade de destino', sel('universidadeId', universities.map((u) => [u.id, `${u.sigla} - ${u.nome} (${u.cidade})`]))),
            field('Ano acadêmico', sel('anoAcademico', cycles.map((c) => [c, c])))),
          h('fieldset', { class: 'program-pick' }, h('legend', {}, 'Mestrado pretendido'),
            list.length ? list.map((pr) => {
              const chosen = draft.programaId === pr.id;
              const taken = existing.has(pr.id);
              const b = h('button', { type: 'button', class: `pick ${chosen ? 'selected' : ''}`, 'aria-pressed': String(chosen), disabled: taken },
                h('span', { class: 'pick-radio', 'aria-hidden': 'true' }, chosen ? icon('check', { size: 14 }) : null),
                h('span', { class: 'pick-text' }, h('strong', {}, pr.nome), h('small', { class: 'muted' }, `${pr.duracaoMeses} meses · ${pr.modalidade} · idioma: ${{ requerido: `exige ${pr.idioma.nivel}${pr.idioma.certificado ? ' com certificado' : ''}`, 'nao-requerido': 'sem certificado', verificar: 'a confirmar' }[pr.idioma.status]}${taken ? ' · você já tem esta jornada' : ''}`)),
                pr.demo ? h('span', { class: 'tag tag-pending' }, 'Demo') : null);
              b.addEventListener('click', () => { draft.programaId = pr.id; draft.duracaoMeses = pr.duracaoMeses; draw(); });
              return b;
            }) : h('p', { class: 'muted' }, 'Ainda não há programas cadastrados para esta universidade no piloto.')),
          h('p', { class: 'hint' }, 'Programas "Demo" são dados demonstrativos: regras diferentes por programa geram jornadas diferentes. Confirme sempre na ficha oficial.'),
          h('div', { class: 'grid-2' },
            field('Data prevista de início das aulas', input('inicioAulas', { type: 'date' }), 'Opcional, use a data publicada pela universidade.'),
            field('Duração da estadia (meses)', input('duracaoMeses', { type: 'number', min: 1, max: 48 }), 'Mais de 6 meses ativa as missões da TIE.')),
          h('fieldset', { class: 'program-pick' }, h('legend', {}, 'Em qual etapa você está?'),
            h('p', { class: 'hint' }, 'Já começou o processo por conta própria? Diga onde está e você não precisa refazer o que já fez.'),
            sel('etapa', etapas.map((e) => [e.id, e.rotulo])),
            etapas.find((e) => e.id === draft.etapa)?.exigeDataEntrada ? field('Quando você entrou na Espanha?', input('dataEntrada', { type: 'date', max: new Date().toISOString().slice(0, 10) })) : null,
            draft.etapa !== 'inicio' ? (() => {
              const chk = h('input', { type: 'checkbox', checked: draft.confirmaEtapa });
              chk.addEventListener('change', () => { draft.confirmaEtapa = chk.checked; });
              return h('label', { class: 'check' }, chk, h('span', {}, 'Confirmo que já fiz essas etapas. Elas ficam marcadas como "declaradas por mim".'));
            })() : null),
        ];
      }
      case 'tenho': {
        // Uma pergunta por vez: quem já tem um documento não recebe a missão de providenciá-lo.
        const list = perguntas.filter((q) => !q.somenteNaEspanha || draft.etapa === 'na-espanha');
        const current = list.find((q) => !(q.id in requisitos));
        return [
          h('p', { class: 'lead-sm' }, 'Responda rapidinho: o que você já tiver, a Estuvia não pede de novo.'),
          Object.keys(requisitos).length ? h('div', { class: 'chips' }, list.filter((q) => q.id in requisitos).map((q) => h('button', { type: 'button', class: 'chip', title: 'Mudar resposta', onClick: () => { delete requisitos[q.id]; draw(); } }, icon('check', { size: 12 }), ` ${q.opcoes.find(([v]) => v === requisitos[q.id])[1]}`))) : null,
          current
            ? h('fieldset', { class: 'program-pick' }, h('legend', {}, current.pergunta),
                h('div', { class: 'choice-grid' }, current.opcoes.map(([v, l]) => h('button', { type: 'button', class: 'choice', onClick: () => { requisitos[current.id] = v; draw(); } }, h('span', {}, l)))))
            : h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ' Pronto! Você pode corrigir essas respostas depois em "Meu perfil".'),
        ];
      }
      default: return [];
    }
  }

  async function finish() {
    if (!draft.programaId) return toast('Escolha um mestrado para criar a jornada.', 'err');
    const stage = etapas.find((e) => e.id === draft.etapa);
    if (draft.etapa !== 'inicio' && !draft.confirmaEtapa) return toast('Confirme as etapas que você já fez.', 'err');
    if (stage?.exigeDataEntrada && !draft.dataEntrada) return toast('Informe quando você entrou na Espanha.', 'err');
    try {
      if (firstTime && Object.keys(requisitos).length) await api.put('/journeys/requirements', { respostas: requisitos });
      if (firstTime) {
        const { universidadeId, programaId, anoAcademico, inicioAulas, duracaoMeses, etapa, dataEntrada, confirmaEtapa, ...profile } = draft;
        setMe(await api.put('/me/profile', { ...profile, onboardingConcluido: true }));
      }
      mount(root, generating());
      let [{ journey }] = await Promise.all([
        api.post('/journeys', { programaId: draft.programaId, anoAcademico: draft.anoAcademico, inicioAulas: draft.inicioAulas, duracaoMeses: draft.duracaoMeses }),
        new Promise((r) => setTimeout(r, 1200)),
      ]);
      if (draft.etapa !== 'inicio') {
        journey = (await api.post(`/journeys/${journey.id}/prior-progress`, { etapa: draft.etapa, confirmo: true, ...(stage?.exigeDataEntrada ? { dataEntrada: draft.dataEntrada } : {}) })).journey;
      }
      invalidate();
      try { localStorage.removeItem(QUIZ_KEY); } catch { /* sem armazenamento */ }
      mount(root, summary(journey));
    } catch (e) { toast(e.message, 'err'); draw(); }
  }

  function draw() {
    const last = step === STEPS.length - 1;
    mount(root, h('div', { class: 'ob-card card' },
      STEPS.length > 1 ? h('ol', { class: 'ob-steps', 'aria-label': 'Etapas' }, STEPS.map((s, i) => h('li', { class: i < step ? 'done' : i === step ? 'current' : '' }, h('span', { class: 'ob-dot' }, icon(i < step ? 'check' : s.icone, { size: 14 })), h('span', { class: 'ob-label' }, s.titulo)))) : null,
      h('p', { class: 'eyebrow' }, firstTime ? `Passo ${step + 1} de ${STEPS.length}` : 'Nova jornada'),
      h('h1', {}, STEPS[step].titulo),
      h('div', { class: 'stack' }, stepBody()),
      h('div', { class: 'ob-actions' },
        step > 0 ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { step -= 1; draw(); } }, icon('back', { size: 16 }), 'Voltar') : h('a', { class: 'btn btn-ghost', href: '#/jornadas' }, 'Cancelar'),
        h('button', { class: 'btn btn-cta btn-lg', type: 'button', onClick: () => { if (last) finish(); else { step += 1; draw(); } } }, last ? 'Gerar minha jornada' : 'Continuar', icon(last ? 'map' : 'arrow', { size: 16 })))));
  }
  draw();
  return root;
}

function generating() {
  return h('div', { class: 'ob-card card generating', role: 'status' },
    h('span', { class: 'gen-orbit', 'aria-hidden': 'true' }, icon('compass', { size: 34 })),
    h('h2', {}, 'Gerando sua jornada…'),
    h('p', { class: 'muted' }, 'Aplicando as regras do seu mestrado, do seu perfil e do seu país de residência.'));
}

function summary(j) {
  const na = j.contagem['nao-aplicavel'];

  return h('div', { class: 'ob-card card ob-summary' },
    h('span', { class: 'celebrate-badge' }, icon('map', { size: 30 })),
    h('p', { class: 'eyebrow' }, 'Jornada criada'),
    h('h1', {}, `${j.destino.origem} → ${j.destino.universidade?.nome || 'Andaluzia'}`),
    h('ul', { class: 'ob-facts' },
      h('li', {}, icon('flag', { size: 16 }), `Você começa pela Rodada ${j.rodadaAtual}. As próximas são liberadas conforme você avança.`),
      na ? h('li', {}, icon('minus', { size: 16 }), `${na} missão(ões) não se aplicam ao seu perfil e saíram do caminho`) : null,
      j.progressoAnterior ? h('li', {}, icon('check', { size: 16 }), `${j.progressoAnterior.missoes} missões anteriores registradas como feitas por você`) : null,
      j.proximaMissao ? h('li', {}, icon('target', { size: 16 }), `Primeira missão: ${j.proximaMissao.label} ${j.proximaMissao.titulo}`) : null),
    j.destino.programa?.demo ? h('p', { class: 'notice' }, 'Este mestrado é um dado demonstrativo do protótipo: as regras dele mostram a personalização. Confirme sempre na ficha oficial.') : null,
    h('div', { class: 'row wrap' }, j.proximaMissao ? h('a', { class: 'btn btn-cta btn-lg', href: `#/j/${j.id}/m/${j.proximaMissao.id}` }, 'Começar a primeira missão', icon('arrow', { size: 16 })) : h('a', { class: 'btn btn-cta btn-lg', href: `#/j/${j.id}` }, 'Ver minha jornada', icon('arrow', { size: 16 })), h('a', { class: 'btn btn-ghost', href: `#/j/${j.id}` }, icon('map', { size: 14 }), 'Ver o mapa da jornada')));
}

export { go };
