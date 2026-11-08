// Meus Documentos (Carteira): simples de bater o olho.
//   3 números → "Para agora" (até 5) → busca (filtros escondidos) → categorias em quadradinhos (uma aberta por vez)
//   → linhas recolhidas: não se aplicam, minha situação, minha pasta, privacidade.
// Dentro de uma categoria, sempre: necessários → opcionais → contingência.
// Dados e regras: /api/documents (server/document-engine.js). "Pronto" é organização do estudante, nunca validação oficial.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, loadJourneys, invalidate, checkAchievements } from '../app.js';
import { ensureStyles, EstadoPill, GRUPOS } from '../components/documents/shared.js';
import { openDocumentPanel } from '../components/documents/DocumentDetailPanel.js';
import { localDocFiles, LocalFilesBanner } from '../components/documents/DocumentUpload.js';
import { MyFolder } from '../components/documents/MyFolder.js';

const KEY_JOURNEY = 'padapal.docs.journey';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } } };
const pct = (x) => `${Math.round(x * 100)}%`;
const fill = (ratio) => { const s = h('span'); s.style.width = pct(ratio); return s; }; // CSSOM: a CSP não permite style inline

const ETAPAS = { candidatura: 'Candidatura', matricula: 'Matrícula', visto: 'Visto', viagem: 'Viagem', estadia: 'Na Espanha', renovacao: 'Renovação' };
const EXIGENCIAS = { requerido: 'Necessários', recomendado: 'Opcionais', condicional: 'Contingência', 'nao-necessario': 'Não se aplicam' };
const ESTADOS = { 'nao-iniciado': 'Não iniciado', solicitar: 'Preciso solicitar', aguardando: 'Aguardando', 'arquivo-enviado': 'Arquivo enviado', 'precisa-apostila': 'Falta apostila', 'precisa-traducao': 'Falta tradução', pronto: 'Pronto', vencido: 'Vencido' };

export async function documentsView(docId) {
  ensureStyles();
  const journeys = await loadJourneys().catch(() => []);
  let jid = journeys.some((j) => j.id === store.get(KEY_JOURNEY)) ? store.get(KEY_JOURNEY) : journeys[0]?.id || null;
  const jq = (sep = '?') => (jid ? `${sep}journeyId=${jid}` : '');
  const root = h('div', { class: 'dc-page cw' });
  let d;
  let openCat = null;
  let showFilters = false;
  const filters = { q: '', etapa: '', exigencia: '', estado: '' };

  const load = async () => { d = await api.get(`/documents/dashboard${jq()}`); draw(); };
  const refresh = () => { invalidate(); checkAchievements(); load().catch((e) => toast(e.message, 'err')); if (openCat) loadCategory(openCat); runSearch(); };
  const open = (id) => {
    history.replaceState(null, '', `#/documentos/${id}`);
    openDocumentPanel(id, { journeyId: jid, onChange: refresh, onClose: () => history.replaceState(null, '', '#/documentos') });
  };

  // Blocos criados uma vez (guardam o próprio estado entre os redesenhos).
  const folder = MyFolder({ onChange: refresh });
  const localHost = h('div');
  const resultsHost = h('div', { class: 'cw-results', 'aria-live': 'polite' });
  const catHost = h('div', { class: 'cw-cat-panel' });

  function draw() {
    mount(root,
      header(),
      now(),
      localHost,
      search(), resultsHost,
      categories(),
      h('div', { class: 'cw-more' }, situation(), folder, privacy()),
      h('p', { class: 'dc-footnote' }, icon('lock', { size: 12 }), ' Cifrado na sua conta. Só você vê.'));
  }

  // ---------- Topo: título + 3 números ----------
  function header() {
    const sel = journeys.length > 1 ? h('select', { class: 'dc-journey', 'aria-label': 'Jornada' }, journeys.map((j) => h('option', { value: j.id, selected: j.id === jid }, j.destino?.programa?.nome || j.destino?.universidade?.sigla || 'Jornada'))) : null;
    sel?.addEventListener('change', () => { jid = sel.value; store.set(KEY_JOURNEY, jid); openCat = null; mount(catHost); load(); });
    const i = d.indicadores;
    const num = (n, label, tone, ic) => h('div', { class: `cw-num t-${tone}` }, icon(ic, { size: 15 }), h('strong', {}, String(n)), h('span', {}, label));
    return h('header', { class: 'cw-top' },
      h('div', { class: 'cw-title' }, h('h1', {}, 'Meus Documentos'), h('p', {}, 'Tudo da sua jornada em um só lugar.'), sel),
      h('div', { class: 'cw-nums', 'aria-label': 'Resumo' },
        num(i.prontos, 'prontos', 'ok', 'check'),
        num(i.pendentes, 'para fazer', 'muted', 'hourglass'),
        i.atencao ? num(i.atencao, 'atenção', 'warn', 'alert') : null));
  }

  // ---------- Para agora ----------
  function now() {
    const list = d.proximos.slice(0, 5);
    const done = list.length && list.every((v) => v.pronto && !v.atencao);
    return h('section', { class: 'cw-now' },
      h('div', { class: 'cw-now-head' }, h('h2', {}, 'Para agora'), h('span', { class: 'cw-chip' }, d.etapaAtualInfo.titulo), h('small', {}, `${d.resumo.prontos}/${d.resumo.total}`)),
      list.length ? h('ol', { class: 'cw-list' }, list.map((v) => row(v, { destaque: v.id === d.proximo?.documento.id }))) : h('p', { class: 'muted small' }, 'Nada exigido nesta etapa.'),
      done ? h('p', { class: 'cw-ok' }, icon('trophy', { size: 15 }), ' Etapa em dia!') : null,
      d.antecedencia.length ? h('details', { class: 'cw-line' }, h('summary', {}, icon('clock', { size: 14 }), `Comece cedo (${d.antecedencia.length})`), h('ol', { class: 'cw-list' }, d.antecedencia.map((v) => row(v)))) : null);
  }

  // Linha de documento: ícone, nome e situação. Só o essencial.
  function row(v, { destaque = false, sub = null } = {}) {
    return h('li', {}, h('button', { type: 'button', class: `cw-row${destaque ? ' is-next' : ''}${v.atencao ? ' is-warn' : ''}`, onClick: () => open(v.id) },
      h('span', { class: `dc-icon${v.pronto && !v.atencao ? ' is-ok' : ''}` }, v.pronto && !v.atencao ? icon('check', { size: 16 }) : icon(v.icone || 'file', { size: 16 })),
      h('span', { class: 'cw-row-main' }, h('strong', {}, v.nome), v.alerta ? h('small', { class: 'cw-row-alert' }, v.alerta) : sub ? h('small', { class: 'cw-row-sub' }, sub) : null),
      v.agregado ? h('small', { class: 'cw-row-sub' }, `${v.agregado.prontos}/${v.agregado.total}`) : EstadoPill(v)));
  }

  // ---------- Busca (filtros escondidos) ----------
  function search() {
    const input = h('input', { type: 'search', value: filters.q, placeholder: 'Procurar documento…', 'aria-label': 'Procurar documento' });
    let t = null;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { filters.q = input.value.trim(); runSearch(); }, 250); });
    const active = filters.etapa || filters.exigencia || filters.estado;
    const sel = (name, label, opts) => {
      const s = h('select', { 'aria-label': label }, h('option', { value: '' }, label), Object.entries(opts).map(([v, l]) => h('option', { value: v, selected: filters[name] === v }, l)));
      s.addEventListener('change', () => { filters[name] = s.value; runSearch(); });
      return s;
    };
    return h('section', { class: 'cw-search', role: 'search' },
      h('div', { class: 'cw-search-box' }, icon('search', { size: 17 }), input,
        h('button', { type: 'button', class: `cw-filter-btn${active ? ' is-on' : ''}`, 'aria-expanded': String(showFilters), onClick: () => { showFilters = !showFilters; draw(); } }, icon('filter', { size: 14 }), 'Filtros')),
      showFilters ? h('div', { class: 'cw-filters' }, sel('etapa', 'Etapa', ETAPAS), sel('exigencia', 'Tipo', EXIGENCIAS), sel('estado', 'Situação', ESTADOS)) : null);
  }

  async function runSearch() {
    const active = filters.q.length >= 2 || filters.etapa || filters.exigencia || filters.estado;
    if (!active) return mount(resultsHost);
    const qs = new URLSearchParams(Object.entries({ ...filters, q: filters.q.length >= 2 ? filters.q : '', ...(jid ? { journeyId: jid } : {}) }).filter(([, v]) => v)).toString();
    try {
      const r = await api.get(`/documents/list?${qs}`);
      mount(resultsHost, h('div', { class: 'cw-box' },
        h('div', { class: 'cw-box-head' }, h('strong', {}, `${r.total} encontrado${r.total === 1 ? '' : 's'}`),
          h('button', { type: 'button', class: 'dp-link', onClick: () => { Object.assign(filters, { q: '', etapa: '', exigencia: '', estado: '' }); showFilters = false; draw(); mount(resultsHost); } }, icon('x', { size: 12 }), 'Limpar')),
        r.itens.length ? h('ol', { class: 'cw-list' }, r.itens.slice(0, 30).map((v) => row(v))) : h('p', { class: 'muted small' }, 'Nada encontrado.')));
    } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- Categorias (quadradinhos) ----------
  function categories() {
    const order = { atual: 0, anterior: 1, futura: 2, complementar: 3 };
    const visible = d.categorias.filter((c) => c.estado !== 'oculta').sort((a, b) => order[a.estado] - order[b.estado] || a.numero - b.numero);
    const hidden = d.categorias.filter((c) => c.estado === 'oculta');
    return h('section', { class: 'cw-cats', 'aria-label': 'Categorias' },
      h('h2', { class: 'cw-h2' }, 'Categorias'),
      h('div', { class: 'cw-tiles' }, visible.map(tile)),
      catHost,
      hidden.length ? h('details', { class: 'cw-line' }, h('summary', {}, `${hidden.length} categorias não se aplicam a você`),
        h('div', { class: 'cw-tags' }, hidden.map((c) => h('button', { type: 'button', class: 'chip', onClick: () => toggleCat(c.id, true) }, icon(c.icone, { size: 12 }), ' ', c.nome)))) : null);
  }

  function tile(c) {
    const isOpen = openCat === c.id;
    const done = c.total && c.prontos === c.total;
    return h('button', { type: 'button', class: `cw-tile${c.estado === 'atual' ? ' is-now' : ''}${isOpen ? ' is-open' : ''}${done ? ' is-done' : ''}`, 'aria-expanded': String(isOpen), onClick: () => toggleCat(c.id) },
      h('span', { class: 'cw-tile-ic' }, icon(done ? 'check' : c.icone, { size: 18 })),
      h('strong', {}, c.nome),
      c.total ? [h('span', { class: 'cw-tile-count' }, `${c.prontos}/${c.total}`), h('span', { class: 'dc-stage-bar cw-bar' }, fill(c.progresso))]
        : h('span', { class: 'cw-tile-count is-soft' }, c.estado === 'futura' ? 'mais adiante' : 'se precisar'));
  }

  function toggleCat(id, todos = false) {
    openCat = openCat === id && !todos ? null : id;
    draw();
    if (!openCat) return mount(catHost);
    loadCategory(id);
    requestAnimationFrame(() => catHost.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function loadCategory(id) {
    const c = d.categorias.find((x) => x.id === id);
    mount(catHost, h('div', { class: 'cw-cat-body' }, h('span', { class: 'du-spinner' })));
    let r;
    try { r = await api.get(`/documents/list?categoria=${id}&todos=1${jq('&')}`); } catch (e) { return toast(e.message, 'err'); }
    const by = (ex) => r.itens.filter((v) => ex.includes(v.exigencia));
    const sub = (v) => (v.rotulos?.[0] && v.rotulos[0] !== v.nome ? v.rotulos[0] : null);
    // Necessários abertos; opcionais, contingência e não aplicáveis recolhidos.
    const group = (g, i) => {
      const items = by(g.exigencias);
      if (!items.length) return null;
      const list = h('ol', { class: 'cw-list' }, items.map((v) => row(v, { sub: sub(v) })));
      return i === 0 ? h('div', { class: 'cw-group' }, h('h3', {}, `${g.titulo.replace('Documentos ', '')} (${items.length})`), list)
        : h('details', { class: 'cw-line' }, h('summary', {}, `${g.titulo.replace('Documentos ', '')} (${items.length})`), list);
    };
    const na = by(['nao-necessario']);
    mount(catHost, h('section', { class: 'cw-cat-body', 'aria-label': c.nome },
      h('header', { class: 'cw-cat-body-head' },
        h('span', { class: 'cw-tile-ic' }, icon(c.icone, { size: 18 })),
        h('h2', {}, c.nome),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onClick: () => toggleCat(id) }, icon('x', { size: 18 }))),
      id === 'financeira' ? h('p', { class: 'cw-note' }, 'Você não precisa de todos: use os que o seu consulado aceita.') : null,
      GRUPOS.map(group),
      na.length ? h('details', { class: 'cw-line' }, h('summary', {}, `Não se aplicam (${na.length})`), h('ol', { class: 'cw-list' }, na.map((v) => row(v)))) : null));
  }

  // ---------- Minha situação ----------
  function situation() {
    const rows = d.condicoes.map((c) => h('li', {},
      h('span', {}, c.rotulo),
      h('div', { class: 'cw-seg', role: 'radiogroup', 'aria-label': c.rotulo },
        [[true, 'Sim'], [false, 'Não']].map(([val, label]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(c.valor === val), class: c.valor === val ? 'is-on' : '', title: c.origem === 'detectado' ? 'Detectado pela sua jornada' : null,
          onClick: () => setCond(c.key, c.valor === val && c.origem === 'voce' ? null : val),
        }, label)))));
    return h('details', { class: 'cw-line cw-card' },
      h('summary', {}, icon('user', { size: 15 }), 'Minha situação'),
      h('p', { class: 'cw-note' }, 'Ajuste se algo estiver errado. A carteira se adapta.'),
      h('ul', { class: 'cw-conds' }, rows));
  }
  async function setCond(key, val) {
    try { d = await api.put(`/documents/conditions${jq()}`, { [key]: val }); toast('Carteira atualizada.', 'ok'); draw(); if (openCat) loadCategory(openCat); } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- Privacidade ----------
  function privacy() {
    const versoes = h('input', { type: 'checkbox', checked: d.prefs?.versoes !== false });
    versoes.addEventListener('change', async () => { try { await api.put('/documents/prefs', { versoes: versoes.checked }); toast('Preferência salva.', 'ok'); } catch (e) { toast(e.message, 'err'); } });
    const confirm = h('input', { type: 'text', placeholder: 'Digite EXCLUIR', 'aria-label': 'Confirmação', class: 'cw-confirm' });
    return h('details', { class: 'cw-line cw-card' },
      h('summary', {}, icon('lock', { size: 15 }), 'Privacidade'),
      h('ul', { class: 'cw-privacy' },
        h('li', {}, 'Cifrado e visível só para você.'),
        h('li', {}, 'Não vai para inteligência artificial.'),
        h('li', {}, 'Nunca guarde senhas ou códigos aqui.')),
      h('label', { class: 'dp-check' }, versoes, h('span', {}, 'Guardar versões antigas')),
      h('div', { class: 'cw-danger' }, h('strong', {}, 'Excluir todos os arquivos'),
        h('div', { class: 'row wrap' }, confirm, h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: async () => {
          if (confirm.value.trim() !== 'EXCLUIR') return toast('Digite EXCLUIR para confirmar.', 'err');
          try { const r = await api.del('/documents/files', { confirmar: 'EXCLUIR' }); toast(`${r.excluidos} arquivo(s) excluído(s).`, 'ok'); refresh(); folder.reload?.(); } catch (e) { toast(e.message, 'err'); }
        } }, 'Excluir'))));
  }

  try { await load(); } catch (e) { return h('div', { class: 'empty' }, h('h2', {}, 'Não foi possível abrir seus documentos'), h('p', { class: 'muted' }, e.message)); }
  // Arquivos antigos guardados só neste navegador → oferta discreta de enviar para a conta.
  localDocFiles(state.me.user.id, null).then((files) => mount(localHost, LocalFilesBanner(files, { onDone: () => { mount(localHost); refresh(); } })));
  if (docId) setTimeout(() => open(docId), 0);
  return root;
}
