// Ferramentas financeiras da central da missão. Leem e gravam pelo mesmo /api/finance do planejador.
// Valor desconhecido ≠ zero: sem recursos informados, nunca mostramos "faltam €X" como se fosse certo.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { hubIcon } from './hub-icons.js';
import { locale } from '../../i18n.js';

export const eur = (v) => (v === null || v === undefined ? '-' : `€ ${Math.round(v).toLocaleString(locale())}`);
const plan = async () => api.get('/finance');
// A CSP bloqueia o atributo style inline: a largura é aplicada via CSSOM.
const fill = (attrs, pct) => { const el = h('span', attrs); el.style.width = `${Math.max(0, Math.min(100, pct))}%`; return el; };


const stat = (label, value, { tone = '', note = null } = {}) => h('div', { class: `mh-stat ${tone}` }, h('small', {}, label), h('strong', {}, value), note ? h('span', { class: 'mh-stat-note' }, note) : null);
const notice = (text, ic = 'alert') => h('p', { class: 'mh-notice' }, icon(ic, { size: 14 }), ' ', text);
const linkBtn = (label, href, cls = 'btn btn-ghost') => h('a', { class: cls, href }, label, ' ', icon('arrow', { size: 14 }));

/** Situação financeira em linguagem simples (usado nas dicas dos cards). */
export async function financeHints() {
  const { plano: f } = await plan();
  return {
    simulador: f.planoIniciado ? `Estimativa: ${eur(f.orcamento)}${f.parcial ? ' (parcial)' : ''}` : 'Ainda não calculado',
    comprovacao: `Referência: ${eur(f.visto.valor)}`,
    dinheiro: f.informouRecursos ? `Garantido: ${eur(f.confirmados)}` : 'Ainda não informado',
    alternativas: !f.informouRecursos ? 'Informe seu dinheiro primeiro' : f.caminhos.length ? `${f.caminhos.length} caminho(s) para você` : 'Seu plano está coberto',
    bolsas: null,
    plano: f,
  };
}

// ---------- Simulador financeiro ----------
export async function SimulatorPanel(m, ctx, hub) {
  const { plano: f } = await plan();
  const host = h('div', { class: 'stack' });
  const d = f.destino;
  const start = async () => {
    try { await api.put('/finance', { iniciar: true }); hub.dirty(); toast('Estimativa inicial criada com as premissas da Estuvia.', 'ok'); hub.reopen(); } catch (e) { toast(e.message, 'err'); }
  };
  mount(host,
    h('p', { class: 'mh-lead' }, `${d.cidade || 'Destino'} · ${f.meses} meses${d.anoAcademico ? ` · ${d.anoAcademico}` : ''}`),
    f.planoIniciado
      ? h('div', { class: 'mh-stats' },
          stat('Antes de viajar', eur(f.preparar), { note: 'documentos, passagens, seguro…' }),
          stat('Instalação', eur(f.instalacao), { note: 'caução e primeiros gastos' }),
          stat('Por mês', eur(f.mensal), { note: `× ${f.meses} meses` }),
          stat('Total estimado', eur(f.orcamento), { tone: 'is-main' }))
      : h('div', { class: 'mh-empty' }, hubIcon('calculator', { size: 28 }), h('p', {}, 'Ainda não calculamos o custo da sua jornada. Começamos com estimativas da Estuvia para a sua cidade e você ajusta o que souber.'),
          h('button', { type: 'button', class: 'btn btn-cta', onClick: start }, icon('euro', { size: 16 }), ' Calcular minha estimativa')),
    f.planoIniciado && f.parcial ? notice(`Ainda faltam ${f.faltamInformar.length} item(ns) sem valor (ex.: matrícula, seguro). Eles não entram como zero: complete no simulador.`, 'clock') : null,
    h('p', { class: 'hint' }, 'Valores são estimativas, não são taxas oficiais. A comprovação do visto é outra coisa (veja "Comprovação financeira").'),
    h('div', { class: 'row wrap' }, linkBtn(f.planoIniciado ? 'Ajustar no simulador completo' : 'Abrir simulador completo', '#/financiamento', 'btn btn-cta'), hub.button('Quanto preciso comprovar?', 'comprovacao')));
  return host;
}

// ---------- Comprovação financeira (A × B × C) ----------
export async function ProofPanel(m) {
  const { plano: f } = await plan();
  const v = f.visto;
  const def = m.definicao;
  return h('div', { class: 'stack' },
    h('p', { class: 'mh-lead' }, 'Para o visto, você precisa MOSTRAR que tem dinheiro para se manter. Não é uma taxa: o dinheiro continua sendo seu.'),
    h('div', { class: 'mh-abc' },
      h('div', { class: 'mh-abc-item a' }, h('span', { class: 'mh-abc-tag' }, 'A'), h('small', {}, 'Precisa comprovar (visto)'), h('strong', {}, eur(v.valor)),
        h('p', {}, `${Math.round(f.iprem.percentual * 100)}% do IPREM (€ ${f.iprem.mensal}/mês${f.iprem.aproximado ? ', valor aproximado' : ''}) × ${f.meses} meses.`)),
      h('div', { class: 'mh-abc-item b' }, h('span', { class: 'mh-abc-tag' }, 'B'), h('small', {}, 'Custo real da mudança'), h('strong', {}, f.planoIniciado ? eur(f.orcamento) : '-'),
        h('p', {}, f.planoIniciado ? `Sua estimativa${f.parcial ? ' (ainda parcial)' : ''}. Pode ser maior ou menor que A.` : 'Ainda não calculado no simulador.')),
      h('div', { class: 'mh-abc-item c' }, h('span', { class: 'mh-abc-tag' }, 'C'), h('small', {}, 'Seu dinheiro garantido'), h('strong', {}, f.informouRecursos ? eur(f.confirmados) : '-'),
        h('p', {}, f.informouRecursos ? (f.previstos ? `+ ${eur(f.previstos)} prometidos ou solicitados (não contam).` : 'Só conta o que já é seu ou foi concedido.') : 'Você ainda não informou.'))),
    f.informouRecursos
      ? h('div', { class: 'mh-meter' }, h('div', { class: 'bar' }, fill({ class: 'bar-fill' }, v.cobertoPct * 100)), h('small', {}, v.falta ? `Para a comprovação, faltam ${eur(v.falta)} (estimativa).` : 'Seu dinheiro garantido cobre a referência do visto.'))
      : notice('Registre quanto você já tem (mesmo que seja zero) para ver se cobre a comprovação.', 'piggy'),
    h('details', { class: 'mh-more' }, h('summary', {}, 'Entender melhor'),
      h('div', { class: 'stack' },
        def.porque ? h('p', {}, def.porque) : null,
        h('p', {}, f.iprem.regra),
        f.iprem.status === 'pendente' ? notice(`IPREM ${f.iprem.ano}: ${f.iprem.fonte}`, 'clock') : null,
        m.errosComuns?.length ? h('ul', { class: 'mh-list' }, m.errosComuns.map((e) => h('li', {}, icon('alert', { size: 13 }), ' ', e))) : null)),
    v.fonte?.url ? h('p', { class: 'mh-source' }, icon('shield', { size: 13 }), ' Fonte: ', h('a', { href: v.fonte.url, target: '_blank', rel: 'noopener noreferrer' }, v.fonte.orgao || v.fonte.titulo), v.verificadoEm ? ` · conferida em ${v.verificadoEm.split('-').reverse().join('/')}` : '') : null,
    h('p', { class: 'hint' }, 'O consulado confirma o valor, as deduções e quais documentos aceita.'));
}

// ---------- Meu dinheiro (MissionResourcePanel) ----------
const KINDS = [
  { id: 'proprio', rotulo: 'Tenho dinheiro guardado', ic: 'piggy', tipo: 'poupanca', status: 'disponivel', descricao: 'Dinheiro guardado', conta: true },
  { id: 'familia', rotulo: 'Minha família vai ajudar', ic: 'users', tipo: 'familiar', status: 'prometido', descricao: 'Apoio familiar', conta: false, pergunta: 'Quem vai ajudar? (ex.: mãe, padrasto)' },
  { id: 'bolsa', rotulo: 'Tenho bolsa concedida', ic: 'cap', tipo: 'bolsa', status: 'confirmado', descricao: 'Bolsa concedida', conta: true, aviso: 'Só registre aqui bolsa já concedida, pelo valor da carta. Bolsa solicitada não conta.' },
  { id: 'outro', rotulo: 'Outra fonte', ic: 'euro', tipo: 'outro', status: 'a-verificar', descricao: 'Outra fonte', conta: false },
];

export async function MissionResourcePanel(m, ctx, hub) {
  const host = h('div', { class: 'stack' });
  const draw = async (choice = null) => {
    const { plano: f } = await plan();
    const mine = f.recursos.filter((r) => !r.automatico);
    const garantidos = f.recursos.filter((r) => ['disponivel', 'bolsa-concedida'].includes(r.grupo));
    const previstos = f.recursos.filter((r) => !['disponivel', 'bolsa-concedida'].includes(r.grupo));
    const form = choice ? resourceForm(choice) : null;
    mount(host,
      h('div', { class: 'mh-stats' },
        stat('Garantido', f.informouRecursos ? eur(f.confirmados) : '-', { tone: 'is-ok', note: 'já é seu ou foi concedido' }),
        stat('Previsto', f.informouRecursos ? eur(f.previstos) : '-', { tone: 'is-warn', note: 'prometido ou a confirmar (não conta)' })),
      !f.informouRecursos ? h('p', { class: 'mh-lead' }, 'Você já tem dinheiro para comprovar seus estudos?') : h('p', { class: 'mh-lead' }, 'Quer registrar mais alguma fonte?'),
      h('div', { class: 'mh-choices' }, KINDS.map((k) => h('button', { type: 'button', class: `mh-choice ${choice?.id === k.id ? 'on' : ''}`, 'aria-pressed': String(choice?.id === k.id), onClick: () => draw(k) }, hubIcon(k.ic, { size: 20 }), h('span', {}, k.rotulo))),
        !f.informouRecursos ? h('button', { type: 'button', class: 'mh-choice', onClick: async () => { try { await api.put('/finance', { informouRecursos: true }); hub.dirty(); toast('Registrado: por enquanto você não tem recursos. Isso é diferente de "não informado".', 'ok'); draw(); } catch (e) { toast(e.message, 'err'); } } }, icon('minus', { size: 20 }), h('span', {}, 'Ainda não tenho nada')) : null),
      form,
      mine.length || garantidos.length ? h('div', { class: 'mh-res' },
        group('Garantido', garantidos, 'is-ok'),
        group('Previsto (não conta como garantido)', previstos, 'is-warn')) : null,
      h('p', { class: 'hint' }, 'O consulado decide quais comprovantes aceita. Apoio de família precisa de documentação.'));
    function group(title, list, tone) {
      if (!list.length) return null;
      return h('div', { class: `mh-res-group ${tone}` }, h('small', {}, title), h('ul', {}, list.map((r) => h('li', {}, h('span', {}, r.descricao), h('strong', {}, eur(r.valorEur ?? r.valor)),
        r.automatico ? h('small', { class: 'muted' }, 'da área de bolsas') : h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Remover ${r.descricao}`, onClick: async () => { try { await api.del(`/finance/resources/${r.id}`); hub.dirty(); draw(); } catch (e) { toast(e.message, 'err'); } } }, icon('trash', { size: 13 }))))));
    }
  };
  function resourceForm(k) {
    const valor = h('input', { type: 'number', min: 0, step: 50, required: true, placeholder: '0', 'aria-label': 'Valor' });
    const moeda = h('select', { 'aria-label': 'Moeda' }, h('option', { value: 'BRL' }, 'R$'), h('option', { value: 'EUR' }, '€'));
    const quem = k.pergunta ? h('input', { type: 'text', maxlength: 80, placeholder: k.pergunta, 'aria-label': k.pergunta }) : null;
    const status = k.id === 'outro' ? h('select', { 'aria-label': 'Situação' }, h('option', { value: 'disponivel' }, 'Já está disponível'), h('option', { value: 'a-verificar' }, 'Ainda preciso confirmar')) : null;
    const f = h('form', { class: 'mh-form' },
      h('label', {}, h('span', {}, 'Quanto?'), h('div', { class: 'row' }, moeda, valor)),
      quem ? h('label', {}, h('span', {}, k.pergunta), quem) : null,
      status ? h('label', {}, h('span', {}, 'Situação'), status) : null,
      k.aviso ? notice(k.aviso, 'cap') : !k.conta && k.id === 'familia' ? notice('Apoio prometido aparece como "previsto": ele só conta como garantido depois de comprovado.', 'users') : null,
      h('button', { type: 'submit', class: 'btn btn-cta' }, icon('check', { size: 16 }), ' Registrar'));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Number(valor.value);
      if (!Number.isFinite(v) || v < 0) return toast('Informe um valor.', 'err');
      try {
        await api.post('/finance/resources', { tipo: k.tipo, descricao: quem?.value.trim() ? `${k.descricao} - ${quem.value.trim()}` : k.descricao, valor: v, moeda: moeda.value, status: status ? status.value : k.status, ...(quem?.value.trim() ? { apoiador: quem.value.trim() } : {}) });
        hub.dirty();
        toast('Recurso registrado.', 'ok');
        draw();
      } catch (err) { toast(err.message, 'err'); }
    });
    queueMicrotask(() => valor.focus());
    return f;
  }
  await draw();
  return host;
}

// ---------- Alternativas de financiamento ----------
export async function AlternativesPanel(m, ctx, hub) {
  const { plano: f } = await plan();
  if (!f.informouRecursos) {
    return h('div', { class: 'stack' }, h('div', { class: 'mh-empty' }, hubIcon('piggy', { size: 28 }), h('p', {}, 'Para eu saber quanto falta, primeiro me diga quanto você já tem, mesmo que seja zero.'), hub.button('Registrar meu dinheiro', 'dinheiro', 'btn btn-cta')),
      h('p', { class: 'small muted' }, 'Enquanto isso, você já pode olhar as bolsas.'), hub.button('Ver bolsas disponíveis', 'bolsas'));
  }
  if (!f.caminhos.length) return h('div', { class: 'mh-empty ok' }, icon('check', { size: 28 }), h('p', {}, 'Pelos seus dados, o dinheiro garantido cobre o plano. Confirme com o consulado quais comprovantes ele aceita.'));
  const ICON = { bolsas: 'cap', economia: 'piggy', familiar: 'users', reduzir: 'home', periodo: 'calendarDays', destinos: 'globe' };
  const target = (c) => (c.id === 'bolsas' ? hub.button('Abrir', 'bolsas') : c.id === 'familiar' ? hub.button('Registrar apoio', 'dinheiro') : c.rota ? linkBtn('Abrir', `#${c.rota}`) : c.id === 'economia' || c.id === 'periodo' ? h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => hub.mentor(c.id === 'economia' ? `Como consigo economizar € ${Math.ceil(f.economiaMensal)} por mês?` : 'Organize minha semana.') }, 'Planejar', ' ', icon('arrow', { size: 14 })) : null);
  return h('div', { class: 'stack' },
    h('p', { class: 'mh-lead' }, `Faltam cerca de ${eur(f.falta)} para o custo estimado${f.deficitVisto ? ` e ${eur(f.deficitVisto)} para a comprovação do visto` : ''}.`),
    h('div', { class: 'mh-paths' }, f.caminhos.map((c) => h('div', { class: 'mh-path' }, h('span', { class: 'mh-path-ic' }, hubIcon(ICON[c.id] || 'wand', { size: 18 })), h('div', {}, h('strong', {}, c.titulo), h('p', {}, c.texto)), target(c)))),
    h('p', { class: 'hint' }, 'Nenhum caminho garante a aprovação do visto. Trabalho na Espanha não substitui a comprovação inicial.'));
}

// ---------- Bolsas disponíveis ----------
export async function ScholarshipsPanel(m, ctx, hub) {
  const host = h('div', { class: 'stack' });
  const draw = async () => {
    const d = await plan();
    const saved = new Map(d.candidaturas.map((a) => [a.catalogId, a]));
    const order = { aberta: 0, futura: 1, 'sem-edital': 2, encerrada: 3 };
    const list = [...d.catalogo].sort((a, b) => order[a.status] - order[b.status]);
    const open = list.filter((s) => s.status === 'aberta').length;
    mount(host,
      h('p', { class: 'mh-lead' }, open ? `${open} bolsa(s) com edital aberto confirmado.` : 'Nenhuma bolsa da nossa base está com edital aberto confirmado agora.'),
      h('div', { class: 'mh-schol' }, list.map((s) => {
        const app = saved.get(s.id);
        const tone = { aberta: 'is-ok', futura: 'is-info', encerrada: 'is-off', 'sem-edital': 'is-warn' }[s.status];
        return h('div', { class: `mh-schol-item ${s.status === 'encerrada' ? 'off' : ''}` },
          h('div', { class: 'mh-schol-top' }, h('strong', {}, s.nome), h('span', { class: `mh-pill ${tone}` }, d.statusBolsa[s.status])),
          h('small', { class: 'muted' }, s.entidade), h('p', {}, s.financia || s.abrangencia),
          h('div', { class: 'row wrap' },
            s.status === 'encerrada' ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: Boolean(app), onClick: async () => { try { await api.post('/finance/scholarships', { catalogId: s.id }); hub.dirty(); toast('Bolsa salva, tarefas criadas na Agenda.', 'ok'); draw(); } catch (e) { toast(e.message, 'err'); } } }, app ? `Acompanhando (${app.status})` : 'Acompanhar'),
            s.url ? h('a', { class: 'btn btn-ghost btn-sm', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Site oficial ', icon('external', { size: 12 })) : null));
      })),
      h('p', { class: 'hint' }, 'Nenhuma bolsa cobre automaticamente o seu mestrado: a elegibilidade é do edital vigente. Bolsa só entra no seu dinheiro quando for concedida.'),
      linkBtn('Gerenciar minhas candidaturas', '#/financiamento#bolsas'));
  };
  await draw();
  return host;
}
