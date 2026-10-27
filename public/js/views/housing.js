// Meu Novo Lar: Encontrar → Salvar → Comparar → Verificar → Escolher.
// A Estuvia não busca nem lê anúncios (não há integração autorizada): leva o estudante aos sites
// conferidos, guarda o que ele encontrou e organiza a decisão. Fotos ficam só neste dispositivo.
// Custos e comparação são calculados no servidor (housing-engine.js).
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { invalidate, checkAchievements, currentAnchor, state } from '../app.js';
import { addFile, listFiles, removeFile } from '../localfiles.js';
import { openAssistant } from '../components/AIJourneyAssistant.js';
import { fmtDate } from '../components/common.js';

const eur = (v) => (v === null || v === undefined ? '-' : `€ ${Math.round(v).toLocaleString('pt-BR')}`);
const STATUS_ORDER = ['quero-conhecer', 'contato', 'aguardando', 'visitado', 'contrato', 'escolhida'];
const AGENDA = [
  ['conversar', 'Conversar com o anunciante'],
  ['visita', 'Visitar o imóvel (ou vídeo-chamada)'],
  ['contrato', 'Verificar o contrato'],
  ['pagamento', 'Conferir as condições de pagamento'],
];
const today = () => new Date().toISOString().slice(0, 10);
const photoScope = (id) => `${state.me.user.id}:moradia:${id}`;

// Foto local reduzida (sem enviar nada ao servidor). createImageBitmap evita URLs blob: (CSP).
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return new File([blob], (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
const asDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
const photoCache = new Map();
async function photosOf(id) {
  if (!photoCache.has(id)) photoCache.set(id, Promise.all((await listFiles(photoScope(id))).filter((f) => f.tipo.startsWith('image/')).map(async (f) => ({ id: f.id, url: await asDataUrl(f.blob) }))));
  return photoCache.get(id);
}

export async function housingView() {
  let d = await api.get('/living');
  const st = { wizard: false, step: 0, importer: false, selected: new Set(), comparacao: null, detail: null };
  const root = h('div', { class: 'hs' });
  const sheetHost = h('div');

  const call = async (method, url, body) => {
    try { d = { ...d, ...(await api[method](url, body)) }; invalidate(); draw(); checkAchievements(); return d; } catch (e) { toast(e.message, 'err'); return null; }
  };
  const item = (id) => d.housing.find((x) => x.id === id);
  const put = (id, body) => call('put', `/living/housing/${id}`, body).then((r) => { if (r && st.detail === id) openDetail(id); return r; });

  // ---------- Cabeçalho, destino e ações ----------
  function header() {
    const dest = d.destino;
    return h('header', { class: 'hs-head' },
      h('div', {}, h('h1', {}, 'Meu novo lar'), h('p', { class: 'muted' }, 'Encontre e organize sua moradia no exterior.')),
      h('div', { class: 'hs-dest card' }, h('span', { class: 'hs-dest-ic' }, icon('pin', { size: 18 })),
        dest.cidade
          ? h('div', {}, h('small', {}, 'Seu destino'), h('strong', {}, `${dest.cidade}, ${dest.pais}`), h('span', { class: 'muted small' }, `${dest.universidade?.nome || ''} · estadia de ${dest.meses} meses`))
          : h('div', {}, h('small', {}, 'Seu destino'), h('strong', {}, 'Ainda não definido'), h('a', { class: 'small', href: '#/jornadas/nova' }, 'Criar minha jornada'))));
  }

  function actions() {
    return h('div', { class: 'hs-actions' },
      h('button', { class: 'btn btn-cta btn-lg', type: 'button', onClick: () => { st.wizard = true; st.step = 0; st.importer = false; draw(); document.getElementById('busca')?.scrollIntoView({ behavior: 'smooth' }); } }, icon('search', { size: 18 }), 'Procurar moradias'),
      h('button', { class: 'guide-secondary', type: 'button', onClick: () => { st.importer = true; st.wizard = false; draw(); document.getElementById('adicionar')?.scrollIntoView({ behavior: 'smooth' }); } }, icon('link', { size: 14 }), 'Adicionar anúncio que encontrei'));
  }

  // ---------- Busca guiada (3 perguntas) ----------
  function wizard() {
    if (!st.wizard) return null;
    const b = d.busca || {};
    const set = (patch, next) => call('put', '/living/search', patch).then(() => { if (next !== undefined) { st.step = next; draw(); } });
    const steps = [
      () => h('div', { class: 'stack' }, h('h2', {}, 'Que tipo de moradia você procura?'),
        h('div', { class: 'hs-types' }, Object.entries(d.tipos).map(([id, t]) => h('button', { type: 'button', class: 'hs-type', 'aria-pressed': String(b.tipo === id), onClick: () => set({ tipo: id }, 1) },
          h('span', { class: 'hs-type-ic' }, icon(t.icone, { size: 22 })), h('strong', {}, t.label), h('small', { class: 'muted' }, t.desc))))),
      () => {
        const faixas = b.tipo && d.destino.faixas?.[b.tipo];
        const custom = h('input', { type: 'number', min: 50, step: 10, class: 'guide-input', placeholder: 'Ex.: 380', value: faixas ? '' : b.orcamentoMax ?? '', 'aria-label': 'Orçamento máximo por mês (€)' });
        return h('div', { class: 'stack' }, h('h2', {}, 'Quanto quer gastar por mês?'),
          faixas ? [h('div', { class: 'choice-grid' }, faixas.map((f) => h('button', { type: 'button', class: 'choice', 'aria-pressed': String(b.orcamentoMax === (f.max ?? null)), onClick: () => set({ orcamentoMax: f.max ?? null }, 2) }, h('span', {}, f.rotulo)))),
            h('p', { class: 'hint' }, 'Faixas da UGR para quarto compartilhado em Granada: ', d.destino.faixas.fonte.map((s, i) => [i ? ' e ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.id)]), '. As páginas divergem e não têm data.')]
            : h('p', { class: 'small muted' }, 'Ainda não temos uma faixa de preço com fonte para este tipo de moradia neste destino. Informe o seu limite:'),
          h('div', { class: 'fp-money' }, custom, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => set({ orcamentoMax: custom.value ? Number(custom.value) : null }, 2) }, faixas ? 'Usar valor personalizado' : 'Continuar')));
      },
      () => {
        const prefs = new Set(b.preferencias || []);
        return h('div', { class: 'stack' }, h('h2', {}, 'O que é importante para você?'),
          h('div', { class: 'chips' }, Object.entries(d.preferencias).map(([id, l]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(prefs.has(id)), onClick: () => { if (prefs.has(id)) prefs.delete(id); else prefs.add(id); set({ preferencias: [...prefs] }); } }, prefs.has(id) ? icon('check', { size: 12 }) : null, ` ${l}`))),
          h('button', { class: 'btn btn-cta', type: 'button', onClick: () => { st.step = 3; draw(); } }, 'Ver onde procurar', icon('arrow', { size: 14 })));
      },
      () => discovery(),
    ];
    return h('section', { class: 'hs-wizard card', id: 'busca' },
      h('div', { class: 'row between' }, h('ol', { class: 'hs-steps', 'aria-label': 'Etapas da busca' }, ['Tipo', 'Orçamento', 'Preferências', 'Onde procurar'].map((l, i) => h('li', {}, h('button', { type: 'button', class: i === st.step ? 'on' : i < st.step ? 'done' : '', onClick: () => { st.step = i; draw(); } }, l)))),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Fechar busca', onClick: () => { st.wizard = false; draw(); } }, icon('x', { size: 14 }))),
      steps[st.step]());
  }

  // Descoberta honesta: sem imóveis fictícios — links conferidos para o destino + o que levar em conta.
  function discovery() {
    const b = d.busca || {};
    const src = d.destino.busca;
    const tipo = b.tipo;
    const sites = (src?.sites || []).filter((s) => !tipo || s.tipos.includes(tipo));
    const prefs = (b.preferencias || []).map((p) => d.preferencias[p]);
    return h('div', { class: 'stack' },
      h('h2', {}, 'Onde procurar'),
      h('p', { class: 'small muted' }, `${tipo ? d.tipos[tipo].label : 'Qualquer tipo'}${b.orcamentoMax ? ` · até € ${b.orcamentoMax}/mês` : ''}${prefs.length ? ` · ${prefs.join(', ')}` : ''}. Aplique esses filtros no site e salve aqui o que encontrar.`),
      src ? [
        h('div', { class: 'hs-sites' }, sites.map((s) => h('a', { class: 'hs-site card', href: s.url, target: '_blank', rel: 'noopener noreferrer' },
          h('strong', {}, s.nome, ' ', icon('external', { size: 12 })), h('span', { class: 'small muted' }, s.desc)))),
        h('a', { class: 'hs-site official card', href: src.oficial.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'tag tag-ok' }, 'Fonte oficial'), h('strong', {}, src.oficial.nome, ' ', icon('external', { size: 12 })), h('span', { class: 'small muted' }, src.oficial.desc)),
        h('p', { class: 'hint' }, `Links conferidos em ${fmtDate(src.verificadoEm)}. A Estuvia não tem parceria com esses sites e não mostra anúncios por eles.`),
      ] : h('p', { class: 'notice' }, `Ainda não temos sites conferidos para ${d.destino.cidade || 'o seu destino'}. Procure nos portais que você conhece e salve aqui o link.`),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn btn-cta', type: 'button', onClick: () => { st.importer = true; draw(); document.getElementById('adicionar')?.scrollIntoView({ behavior: 'smooth' }); } }, icon('link', { size: 14 }), 'Achei um anúncio: adicionar'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openAssistant({ pergunta: `Como encontro ${tipo ? d.tipos[tipo].label.toLowerCase() : 'moradia'} barato em ${d.destino.cidade || 'meu destino'}?` }) }, icon('chat', { size: 14 }), 'Dicas do Mentor')));
  }

  // ---------- Adicionar por link (4 dados essenciais) ----------
  function importer() {
    if (!st.importer) return null;
    const b = d.busca || {};
    const link = h('input', { type: 'url', class: 'guide-input', placeholder: 'https://… (link do anúncio)', 'aria-label': 'Link do anúncio' });
    const site = h('small', { class: 'muted' });
    link.addEventListener('input', () => { try { site.textContent = link.value ? `Anúncio de ${new URL(link.value).hostname.replace(/^www\./, '')}` : ''; } catch { site.textContent = ''; } });
    const nome = h('input', { class: 'guide-input', maxlength: 100, placeholder: 'Ex.: Quarto no Realejo', 'aria-label': 'Nome ou título' });
    const preco = h('input', { type: 'number', min: 0, step: 10, class: 'guide-input', placeholder: '€ por mês', 'aria-label': 'Preço mensal' });
    const tipo = h('select', { class: 'guide-input', 'aria-label': 'Tipo de moradia' }, Object.entries(d.tipos).map(([id, t]) => h('option', { value: id, selected: id === (b.tipo || 'quarto') }, t.curto)));
    const bairro = h('input', { class: 'guide-input', maxlength: 100, placeholder: 'Bairro (se souber)', 'aria-label': 'Bairro' });
    const save = async () => {
      if (link.value && !/^https:\/\//.test(link.value)) return toast('Use um link que comece com https://', 'err');
      if (!nome.value.trim() || preco.value === '') return toast('Informe o nome e o preço mensal.', 'err');
      const r = await call('post', '/living/housing', { nome: nome.value.trim(), aluguel: Number(preco.value), tipo: tipo.value, ...(bairro.value.trim() ? { bairro: bairro.value.trim() } : {}), ...(link.value ? { link: link.value } : {}) });
      if (r) { st.importer = false; draw(); toast('Moradia salva. Complete os detalhes quando quiser.', 'ok'); if (r.criado) openDetail(r.criado); }
    };
    return h('section', { class: 'hs-import card', id: 'adicionar' },
      h('div', { class: 'row between' }, h('h2', {}, 'Cole o link do anúncio que encontrou'), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Fechar', onClick: () => { st.importer = false; draw(); } }, icon('x', { size: 14 }))),
      h('div', { class: 'stack' }, link, site),
      h('p', { class: 'small muted' }, 'A Estuvia não lê o anúncio automaticamente: confira no site e preencha só o essencial. O resto você completa depois.'),
      h('div', { class: 'hs-import-grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome ou título'), nome),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Preço mensal (€)'), preco),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tipo'), tipo),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bairro'), bairro)),
      h('button', { class: 'btn btn-cta btn-lg', type: 'button', onClick: save }, icon('home2', { size: 16 }), 'Adicionar imóvel'));
  }

  // ---------- Cards ----------
  function photoSlot(x, cls = 'hs-photo') {
    const box = h('div', { class: `${cls} ph-${x.tipo}` }, h('span', { class: 'hs-photo-ic' }, icon(d.tipos[x.tipo]?.icone || 'home2', { size: 30 })));
    photosOf(x.id).then((ps) => { if (ps[0]) box.replaceChildren(h('img', { src: ps[0].url, alt: `Foto de ${x.nome} (adicionada por você)` })); }).catch(() => {});
    return box;
  }

  function safetyBadge(x) {
    const s = x.seguranca;
    if (s.nivel === 'alerta') return h('span', { class: 'hs-safe alert' }, icon('alert', { size: 12 }), `${s.alertas.length} alerta(s)`);
    if (s.nivel === 'conferido') return h('span', { class: 'hs-safe ok' }, icon('shield', { size: 12 }), 'Conferências feitas');
    return h('span', { class: 'hs-safe' }, icon('shield', { size: 12 }), `Conferido ${s.confirmadas}/${s.total}`);
  }

  function card(x) {
    const c = x.custos;
    const sel = st.selected.has(x.id);
    const pick = h('input', { type: 'checkbox', checked: sel, disabled: !sel && st.selected.size >= 3, 'aria-label': `Comparar ${x.nome}` });
    pick.addEventListener('change', () => { if (pick.checked) st.selected.add(x.id); else st.selected.delete(x.id); st.comparacao = null; draw(); });
    const status = h('select', { class: 'hs-status', 'aria-label': `Situação de ${x.nome}` }, Object.entries(d.situacoes).map(([v, s]) => h('option', { value: v, selected: v === x.status }, s.label)));
    status.addEventListener('change', () => (status.value === 'escolhida' ? choose(x.id) : put(x.id, { status: status.value })));
    return h('article', { class: `hs-card card s-${x.status} ${sel ? 'picked' : ''}` },
      h('button', { type: 'button', class: 'hs-card-media', onClick: () => openDetail(x.id), 'aria-label': `Ver detalhes de ${x.nome}` }, photoSlot(x),
        x.status === 'escolhida' ? h('span', { class: 'hs-chosen' }, icon('check', { size: 12 }), 'Minha moradia') : null),
      h('div', { class: 'hs-card-body' },
        h('div', { class: 'row between' }, h('span', { class: 'tag tag-info' }, x.tipoLabel), safetyBadge(x)),
        h('h3', {}, x.nome),
        x.bairro ? h('p', { class: 'small muted' }, icon('pin', { size: 12 }), ` ${x.bairro}`) : null,
        h('p', { class: 'hs-price' }, h('strong', {}, eur(c.mensal)), h('span', {}, '/mês')),
        h('p', { class: 'small muted' }, x.contasIncluidas ? 'Contas incluídas' : c.adicionais !== null ? `inclui € ${c.adicionais} de contas/despesas` : 'Contas: ainda não informadas', c.caucao !== null ? ` · caução ${eur(c.caucao)}` : ''),
        h('div', { class: 'hs-card-foot' },
          status,
          h('label', { class: 'hs-pick' }, pick, h('span', {}, 'Comparar')),
          x.link ? h('a', { class: 'small', href: x.link, target: '_blank', rel: 'noopener noreferrer' }, x.fonte || 'Anúncio', ' ', icon('external', { size: 11 })) : null),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openDetail(x.id) }, 'Ver detalhes', icon('arrow', { size: 12 }))));
  }

  function listing() {
    const all = d.housing;
    if (!all.length) {
      return h('section', { class: 'hs-empty card' }, h('span', { class: 'hs-empty-ic' }, icon('home2', { size: 34 })),
        h('h2', {}, 'Você ainda não salvou nenhuma moradia.'), h('p', { class: 'muted' }, 'Vamos encontrar algumas opções?'),
        h('button', { class: 'btn btn-cta', type: 'button', onClick: () => { st.wizard = true; st.step = 0; draw(); } }, icon('search', { size: 16 }), 'Procurar moradias'));
    }
    const active = all.filter((x) => x.status !== 'descartada');
    const discarded = all.filter((x) => x.status === 'descartada');
    return h('section', { class: 'stack', id: 'opcoes' },
      h('div', { class: 'section-head' }, h('h2', {}, `Minhas opções (${active.length})`), h('span', { class: 'muted small' }, 'Marque 2 ou 3 para comparar')),
      h('div', { class: 'hs-grid' }, active.map(card)),
      discarded.length ? h('details', { class: 'guide-more' }, h('summary', {}, `Descartadas (${discarded.length})`), h('div', { class: 'hs-grid' }, discarded.map(card))) : null);
  }

  function compareBar() {
    if (st.selected.size < 2) return st.selected.size === 1 ? h('div', { class: 'hs-cmpbar' }, h('span', {}, 'Selecione mais uma opção para comparar.')) : null;
    return h('div', { class: 'hs-cmpbar' }, h('span', {}, `${st.selected.size} selecionadas`),
      h('button', { class: 'btn btn-cta', type: 'button', onClick: runCompare }, icon('scale', { size: 16 }), 'Comparar opções'),
      h('button', { class: 'guide-secondary', type: 'button', onClick: () => { st.selected.clear(); st.comparacao = null; draw(); } }, 'Limpar'));
  }

  async function runCompare() {
    try { const r = await api.post('/living/compare', { ids: [...st.selected] }); st.comparacao = r.comparacao; invalidate(); draw(); document.getElementById('comparacao')?.scrollIntoView({ behavior: 'smooth' }); } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- Comparação ----------
  function comparison() {
    const cmp = st.comparacao;
    if (!cmp) return null;
    const rows = [
      ['Aluguel mensal', (o) => eur(o.custos.aluguel)],
      ['Contas e despesas', (o) => (o.contasIncluidas ? 'Incluídas' : o.custos.adicionais === null ? 'Não informadas' : `${eur(o.custos.adicionais)}/mês`)],
      ['Custo mensal', (o) => eur(o.custos.mensal), 'strong'],
      ['Caução (reembolsável)', (o) => (o.custos.caucao === null ? 'Não informada' : eur(o.custos.caucao))],
      ['Custo inicial (1º mês + caução + taxas)', (o) => `${eur(o.custos.inicial)}${o.custos.inicialParcial ? ' + ?' : ''}`],
      [`Total da estadia (${cmp.meses} meses)`, (o) => eur(o.custos.totalEstadia), 'strong'],
      ['Localização', (o) => o.bairro || '-'],
      ['Até a universidade', (o) => o.distancia || 'Não informado'],
      ['Contrato', (o) => o.duracaoContrato || 'Não informado'],
      ['Conferir antes de pagar', (o) => (o.seguranca.alertas.length ? `${o.seguranca.alertas.length} alerta(s)` : `${o.seguranca.confirmadas}/${o.seguranca.total} conferido`)],
    ];
    return h('section', { class: 'hs-compare card', id: 'comparacao' },
      h('div', { class: 'row between' }, h('h2', {}, icon('scale', { size: 18 }), ' Comparação'), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Fechar comparação', onClick: () => { st.comparacao = null; draw(); } }, icon('x', { size: 14 }))),
      cmp.diferencas.length ? h('ul', { class: 'hs-diffs' }, cmp.diferencas.map((t) => h('li', {}, icon('target', { size: 13 }), ' ', t))) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'cmp hs-cmp' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), cmp.opcoes.map((o) => h('th', {}, h('button', { type: 'button', class: 'hs-th', onClick: () => openDetail(o.id) }, o.nome))))),
        h('tbody', {}, rows.map(([label, fn, cls]) => h('tr', { class: cls || '' }, h('th', {}, label), cmp.opcoes.map((o) => h('td', {}, fn(o)))))))),
      h('p', { class: 'hint' }, cmp.aviso),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openAssistant({ pergunta: 'Qual dessas opções de moradia fica mais barata e o que ainda preciso perguntar antes de decidir?' }) }, icon('chat', { size: 14 }), 'Pensar com o Mentor'));
  }

  // ---------- Escolher (com conferência de segurança no momento da decisão) ----------
  function choose(id) {
    const x = item(id);
    const s = x.seguranca;
    const body = h('div', { class: 'stack' },
      h('h2', {}, `Escolher "${x.nome}" como minha moradia?`),
      h('p', {}, 'O aluguel, as contas e a caução passam a alimentar o seu planejamento financeiro. Se você trocar depois, o plano acompanha.'),
      s.nivel === 'alerta' ? h('p', { class: 'notice' }, icon('alert', { size: 14 }), ` Há ${s.alertas.length} sinal(is) de alerta: ${s.alertas.join(' · ')}`) : null,
      s.nivel !== 'conferido' ? h('p', { class: 'small muted' }, `Você conferiu ${s.confirmadas} de ${s.total} itens de "Conferir antes de pagar". Não envie dinheiro antes de conferir.`) : h('p', { class: 'small muted' }, 'Conferências feitas, isso ajuda, mas não garante que o anúncio é seguro.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn btn-cta', type: 'button', onClick: async () => { closeSheet(); await put(id, { status: 'escolhida' }); toast('Moradia escolhida. Seu planejamento financeiro foi atualizado.', 'ok'); } }, icon('check', { size: 16 }), 'Sim, escolher'),
        s.nivel !== 'conferido' ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openDetail(id, 'seguranca') }, 'Conferir antes') : null,
        h('button', { class: 'guide-secondary', type: 'button', onClick: () => { closeSheet(); draw(); } }, 'Cancelar')));
    openSheet(body, 'Escolher moradia');
  }

  // ---------- Detalhes ----------
  async function openDetail(id, focus) {
    const x = item(id);
    if (!x) return;
    st.detail = id;
    const c = x.custos;
    const field = (label, key, attrs = {}) => {
      const el = h('input', { class: 'guide-input', value: x[key] ?? '', ...attrs, 'aria-label': label });
      el.addEventListener('change', () => {
        const v = attrs.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
        if (key === 'aluguel' && v === null) return toast('O aluguel é obrigatório.', 'err');
        put(id, { [key]: v });
      });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
    };
    const contas = h('input', { type: 'checkbox', checked: Boolean(x.contasIncluidas) });
    contas.addEventListener('change', () => put(id, { contasIncluidas: contas.checked }));
    const notes = h('textarea', { class: 'guide-input', rows: 4, maxlength: 1500, placeholder: 'O que você combinou, perguntas, impressões…', 'aria-label': 'Minhas anotações' }, x.notas || '');
    let t;
    notes.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => api.put(`/living/housing/${id}`, { notas: notes.value }).then((r) => { d = { ...d, ...r }; }).catch((e) => toast(e.message, 'err')), 700); });

    const photos = h('div', { class: 'hs-gallery' });
    const drawPhotos = async () => {
      photoCache.delete(id);
      const ps = await photosOf(id);
      const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
      file.addEventListener('change', async () => { try { for (const f of file.files) await addFile(photoScope(id), await shrink(f)); await drawPhotos(); draw(); } catch (e) { toast(e.message, 'err'); } });
      mount(photos, ps.length ? ps.map((p) => h('figure', {}, h('img', { src: p.url, alt: `Foto de ${x.nome}` }), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remover foto', onClick: async () => { await removeFile(p.id); await drawPhotos(); draw(); } }, icon('trash', { size: 12 })))) : photoSlot(x, 'hs-photo big'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => file.click() }, icon('edit', { size: 13 }), 'Adicionar foto (fica só neste dispositivo)'), file);
    };
    drawPhotos();

    const safety = h('section', { class: 'hs-safety', id: 'hs-seguranca' }, h('h3', {}, icon('shield', { size: 16 }), ' Conferir antes de pagar'),
      h('p', { class: 'small muted' }, 'Responda com sinceridade. Isso ajuda a perceber riscos, mas não torna o anúncio seguro.'),
      h('ul', { class: 'hs-questions' }, d.antifraude.map((q) => {
        const cur = x.checklist?.[q.id] ? 'ok' : x.sinais?.[q.id] ? 'alerta' : null;
        const btn = (v, label) => h('button', { type: 'button', class: `hs-ans ${v || 'ns'}`, 'aria-pressed': String(cur === v), onClick: () => put(id, { respostas: { [q.id]: v } }) }, label);
        return h('li', { class: cur === 'alerta' ? 'is-alert' : '' }, h('strong', {}, q.pergunta), h('div', { class: 'hs-ans-row' }, btn('ok', q.ok), btn('alerta', q.alerta), btn(null, 'Não sei')), cur === 'alerta' || cur === null ? h('small', { class: 'muted' }, q.dica) : null);
      })),
      x.seguranca.alertas.length ? h('p', { class: 'notice' }, icon('alert', { size: 14 }), ' Sinais de alerta: não envie dinheiro e peça ajuda antes de continuar.') : null);

    const agenda = h('div', { class: 'hs-agenda' });
    const drawAgenda = () => {
      const what = h('select', { class: 'guide-input', 'aria-label': 'Atividade' }, AGENDA.map(([v, l]) => h('option', { value: v }, l)));
      const date = h('input', { type: 'date', class: 'guide-input', min: today(), value: today(), 'aria-label': 'Data' });
      const time = h('input', { type: 'time', class: 'guide-input', value: '18:00', 'aria-label': 'Horário' });
      mount(agenda, h('div', { class: 'hs-agenda-grid' }, what, date, time),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => {
          const [hh, mm] = time.value.split(':').map(Number);
          const end = `${String(Math.min(23, hh + (mm + 45 >= 60 ? 1 : 0))).padStart(2, '0')}:${String((mm + 45) % 60).padStart(2, '0')}`;
          try {
            await api.post('/planner', { titulo: `${AGENDA.find(([v]) => v === what.value)[1]} - ${x.nome}`.slice(0, 120), categoria: 'viagem', data: date.value, inicio: time.value, fim: end > time.value ? end : '23:59', motivo: 'Meu Novo Lar', nota: 'Combine o horário com o anunciante: a Estuvia não agenda com terceiros.' });
            toast('Adicionado à sua Agenda.', 'ok');
          } catch (e) { toast(e.message, 'err'); }
        } }, icon('calendar', { size: 13 }), 'Pôr na minha agenda'),
        h('p', { class: 'hint' }, 'Fica na sua agenda como lembrete. Você combina o horário com o anunciante.'));
    };
    drawAgenda();

    const draft = () => {
      const p = state.me.user.profile;
      const txt = `Hola, ¿qué tal?\n\nMe llamo ${p.nome || '[nombre]'} y soy estudiante de máster en ${d.destino.universidade?.nome || 'la universidad'}. Vi su anuncio "${x.nome}"${x.bairro ? ` en ${x.bairro}` : ''} y me interesa mucho.\n\nMe gustaría saber:\n1. Si sigue disponible a partir de ${x.entrada ? fmtDate(x.entrada) : '[fecha]'} y por cuántos meses se puede alquilar.\n2. Qué gastos están incluidos (agua, luz, internet) y cuánto suelen ser los demás.\n3. El importe de la fianza y cómo se devuelve.\n4. Si hay contrato por escrito y si podríamos hacer una videollamada para ver el piso.\n\nMuchas gracias.\nUn saludo,\n${p.nome || '[nombre]'}`;
      const area = h('textarea', { class: 'guide-input', rows: 10, 'aria-label': 'Mensagem em espanhol' }, txt);
      return h('div', { class: 'stack' }, area, h('div', { class: 'row wrap' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => navigator.clipboard.writeText(area.value).then(() => toast('Mensagem copiada. Revise e envie pelo canal do anúncio.', 'ok')) }, icon('copy', { size: 13 }), 'Copiar mensagem'),
        h('button', { class: 'guide-secondary', type: 'button', onClick: () => openAssistant({ pergunta: `Me ajuda a escrever para o proprietário do anúncio "${x.nome}" em espanhol.` }) }, 'Pedir ao Mentor')),
        h('p', { class: 'hint' }, 'Rascunho para você revisar. Nada é enviado pela Estuvia.'));
    };

    const tracker = h('ol', { class: 'hs-tracker' }, STATUS_ORDER.map((sId) => {
      const idx = STATUS_ORDER.indexOf(x.status);
      const i = STATUS_ORDER.indexOf(sId);
      return h('li', { class: i < idx ? 'done' : i === idx ? 'on' : '' }, h('button', { type: 'button', onClick: () => (sId === 'escolhida' ? choose(id) : put(id, { status: sId })) }, icon(d.situacoes[sId].icone, { size: 13 }), d.situacoes[sId].label));
    }));

    const body = h('div', { class: 'hs-detail' },
      photos,
      h('div', { class: 'hs-detail-head' }, h('span', { class: 'tag tag-info' }, x.tipoLabel), x.fonte ? h('span', { class: 'tag' }, x.fonte) : null, x.status === 'escolhida' ? h('span', { class: 'tag tag-ok' }, 'Minha moradia') : null),
      h('h2', {}, x.nome),
      h('div', { class: 'hs-costs' },
        h('div', {}, h('small', {}, 'Por mês'), h('strong', {}, eur(c.mensal)), c.contasDesconhecidas ? h('span', { class: 'small warn' }, 'contas não informadas') : null),
        h('div', {}, h('small', {}, 'Para entrar'), h('strong', {}, `${eur(c.inicial)}${c.inicialParcial ? ' + ?' : ''}`), h('span', { class: 'small muted' }, '1º aluguel + caução + taxas')),
        h('div', {}, h('small', {}, `Total em ${c.meses} meses`), h('strong', {}, eur(c.totalEstadia)), c.caucao ? h('span', { class: 'small muted' }, `+ caução de ${eur(c.caucao)} (costuma voltar)`) : null)),
      h('section', { class: 'hs-next' }, h('h3', {}, 'Próximas ações'),
        h('div', { class: 'hs-next-grid' },
          x.link ? h('a', { class: 'choice', href: x.link, target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 16 }), h('span', {}, 'Abrir anúncio original')) : null,
          h('button', { class: 'choice', type: 'button', onClick: () => document.getElementById('hs-seguranca')?.scrollIntoView({ behavior: 'smooth' }) }, icon('shield', { size: 16 }), h('span', {}, 'Conferir contrato')),
          h('button', { class: 'choice', type: 'button', 'aria-pressed': String(st.selected.has(id)), onClick: () => { if (st.selected.has(id)) st.selected.delete(id); else if (st.selected.size < 3) st.selected.add(id); else return toast('Compare até 3 opções.', 'err'); draw(); openDetail(id); } }, icon('scale', { size: 16 }), h('span', {}, st.selected.has(id) ? 'Na comparação' : 'Adicionar à comparação')),
          h('button', { class: 'choice', type: 'button', onClick: () => document.getElementById('hs-agenda-sec')?.scrollIntoView({ behavior: 'smooth' }) }, icon('calendar', { size: 16 }), h('span', {}, 'Organizar uma visita')),
          h('button', { class: 'choice', type: 'button', onClick: () => openAssistant({ pergunta: `Esse anúncio de moradia parece suspeito? "${x.nome}", ${eur(c.mensal)}/mês${x.bairro ? `, ${x.bairro}` : ''}.` }) }, icon('chat', { size: 16 }), h('span', {}, 'Perguntar ao Mentor'))),
        x.status !== 'escolhida' ? h('button', { class: 'btn btn-cta btn-lg', type: 'button', onClick: () => choose(id) }, icon('check', { size: 16 }), 'Selecionar como minha moradia') : h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ' Esta é a sua moradia. O planejamento financeiro usa os valores dela.')),
      h('section', {}, h('h3', {}, 'Situação'), tracker),
      safety,
      h('section', {}, h('h3', {}, 'Custos e contrato'), h('div', { class: 'hs-form' },
        field('Aluguel mensal (€)', 'aluguel', { type: 'number', min: 0, step: 10 }),
        h('label', { class: 'check' }, contas, h('span', {}, 'Contas incluídas no aluguel')),
        x.contasIncluidas ? null : field('Contas e despesas por mês (€)', 'adicionais', { type: 'number', min: 0, step: 5, placeholder: 'Não sei ainda' }),
        field('Caução (€)', 'caucao', { type: 'number', min: 0, step: 10, placeholder: 'Não sei ainda' }),
        field('Taxa de agência (€)', 'taxaAgencia', { type: 'number', min: 0, step: 10, placeholder: 'Se houver' }),
        field('Data de entrada', 'entrada', { type: 'date' }),
        field('Duração do contrato', 'duracaoContrato', { maxlength: 60, placeholder: 'Ex.: 10 meses' }),
        field('Bairro ou endereço', 'bairro', { maxlength: 100 }),
        field('Distância da universidade', 'distancia', { maxlength: 60, placeholder: 'Ex.: 15 min a pé' }),
        field('Link do anúncio', 'link', { type: 'url', maxlength: 400, placeholder: 'https://…' }))),
      h('section', {}, h('h3', {}, 'Minhas anotações'), notes),
      h('section', { id: 'hs-agenda-sec' }, h('h3', {}, 'Organizar na Agenda'), agenda),
      h('details', { class: 'guide-more' }, h('summary', {}, icon('mail', { size: 14 }), ' Escrever ao anunciante (em espanhol)'), draft()),
      h('div', { class: 'row wrap' },
        x.status !== 'descartada' ? h('button', { class: 'guide-secondary', type: 'button', onClick: () => put(id, { status: 'descartada' }) }, 'Descartar esta opção') : h('button', { class: 'guide-secondary', type: 'button', onClick: () => put(id, { status: 'quero-conhecer' }) }, 'Recuperar opção'),
        h('button', { class: 'guide-secondary danger', type: 'button', onClick: async () => { closeSheet(); st.selected.delete(id); await call('del', `/living/housing/${id}`); } }, icon('trash', { size: 13 }), 'Excluir')));
    openSheet(body, x.nome);
    if (focus === 'seguranca') requestAnimationFrame(() => document.getElementById('hs-seguranca')?.scrollIntoView({ behavior: 'smooth' }));
  }

  let lastFocus = null;
  function openSheet(body, title) {
    const scrollY = document.querySelector('.hs-sheet-card')?.scrollTop;
    lastFocus ??= document.activeElement;
    const card = h('div', { class: 'hs-sheet-card', tabindex: '-1' }, h('button', { class: 'icon-btn hs-close', type: 'button', 'aria-label': 'Fechar', onClick: closeSheet }, icon('x', { size: 16 })), body);
    const sheet = h('div', { class: 'hs-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, card);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
    mount(sheetHost, sheet);
    if (scrollY) card.scrollTop = scrollY; else card.focus();
  }
  function closeSheet() { st.detail = null; mount(sheetHost); lastFocus?.focus?.(); lastFocus = null; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetHost.firstChild) closeSheet(); });

  function draw() {
    mount(root, header(), actions(), wizard(), importer(), compareBar(), comparison(), listing(), sheetHost);
  }
  draw();
  const anchor = currentAnchor();
  if (anchor === 'buscar') { st.wizard = true; draw(); }
  return root;
}
