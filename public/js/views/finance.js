// Planejador Financeiro Inteligente: primeiro o resultado, depois os ajustes.
// A Estuvia estima o que tem fonte; o estudante ajusta. Todo cálculo vem do servidor (finance-engine.js),
// a tela só desenha — e redesenha a cada alteração, sem botão "Recalcular".
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { loadJourneys, invalidate, checkAchievements, currentAnchor } from '../app.js';
import { fmtDate, pct } from '../components/common.js';
import { openAssistant } from '../components/AIJourneyAssistant.js';

const eur = (v) => (v === null || v === undefined ? '—' : `€ ${Math.round(v).toLocaleString('pt-BR')}`);
const brl = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const APP_STATUS = [['interesse', 'Interesse'], ['verificando', 'Verificando elegibilidade'], ['preparando', 'Preparando'], ['enviada', 'Enviada'], ['concedida', 'Concedida'], ['negada', 'Negada'], ['desisti', 'Desisti']];
const ORIGEM = { premissa: ['Estimativa Estuvia', 'tag-info'], usuario: ['Você informou', 'tag-ok'], moradia: ['Meu novo lar', 'tag-ok'], viagem: ['Viagem', 'tag-ok'] };
const STATUS = [['estimado', 'Estimado'], ['confirmado', 'Confirmado'], ['pago', 'Pago']];
const HELP = [['nao', 'Não'], ['familia', 'Sim, minha família'], ['bolsa', 'Tenho uma bolsa'], ['outra', 'Tenho outra fonte'], ['naosei', 'Ainda não sei']];

const bar = (value, label) => {
  const fill = h('span', { class: 'bar-fill' });
  fill.style.width = pct(value);
  return h('div', { class: 'bar bar-lg', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(value * 100), 'aria-label': label }, fill);
};
const moneySelect = (value, key) => h('select', { class: 'fp-cur', 'aria-label': 'Moeda', dataset: { key } }, [['EUR', '€'], ['BRL', 'R$']].map(([v, l]) => h('option', { value: v, selected: v === (value || 'EUR') }, l)));

export async function financeView() {
  const journeys = await loadJourneys();
  if (!journeys.length) {
    return h('div', { class: 'fp' }, h('section', { class: 'fp-intro card' },
      h('span', { class: 'fp-intro-ic' }, icon('euro', { size: 30 })),
      h('h1', {}, 'Vamos planejar o dinheiro da sua jornada'),
      h('p', { class: 'muted' }, 'Primeiro crie sua jornada (destino e mestrado). Com ela, a Estuvia estima os custos para você.'),
      h('a', { class: 'btn btn-cta btn-lg', href: '#/jornadas/nova' }, 'Criar minha jornada', icon('arrow', { size: 16 }))));
  }
  let jid = journeys[0].id;
  let d = await api.get(`/finance?journeyId=${jid}`);
  const st = { help: null, novoCenario: false };
  const root = h('div', { class: 'fp' });
  const qs = (url) => `${url}${url.includes('?') ? '&' : '?'}journeyId=${jid}`;

  // Redesenho preservando o campo em edição (atualização imediata enquanto digita).
  const draw = () => {
    const a = document.activeElement;
    const key = a?.dataset?.key;
    const sel = key && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    const y = window.scrollY;
    mount(root, ...view());
    if (key) { const el = root.querySelector(`[data-key="${key}"]`); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch {} } }
    window.scrollTo(0, y);
  };
  const refresh = (data) => { d = data; invalidate(); draw(); checkAchievements(); };
  const call = async (method, url, body) => {
    try { refresh(await api[method](qs(url), body)); return true; } catch (e) { toast(e.message, 'err'); return false; }
  };
  let timer;
  const later = (fn, ms = 550) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ---------- Etapa 1: destino (dados da jornada, sem perguntar de novo) ----------
  function intro(p) {
    const dd = p.destino;
    return [h('section', { class: 'fp-intro card' },
      h('p', { class: 'eyebrow' }, 'Meu planejamento financeiro'),
      h('h1', {}, 'Seu destino 🇪🇸'),
      h('div', { class: 'fp-dest' },
        h('strong', {}, dd.universidade?.nome || 'Universidade a definir'),
        h('span', {}, `${dd.cidade || '—'}, ${dd.pais}`),
        h('span', { class: 'muted' }, `${dd.programa?.nome || 'Mestrado a definir'}${dd.anoAcademico ? ` — ${dd.anoAcademico}` : ''} · ${p.meses} meses`),
        dd.programa?.demo ? h('span', { class: 'chip-demo' }, 'Mestrado demonstrativo') : null),
      h('p', { class: 'fp-lead' }, 'Vamos descobrir quanto você vai precisar para estudar aqui. A Estuvia já prepara uma estimativa; você ajusta o que quiser.'),
      h('button', { class: 'btn btn-cta btn-lg', type: 'button', onClick: () => call('put', '/finance', { iniciar: true }) }, icon('sparkles', { size: 16 }), 'Calcular meus custos'),
      h('p', { class: 'hint' }, 'Usamos só valores com fonte identificada. O que não tiver fonte fica marcado para você informar.'))];
  }

  // ---------- Resultado principal ----------
  function hero(p) {
    const fx = p.cambioInfo;
    const meta = p.aDesembolsar;
    return h('section', { class: 'fp-hero' },
      h('div', { class: 'fp-main card' },
        h('p', { class: 'eyebrow' }, 'Quanto preciso planejar para minha jornada?'),
        h('strong', { class: 'fp-big' }, eur(p.orcamento)),
        p.cambio ? h('p', { class: 'fp-brl' }, `≈ ${brl(p.orcamento * p.cambio)}`, h('small', {}, ` · câmbio R$ ${p.cambio.toFixed(2).replace('.', ',')} (${fx.origem === 'manual' ? 'informado por você' : `${fx.fonte}, ${fmtDate(fx.data)}`})`)) : h('p', { class: 'fp-brl muted' }, h('a', { href: '#/financiamento#cambio', onClick: (e) => { e.preventDefault(); go('cambio'); } }, 'Informe o câmbio'), ' para ver em reais.'),
        p.jaPago ? h('p', { class: 'small muted' }, `Já pago: ${eur(p.jaPago)} · falta desembolsar ${eur(p.aDesembolsar)}`) : null,
        p.parcial ? h('button', { class: 'fp-partial', type: 'button', onClick: () => { const det = document.getElementById('custos'); if (det) det.open = true; go('custos'); } }, icon('alert', { size: 14 }), `Estimativa parcial: ${p.faltamInformar.length} item(ns) sem valor. Completar`) : h('span', { class: 'tag tag-ok' }, 'Todos os itens com valor')),
      h('div', { class: 'fp-cards' },
        stat('Custos de instalação', eur(p.instalacao), p.reembolsavel ? `inclui ${eur(p.reembolsavel)} de caução (costuma voltar)` : 'pagos uma vez', 'luggage'),
        stat('Custo mensal estimado', `${eur(p.mensal)}/mês`, `× ${p.meses} meses = ${eur(p.mensalTotal)}`, 'calendar'),
        stat('Recursos disponíveis', eur(p.confirmados), p.previstos ? `+ ${eur(p.previstos)} ainda não garantidos` : 'só o que já é seu', 'shield', 'ok'),
        stat('Quanto ainda falta?', p.informouRecursos ? eur(p.falta) : '—', p.informouRecursos ? (p.falta ? 'para a meta da jornada' : 'nada: meta coberta 🎉') : 'conte quanto você já tem', 'target', p.informouRecursos && p.falta ? 'warn' : '')),
      h('div', { class: 'fp-meter card' },
        h('div', { class: 'row between' }, h('strong', {}, 'Minha preparação financeira'), h('span', { class: 'fp-pct' }, `${Math.round(p.metaPct * 100)}%`)),
        bar(p.metaPct, 'Meta financeira alcançada'),
        h('p', { class: 'small muted' }, `${eur(p.confirmados)} disponíveis de uma meta de ${eur(meta)}.`),
        !p.informouRecursos
          ? h('button', { class: 'btn btn-cta', type: 'button', onClick: () => go('recursos') }, 'Contar quanto já tenho', icon('arrow', { size: 14 }))
          : p.falta
            ? [h('p', { class: 'fp-gap' }, `Você ainda precisa planejar como cobrir ${eur(p.falta)}.`), h('button', { class: 'btn btn-cta', type: 'button', onClick: () => go('alternativas') }, icon('wand', { size: 14 }), 'Encontrar alternativas')]
            : h('p', { class: 'ok-line' }, icon('check', { size: 16 }), ' Seus recursos cobrem a estimativa atual.')));
  }
  const stat = (label, value, sub, ic, tone = '') => h('div', { class: `fp-stat card ${tone}` }, h('span', { class: 'fp-stat-ic' }, icon(ic, { size: 18 })), h('small', {}, label), h('strong', {}, value), h('span', { class: 'muted small' }, sub));

  // ---------- As três contas que não se misturam ----------
  function threeCalcs(p) {
    const v = p.visto;
    return h('section', { class: 'fp-three' },
      calc('A', 'Preparar a viagem', eur(p.preparar), 'Antes de partir e no primeiro mês: instalação + 1º mês de custos.', 'plane'),
      calc('B', 'Manter-me no exterior', eur(p.mensalTotal), `${eur(p.mensal)} por mês durante ${p.meses} meses.`, 'home2'),
      h('div', { class: 'fp-calc card is-visa' },
        h('span', { class: 'fp-calc-letter' }, 'C'), h('small', {}, 'Comprovar para o visto'),
        h('strong', {}, eur(v.valor)),
        h('div', { class: 'fp-mini' }, bar(v.cobertoPct, 'Comprovação coberta'), h('span', {}, `${Math.round(v.cobertoPct * 100)}% coberto`)),
        h('p', { class: 'small muted' }, `${Math.round(p.iprem.percentual * 100)}% do IPREM (€ ${p.iprem.mensal}/mês, ${p.iprem.ano}) × ${p.meses} meses. É dinheiro para mostrar ao consulado, não um gasto a mais.`),
        h('p', { class: 'small' }, v.status === 'pendente' ? h('span', { class: 'tag tag-pending' }, 'Valor do IPREM pendente de conferência oficial') : h('span', { class: 'tag tag-ok' }, 'Fonte verificada'), v.fonte?.url ? [' ', h('a', { href: v.fonte.url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver regra oficial', icon('external', { size: 11 }))] : null),
        v.aproximado ? h('p', { class: 'hint' }, `Ainda não há IPREM cadastrado para ${p.ano}; usamos o de ${p.iprem.ano}.`) : null));
  }
  const calc = (letter, title, value, text, ic) => h('div', { class: 'fp-calc card' }, h('span', { class: 'fp-calc-letter' }, letter), h('small', {}, title), h('strong', {}, value), h('p', { class: 'small muted' }, text), h('span', { class: 'fp-calc-ic' }, icon(ic, { size: 18 })));

  // ---------- Para onde vai o dinheiro (uma série: barras horizontais, um tom, rótulos diretos) ----------
  function breakdown(p) {
    const totals = {};
    for (const i of p.itens) {
      const v = i.valorEur === null ? null : i.valorEur * (i.grupo === 'mensal' ? p.meses : 1);
      const t = (totals[i.categoria] ??= { label: i.categoriaLabel, total: 0, desconhecidos: 0 });
      if (v === null) t.desconhecidos += 1; else t.total += v;
    }
    const rows = Object.values(totals).sort((a, b) => b.total - a.total);
    const max = Math.max(1, ...rows.map((r) => r.total));
    return h('section', { class: 'fp-break card' },
      h('h2', {}, 'Para onde vai o dinheiro'),
      h('p', { class: 'small muted' }, `Total da estadia por categoria (${p.meses} meses).`),
      h('ul', { class: 'fp-bars' }, rows.map((r) => {
        const fill = h('span', { class: 'fp-bar-fill' });
        fill.style.width = `${(r.total / max) * 100}%`;
        return h('li', { title: `${r.label}: ${eur(r.total)}${r.desconhecidos ? ` · ${r.desconhecidos} item(ns) sem valor` : ''}` },
          h('span', { class: 'fp-bar-label' }, r.label),
          h('span', { class: 'fp-bar-track' }, fill),
          h('span', { class: 'fp-bar-value' }, r.total ? eur(r.total) : 'sem valor', r.desconhecidos && r.total ? h('small', {}, ' + ?') : null));
      })),
      h('p', { class: 'hint' }, 'Barras sem valor ainda precisam ser informadas em "Editar meus custos".'));
  }

  // ---------- Perfil de gastos e cenários ----------
  function profiles(p) {
    const estimated = p.itens.filter((i) => i.origemTipo === 'premissa' && i.fonte);
    return h('section', { class: 'fp-scen' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Compare cenários'), h('span', { class: 'muted small' }, 'Mudar o perfil não apaga o que você já informou')),
      h('div', { class: 'fp-scen-grid' }, p.cenarios.map((c) => h('article', { class: `fp-scen-card card ${p.perfil === c.perfil ? 'on' : ''}` },
        h('div', { class: 'row between' }, h('strong', {}, c.label), p.perfil === c.perfil ? h('span', { class: 'tag tag-ok' }, 'Em uso') : null),
        h('p', { class: 'small muted' }, c.resumo),
        h('dl', {},
          h('dt', {}, 'Instalação'), h('dd', {}, eur(c.instalacao)),
          h('dt', {}, 'Por mês'), h('dd', {}, eur(c.mensal)),
          h('dt', {}, 'Total'), h('dd', { class: 'strong' }, eur(c.orcamento)),
          h('dt', {}, 'Reserva'), h('dd', {}, eur(c.reserva)),
          p.informouRecursos ? [h('dt', {}, 'Seus recursos'), h('dd', { class: c.diferenca < 0 ? 'neg' : 'pos' }, c.diferenca < 0 ? `faltam ${eur(-c.diferenca)}` : `sobram ${eur(c.diferenca)}`)] : null),
        p.perfil === c.perfil ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => call('put', '/finance', { perfil: c.perfil }) }, 'Usar este cenário')))),
      estimated.length ? h('p', { class: 'fp-premises small muted' }, icon('book', { size: 12 }), ' Premissas: ', estimated.map((i, k) => [k ? ' · ' : '', `${i.label.split(' (')[0]} ${eur(i.valorEur)} (`, h('a', { href: i.fonte.url, target: '_blank', rel: 'noopener noreferrer' }, i.fonte.orgao.split(' — ')[0]), ')'])) : null,
      savedScenarios(p));
  }

  function savedScenarios(p) {
    const name = h('input', { class: 'guide-input', maxlength: 60, placeholder: 'Nome (ex.: Plano com quarto mais barato)', 'aria-label': 'Nome do cenário' });
    return h('div', { class: 'fp-saved' },
      p.cenariosSalvos.length ? h('ul', { class: 'fp-saved-list' }, p.cenariosSalvos.map((c) => h('li', {},
        h('div', {}, h('strong', {}, c.nome), h('small', { class: 'muted' }, `${d.plano.perfis[c.perfil]?.label} · total ${eur(c.orcamento)}`)),
        c.principal ? h('span', { class: 'tag tag-ok' }, 'Principal') : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => call('put', `/finance/scenarios/${c.id}/principal`) }, 'Usar como principal'),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Excluir ${c.nome}`, onClick: () => call('del', `/finance/scenarios/${c.id}`) }, icon('trash', { size: 13 }))))) : null,
      st.novoCenario
        ? h('div', { class: 'row wrap' }, name, h('button', { class: 'btn btn-cta btn-sm', type: 'button', onClick: async () => { if (!name.value.trim()) return toast('Dê um nome ao cenário.', 'err'); st.novoCenario = false; await call('post', '/finance/scenarios', { nome: name.value.trim() }); } }, 'Salvar'))
        : h('button', { class: 'guide-secondary', type: 'button', onClick: () => { st.novoCenario = true; draw(); } }, icon('check', { size: 14 }), 'Salvar o cenário atual'));
  }

  // ---------- Minha situação financeira ----------
  function situation(p) {
    const quick = (d.plano.recursos || []).find((r) => r.origem === 'rapido');
    const val = h('input', { type: 'number', min: 0, step: 100, class: 'guide-input', value: quick ? quick.valor : '', placeholder: 'Ex.: 20000', 'aria-label': 'Quanto dinheiro você já tem', dataset: { key: 'rapido-valor' } });
    const cur = moneySelect(quick?.moeda || 'BRL', 'rapido-moeda');
    const saveQuick = () => {
      const valor = Number(val.value);
      if (!val.value || !(valor >= 0)) return toast('Informe um valor (pode ser 0).', 'err');
      const body = { tipo: 'poupanca', descricao: 'Dinheiro que já tenho', valor, moeda: cur.value, status: 'disponivel', origem: 'rapido' };
      if (quick) call('put', `/finance/resources/${quick.id}`, body); else call('post', '/finance/resources', body);
    };
    const groups = p.gruposRecursos;
    return h('section', { class: 'fp-sit card', id: 'recursos' },
      h('h2', {}, 'Minha situação financeira'),
      h('label', { class: 'fp-q' }, h('span', {}, 'Quanto dinheiro você já tem para sua jornada?'), h('div', { class: 'fp-money' }, cur, val, h('button', { class: 'btn btn-cta', type: 'button', onClick: saveQuick }, 'Salvar'))),
      quick?.moeda === 'BRL' && !p.cambio ? h('p', { class: 'hint' }, 'Para somar reais aos euros, informe o câmbio abaixo.') : null,
      p.informouRecursos ? null : h('button', { class: 'guide-secondary', type: 'button', onClick: () => call('put', '/finance', { informouRecursos: true }) }, 'Ainda não tenho nada guardado'),
      h('div', { class: 'fp-q' }, h('span', {}, 'Alguém vai ajudar a financiar seus estudos?'),
        h('div', { class: 'choice-grid' }, HELP.map(([k, l]) => h('button', { type: 'button', class: 'choice', 'aria-pressed': String(st.help === k), onClick: () => { st.help = st.help === k ? null : k; draw(); } }, h('span', {}, l))))),
      helpForm(),
      h('div', { class: 'fp-groups' }, Object.entries(groups).filter(([, g]) => g.itens).map(([k, g]) => h('div', { class: `fp-group ${g.conta ? 'counts' : ''}` },
        h('div', { class: 'row between' }, h('strong', {}, g.label), h('span', {}, eur(g.total))),
        h('small', { class: 'muted' }, `${g.texto} ${g.conta ? 'Conta na meta.' : 'Ainda não conta.'}${g.semCambio ? ` ${g.semCambio} valor(es) em reais sem câmbio.` : ''}`),
        h('ul', {}, p.recursos.filter((r) => r.grupo === k).map((r) => h('li', {}, h('span', {}, r.descricao), h('span', { class: 'muted' }, `${r.moeda === 'BRL' ? 'R$' : '€'} ${Number(r.valor).toLocaleString('pt-BR')}`),
          r.automatico ? h('small', { class: 'muted' }, 'da bolsa') : h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Remover ${r.descricao}`, onClick: () => call('del', `/finance/resources/${r.id}`) }, icon('trash', { size: 12 })))))))),
      h('p', { class: 'hint' }, 'Só conta como garantido o que já é seu ou está confirmado. Apoio prometido e bolsa solicitada aparecem, mas não entram na conta.'));
  }

  function helpForm() {
    if (!st.help || st.help === 'nao') return st.help === 'nao' ? h('p', { class: 'small muted' }, 'Tudo bem. Se faltar dinheiro, as alternativas aparecem logo abaixo.') : null;
    if (st.help === 'bolsa') return h('p', { class: 'small' }, 'Registre a bolsa em ', h('a', { href: '#/financiamento#bolsas', onClick: (e) => { e.preventDefault(); go('bolsas'); } }, 'Bolsas de estudo'), '. Ela só conta quando estiver concedida, pelo valor confirmado.');
    if (st.help === 'naosei') return h('div', { class: 'row wrap' }, h('p', { class: 'small muted' }, 'Sem problema. O Mentor pode ajudar a pensar nas opções.'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openAssistant({ journeyId: jid, acao: 'semdinheiro' }) }, icon('chat', { size: 14 }), 'Conversar com o Mentor'));
    const fam = st.help === 'familia';
    const desc = h('input', { class: 'guide-input', maxlength: 100, placeholder: fam ? 'Quem vai ajudar? (ex.: meu pai)' : 'Qual fonte? (ex.: venda do carro)', 'aria-label': 'Descrição' });
    const val = h('input', { type: 'number', min: 0, step: 100, class: 'guide-input', placeholder: 'Valor', 'aria-label': 'Valor' });
    const cur = moneySelect('BRL');
    const status = h('select', { class: 'guide-input', 'aria-label': 'Situação' }, (fam ? [['prometido', 'Prometido, ainda sem documentos'], ['confirmado', 'Já está disponível e documentado']] : [['a-verificar', 'Ainda preciso confirmar'], ['disponivel', 'Já está disponível']]).map(([v, l]) => h('option', { value: v }, l)));
    return h('div', { class: 'fp-helpform' }, h('div', { class: 'fp-money' }, desc), h('div', { class: 'fp-money' }, cur, val), status,
      h('button', { class: 'btn btn-cta', type: 'button', onClick: async () => {
        if (!desc.value.trim() || !val.value) return toast('Preencha descrição e valor.', 'err');
        if (await call('post', '/finance/resources', { tipo: fam ? 'familiar' : 'outro', descricao: desc.value.trim(), valor: Number(val.value), moeda: cur.value, status: status.value })) { st.help = null; draw(); }
      } }, 'Adicionar'),
      fam ? h('p', { class: 'hint' }, 'O consulado define se e como o apoio da família é aceito e quais documentos pedir.') : null);
  }

  // ---------- Quando falta dinheiro: caminhos ----------
  function alternatives(p) {
    if (!p.informouRecursos || !p.deficit) return null;
    const partida = h('input', { type: 'date', class: 'guide-input', value: p.partida, 'aria-label': 'Data prevista de partida' });
    partida.addEventListener('change', () => call('put', '/finance', { partida: partida.value }));
    const action = (c) => {
      if (c.id === 'bolsas') return h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => go('bolsas') }, 'Ver bolsas', icon('arrow', { size: 12 }));
      if (c.id === 'familiar') return h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openAssistant({ journeyId: jid, acao: 'apoio' }) }, icon('chat', { size: 12 }), 'Como comprovar?');
      if (c.id === 'reduzir') return h('div', { class: 'row wrap' }, p.perfil !== 'economico' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => call('put', '/finance', { perfil: 'economico' }) }, 'Usar perfil econômico') : null, h('a', { class: 'btn btn-ghost btn-sm', href: '#/novo-lar' }, 'Comparar moradias'));
      if (c.id === 'periodo' || c.id === 'economia') return h('label', { class: 'field' }, h('span', { class: 'field-label' }, c.id === 'periodo' ? 'Simular outra data de partida' : 'Até quando?'), partida);
      return c.rota ? h('a', { class: 'btn btn-ghost btn-sm', href: `#${c.rota}` }, 'Abrir', icon('arrow', { size: 12 })) : null;
    };
    return h('section', { class: 'fp-alt', id: 'alternativas' },
      h('div', { class: 'fp-alt-head' }, h('h2', {}, `Ainda faltam ${eur(p.deficit)} para sua meta.`), h('p', {}, 'Vamos encontrar um caminho para você.'),
        p.deficitVisto > p.falta ? h('p', { class: 'small muted' }, `O maior valor aqui é a comprovação do visto (${eur(p.exigenciaVisto)}).`) : null),
      h('div', { class: 'fp-alt-grid' }, p.caminhos.map((c) => h('article', { class: 'fp-alt-card card' },
        h('span', { class: 'fp-stat-ic' }, icon(c.icone || 'wand', { size: 18 })), h('strong', {}, c.titulo), h('p', { class: 'small muted' }, c.texto), action(c)))),
      h('button', { class: 'btn btn-cta', type: 'button', onClick: () => openAssistant({ journeyId: jid, acao: 'semdinheiro' }) }, icon('chat', { size: 16 }), 'Decidir com o Mentor'),
      h('p', { class: 'hint' }, 'A Estuvia não promete aprovação do visto: estes caminhos ajudam a buscar alternativas verificáveis.'));
  }

  // ---------- Bolsas ----------
  function scholarships() {
    const saved = new Map(d.candidaturas.filter((a) => a.catalogId).map((a) => [a.catalogId, a]));
    const custom = h('form', { class: 'grid-res' },
      h('input', { name: 'nome', placeholder: 'Outra bolsa (nome)', required: true, maxlength: 120 }),
      h('input', { name: 'entidade', placeholder: 'Entidade', maxlength: 120 }),
      h('input', { name: 'url', type: 'url', placeholder: 'Link oficial (https)', maxlength: 300 }),
      h('input', { name: 'prazo', type: 'date', 'aria-label': 'Prazo do edital' }),
      h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Salvar bolsa'));
    custom.addEventListener('submit', (e) => {
      e.preventDefault();
      call('post', '/finance/scholarships', Object.fromEntries([...new FormData(custom)].filter(([, v]) => String(v).trim())));
    });
    return h('section', { class: 'panel', id: 'bolsas' },
      h('h2', { class: 'panel-title' }, icon('trophy', { size: 18 }), 'Bolsas de estudo'),
      h('p', { class: 'muted small' }, 'Nenhuma bolsa cobre automaticamente o seu mestrado: confira elegibilidade e prazo no edital. O Radar de Oportunidades ainda não monitora editais de bolsas.'),
      h('div', { class: 'sch-grid' }, d.catalogo.map((s) => {
        const app = saved.get(s.id);
        return h('article', { class: 'sch' },
          h('div', { class: 'row between' }, h('strong', {}, s.nome), h('span', { class: 'tag tag-pending' }, d.statusBolsa[s.status])),
          h('p', { class: 'small muted' }, s.entidade),
          h('details', {}, h('summary', { class: 'small' }, 'Ver detalhes'), h('dl', { class: 'sch-dl' }, h('dt', {}, 'Elegibilidade'), h('dd', {}, s.elegibilidade), h('dt', {}, 'Abrange'), h('dd', {}, s.abrangencia), h('dt', {}, 'Financia'), h('dd', {}, s.financia), h('dt', {}, 'Cobertura'), h('dd', {}, s.cobertura), h('dt', {}, 'Prazo'), h('dd', {}, s.prazo || 'Sem edital confirmado'))),
          h('div', { class: 'row wrap' },
            app ? h('span', { class: 'chip-status st-concluida' }, `Salva · ${APP_STATUS.find(([v]) => v === app.status)?.[1]}`) : h('button', { class: 'btn btn-cta btn-sm', type: 'button', onClick: () => call('post', '/finance/scholarships', { catalogId: s.id }) }, 'Acompanhar esta bolsa'),
            h('a', { class: 'btn btn-ghost btn-sm', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Site oficial', icon('external', { size: 12 }))));
      })),
      d.candidaturas.length ? [h('h3', { class: 'small-title' }, 'Minhas candidaturas'), h('div', { class: 'stack' }, d.candidaturas.map(appCard))] : null,
      h('details', { class: 'guide-more' }, h('summary', {}, 'Adicionar outra bolsa'), custom),
      h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', checked: d.entrada.nenhumaBolsaAplicavel }); c.addEventListener('change', () => call('put', '/finance', { nenhumaBolsaAplicavel: c.checked })); return c; })(), h('span', {}, 'Pesquisei e nenhuma bolsa se aplica ao meu caso agora.')));
  }

  function appCard(a) {
    const sel = h('select', { 'aria-label': 'Situação' }, APP_STATUS.map(([v, l]) => h('option', { value: v, selected: v === a.status }, l)));
    const prazo = h('input', { type: 'date', value: a.prazo || '', 'aria-label': 'Prazo do edital' });
    const valor = h('input', { type: 'number', min: 0, step: 100, value: a.valorTotal ?? '', placeholder: 'Valor (€ total)', 'aria-label': 'Valor total da bolsa' });
    sel.addEventListener('change', () => call('put', `/finance/scholarships/${a.id}`, { status: sel.value }));
    prazo.addEventListener('change', () => call('put', `/finance/scholarships/${a.id}`, { prazo: prazo.value }));
    valor.addEventListener('change', () => call('put', `/finance/scholarships/${a.id}`, { valorTotal: Number(valor.value) || 0 }));
    const done = a.tarefas.filter((t) => t.feito).length;
    return h('article', { class: 'app-card' },
      h('div', { class: 'row between wrap' }, h('div', {}, h('strong', {}, a.nome), h('p', { class: 'small muted' }, a.entidade || '')), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remover bolsa', onClick: () => call('del', `/finance/scholarships/${a.id}`) }, icon('trash', { size: 13 }))),
      h('div', { class: 'grid-3 tight' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Situação'), sel), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Prazo do edital'), prazo),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, a.status === 'concedida' ? 'Valor concedido (€ total)' : 'Valor previsto (€ total)'), valor)),
      h('p', { class: 'hint' }, a.status === 'concedida' ? 'Bolsa concedida: o valor entra nos seus recursos garantidos.' : 'Enquanto não for concedida, a bolsa aparece como "solicitada" e não conta na meta.'),
      h('details', {}, h('summary', {}, `Tarefas (${done}/${a.tarefas.length}) — aparecem na Agenda AI`),
        h('ul', { class: 'checklist' }, a.tarefas.map((t) => {
          const b = h('button', { type: 'button', class: `ck ${t.feito ? 'done' : ''}`, role: 'checkbox', 'aria-checked': String(t.feito) }, h('span', { class: 'ck-box' }, t.feito ? icon('check', { size: 14 }) : null), h('span', { class: 'ck-text' }, t.texto));
          b.addEventListener('click', () => call('put', `/finance/scholarships/${a.id}`, { tarefa: { id: t.id, feito: !t.feito } }));
          return h('li', {}, b);
        }))));
  }

  // ---------- Editar meus custos (painel secundário) ----------
  function editCosts(p) {
    const row = (i) => {
      const [olabel, ocls] = ORIGEM[i.origemTipo] || ['Sem valor', 'tag-pending'];
      const ov = d.entrada.itens[i.id];
      if (!i.editavel) {
        return h('li', { class: 'fp-item' }, h('span', { class: 'fp-item-ic' }, icon(i.icone, { size: 16 })), h('div', { class: 'fp-item-main' }, h('strong', {}, i.label), h('small', { class: 'muted' }, i.nota || '')),
          h('span', { class: 'fp-item-value' }, eur(i.valorEur), i.grupo === 'mensal' ? h('small', {}, '/mês') : null), h('a', { class: `tag ${ocls}`, href: i.origemTipo === 'viagem' ? '#/viagem' : '#/novo-lar' }, olabel));
      }
      const input = h('input', { type: 'number', min: 0, step: 10, class: 'fp-input', value: ov && ov.valor !== null && ov.valor !== undefined ? ov.valor : i.origemTipo === 'premissa' ? Math.round(i.valorEur) : '', placeholder: 'Informe', 'aria-label': i.label, dataset: { key: `v-${i.id}` } });
      const cur = moneySelect(ov?.moeda, `m-${i.id}`);
      const status = h('select', { class: 'fp-status', 'aria-label': `Situação de ${i.label}`, dataset: { key: `s-${i.id}` } }, STATUS.map(([v, l]) => h('option', { value: v, selected: v === (ov?.status || 'estimado') }, l)));
      const due = i.grupo === 'instalacao' ? h('input', { type: 'date', class: 'fp-due', value: ov?.vencimento || '', 'aria-label': `Data de pagamento de ${i.label}`, title: 'Data de pagamento (vai para a Agenda AI)', dataset: { key: `d-${i.id}` } }) : null;
      const send = () => {
        const valor = input.value === '' ? null : Number(input.value);
        const body = valor === null && !ov ? null : { valor, moeda: cur.value, status: status.value, ...(due ? { vencimento: due.value } : {}) };
        if (body === null) return;
        call('put', '/finance', { itens: { [i.id]: body } });
      };
      input.addEventListener('input', () => later(send));
      [cur, status, due].filter(Boolean).forEach((el) => el.addEventListener('change', send));
      return h('li', { class: `fp-item ${i.valorEur === null ? 'unknown' : ''}` },
        h('span', { class: 'fp-item-ic' }, icon(i.icone, { size: 16 })),
        h('div', { class: 'fp-item-main' }, h('strong', {}, i.label, i.reembolsavel ? h('span', { class: 'tag tag-info' }, 'reembolsável') : null),
          h('small', { class: 'muted' }, i.nota || i.dica || ''),
          i.fonte ? h('small', {}, h('a', { href: i.fonte.url, target: '_blank', rel: 'noopener noreferrer' }, `Fonte: ${i.fonte.orgao}`), ` · consultada em ${fmtDate(i.fonte.revisadoEm)}`) : null,
          i.precisaCambio ? h('small', { class: 'warn' }, 'Valor em reais: informe o câmbio para converter.') : null),
        h('div', { class: 'fp-item-edit' }, h('div', { class: 'fp-money' }, cur, input), status, due,
          ov ? h('button', { class: 'guide-secondary', type: 'button', onClick: () => call('put', '/finance', { itens: { [i.id]: null } }) }, i.origemTipo === 'usuario' && d.plano.itens.length ? 'Voltar à estimativa' : 'Limpar') : null),
        h('span', { class: `tag ${ocls}` }, olabel));
    };
    const group = (g, title, sub) => h('div', { class: 'fp-edit-group' }, h('h3', {}, title, h('small', { class: 'muted' }, ` ${sub}`)), h('ul', { class: 'fp-items' }, p.itens.filter((i) => i.grupo === g).map(row)));
    const months = h('input', { type: 'number', min: 1, max: 48, class: 'fp-input', value: p.meses, 'aria-label': 'Meses de estadia', dataset: { key: 'meses' } });
    months.addEventListener('change', async () => {
      const n = Number(months.value);
      if (!(n >= 1 && n <= 48)) return toast('Use entre 1 e 48 meses.', 'err');
      try { await api.put(`/journeys/${jid}`, { duracaoMeses: n }); refresh(await api.get(qs('/finance'))); } catch (e) { toast(e.message, 'err'); }
    });
    return h('details', { class: 'fp-edit card', id: 'custos', open: Boolean(st.editOpen) },
      h('summary', {}, icon('edit', { size: 16 }), ' Editar meus custos', p.parcial ? h('span', { class: 'tag tag-pending' }, `${p.faltamInformar.length} sem valor`) : null),
      h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, 'Mude qualquer valor: o resultado atualiza na hora. Campo vazio = ainda não sei (não é o mesmo que zero).'),
        h('label', { class: 'fp-inline' }, h('span', {}, 'Duração da estadia'), months, h('span', { class: 'muted small' }, 'meses')),
        group('instalacao', 'Para se instalar', '(pagos uma vez)'),
        group('mensal', 'Por mês no destino', `(× ${p.meses} meses)`)));
  }

  // ---------- Câmbio ----------
  function exchange(p) {
    const fx = p.cambioInfo;
    const rate = h('input', { type: 'number', min: 0, step: 0.01, class: 'fp-input', value: d.entrada.cambio || '', placeholder: fx.origem === 'referencia' ? fx.taxa.toFixed(2) : 'Ex.: 6,10', 'aria-label': 'Taxa de câmbio manual (R$ por €1)', dataset: { key: 'cambio' } });
    rate.addEventListener('change', () => call('put', '/finance', { cambio: rate.value ? Number(rate.value) : null }));
    const spread = h('input', { type: 'number', min: 0, max: 20, step: 0.1, class: 'fp-input', value: d.entrada.spreadPct ?? '', placeholder: '0', 'aria-label': 'Custo de conversão em %', dataset: { key: 'spread' } });
    spread.addEventListener('change', () => call('put', '/finance', { spreadPct: spread.value === '' ? null : Number(spread.value) }));
    return h('section', { class: 'fp-fx card', id: 'cambio' },
      h('h2', {}, icon('globe', { size: 16 }), ' Câmbio'),
      fx.taxa
        ? h('p', {}, h('strong', {}, `R$ ${fx.taxa.toFixed(4).replace('.', ',')} por € 1`), h('br'), h('small', { class: 'muted' }, fx.origem === 'manual' ? `Informada por você${fx.data ? ` em ${fmtDate(fx.data)}` : ''}` : `${fx.fonte} · cotação de ${fmtDate(fx.data)} · atualizada às ${new Date(fx.obtidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`))
        : h('p', { class: 'small' }, 'Sem taxa automática agora. Informe a taxa que você conseguiu (ela fica marcada como "informada por você").'),
      h('div', { class: 'fp-fx-grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Usar outra taxa (R$ por €1)'), rate),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Custo de conversão (IOF, spread) %'), spread)),
      d.entrada.cambio && fx.origem === 'manual' ? h('button', { class: 'guide-secondary', type: 'button', onClick: () => call('put', '/finance', { cambio: null }) }, 'Usar a taxa de referência') : null,
      h('p', { class: 'hint' }, 'Os cálculos são em euro. O custo de conversão é aplicado ao dinheiro em reais que você registrou.'));
  }

  // ---------- Durante a estadia: previsto × realizado ----------
  function tracking(p) {
    const a = p.acompanhamento;
    if (!a.ativo) return null;
    const mes = h('input', { type: 'month', class: 'fp-input', value: new Date().toISOString().slice(0, 7), 'aria-label': 'Mês' });
    const cat = h('select', { class: 'fp-status', 'aria-label': 'Categoria' }, a.categorias.map((c) => h('option', { value: c.categoria }, c.label)));
    const val = h('input', { type: 'number', min: 0, step: 5, class: 'fp-input', placeholder: '€', 'aria-label': 'Valor gasto' });
    return h('section', { class: 'fp-track card' },
      h('h2', {}, 'Durante a estadia: previsto × realizado'),
      h('ul', { class: 'fp-track-list' }, a.categorias.map((c) => h('li', {}, h('span', {}, c.label), h('span', { class: 'muted' }, `previsto ${eur(c.previstoMes)}/mês`),
        h('strong', { class: c.realizadoMes !== null && c.realizadoMes > c.previstoMes ? 'neg' : '' }, c.realizadoMes === null ? 'sem lançamentos' : `real ${eur(c.realizadoMes)}/mês`)))),
      h('div', { class: 'row wrap' }, mes, cat, val, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { if (!val.value) return; call('post', '/finance/spending', { mes: mes.value, categoria: cat.value, valor: Number(val.value) }); } }, 'Lançar gasto')),
      h('p', { class: 'hint' }, `${a.meses} mês(es) com lançamentos. A média real ajuda a ajustar o plano do restante da estadia.`));
  }

  function view() {
    const p = d.plano;
    const picker = journeys.length > 1 ? (() => {
      const s = h('select', { 'aria-label': 'Jornada' }, journeys.map((j) => h('option', { value: j.id, selected: j.id === jid }, `${j.destino.universidade?.sigla} — ${j.destino.programa?.nome || ''}`)));
      s.addEventListener('change', async () => { jid = s.value; d = await api.get(qs('/finance')); draw(); });
      return s;
    })() : null;
    if (!p.planoIniciado) return intro(p);
    return [
      h('header', { class: 'fp-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Meu planejamento financeiro'), h('h1', {}, `Brasil → ${p.destino.cidade || 'Espanha'}`), h('p', { class: 'muted small' }, `${p.destino.universidade?.sigla || ''} · ${p.destino.programa?.nome || ''}${p.destino.anoAcademico ? ` · ${p.destino.anoAcademico}` : ''} · ${p.meses} meses`)), picker),
      hero(p),
      threeCalcs(p),
      h('div', { class: 'fp-mid' }, breakdown(p), situation(p)),
      alternatives(p),
      profiles(p),
      scholarships(),
      editCosts(p),
      exchange(p),
      tracking(p),
    ];
  }

  // O painel "Editar meus custos" lembra se estava aberto.
  root.addEventListener('toggle', (e) => { if (e.target.id === 'custos') st.editOpen = e.target.open; }, true);
  draw();
  const anchor = currentAnchor();
  if (anchor) requestAnimationFrame(() => { if (anchor === 'custos') { st.editOpen = true; document.getElementById('custos')?.setAttribute('open', ''); } go(anchor); });
  return root;
}

export { fmtDate };
