// Mestrados (Missões 1.2/1.3): todos os mestrados oficiais das universidades públicas da Andaluzia que o Radar
// acompanha (catálogo do DUA + catálogo da UGR), por universidade, com filtros, e "Minhas opções" (até 6, Missão 3.4).
// Os dados vêm de GET /api/radar/programs (formato compacto); os detalhes e o calendário ficam no Radar.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe } from '../app.js';
import { getCatalog } from '../data.js';
import { ChoicesCompare } from '../components/ChoicesCompare.js';
import { addToJourney } from './radar.js';
import { filterPrograms, spanishText, degreeText, displayName } from '../data/programs.js';

const PAGE = 36;
const MODALIDADE = { presencial: 'Presencial', online: 'Online', hibrida: 'Híbrida', semipresencial: 'Semipresencial' };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

export async function catalogView() {
  const [cat, demo] = await Promise.all([api.get('/radar/programs'), getCatalog().catch(() => ({ programs: [], universities: [] }))]);
  const { universidades, programas } = cat;
  const uni = new Map(universidades.map((u) => [u.id, u]));
  const byId = new Map(programas.map((p) => [p.id, p]));
  // Opções antigas podem apontar para os exemplos demonstrativos (content/catalog.js): o nome continua aparecendo.
  const demoById = new Map((demo.programs || []).map((p) => [p.id, p]));
  const filters = { q: '', universidade: '', cidade: '', area: '', modalidade: '', espanhol: '', graduacao: '', ficha: false };
  let shown = PAGE;
  const root = h('div', { class: 'stack-lg mest' });

  async function save(choices) {
    try { setMe(await api.put('/me/choices', { choices })); draw(); } catch (e) { toast(e.message, 'err'); }
  }
  async function journey(p) {
    const u = uni.get(p.universidadeId) || {};
    await addToJourney({ programId: p.id, anoAcademico: p.anoAcademico, estado: p.estado, universidade: { id: u.id }, programa: { nome: displayName(p.nome) }, naJornada: p.naJornada });
  }
  const setFilter = (key, value) => { filters[key] = value; shown = PAGE; draw(); };

  function select(key, label, options) {
    const s = h('select', { 'aria-label': label },
      h('option', { value: '' }, label),
      options.map(([v, l]) => h('option', { value: v, selected: filters[key] === v }, l)));
    s.addEventListener('change', () => setFilter(key, s.value));
    return s;
  }

  function choicesPanel(choices) {
    const move = (i, d) => { const c = [...choices]; [c[i], c[i + d]] = [c[i + d], c[i]]; save(c); };
    const label = (id) => {
      const p = byId.get(id) || demoById.get(id);
      const u = p ? uni.get(p.universidadeId) || (demo.universities || []).find((x) => x.id === p.universidadeId) : null;
      return [p ? displayName(p.nome) : 'Programa que não está mais no catálogo', h('small', { class: 'muted' }, `${u ? ` · ${u.sigla}` : ''}${demoById.has(id) ? ' · exemplo demonstrativo' : ''}`)];
    };
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, icon('flag', { size: 18 }), `Minhas opções (${choices.length}/6 na Estuvia)`),
      h('p', { class: 'muted small' }, 'A Estuvia guarda até 6 opções. Esse limite interno não confirma quantas o edital vigente aceita. Confira o edital e faça o envio oficial no DUA.'),
      choices.length ? h('ol', { class: 'choices' }, choices.map((id, i) => h('li', { class: 'choice' },
        h('span', { class: 'choice-pos' }, String(i + 1)),
        h('span', { class: 'choice-name' }, ...label(id)),
        h('span', { class: 'row' },
          h('button', { class: 'icon-btn sm', type: 'button', disabled: i === 0, 'aria-label': 'Subir', onClick: () => move(i, -1) }, icon('back', { size: 12, cls: 'rot90' })),
          h('button', { class: 'icon-btn sm', type: 'button', disabled: i === choices.length - 1, 'aria-label': 'Descer', onClick: () => move(i, 1) }, icon('arrow', { size: 12, cls: 'rot90' })),
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remover', onClick: () => save(choices.filter((c) => c !== id)) }, icon('x', { size: 12 })))))) : h('p', { class: 'muted' }, 'Nenhuma opção ainda. Use "Adicionar às opções" nos mestrados abaixo.'));
  }

  function universityTiles() {
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, icon('cap', { size: 18 }), 'Por universidade'),
      h('ul', { class: 'mest-unis' }, universidades.map((u) => h('li', {},
        h('button', {
          type: 'button', class: `mest-uni${filters.universidade === u.id ? ' is-on' : ''}`, 'aria-pressed': String(filters.universidade === u.id), disabled: !u.total, 'data-university': u.id,
          onClick: () => setFilter('universidade', filters.universidade === u.id ? '' : u.id),
        },
        u.logo ? h('img', { class: 'uni-directory-logo', src: u.logo, alt: '', loading: 'lazy' }) : h('span', { class: 'mest-uni-sigla', 'aria-hidden': 'true' }, u.sigla),
        h('span', { class: 'mest-uni-text' }, h('strong', {}, u.sigla), h('small', {}, `${u.nome} · ${u.cidade}`)),
        h('span', { class: 'mest-uni-count' }, u.total ? String(u.total) : 'em coleta'))))));
  }

  function card(p, choices) {
    const u = uni.get(p.universidadeId) || {};
    const chosen = choices.includes(p.id);
    const grad = degreeText(p.graduacao);
    const criterios = (p.criterios || []).slice(0, 3);
    return h('article', { class: 'program-card mest-card' },
      h('div', { class: 'pc-body' },
        h('p', { class: 'eyebrow' }, `${u.sigla || ''} · ${u.cidade || ''}`),
        h('h3', {}, displayName(p.nome)),
        h('div', { class: 'mest-tags' },
          p.modalidade ? h('span', { class: 'mest-tag' }, MODALIDADE[p.modalidade] || p.modalidade) : null,
          p.creditos ? h('span', { class: 'mest-tag' }, `${p.creditos} ECTS`) : null,
          ...(p.ramos || []).slice(0, 1).map((r) => h('span', { class: 'mest-tag' }, r)),
          h('span', { class: 'mest-tag mest-tag-state' }, `${p.estadoLabel} · ${p.anoAcademico}`)),
        h('dl', { class: 'facts' },
          h('dt', {}, 'Idioma'), h('dd', {}, spanishText(p.espanhol)),
          h('dt', {}, 'Seleção'), h('dd', {}, p.criterios === null ? 'Ficha do DUA ainda não conferida'
            : criterios.length ? criterios.map((c) => `${c.descricao}${c.peso != null ? ` ${c.peso}%` : ''}`).join(' · ') : 'Somente nota do histórico'),
          p.codigoDua ? [h('dt', {}, 'Código DUA'), h('dd', {}, p.codigoDua)] : null),
        grad ? h('p', { class: `mest-grad is-${grad.tom}` }, grad.texto) : null,
        h('div', { class: 'row wrap' },
          h('a', { class: 'btn btn-ghost btn-sm', href: `#/oportunidades/${encodeURIComponent(p.oportunidadeId)}` }, 'Ver detalhes', icon('arrow', { size: 12 })),
          p.fichaDuaUrl || p.webPropria ? h('a', { class: 'btn btn-ghost btn-sm', href: p.fichaDuaUrl || p.webPropria, target: '_blank', rel: 'noopener noreferrer' }, 'Ficha oficial', icon('external', { size: 12 })) : null,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: !chosen && choices.length >= 6, onClick: () => save(chosen ? choices.filter((c) => c !== p.id) : [...choices, p.id]) }, chosen ? 'Remover das opções' : 'Adicionar às opções'),
          h('button', { class: 'btn btn-cta btn-sm', type: 'button', disabled: p.naJornada, onClick: () => journey(p) }, icon('map', { size: 14 }), p.naJornada ? 'Na sua jornada' : 'Adicionar à minha jornada'))));
  }

  function draw() {
    const choices = state.me.user.choices || [];
    const cidades = [...new Set(universidades.filter((u) => u.total).map((u) => u.cidade))].sort();
    const areas = [...new Set(programas.flatMap((p) => p.ramos || []))].sort();
    const modalidades = [...new Set(programas.map((p) => p.modalidade).filter(Boolean))].sort();
    const comUni = universidades.filter((u) => u.total).length;
    const fonte = cat.fontes.find((s) => s.id === 'dua-catalogo')?.verificadaEm;
    const search = h('input', { type: 'search', class: 'mest-search', placeholder: 'Buscar por nome, universidade, cidade ou código…', 'aria-label': 'Buscar mestrado', value: filters.q });
    let timer = null;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filters.q = search.value; shown = PAGE; drawList(); }, 200); });
    const listHost = h('div', { class: 'stack' });
    const ficha = h('input', { type: 'checkbox', checked: filters.ficha });
    ficha.addEventListener('change', () => setFilter('ficha', ficha.checked));

    function drawList() {
      const l = filterPrograms(programas, filters, universidades);
      mount(listHost,
        h('p', { class: 'mest-count', 'aria-live': 'polite' }, h('strong', {}, String(l.length)), ` mestrado(s)${filters.universidade ? ` na ${uni.get(filters.universidade)?.sigla}` : ''} · ${cat.anoAcademico}`),
        l.length ? h('div', { class: 'program-grid' }, l.slice(0, shown).map((p) => card(p, choices))) : h('p', { class: 'empty-inline' }, 'Nenhum mestrado com esses filtros.'),
        l.length > shown ? h('button', { class: 'btn btn-ghost mest-more', type: 'button', onClick: () => { shown += PAGE * 2; drawList(); } }, `Mostrar mais (${l.length - shown} restantes)`) : null);
    }

    mount(root,
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Rodada 1 · Missões 1.2 e 1.3'),
        h('h1', {}, icon('cap', { size: 26 }), ' Mestrados'),
        h('p', { class: 'muted' }, `${programas.length} mestrados oficiais em ${comUni} universidades públicas da Andaluzia, do catálogo do Distrito Único Andaluz (DUA). Critérios de seleção, idioma e graduações aceitas vêm da ficha oficial de cada mestrado.`),
        fonte ? h('p', { class: 'muted small' }, icon('shield', { size: 12 }), ` Catálogo verificado em ${fmtDate(fonte)}. Confirme sempre na ficha oficial antes de se candidatar.`) : null)),
      choicesPanel(choices),
      choices.length >= 2 ? h('section', { class: 'panel', id: 'comparar' },
        h('h2', { class: 'panel-title' }, icon('scale', { size: 18 }), 'Comparar minhas opções lado a lado'),
        ChoicesCompare()) : null,
      universityTiles(),
      h('section', { class: 'panel mest-filters' },
        h('div', { class: 'mest-search-row' }, icon('search', { size: 16 }), search),
        h('div', { class: 'filters' }, icon('filter', { size: 16 }),
          select('universidade', 'Universidade', universidades.filter((u) => u.total).map((u) => [u.id, `${u.sigla} (${u.total})`])),
          select('cidade', 'Cidade', cidades.map((c) => [c, c])),
          areas.length ? select('area', 'Área (só UGR informa)', areas.map((a) => [a, a])) : null,
          select('modalidade', 'Modalidade', modalidades.map((m) => [m, MODALIDADE[m] || m])),
          select('espanhol', 'Espanhol exigido', [['nao-exige', 'Não exige espanhol'], ['B1', 'Até B1'], ['B2', 'Até B2'], ['C1', 'Até C1']]),
          cat.comGraduacao ? select('graduacao', 'Minha graduação', [['aceita', 'Aceita minha graduação'], ['preferencia', 'Na lista de preferência']]) : null,
          h('label', { class: 'mest-check' }, ficha, h('span', {}, 'Só com ficha do DUA conferida')),
          Object.entries(filters).some(([, v]) => v) ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { Object.assign(filters, { q: '', universidade: '', cidade: '', area: '', modalidade: '', espanhol: '', graduacao: '', ficha: false }); shown = PAGE; draw(); } }, 'Limpar') : null),
        !cat.comGraduacao ? h('p', { class: 'muted small' }, 'Informe o curso da sua graduação em ', h('a', { href: '#/perfil' }, 'Meu perfil'), ' para ver quais mestrados aceitam a sua formação.') : null,
        filters.espanhol ? h('p', { class: 'muted small' }, 'Mestrados sem ficha do DUA conferida ficam fora deste filtro: não presumimos a exigência de idioma.') : null),
      listHost,
    );
    drawList();
  }
  draw();
  return root;
}
