// Catálogo de mestrados (Missões 1.2/1.3) + "Minhas opções" (até 6, Missão 3.4).
import { h, mount, toast, sourceLink } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, go } from '../app.js';
import { getCatalog, getSources } from '../data.js';

const STATUS_LABEL = { requerido: 'Requerido', 'nao-requerido': 'Não requerido', verificar: 'Verificar' };
const IDIOMA = (i) => ({ requerido: `Espanhol ${i.nivel}${i.certificado ? ' com certificado' : ''}`, 'nao-requerido': 'Sem certificado exigido', verificar: 'A confirmar na ficha' }[i.status]);

export async function catalogView() {
  const [{ universities, programs }, sources] = await Promise.all([getCatalog(), getSources()]);
  const uni = (id) => universities.find((u) => u.id === id);
  const prog = (id) => programs.find((p) => p.id === id);
  // Jornadas criadas a partir do Radar também aparecem em "Minhas opções".
  // Carrega os nomes oficiais para não exibir o ID interno do programa.
  const radarPrograms = new Map();
  try {
    const first = await api.get('/radar/opportunities?limit=100');
    for (const item of first.items || []) radarPrograms.set(item.programId, item);
    if (first.total > (first.items || []).length) {
      const next = await api.get(`/radar/opportunities?limit=100&offset=${first.items.length}`);
      for (const item of next.items || []) radarPrograms.set(item.programId, item);
    }
  } catch { /* o catálogo de exemplo continua acessível se o Radar estiver indisponível */ }
  const selectedProgram = (id) => {
    const local = prog(id);
    const official = radarPrograms.get(id);
    return local || (official ? { id, nome: official.programa.nome, universidadeId: official.universidade.id, demo: official.demo } : null);
  };
  const filters = { universidade: '', cidade: '', area: '', modalidade: '', duracao: '' };
  const root = h('div', { class: 'stack-lg' });

  async function save(choices) {
    try { setMe(await api.put('/me/choices', { choices })); draw(); } catch (e) { toast(e.message, 'err'); }
  }
  async function createJourney(p) {
    if (p.demo) {
      toast('Este é um curso de demonstração. Abra o Radar para escolher um mestrado oficial.');
      return;
    }
    try {
      const year = new Date().getFullYear() + 1;
      const { journey } = await api.post('/journeys', { programaId: p.id, anoAcademico: `${year}/${String((year + 1) % 100).padStart(2, '0')}` });
      toast('Jornada criada.', 'ok');
      go(`/j/${journey.id}`);
    } catch (e) { toast(e.message, 'err'); }
  }

  const opt = (key, label, values) => {
    const s = h('select', { 'aria-label': label }, h('option', { value: '' }, label), [...new Set(values)].sort().map((v) => h('option', { value: v, selected: filters[key] === v }, v)));
    s.addEventListener('change', () => { filters[key] = s.value; draw(); });
    return s;
  };

  function draw() {
    const choices = state.me.user.choices;
    const move = (i, d) => { const c = [...choices]; [c[i], c[i + d]] = [c[i + d], c[i]]; save(c); };
    const list = programs.filter((p) => {
      const u = uni(p.universidadeId);
      return (!filters.universidade || u.sigla === filters.universidade) && (!filters.cidade || u.cidade === filters.cidade)
        && (!filters.area || p.area === filters.area) && (!filters.modalidade || p.modalidade === filters.modalidade)
        && (!filters.duracao || `${p.duracaoMeses} meses` === filters.duracao);
    });
    mount(root,
      h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Rodada 1 · Missões 1.2 e 1.3'), h('h1', {}, icon('cap', { size: 26 }), ' Mestrados'),
        h('p', { class: 'muted' }, 'Os cartões abaixo são exemplos demonstrativos e não podem ser usados numa candidatura real. Para consultar programas oficiais e iniciar uma jornada, use o Radar.'),
        h('a', { class: 'btn btn-cta', href: '#/oportunidades' }, 'Explorar mestrados oficiais no Radar', icon('arrow', { size: 14 })))),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title' }, icon('flag', { size: 18 }), `Minhas opções (${choices.length}/6 na Estuvia)`),
        h('p', { class: 'muted small' }, 'A Estuvia guarda até 6 opções. Esse limite interno não confirma quantas o edital vigente aceita. Confira o edital e faça o envio oficial no DUA.'),
        choices.length ? h('ol', { class: 'choices' }, choices.map((id, i) => h('li', { class: 'choice' },
          h('span', { class: 'choice-pos' }, String(i + 1)),
          h('span', { class: 'choice-name' }, selectedProgram(id)?.nome || 'Programa oficial (consulte no Radar)', h('small', { class: 'muted' }, ` · ${uni(selectedProgram(id)?.universidadeId)?.sigla || radarPrograms.get(id)?.universidade.sigla || ''}${selectedProgram(id)?.demo ? ' · demonstração' : ''}`)),
          h('span', { class: 'row' },
            h('button', { class: 'icon-btn sm', type: 'button', disabled: i === 0, 'aria-label': 'Subir', onClick: () => move(i, -1) }, icon('back', { size: 12, cls: 'rot90' })),
            h('button', { class: 'icon-btn sm', type: 'button', disabled: i === choices.length - 1, 'aria-label': 'Descer', onClick: () => move(i, 1) }, icon('arrow', { size: 12, cls: 'rot90' })),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remover', onClick: () => save(choices.filter((c) => c !== id)) }, icon('x', { size: 12 })))))) : h('p', { class: 'muted' }, 'Nenhum programa ainda.')),
      h('div', { class: 'filters' }, icon('filter', { size: 16 }),
        opt('universidade', 'Universidade', programs.map((p) => uni(p.universidadeId).sigla)),
        opt('cidade', 'Cidade', programs.map((p) => uni(p.universidadeId).cidade)),
        opt('area', 'Área', programs.map((p) => p.area)),
        opt('modalidade', 'Modalidade', programs.map((p) => p.modalidade)),
        opt('duracao', 'Duração', programs.map((p) => `${p.duracaoMeses} meses`)),
        Object.values(filters).some(Boolean) ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { Object.keys(filters).forEach((k) => { filters[k] = ''; }); draw(); } }, 'Limpar') : null),
      list.length ? h('div', { class: 'program-grid' }, list.map((p) => {
        const u = uni(p.universidadeId);
        const chosen = choices.includes(p.id);
        return h('article', { class: 'program-card' },
          h('div', { class: 'pc-media' }, h('img', { src: u.capa, alt: '', loading: 'lazy' }), h('span', { class: 'chip-demo' }, p.demo ? 'Dados demo' : 'Verificado')),
          h('div', { class: 'pc-body' },
            h('p', { class: 'eyebrow' }, `${u.sigla} · ${u.cidade}`),
            h('h3', {}, p.nome),
            h('dl', { class: 'facts' },
              h('dt', {}, 'Área'), h('dd', {}, p.area),
              h('dt', {}, 'Duração'), h('dd', {}, `${p.duracaoMeses} meses`),
              h('dt', {}, 'Modalidade'), h('dd', {}, p.modalidade),
              h('dt', {}, 'Idioma'), h('dd', {}, IDIOMA(p.idioma)),
              h('dt', {}, 'Ciclo'), h('dd', {}, p.ciclo),
              h('dt', {}, 'Vagas'), h('dd', {}, 'Consulte a ficha'),
              h('dt', {}, 'Custos'), h('dd', {}, 'Consulte a universidade')),
            h('ul', { class: 'reqs' }, p.requisitos.map((r) => h('li', {}, h('span', { class: `req req-${r.status}` }, STATUS_LABEL[r.status]), ' ', r.descricao, ' ', sourceLink(sources.find((s) => s.id === r.fonte))))),
            h('div', { class: 'row wrap' },
              h('a', { class: 'btn btn-ghost btn-sm', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Página oficial', icon('external', { size: 12 })),
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: p.demo || (!chosen && choices.length >= 6), title: p.demo ? 'Exemplos não podem ser usados numa candidatura real' : '', onClick: () => save(chosen ? choices.filter((c) => c !== p.id) : [...choices, p.id]) }, chosen ? 'Remover das opções' : 'Adicionar às opções'),
              p.demo ? h('span', { class: 'muted small' }, 'Exemplo: não iniciar candidatura com este programa.') : h('button', { class: 'btn btn-cta btn-sm', type: 'button', onClick: () => createJourney(p) }, 'Criar jornada'))));
      })) : h('p', { class: 'empty-inline' }, 'Nenhum programa com esses filtros.'),
      h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Universidades públicas andaluzas'),
        h('ul', { class: 'unis' }, universities.map((u) => h('li', {}, h('a', { href: u.url, target: '_blank', rel: 'noopener noreferrer' }, `${u.sigla} - ${u.nome}`), h('span', { class: 'muted small' }, ` · ${u.cidade}`))))),
    );
  }
  draw();
  return root;
}
