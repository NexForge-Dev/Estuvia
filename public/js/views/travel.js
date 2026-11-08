// Planejamento de viagem (TravelPlan): rotas cotadas pelo estudante e organização da chegada.
// Não inventa preços nem horários: os valores são as cotações informadas.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { invalidate, checkAchievements, loadJourneys } from '../app.js';

const money = (v) => `€ ${Math.round(Number(v) || 0).toLocaleString('pt-BR')}`;

export async function travelView() {
  let d = await api.get('/living');
  const journeys = await loadJourneys().catch(() => []);
  const city = journeys[0]?.destino?.cidade || 'Granada';
  const visa = journeys[0] ? (await api.get(`/journeys/${journeys[0].id}`)).journey.situacao.visto : null;
  const root = h('div', { class: 'stack-lg travel' });
  const call = async (method, url, body) => {
    try { d = await api[method](url, body); invalidate(); draw(); checkAchievements(); } catch (e) { toast(e.message, 'err'); }
  };
  const total = (o) => (Number(o.voo) || 0) + (Number(o.bagagem) || 0) + (Number(o.terrestre) || 0);
  const suggestions = city === 'Granada' ? ['Brasil → Madri → Granada', 'Brasil → Málaga → Granada', 'Brasil → Granada'] : [`Brasil → Madri → ${city}`, `Brasil → ${city}`];

  function routeForm() {
    const f = h('form', { class: 'stack' },
      h('div', { class: 'grid-3 tight' },
        h('input', { name: 'rota', placeholder: 'Rota', required: true, maxlength: 120, list: 'route-suggestions' }),
        h('input', { name: 'voo', type: 'number', min: 0, step: 10, placeholder: 'Voo (€)', required: true }),
        h('input', { name: 'bagagem', type: 'number', min: 0, step: 5, placeholder: 'Bagagem (€)' }),
        h('input', { name: 'terrestre', type: 'number', min: 0, step: 5, placeholder: 'Deslocamento terrestre (€)' }),
        h('input', { name: 'duracao', placeholder: 'Duração total (ex.: 18 h)', maxlength: 60 }),
        h('input', { name: 'fonte', placeholder: 'Onde cotou (site/agência)', maxlength: 200 })),
      h('datalist', { id: 'route-suggestions' }, suggestions.map((s) => h('option', { value: s }))),
      h('button', { class: 'btn btn-cta', type: 'submit' }, icon('plane', { size: 16 }), 'Salvar cotação'));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const body = {};
      for (const [k, v] of new FormData(f)) { if (String(v).trim() === '') continue; body[k] = ['voo', 'bagagem', 'terrestre'].includes(k) ? Number(v) : String(v).trim(); }
      call('post', '/living/travel/routes', body).then(() => f.reset());
    });
    return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('plane', { size: 18 }), 'Comparar rotas'),
      h('p', { class: 'muted small' }, `Sugestões para ${city}: ${suggestions.join(' · ')}. Informe as cotações que você encontrou; integrações com buscadores de passagens poderão vir no futuro.`), f);
  }

  function routes() {
    if (!d.travel.opcoes.length) return h('p', { class: 'empty-inline' }, 'Nenhuma cotação registrada ainda.');
    const min = Math.min(...d.travel.opcoes.map(total));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'cmp' },
      h('thead', {}, h('tr', {}, ['Rota', 'Voo', 'Bagagem', 'Terrestre', 'Total', 'Cotado em', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, [...d.travel.opcoes].sort((a, b) => total(a) - total(b)).map((o) => h('tr', { class: o.escolhida ? 'chosen' : '' },
        h('td', {}, o.rota, total(o) === min ? h('span', { class: 'tag tag-ok' }, 'Menor custo') : null, o.fonte ? h('small', { class: 'muted' }, ` · ${o.fonte}`) : null),
        h('td', {}, money(o.voo)), h('td', {}, money(o.bagagem)), h('td', {}, money(o.terrestre)), h('td', {}, h('strong', {}, money(total(o)))), h('td', {}, o.cotadoEm || '-'),
        h('td', {}, h('div', { class: 'row' },
          o.escolhida ? h('span', { class: 'chip-status st-concluida' }, 'Escolhida') : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => call('put', `/living/travel/routes/${o.id}`, { escolhida: true }) }, 'Escolher'),
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Excluir', onClick: () => call('del', `/living/travel/routes/${o.id}`) }, icon('trash', { size: 13 })))))))));
  }

  function arrival() {
    const c = d.travel.chegada || {};
    const f = h('form', { class: 'stack' },
      h('div', { class: 'grid-2 tight' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Aeroporto de chegada'), h('input', { name: 'aeroporto', value: c.aeroporto || '', maxlength: 100 })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Data prevista'), h('input', { name: 'data', type: 'date', value: c.data || '' })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Conexões'), h('input', { name: 'conexoes', value: c.conexoes || '', maxlength: 200 })),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Transporte até a moradia'), h('input', { name: 'transporte', value: c.transporte || '', maxlength: 200 }))),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Endereço inicial de hospedagem'), h('input', { name: 'enderecoInicial', value: c.enderecoInicial || '', maxlength: 200 })),
      h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Salvar chegada'));
    f.addEventListener('submit', (e) => { e.preventDefault(); call('put', '/living/travel/arrival', Object.fromEntries(new FormData(f))); });
    return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('pin', { size: 18 }), 'Organizar minha chegada (Missão 6.5)'), f);
  }

  function draw() {
    mount(root,
      h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Rodada 6 · Missões 6.3 a 6.5'), h('h1', {}, icon('plane', { size: 26 }), ' Viagem'),
        h('p', { class: 'muted' }, 'Compare o custo total de cada rota e planeje a chegada. A rota escolhida entra no seu orçamento.'))),
      visa !== 'aprovado' ? h('div', { class: 'notice' }, icon('alert', { size: 14 }), ' Seu visto ainda não está registrado como aprovado. Comprar a passagem definitiva agora é um risco financeiro: prefira cotar e, se comprar, escolha tarifas com remarcação.') : h('div', { class: 'notice ok' }, icon('check', { size: 14 }), ' Visto registrado como aprovado: este é um bom momento para a compra definitiva.'),
      routeForm(), routes(), arrival());
  }
  draw();
  return root;
}
