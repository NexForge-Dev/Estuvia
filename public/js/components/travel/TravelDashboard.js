// Minha Viagem — planejador visual (missões 6.3 a 6.5).
// A Estuvia organiza as possibilidades; o estudante avança aos poucos: pesquisando → cotação salva →
// rota escolhida → passagem comprada → viagem concluída. Nada de voo, horário ou preço inventado:
// sem cotação, o card diz "Preço a consultar" (nunca €0).
//
//   TravelHero · TravelStatusCard · RouteDiscovery · TravelRouteCard · FlightQuoteImporter
//   RouteComparison · TravelItinerary · TravelSegment · ArrivalPlanner · TravelCostSummary · TravelAgenda
//   LivePrices: menores preços vistos no Aviasales (via Travelpayouts, gratuito) + alerta de preço — referência, não oferta
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { invalidate, checkAchievements } from '../../app.js';
import { hubIcon } from '../mission-hub/hub-icons.js';
import { openMentor } from '../MentorPanel.js';
import { onLive } from '../../live.js';

function ensureStyles() {
  if (document.querySelector('link[data-travel-css]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/travel.css', 'data-travel-css': '' }));
}

const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
const money = (v, moeda = 'EUR') => (v === null || v === undefined ? null : `${moeda === 'BRL' ? 'R$' : '€'} ${Math.round(v).toLocaleString('pt-BR')}`);
const MEIO_ICON = { aviao: 'plane', trem: 'train', 'trem-urbano': 'train', onibus: 'bus', local: 'home', taxi: 'car', carro: 'car', ape: 'walk', metro: 'train' };
const STATUS_TONE = { pesquisando: 'is-info', cotacao: 'is-warn', escolhida: 'is-accent', comprada: 'is-ok', concluida: 'is-ok' };

// Painel lateral (mesmo padrão da central da missão).
function sheet(title, ic) {
  const body = h('div', { class: 'tv-sheet-body' });
  const close = () => { root.classList.remove('open'); document.removeEventListener('keydown', esc); window.removeEventListener('hashchange', close); setTimeout(() => root.remove(), 180); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('hashchange', close); // mudar de tela fecha o painel
  const root = h('div', { class: 'tv-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'tv-sheet-card', tabindex: '-1' },
      h('header', { class: 'tv-sheet-head' }, h('span', { class: 'tv-ic' }, hubIcon(ic, { size: 20 })), h('h2', {}, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onClick: close }, icon('x', { size: 18 }))),
      body));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.addEventListener('keydown', esc);
  document.body.append(root);
  requestAnimationFrame(() => { root.classList.add('open'); root.querySelector('.tv-sheet-card').focus(); });
  return { body, close };
}

export async function travelDashboardView() {
  ensureStyles();
  const root = h('div', { class: 'tv' });
  let d = await api.get('/travel');
  const ui = { showCompare: false, showWizard: false };

  const call = async (method, url, body, okMsg) => {
    try {
      d = await api[method](`/travel${url}`, body);
      invalidate(); checkAchievements();
      if (okMsg) toast(okMsg, 'ok');
      draw();
      return true;
    } catch (e) { toast(e.message, 'err'); return false; }
  };
  const ask = (mensagem) => openMentor({ mensagem, missaoId: '6.3', journeyId: d.destino.journeyId || undefined });

  // ---------------------------------------------------------------------------
  function TravelHero() {
    const o = d.origem;
    const dest = d.destino;
    const data = d.dataViagem ? fmtDate(d.dataViagem) : dest.inicioAulas ? `Aulas em ${fmtDate(dest.inicioAulas)}` : 'Data a definir';
    const place = (label, main, sub, ic) => h('div', { class: 'tv-place' }, h('small', {}, label), h('strong', {}, main), sub ? h('span', {}, sub) : null, ic ? h('span', { class: 'tv-place-ic' }, ic) : null);
    const originSelect = !o.iata || o.sugerido ? originPicker() : null;
    return h('section', { class: 'tv-hero' },
      h('div', { class: 'tv-hero-top' },
        h('div', {}, h('h1', {}, 'Minha viagem'), h('p', { class: 'tv-sub' }, 'Vamos organizar sua chegada ao exterior.')),
        VisaHint()),
      h('div', { class: 'tv-route-line' },
        place('Origem', o.nome || 'Defina sua cidade', `${o.pais || 'Brasil'}${o.iata ? ` · ${o.iata}` : ''}`),
        h('div', { class: 'tv-flight-path', 'aria-hidden': 'true' }, h('span', { class: 'tv-dot' }), h('span', { class: 'tv-dash' }), h('span', { class: 'tv-plane' }, icon('plane', { size: 18 })), h('span', { class: 'tv-dash' }), h('span', { class: 'tv-dot' })),
        place('Destino', dest.cidade || 'Destino da jornada', dest.pais),
        place('Universidade', dest.universidade?.sigla || '-', dest.universidade?.nome),
        place('Data prevista', data, d.dataViagem ? 'data da viagem' : null)),
      originSelect,
      d.status === 'pesquisando' ? h('div', { class: 'tv-hero-actions' },
        h('button', { type: 'button', class: 'btn btn-cta btn-lg', onClick: () => { ui.showWizard = true; draw(); document.querySelector('.tv-wizard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, icon('search', { size: 18 }), ' Encontrar minha rota'),
        h('button', { type: 'button', class: 'tv-link', onClick: () => FlightQuoteImporter() }, 'Já encontrei uma passagem, adicionar cotação')) : null);
  }

  function originPicker() {
    const sel = h('select', { 'aria-label': 'Aeroporto de origem' }, h('option', { value: '' }, 'Escolha o aeroporto'), Object.entries(d.aeroportosBrasil).map(([k, v]) => h('option', { value: k, selected: k === d.origem.iata }, `${v} (${k})`)));
    sel.addEventListener('change', () => sel.value && call('put', '/profile', { origemIata: sel.value }, 'Origem salva.'));
    return h('div', { class: 'tv-origin' }, icon('pin', { size: 14 }), h('span', {}, d.origem.sugerido ? `Sugerimos ${d.origem.nome} pelo seu estado. É de lá que você vai sair?` : 'De qual aeroporto você vai sair?'), sel,
      d.origem.sugerido ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => call('put', '/profile', { origemIata: d.origem.iata }, 'Origem confirmada.') }, 'Sim, confirmar') : null);
  }

  function VisaHint() {
    const a = d.visto.aviso;
    if (!a) return h('span', { class: 'tv-pill is-ok' }, icon('check', { size: 12 }), ' Visto aprovado: bom momento para comprar');
    const det = h('details', { class: `tv-visa ${a.nivel === 'alto' ? 'is-high' : ''}` }, h('summary', {}, icon('shield', { size: 13 }), ` ${a.titulo}`),
      h('div', {}, h('p', {}, a.texto), h('p', { class: 'small' }, a.detalhe)));
    return det;
  }

  // ---------------------------------------------------------------------------
  function TravelStatusCard() {
    const q = d.escolhida;
    const custo = q?.custo;
    return h('section', { class: 'tv-status' },
      h('div', { class: 'tv-status-main' },
        h('small', { class: 'tv-eyebrow' }, d.status === 'concluida' ? 'Viagem concluída' : 'Minha próxima viagem'),
        h('h2', {}, `${d.origem.nome || 'Brasil'} → ${d.destino.cidade || 'Destino'}`),
        h('div', { class: 'tv-status-grid' },
          stat('Data da partida', q?.dataViagem ? fmtDate(q.dataViagem) : 'A definir'),
          stat('Rota escolhida', q?.percursoNome || q?.rota || '-'),
          stat('Custo previsto', custo?.total !== null && custo?.total !== undefined ? `${money(custo.total, q.moeda)}${custo.completo ? '' : ' + itens a confirmar'}` : 'Preço a consultar'),
          stat('Situação', d.statusLabel)),
        Stepper(),
        h('div', { class: 'tv-status-actions' },
          act('Ver itinerário', 'map', () => document.querySelector('.tv-itin')?.scrollIntoView({ behavior: 'smooth' })),
          act('Comparar outra rota', 'scale', () => { ui.showCompare = !ui.showCompare; draw(); }),
          act('Editar viagem', 'edit', () => FlightQuoteImporter(q)),
          act('Abrir Agenda', 'calendar', null, '#/agenda'),
          d.destino.journeyId ? act('Ver documentos', 'file', null, `#/j/${d.destino.journeyId}/m/6.4`) : null,
          act('Preparar chegada', 'pin', () => document.querySelector('.tv-arrival')?.scrollIntoView({ behavior: 'smooth' })))),
      q && !q.comprada && d.status !== 'concluida' ? PurchaseBox(q) : null);
  }
  const stat = (label, value) => h('div', { class: 'tv-stat' }, h('small', {}, label), h('strong', {}, value));
  const act = (label, ic, onClick, href) => (href ? h('a', { class: 'tv-act', href }, icon(ic, { size: 15 }), label) : h('button', { type: 'button', class: 'tv-act', onClick }, icon(ic, { size: 15 }), label));

  function Stepper() {
    return h('ol', { class: 'tv-steps' }, d.etapasStatus.map((s) => h('li', { class: `${s.feito ? 'done' : ''} ${s.id === d.status ? 'now' : ''}` }, h('span', {}, s.feito ? icon('check', { size: 11 }) : ''), s.rotulo)));
  }

  function PurchaseBox(q) {
    const chk = h('input', { type: 'checkbox', id: 'tv-buy' });
    const tarifa = h('select', { 'aria-label': 'Tipo de tarifa' }, h('option', { value: 'desconhecida' }, 'Não sei a tarifa'), h('option', { value: 'flexivel' }, 'Com remarcação/reembolso'), h('option', { value: 'nao-reembolsavel' }, 'Não reembolsável'));
    const btn = h('button', { type: 'button', class: 'btn btn-cta', disabled: true, onClick: () => call('post', `/quotes/${q.id}/purchase`, { comprada: true, tarifa: tarifa.value, confirmo: true }, 'Passagem registrada como comprada. O custo passou a "confirmado" no seu planejamento.') }, icon('check', { size: 15 }), ' Registrar compra');
    chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
    return h('div', { class: 'tv-buy' },
      h('div', {}, h('strong', {}, 'Já comprou esta passagem?'), h('p', { class: 'small' }, d.visto.aprovado ? 'Registre aqui para atualizar o seu planejamento financeiro e a agenda.' : 'Com o visto ainda não aprovado, prefira tarifa com remarcação ou reembolso.')),
      tarifa, h('label', { class: 'check', for: 'tv-buy' }, chk, h('span', {}, 'Comprei no site da companhia ou agência')), btn);
  }

  // ---------------------------------------------------------------------------
  function RouteDiscovery() {
    const routes = d.percursos;
    if (!routes.length) return h('section', { class: 'tv-section' }, h('h2', {}, 'Como você pode chegar ao seu destino?'), h('p', { class: 'muted' }, 'Ainda não temos percursos cadastrados para esta cidade. Você pode adicionar a sua cotação.'));
    return h('section', { class: 'tv-section' },
      h('div', { class: 'tv-section-head' }, h('div', {}, h('h2', {}, 'Como você pode chegar ao seu destino?'), h('p', { class: 'muted' }, 'Percursos possíveis, não voos confirmados. Os preços aparecem quando você salva uma cotação.')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => ask(`Compensa mais ir para ${d.destino.cidade || 'o destino'} por Madri ou por Málaga?`) }, icon('chat', { size: 14 }), ' Qual compensa mais?')),
      h('div', { class: 'tv-routes' }, routes.map(TravelRouteCard)));
  }

  function TravelRouteCard(r) {
    const preco = r.precoConhecido;
    // Cidades do percurso sem repetição ("Madri (MAD)" e "Madri, estação" viram uma só parada).
    const city = (s) => s.replace(/(,| —).*$/, '').replace(/ \([A-Z]{3}\)$/, '').trim();
    const stops = [d.origem.iata || 'Brasil', ...r.etapas.map((e) => city(e.para)), d.destino.cidade || 'Destino'].filter((x, i, a) => i === 0 || x !== a[i - 1]);
    return h('article', { class: `tv-route ${r.escolhida ? 'is-chosen' : ''}` },
      h('div', { class: 'tv-route-img' }, h('img', { src: r.imagem, alt: '', loading: 'lazy' }), r.escolhida ? h('span', { class: 'tv-pill is-ok tv-route-badge' }, icon('check', { size: 12 }), ' Escolhida') : null),
      h('div', { class: 'tv-route-body' },
        h('h3', {}, r.nome),
        h('p', { class: 'tv-route-path' }, stops.map((s, i) => [i ? h('span', { class: 'tv-arrow' }, '→') : null, h('span', {}, s)])),
        h('ul', { class: 'tv-route-facts' },
          h('li', {}, icon('plane', { size: 13 }), ` Aeroporto: ${r.aeroportos.join(', ')}`),
          h('li', {}, icon('refresh', { size: 13 }), ` ${r.conexoesInformadas !== null ? `${r.conexoesInformadas} conexão(ões) na sua cotação` : r.conexoesAereasTipicas}`),
          h('li', {}, hubIcon(r.terrestre ? 'bus' : 'walk', { size: 13 }), r.terrestre ? ' Inclui trecho por terra até a cidade' : ' Chega direto à cidade'),
          r.bagagemIncluida !== null ? h('li', {}, icon('luggage', { size: 13 }), r.bagagemIncluida ? ' Bagagem incluída na cotação' : ' Bagagem paga à parte') : null),
        h('div', { class: 'tv-route-foot' },
          preco ? h('div', { class: 'tv-price' }, h('strong', {}, money(preco.total, preco.moeda)), h('small', {}, `${preco.completo ? 'total cotado' : 'parcial'} · ${fmtDate(preco.cotadoEm)}`)) : h('div', { class: 'tv-price is-unknown' }, h('strong', {}, 'Preço a consultar'), h('small', {}, 'sem cotação salva')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => RouteDetails(r) }, 'Ver detalhes'))));
  }

  function RouteDetails(r) {
    const s = sheet(r.nome, 'plane');
    mount(s.body,
      h('img', { class: 'tv-detail-img', src: r.imagem, alt: '' }),
      h('p', { class: 'tv-lead' }, r.resumo),
      h('ol', { class: 'tv-mini-itin' }, [{ para: d.origem.nome || 'Sua cidade', meio: null }, ...r.etapas].map((e, i) => h('li', {}, h('span', { class: 'tv-node' }, hubIcon(i === 0 ? 'pin' : MEIO_ICON[e.meio] || 'pin', { size: 14 })), h('div', {}, h('strong', {}, i === 0 ? e.para : e.para), i ? h('small', {}, e.rotulo) : h('small', {}, 'Saída'))))),
      r.atencao.length ? h('div', { class: 'tv-notes' }, r.atencao.map((t) => h('p', {}, icon('alert', { size: 13 }), ' ', t))) : null,
      h('div', { class: 'tv-detail-actions' },
        r.busca.length ? h('div', {}, h('small', { class: 'tv-eyebrow' }, 'Pesquisar passagens (preços reais no site)'), h('div', { class: 'row wrap' }, r.busca.map((b) => h('a', { class: 'btn btn-ghost btn-sm', href: b.url, target: '_blank', rel: 'noopener noreferrer' }, b.rotulo, ' ', icon('external', { size: 12 }))))) : h('p', { class: 'small muted' }, 'Defina o aeroporto de origem para gerar os links de pesquisa.'),
        h('button', { type: 'button', class: 'btn btn-cta', onClick: () => { s.close(); FlightQuoteImporter(null, r); } }, icon('plane', { size: 15 }), ' Salvar cotação desta rota'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { s.close(); ask(`Quero ir para ${d.destino.cidade} ${r.nome.toLowerCase()}. O que preciso saber?`); } }, icon('chat', { size: 14 }), ' Perguntar ao Mentor')),
      h('div', { class: 'tv-sources' }, h('small', {}, 'Fontes oficiais: '), r.fontes.map((f, i) => [i ? ' · ' : '', h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.titulo)])),
      h('p', { class: 'hint' }, 'Horários, duração e preços dependem da data e da companhia: confira sempre no site antes de comprar.'));
  }

  // ---------------------------------------------------------------------------
  // Busca guiada: só o necessário (origem, data, malas, orçamento opcional).
  function Wizard() {
    const p = d.perfil || {};
    const step = ui.step ?? 0;
    const next = (n) => { ui.step = n; draw(); };
    const qs = [
      () => {
        const sel = h('select', { 'aria-label': 'Aeroporto de origem' }, h('option', { value: '' }, 'Escolha'), Object.entries(d.aeroportosBrasil).map(([k, v]) => h('option', { value: k, selected: k === d.origem.iata }, `${v} (${k})`)));
        return [h('h3', {}, 'De onde você vai sair?'), sel, h('button', { type: 'button', class: 'btn btn-cta', onClick: async () => { if (!sel.value) return toast('Escolha o aeroporto.', 'err'); if (await call('put', '/profile', { origemIata: sel.value })) next(1); } }, 'Continuar')];
      },
      () => {
        const dt = h('input', { type: 'date', value: p.dataIda || '', 'aria-label': 'Data da viagem' });
        const flex = h('input', { type: 'checkbox', checked: Boolean(p.dataFlexivel) });
        return [h('h3', {}, 'Quando pretende viajar?'), d.destino.inicioAulas ? h('p', { class: 'small muted' }, `Suas aulas começam em ${fmtDate(d.destino.inicioAulas)}. Chegar alguns dias antes ajuda nos primeiros trâmites.`) : null, dt, h('label', { class: 'check' }, flex, h('span', {}, 'Tenho flexibilidade de alguns dias')),
          h('button', { type: 'button', class: 'btn btn-cta', onClick: async () => { if (await call('put', '/profile', { dataIda: dt.value || '', dataFlexivel: flex.checked })) next(2); } }, 'Continuar')];
      },
      () => [h('h3', {}, 'Vai despachar bagagem?'), h('p', { class: 'small muted' }, 'Malas despachadas mudam bastante o custo total.'),
        h('div', { class: 'tv-choices' }, [0, 1, 2, 3].map((n) => h('button', { type: 'button', class: `tv-choice ${p.malas === n ? 'on' : ''}`, onClick: async () => { if (await call('put', '/profile', { malas: n })) next(3); } }, icon('luggage', { size: 18 }), n === 0 ? 'Só bagagem de mão' : `${n} mala${n > 1 ? 's' : ''}`)))],
      () => {
        const v = h('input', { type: 'number', min: 0, step: 50, value: p.orcamento ?? '', placeholder: 'Opcional', 'aria-label': 'Orçamento' });
        const moeda = h('select', { 'aria-label': 'Moeda' }, h('option', { value: 'EUR' }, '€'), h('option', { value: 'BRL', selected: p.moeda === 'BRL' }, 'R$'));
        return [h('h3', {}, 'Qual é seu orçamento aproximado para a viagem?'), h('div', { class: 'row' }, moeda, v),
          h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn btn-cta', onClick: async () => { if (await call('put', '/profile', { orcamento: v.value === '' ? null : Number(v.value), moeda: moeda.value })) { ui.showWizard = false; ui.step = 0; draw(); document.querySelector('.tv-routes')?.scrollIntoView({ behavior: 'smooth' }); } } }, 'Ver minhas opções'),
            h('button', { type: 'button', class: 'tv-link', onClick: () => { ui.showWizard = false; ui.step = 0; draw(); } }, 'Pular'))];
      },
    ];
    return h('section', { class: 'tv-wizard' },
      h('div', { class: 'tv-wizard-dots' }, qs.map((_, i) => h('span', { class: i <= step ? 'on' : '' }))),
      h('div', { class: 'tv-wizard-q' }, qs[step]()),
      h('p', { class: 'hint' }, `Destino: ${d.destino.cidade || 'da sua jornada'}, você não precisa informar de novo.`));
  }

  // ---------------------------------------------------------------------------
  // Adicionar passagem por link (ou editar uma cotação).
  function FlightQuoteImporter(quote = null, route = null) {
    const s = sheet(quote ? 'Editar cotação' : 'Adicionar cotação', 'plane');
    const q = quote || {};
    const tpl = route || d.percursos.find((r) => r.id === q.percursoId) || null;
    const link = h('input', { type: 'url', placeholder: 'https://… (link da passagem que você encontrou)', value: q.link || '', 'aria-label': 'Link da passagem' });
    const found = h('div', { class: 'tv-found' });
    const f = {
      rota: h('input', { value: q.rota || (tpl ? `${d.origem.nome || 'Brasil'} → ${tpl.nome.replace('Via ', '')} → ${d.destino.cidade}` : ''), maxlength: 120, required: true, 'aria-label': 'Nome da rota' }),
      voo: h('input', { type: 'number', min: 0, step: 10, value: q.voo ?? '', placeholder: 'ex.: 650', 'aria-label': 'Preço' }),
      moeda: h('select', { 'aria-label': 'Moeda' }, h('option', { value: 'EUR' }, '€'), h('option', { value: 'BRL', selected: q.moeda === 'BRL' }, 'R$')),
      dataViagem: h('input', { type: 'date', value: q.dataViagem || d.perfil?.dataIda || '', 'aria-label': 'Data da viagem' }),
      percursoId: h('select', { 'aria-label': 'Percurso' }, h('option', { value: '' }, 'Outro percurso'), d.percursos.map((r) => h('option', { value: r.id, selected: r.id === (tpl?.id || q.percursoId) }, r.nome))),
    };
    const num = (k, label, step = 5) => { const i = h('input', { type: 'number', min: 0, step, value: q[k] ?? '', 'aria-label': label }); f[k] = i; return h('label', {}, h('span', {}, label), i); };
    const txt = (k, label, extra = {}) => { const i = h('input', { value: q[k] ?? '', ...extra, 'aria-label': label }); f[k] = i; return h('label', {}, h('span', {}, label), i); };
    const tarifa = h('select', { 'aria-label': 'Tarifa' }, ['desconhecida', 'flexivel', 'nao-reembolsavel'].map((v) => h('option', { value: v, selected: q.tarifa === v }, { desconhecida: 'Não sei', flexivel: 'Com remarcação/reembolso', 'nao-reembolsavel': 'Não reembolsável' }[v])));
    const separados = h('input', { type: 'checkbox', checked: Boolean(q.bilhetesSeparados) });
    link.addEventListener('change', async () => {
      if (!link.value.startsWith('https://')) return;
      try {
        const r = await api.post('/travel/quotes/parse-link', { link: link.value });
        if (r.data && !f.dataViagem.value) f.dataViagem.value = r.data;
        if (r.percursoId) f.percursoId.value = r.percursoId;
        if (r.origem && r.destino && !f.rota.value) f.rota.value = `${r.origem} → ${r.destino}${d.destino.cidade && r.destino !== 'GRX' ? ` → ${d.destino.cidade}` : ''}`;
        mount(found, r.extraido.length ? h('p', { class: 'tv-ok' }, icon('check', { size: 13 }), ` Do link: ${[r.origem && `origem ${r.origem}`, r.destino && `destino ${r.destino}`, r.data && `data ${fmtDate(r.data)}`].filter(Boolean).join(' · ')} (${r.site})`) : null, h('p', { class: 'small muted' }, r.aviso));
      } catch (e) { mount(found, h('p', { class: 'small muted' }, e.message)); }
    });
    const form = h('form', { class: 'tv-form' },
      h('label', { class: 'tv-big' }, h('span', {}, 'Cole o link da passagem que encontrou'), link), found,
      h('div', { class: 'tv-form-grid' },
        h('label', {}, h('span', {}, 'Nome da rota'), f.rota),
        h('label', {}, h('span', {}, 'Percurso'), f.percursoId),
        h('label', {}, h('span', {}, 'Preço do voo (ou total conhecido)'), h('div', { class: 'row' }, f.moeda, f.voo)),
        h('label', {}, h('span', {}, 'Data da viagem'), f.dataViagem)),
      h('details', { class: 'tv-more', open: Boolean(quote) }, h('summary', {}, 'Mais detalhes (opcional), bagagem, trecho por terra, conexões'),
        h('div', { class: 'tv-form-grid' },
          num('bagagem', 'Bagagem despachada'), num('terrestre', 'Trecho até a cidade (ônibus/trem)'), num('transporteLocal', 'Transporte local até a moradia'), num('pernoite', 'Pernoite (se precisar)', 10),
          num('conexoes', 'Conexões', 1), num('malasIncluidas', 'Malas incluídas', 1), txt('horarioChegada', 'Horário de chegada', { type: 'time' }), txt('companhia', 'Companhia aérea', { maxlength: 60 }),
          h('label', {}, h('span', {}, 'Tarifa'), tarifa)),
        h('label', { class: 'check' }, separados, h('span', {}, 'Os voos foram comprados em bilhetes separados'))),
      h('p', { class: 'hint' }, `Cotado em ${fmtDate(new Date().toISOString().slice(0, 10))}. Preços de passagens mudam: confira antes de comprar.`),
      h('button', { type: 'submit', class: 'btn btn-cta btn-lg' }, icon('check', { size: 16 }), quote ? ' Salvar alterações' : ' Salvar cotação'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = (i) => (i.value === '' ? null : Number(i.value));
      const body = {
        rota: f.rota.value.trim(), percursoId: f.percursoId.value || null, link: link.value.trim(), moeda: f.moeda.value, voo: n(f.voo), dataViagem: f.dataViagem.value,
        bagagem: n(f.bagagem), terrestre: n(f.terrestre), transporteLocal: n(f.transporteLocal), pernoite: n(f.pernoite), conexoes: n(f.conexoes), malasIncluidas: n(f.malasIncluidas),
        horarioChegada: f.horarioChegada.value, companhia: f.companhia.value.trim(), tarifa: tarifa.value, bilhetesSeparados: separados.checked,
      };
      if (!quote) for (const k of Object.keys(body)) if (body[k] === null || body[k] === '') delete body[k];
      if (body.rota.length < 3) return toast('Dê um nome à rota (ex.: Recife → Madri → Granada).', 'err');
      if (await call(quote ? 'put' : 'post', quote ? `/quotes/${quote.id}` : '/quotes', body, quote ? 'Cotação atualizada.' : 'Cotação salva.')) s.close();
    });
    mount(s.body, form);
    queueMicrotask(() => (quote ? f.rota : link).focus());
  }

  // ---------------------------------------------------------------------------
  function RouteComparison() {
    const list = d.cotacoes;
    if (!list.length) return null;
    const max = Math.max(...list.map((c) => c.custo.total || 0), 1);
    const cell = (c, id) => { const p = c.custo.partes.find((x) => x.id === id); return p.valor === null ? h('span', { class: 'muted' }, '-') : money(p.valor, c.moeda); };
    const rows = [['voo', 'Voo'], ['bagagem', 'Bagagem'], ['terrestre', 'Até a cidade'], ['transporteLocal', 'Transporte local'], ['pernoite', 'Pernoite']].filter(([id]) => list.some((c) => c.custo.partes.find((p) => p.id === id).valor !== null) || ['voo', 'bagagem', 'terrestre'].includes(id));
    return h('section', { class: 'tv-section tv-compare' },
      h('div', { class: 'tv-section-head' }, h('div', {}, h('h2', {}, 'Comparar minhas cotações'), h('p', { class: 'muted' }, 'O total considera voo, bagagem e transporte. A mais barata nem sempre é a melhor: veja os alertas.')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => FlightQuoteImporter() }, icon('plane', { size: 14 }), ' Adicionar cotação')),
      h('div', { class: 'tv-quotes' }, list.map((c) => h('article', { class: `tv-quote ${c.escolhida ? 'is-chosen' : ''}` },
        h('header', {}, h('div', {}, h('strong', {}, c.rota), h('small', { class: 'muted' }, `${c.percursoNome || 'Percurso próprio'} · cotada em ${fmtDate(c.cotadoEm) || '-'}${c.fonte ? ` · ${c.fonte}` : ''}`)),
          c.escolhida ? h('span', { class: `tv-pill ${c.comprada ? 'is-ok' : 'is-accent'}` }, c.comprada ? 'Comprada' : 'Escolhida') : null),
        h('dl', { class: 'tv-costs' }, rows.map(([id, label]) => [h('dt', {}, label), h('dd', {}, cell(c, id))]),
          h('dt', { class: 'tv-total' }, 'Total'), h('dd', { class: 'tv-total' }, c.custo.total === null ? 'Preço a consultar' : money(c.custo.total, c.moeda))),
        c.custo.total !== null ? (() => { const b = h('span', {}); b.style.width = `${Math.round((c.custo.total / max) * 100)}%`; return h('div', { class: 'tv-bar' }, b); })() : null,
        h('p', { class: 'small' }, !c.custo.completo ? h('span', { class: 'tv-warn' }, `Faltam: ${c.custo.desconhecidas.map((x) => ({ bagagem: 'bagagem', terrestre: 'trecho por terra' }[x])).join(' e ')}, o total pode subir.`) : c.diferencaParaMenor === 0 ? h('span', { class: 'tv-good' }, 'Menor custo total entre as completas') : c.diferencaParaMenor ? `+${money(c.diferencaParaMenor, c.moeda)} que a mais barata` : null),
        c.consideracoes.length ? h('ul', { class: 'tv-cons' }, c.consideracoes.map((x) => h('li', { class: `n-${x.nivel}` }, icon(x.nivel === 'risco' ? 'alert' : x.nivel === 'atencao' ? 'clock' : 'help', { size: 12 }), ' ', x.texto))) : null,
        h('div', { class: 'tv-quote-actions' },
          c.escolhida ? null : h('button', { type: 'button', class: 'btn btn-cta btn-sm', onClick: () => call('post', `/quotes/${c.id}/choose`, {}, 'Rota escolhida. O custo entrou no seu planejamento como estimativa.') }, 'Escolher esta rota'),
          c.link ? h('a', { class: 'btn btn-ghost btn-sm', href: c.link, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir cotação ', icon('external', { size: 11 })) : null,
          h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Editar', onClick: () => FlightQuoteImporter(c) }, icon('edit', { size: 13 })),
          h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Excluir', onClick: () => call('del', `/quotes/${c.id}`, undefined, 'Cotação removida.') }, icon('trash', { size: 13 })))))));
  }

  // ---------------------------------------------------------------------------
  function TravelSegment(e, last) {
    const meta = [e.data && fmtDate(e.data), e.horario && `chegada ${e.horario}`, e.operador, e.custo !== null && e.custo !== undefined ? money(e.custo) : null].filter(Boolean);
    return h('li', { class: `tv-seg s-${e.status}` },
      h('span', { class: 'tv-seg-node' }, hubIcon(MEIO_ICON[e.meio] || 'pin', { size: 16 })),
      h('div', { class: 'tv-seg-body' },
        h('strong', {}, e.para),
        h('span', { class: 'tv-seg-how' }, e.rotulo),
        meta.length ? h('small', {}, meta.join(' · ')) : h('small', { class: 'muted' }, 'Detalhes a definir'),
        e.status === 'comprado' ? h('span', { class: 'tv-pill is-ok' }, 'Comprado') : e.status === 'a-definir' ? h('a', { class: 'tv-pill is-warn', href: '#/novo-lar' }, 'Escolher moradia') : null),
      last ? null : h('span', { class: 'tv-seg-line', 'aria-hidden': 'true' }));
  }

  function TravelItinerary() {
    const it = d.itinerario;
    if (!it) return null;
    return h('section', { class: 'tv-section tv-itin' },
      h('div', { class: 'tv-section-head' }, h('div', {}, h('h2', {}, 'Meu itinerário'), h('p', { class: 'muted' }, `${it.percurso}. Atualiza sozinho quando você muda a rota.`))),
      h('ol', { class: 'tv-timeline' },
        h('li', { class: 'tv-seg s-origem' }, h('span', { class: 'tv-seg-node' }, icon('pin', { size: 16 })), h('div', { class: 'tv-seg-body' }, h('strong', {}, `${d.origem.nome || 'Sua cidade'} 🇧🇷`), h('span', { class: 'tv-seg-how' }, 'Saída')), h('span', { class: 'tv-seg-line', 'aria-hidden': 'true' })),
        it.etapas.map((e, i) => TravelSegment(e, i === it.etapas.length - 1))));
  }

  // ---------------------------------------------------------------------------
  function ArrivalPlanner() {
    const c = d.chegada;
    if (!d.escolhida && !c.registrada) return null;
    const MEIOS = [['onibus', 'Ônibus', 'bus'], ['trem', 'Trem', 'train'], ['taxi', 'Táxi', 'car'], ['carro', 'Carona / app', 'car'], ['ape', 'A pé', 'walk']];
    const sel = { meio: c.meio || null };
    const btns = h('div', { class: 'tv-choices' }, MEIOS.map(([id, l, ic]) => h('button', { type: 'button', class: `tv-choice ${sel.meio === id ? 'on' : ''}`, 'aria-pressed': String(sel.meio === id), onClick: (ev) => { sel.meio = id; btns.querySelectorAll('.tv-choice').forEach((b) => { b.classList.toggle('on', b === ev.currentTarget); b.setAttribute('aria-pressed', String(b === ev.currentTarget)); }); } }, hubIcon(ic, { size: 18 }), l)));
    const data = h('input', { type: 'date', value: c.data || '', 'aria-label': 'Data de chegada' });
    const hora = h('input', { type: 'time', value: c.horario || '', 'aria-label': 'Horário de chegada' });
    return h('section', { class: 'tv-section tv-arrival' },
      h('h2', {}, 'Minha chegada à Espanha'),
      c.frase ? h('p', { class: 'tv-lead' }, c.frase) : null,
      h('div', { class: 'tv-arrival-grid' },
        h('div', { class: 'tv-arrival-card' }, h('small', {}, 'Aeroporto de chegada'), h('strong', {}, c.aeroporto || 'Defina a rota'), h('span', {}, 'da rota escolhida')),
        h('div', { class: 'tv-arrival-card' }, h('small', {}, 'Data e horário previstos'), h('div', { class: 'row' }, data, hora)),
        h('div', { class: 'tv-arrival-card' }, h('small', {}, 'Endereço de destino'), c.moradia ? [h('strong', {}, c.moradia.nome), h('span', {}, c.moradia.bairro || 'Do "Meu novo lar"')] : [h('strong', {}, 'Você ainda não escolheu onde vai ficar.'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/novo-lar' }, 'Organizar minha moradia')])),
      c.opcoes.length ? h('div', { class: 'tv-legs' }, h('small', { class: 'tv-eyebrow' }, 'Do aeroporto até a cidade'), c.opcoes.map((o) => h('p', {}, icon('arrow', { size: 13 }), ` ${o.de} → ${o.para}: ${o.rotulo}`)),
        h('p', { class: 'tv-sources' }, 'Consulte horários e preços nos sites oficiais: ', c.fontes.map((f, i) => [i ? ' · ' : '', h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.titulo)]))) : null,
      h('div', {}, h('small', { class: 'tv-eyebrow' }, 'Como vou chegar à minha moradia?'), btns),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn btn-cta', onClick: () => call('put', '/arrival', { aeroporto: c.aeroporto || undefined, data: data.value, horario: hora.value, ...(sel.meio ? { meio: sel.meio } : {}) }, 'Chegada salva e adicionada ao itinerário.') }, icon('check', { size: 15 }), ' Adicionar ao meu itinerário'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => ask('Como chego do aeroporto até minha casa?') }, icon('chat', { size: 14 }), ' Perguntar ao Mentor')));
  }

  // ---------------------------------------------------------------------------
  function TravelCostSummary() {
    const fin = d.financeiro;
    if (!d.escolhida || !fin) return null;
    const c = d.escolhida.custo;
    return h('section', { class: 'tv-section tv-cost' },
      h('h2', {}, 'Custo da viagem no meu planejamento'),
      h('div', { class: 'tv-cost-row' },
        c.partes.filter((p) => p.valor !== null).map((p) => h('div', { class: 'tv-stat' }, h('small', {}, p.rotulo), h('strong', {}, money(p.valor, d.escolhida.moeda)))),
        h('div', { class: 'tv-stat is-main' }, h('small', {}, 'Total'), h('strong', {}, money(c.total, d.escolhida.moeda)))),
      h('p', { class: 'small' }, h('span', { class: `tv-pill ${fin.status === 'confirmado' ? 'is-ok' : 'is-warn'}` }, fin.status === 'confirmado' ? 'Confirmado (comprado)' : 'Estimado (cotação)'), ' Entra uma única vez como "Passagens" no simulador financeiro. ', h('a', { href: '#/financiamento' }, 'Ver planejamento')));
  }

  // ---------------------------------------------------------------------------
  function TravelAgenda() {
    const a = d.agenda;
    if (!a.sugestoes.base && !a.alteracoes.length) return null;
    const pend = a.sugestoes.itens.filter((i) => !i.jaCriado);
    const rows = pend.map((i) => {
      const chk = h('input', { type: 'checkbox', checked: i.horarioConhecido, 'aria-label': i.titulo });
      const ini = h('input', { type: 'time', value: i.inicio || '', 'aria-label': 'Início' });
      const fim = h('input', { type: 'time', value: i.fim || '', 'aria-label': 'Fim' });
      return { i, chk, ini, fim, el: h('li', {}, h('label', { class: 'check' }, chk, h('span', {}, h('strong', {}, fmtDate(i.data)), ` · ${i.titulo}`)), h('div', { class: 'row' }, ini, fim)) };
    });
    const create = async () => {
      const itens = rows.filter((r) => r.chk.checked).map((r) => ({ chave: r.i.chave, data: r.i.data, inicio: r.ini.value, fim: r.fim.value, titulo: r.i.titulo }));
      if (!itens.length) return toast('Marque ao menos um compromisso.', 'err');
      if (itens.some((x) => !x.inicio || !x.fim || x.fim <= x.inicio)) return toast('Defina início e fim de cada compromisso marcado.', 'err');
      await call('post', '/agenda', { itens }, 'Compromissos criados na Agenda.');
    };
    return h('section', { class: 'tv-section tv-agenda' },
      h('h2', {}, 'Compromissos da viagem'),
      a.alteracoes.length ? h('div', { class: 'tv-changes' }, h('strong', {}, 'A data da sua viagem mudou.'), h('p', { class: 'small' }, 'Quer atualizar estes compromissos? Nada muda sem a sua confirmação.'),
        h('ul', {}, a.alteracoes.map((c) => h('li', {}, `${c.titulo}: ${fmtDate(c.dataAtual)} → ${fmtDate(c.novaData)}`))),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-cta btn-sm', onClick: () => call('post', '/agenda/changes', { aceitar: a.alteracoes.map((c) => c.eventId) }, 'Agenda atualizada.') }, 'Atualizar datas'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => call('post', '/agenda/changes', { aceitar: [], recusar: a.alteracoes.map((c) => c.eventId) }, 'Datas mantidas.') }, 'Manter como está'))) : null,
      pend.length ? [h('p', { class: 'small muted' }, `A partir da viagem em ${fmtDate(a.sugestoes.base)}. Escolha o que entra na sua agenda; horários do voo você define.`), h('ul', { class: 'tv-agenda-list' }, rows.map((r) => r.el)),
        h('button', { type: 'button', class: 'btn btn-cta', onClick: create }, icon('calendar', { size: 15 }), ' Criar na Agenda')] : h('p', { class: 'small muted' }, 'Os compromissos da viagem já estão na sua agenda.'));
  }

  // ---------------------------------------------------------------------------
  function MentorBar() {
    const qs = ['Qual é a melhor forma de chegar a Granada?', 'Quanto vou gastar com bagagem?', 'Essa conexão é muito curta?'];
    return h('section', { class: 'tv-mentor' }, h('span', { class: 'tv-mentor-ic' }, icon('chat', { size: 16 })),
      h('div', {}, h('strong', {}, 'Dúvidas sobre a viagem? Pergunte ao Mentor'), h('div', { class: 'chips' }, qs.map((q) => h('button', { type: 'button', class: 'chip', onClick: () => ask(q.replace('Granada', d.destino.cidade || 'Granada')) }, q.replace('Granada', d.destino.cidade || 'Granada'))))));
  }

  // ---------------------------------------------------------------------------
  // Preços vistos agora (referência) + alerta de preço. Recolhido por padrão para a tela ficar limpa.
  let prices = null; // resposta de /travel/prices (carregada ao abrir)
  let pricesOpen = false;
  const jq = () => (d.destino.journeyId ? `?journeyId=${d.destino.journeyId}` : '');
  const loadPrices = async () => {
    try { prices = await api.get(`/travel/prices${jq()}`); } catch (e) { prices = { erroGeral: e.message, rotas: [] }; }
    draw();
  };
  const IATA_ROUTE = { MAD: 'via-madri', AGP: 'via-malaga', GRX: 'via-granada' };
  const saveOffer = (o) => call('post', '/quotes', {
    rota: `${o.origem} → ${o.destino}${o.companhia ? ` (${o.companhia})` : ''}`, percursoId: IATA_ROUTE[o.destino] || null,
    voo: o.preco, moeda: 'BRL', ...(o.link ? { link: o.link } : {}), fonte: 'Aviasales (preço visto, a confirmar)',
    ...(o.partida ? { dataViagem: o.partida.slice(0, 10) } : {}), ...(o.companhia ? { companhia: o.companhia } : {}), ...(o.conexoes !== null ? { conexoes: Math.min(o.conexoes, 5) } : {}),
    notas: 'Preço visto no Aviasales; bagagem e valor final a confirmar no site.',
  }, 'Cotação salva. Confirme bagagem e preço final no site antes de comprar.');
  const when = (iso) => new Date(iso || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  function LivePrices() {
    if (['comprada', 'concluida'].includes(d.status)) return null;
    const best = prices?.menor;
    const det = h('details', { class: 'tv-prices', open: pricesOpen },
      h('summary', {}, icon('plane', { size: 16 }), h('span', { class: 'tv-prices-title' }, 'Preços vistos agora'),
        h('span', { class: 'tv-prices-hint' }, best ? `a partir de ${money(best.preco, 'BRL')}` : d.alertaPreco?.ativo ? `alerta até ${money(d.alertaPreco.teto, 'BRL')}` : 'abrir'),
        icon('chevron', { size: 16, cls: 'tv-prices-chev' })));
    det.addEventListener('toggle', () => { pricesOpen = det.open; if (det.open && !prices) loadPrices(); });
    if (!pricesOpen) return det;
    if (!prices) { det.append(h('p', { class: 'muted small tv-prices-body' }, 'Consultando…')); return det; }
    const body = h('div', { class: 'tv-prices-body' });
    if (prices.erroGeral) body.append(h('p', { class: 'notice' }, prices.erroGeral));
    else if (prices.motivo) body.append(h('p', { class: 'notice' }, prices.motivo));
    for (const r of prices.rotas || []) {
      body.append(h('div', { class: 'tv-price-route' },
        h('strong', {}, `${r.origem} → ${r.destino}`),
        r.erro ? h('p', { class: 'small muted' }, `Não consegui consultar agora: ${r.erro}.`)
          : r.ofertas.length ? h('ul', {}, r.ofertas.map((o) => h('li', {},
            h('span', { class: 'tv-price' }, money(o.preco, 'BRL')),
            h('span', { class: 'small muted' }, [o.partida ? fmtDate(o.partida.slice(0, 10)) : null, o.companhia, o.conexoes === null ? null : o.conexoes === 0 ? 'direto' : `${o.conexoes} conexão(ões)`].filter(Boolean).join(' · ')),
            h('span', { class: 'tv-price-actions' },
              o.link ? h('a', { class: 'btn btn-sm btn-ghost', href: o.link, target: '_blank', rel: 'noopener noreferrer' }, 'Ver no site ', icon('external', { size: 11 })) : null,
              h('button', { type: 'button', class: 'btn btn-sm', onClick: () => saveOffer(o) }, 'Salvar como cotação')))))
            : h('p', { class: 'small muted' }, 'Nenhum preço visto recentemente para este mês.')));
    }
    if (prices.rotas?.length) body.append(h('p', { class: 'hint' }, `${prices.fonte.natureza} Fonte: ${prices.fonte.nome}. Consultado em ${when(prices.rotas[0].consultadoEm)}${prices.mes ? ` · mês ${prices.mes.split('-').reverse().join('/')}` : ''}.`));
    if (prices.configurado) body.append(PriceAlert());
    body.append(h('button', { type: 'button', class: 'tv-link', onClick: () => { prices = null; loadPrices(); } }, icon('refresh', { size: 13 }), ' Atualizar'));
    det.append(body);
    return det;
  }

  function PriceAlert() {
    const a = d.alertaPreco || {};
    const teto = h('input', { type: 'number', min: '100', step: '50', inputmode: 'numeric', value: a.teto || '', placeholder: 'Ex.: 3500', 'aria-label': 'Preço máximo em reais' });
    const save = (ativo) => call('put', `/price-alert${jq()}`, { ativo, teto: teto.value ? Number(teto.value) : null }, ativo ? 'Alerta ativado: avisamos quando aparecer um preço abaixo do seu teto.' : 'Alerta desativado.');
    return h('div', { class: 'tv-alert' },
      h('div', {}, h('strong', {}, icon('bell', { size: 14 }), ' Alerta de preço'), h('p', { class: 'small muted' }, 'Conferimos a cada 6 horas e avisamos aqui na Estuvia quando o menor preço visto ficar abaixo do seu teto. Nada é comprado.')),
      h('div', { class: 'tv-alert-row' }, h('span', {}, 'R$'), teto,
        h('button', { type: 'button', class: 'btn btn-sm btn-cta', onClick: () => save(true) }, a.ativo ? 'Atualizar alerta' : 'Ativar alerta'),
        a.ativo ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => save(false) }, 'Desativar') : null),
      a.ultimoAviso ? h('p', { class: 'small' }, `Último aviso: ${a.ultimoAviso.origem} → ${a.ultimoAviso.destino} por ${money(a.ultimoAviso.preco, 'BRL')} em ${when(a.ultimoAviso.em)}.`) : null);
  }
  // Aviso ao vivo de preço: recarrega os dados da viagem e os preços.
  onLive(root, ['preco-passagem'], async () => { try { d = await api.get('/travel'); prices = null; if (pricesOpen) loadPrices(); else draw(); } catch { /* mantém a tela */ } });

  function draw() {
    const planned = ['escolhida', 'comprada', 'concluida'].includes(d.status);
    mount(root,
      planned ? [h('div', { class: 'tv-planned-top' }, h('h1', {}, 'Minha viagem'), VisaHint()), TravelStatusCard()] : TravelHero(),
      ui.showWizard && !planned ? Wizard() : null,
      LivePrices(),
      planned ? [TravelItinerary(), ArrivalPlanner(), TravelCostSummary(), TravelAgenda(), ui.showCompare ? RouteComparison() : null] : [RouteDiscovery(), RouteComparison()],
      MentorBar(),
      h('p', { class: 'hint tv-foot' }, 'A Estuvia não vende passagens. "Preços vistos agora" são referência, com fonte e hora; os demais valores são os que você informou. Confira sempre horários e condições nos sites oficiais.'));
  }
  draw();
  return root;
}
