// Mentor Estuvia — interface: botão flutuante, painel lateral e página completa.
// O contexto (jornada, missão e tela) vem da rota atual; o estudante não precisa repetir nada.
// Toda alteração chega como PROPOSTA com prévia: só é executada depois do clique em "Confirmar",
// e o resultado mostrado é o que o servidor realmente fez.
import { h, mount, richText, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, go, currentPath, invalidate, isFocusPath } from '../app.js';
import { renderResult } from './ResultCard.js';
import { locale } from '../i18n.js';

// Estilos próprios, carregados uma vez (CSP: só arquivos do próprio site).
function ensureStyles() {
  if (document.querySelector('link[data-mentor-css]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/mentor.css', 'data-mentor-css': '' }));
}

// Conversa só na memória da aba (o servidor não grava conversas).
const conversations = new Map();
export const resetMentor = () => conversations.clear();
let info = null; // GET /mentor (modo, ações rápidas, avisos)
let pending = null;

const SCREEN = [
  [/^\/j\/[\w-]+\/m\//, 'missao'], [/^\/j\/[\w-]+\/r\//, 'rodada'], [/^\/j\/[\w-]+$/, 'jornadas'], [/^\/jornadas/, 'jornadas'],
  [/^\/agenda/, 'agenda'], [/^\/financiamento/, 'financas'], [/^\/oportunidades/, 'radar'], [/^\/documentos/, 'documentos'],
  [/^\/novo-lar/, 'moradia'], [/^\/viagem/, 'moradia'], [/^\/comunidade/, 'comunidade'], [/^\/$/, 'dashboard'],
];

export function routeContext() {
  const path = currentPath();
  const [, jid, mid] = /^\/j\/([\w-]+)(?:\/m\/(\d\.\d{1,2}))?/.exec(path) || [];
  const tela = SCREEN.find(([re]) => re.test(path))?.[1];
  return { journeyId: jid || state.journeys?.[0]?.id || undefined, missaoId: mid || undefined, tela };
}

const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const eur = (v) => `€ ${Math.round(Number(v) || 0).toLocaleString(locale())}`;
// A CSP bloqueia o atributo style inline: a largura é aplicada via CSSOM.
const fill = (attrs, pct) => { const el = h('span', attrs); el.style.width = `${Math.max(0, Math.min(100, pct))}%`; return el; };
const time = (t) => (t ? `${Number(t.slice(0, 2))}h${t.slice(3) === '00' ? '' : t.slice(3)}` : '');

// ---------------------------------------------------------------------------
// Cartões de resultado
// ---------------------------------------------------------------------------

function card(c, ui) {
  const box = (title, iconName, ...body) => h('div', { class: `mt-card mt-${c.tipo}` }, title ? h('div', { class: 'mt-card-head' }, icon(iconName, { size: 15 }), h('strong', {}, title)) : null, ...body);
  switch (c.tipo) {
    case 'avisos':
      return box('Avisos para você', 'bell', h('ul', { class: 'mt-list' }, c.itens.map((a) => h('li', { class: `mt-aviso p-${a.prioridade}` },
        h('div', {}, h('strong', {}, a.titulo), h('p', {}, a.texto)),
        a.acao ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => ui.act(a.acao) }, a.acao.rotulo) : null))));
    case 'limitacao':
      return box('O que eu ainda não faço', 'lock', h('p', {}, c.motivo), h('p', { class: 'muted' }, h('strong', {}, 'Alternativa: '), c.alternativa));
    case 'missao': {
      const m = c.missao;
      return box(`Missão ${m.label}`, 'target', h('p', {}, h('strong', {}, m.titulo), ' · ', h('span', { class: 'muted' }, m.statusLabel)),
        m.objetivosLista ? h('ul', { class: 'mt-checks' }, m.objetivosLista.map((o) => h('li', { class: o.feito ? 'done' : '' }, icon(o.feito ? 'check' : 'minus', { size: 13 }), o.texto))) : null,
        m.prazo ? h('p', { class: 'small' }, icon('clock', { size: 13 }), ` Prazo: ${fmt(m.prazo.data)} (${m.prazo.origem === 'oficial' ? 'oficial' : m.prazo.origem === 'previsto' ? 'previsão' : 'informado por você'})`) : null,
        m.journeyId ? h('a', { class: 'btn btn-sm', href: `#/j/${m.journeyId}/m/${m.id}`, onClick: ui.close }, 'Abrir missão') : null);
    }
    case 'missoes':
      return box(c.titulo || 'Missões', 'flag', c.grupos.map((g) => h('div', { class: 'mt-group' }, h('p', { class: 'mt-group-title' }, `${g.titulo} (${g.itens.length})`),
        h('ul', { class: 'mt-list' }, g.itens.slice(0, 6).map((m) => h('li', {},
          c.journeyId || state.journeys?.[0]?.id ? h('a', { href: `#/j/${c.journeyId || state.journeys[0].id}/m/${m.id}`, onClick: ui.close }, `${m.label} - ${m.titulo}`) : `${m.label} - ${m.titulo}`,
          m.bloqueadaPor?.length ? h('span', { class: 'muted small' }, ` · falta: ${m.bloqueadaPor.join(', ')}`) : m.prazo ? h('span', { class: 'muted small' }, ` · prazo ${fmt(m.prazo.data)}`) : null))))));
    case 'jornada': {
      const j = c.jornada;
      return box(j.destino.programa || 'Sua jornada', 'compass', h('div', { class: 'mt-progress' }, fill({}, j.progresso)),
        h('p', { class: 'small' }, `${j.progresso}% · Rodada ${j.rodadaAtual.numero} - ${j.rodadaAtual.titulo}`),
        h('ul', { class: 'mt-rounds' }, j.rodadas.map((r) => h('li', { class: r.status }, h('span', {}, r.numero), r.titulo))));
    }
    case 'eventos':
      return box(c.titulo || 'Agenda', 'calendar',
        c.eventos.length ? h('ul', { class: 'mt-list' }, c.eventos.map((e) => h('li', {}, h('strong', {}, `${fmt(e.data).slice(0, 5)} ${time(e.inicio)}`), ` ${e.titulo}`, e.prazoOficial ? h('span', { class: 'mt-pill' }, 'prazo oficial') : null))) : null,
        c.prazos?.length ? h('ul', { class: 'mt-list' }, c.prazos.map((p) => h('li', {}, icon('flag', { size: 13 }), ` ${fmt(p.data)} - ${p.titulo} `, h('span', { class: `mt-pill o-${p.origem}` }, p.origem === 'oficial' ? 'oficial' : p.origem === 'previsto' ? 'previsão' : 'informado por você')))) : null,
        !c.eventos.length && !c.prazos?.length ? h('p', { class: 'muted' }, 'Nada marcado.') : null);
    case 'agenda-semana': {
      const days = new Map();
      c.itens.forEach((it, i) => { if (!days.has(it.data)) days.set(it.data, []); days.get(it.data).push({ it, i }); });
      const editable = ui.proposal?.passos?.[0]?.ferramenta === 'create_calendar_event' && ui.proposal.passos[0].editavel?.includes('itens');
      return box('Proposta da semana', 'calendar',
        h('div', { class: 'mt-week' }, [...days].map(([d, list]) => h('div', { class: 'mt-day' }, h('p', { class: 'mt-day-title' }, new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })),
          list.map(({ it, i }) => h('label', { class: `mt-block p-${it.prioridade || 'normal'}` },
            editable ? h('input', { type: 'checkbox', checked: true, dataset: { idx: i }, onChange: (e) => ui.toggleItem(i, e.target.checked) }) : null,
            h('span', { class: 'mt-block-time' }, `${time(it.inicio)}–${time(it.fim)}`), h('span', {}, it.titulo), it.motivo ? h('small', { class: 'muted' }, it.motivo) : null))))),
        c.naoAgendadas?.length ? h('p', { class: 'small muted' }, `Ficaram para depois: ${c.naoAgendadas.map((x) => x.titulo).slice(0, 3).join('; ')}`) : null,
        c.prazos?.length ? h('p', { class: 'small' }, icon('flag', { size: 13 }), ` Prazos da semana: ${c.prazos.map((p) => `${p.titulo} (${fmt(p.data)})`).join('; ')}`) : null,
        editable ? h('p', { class: 'hint' }, 'Desmarque os blocos que não quer salvar.') : null);
    }
    case 'financas': {
      const max = Math.max(c.necessario || 0, 1);
      const bar = (v, cls) => fill({ class: cls }, (v / max) * 100);
      return box('Resumo financeiro (estimativa)', 'euro',
        h('div', { class: 'mt-money' },
          h('div', {}, h('small', { class: 'muted' }, 'Necessário'), h('strong', {}, eur(c.necessario))),
          h('div', {}, h('small', { class: 'muted' }, 'Garantido'), h('strong', { class: 'ok' }, eur(c.garantidos))),
          h('div', {}, h('small', { class: 'muted' }, 'Falta'), c.deficit === null || c.deficit === undefined ? h('strong', { class: 'muted', title: 'Informe quanto você já tem (mesmo que zero)' }, '-') : h('strong', { class: c.deficit ? 'warn' : 'ok' }, eur(c.deficit)))),
        h('div', { class: 'mt-bar' }, bar(c.garantidos, 'g'), bar(c.naoGarantidos || 0, 'n')),
        h('p', { class: 'small muted' }, `Prometido/solicitado (não conta): ${eur(c.naoGarantidos || 0)}${c.base ? ` · base: ${c.base}` : ''}`),
        c.simulacao ? h('p', { class: 'small' }, icon('wand', { size: 13 }), ` Simulação (nada gravado): com ${eur(c.simulacao.valorEur)}, faltariam ${eur(c.simulacao.deficitDepois)}.`) : null,
        c.economia ? h('p', { class: 'small' }, `Guardando ${eur(c.economia.porMes)}/mês: ${c.economia.mesesParaCobrir} mês(es) · faltam ~${c.economia.mesesAteViagem} até a viagem.`) : null,
        c.recursos?.length ? h('ul', { class: 'mt-list small' }, c.recursos.map((r) => h('li', {}, `${r.descricao}: ${eur(r.valorEur)} `, h('span', { class: `mt-pill ${r.contaComoGarantido ? 'o-oficial' : 'o-declarado'}` }, r.statusLabel)))) : null,
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/financiamento', onClick: ui.close }, 'Abrir planejamento'));
    }
    case 'oportunidades':
      return box('Radar de Oportunidades', 'search', h('ul', { class: 'mt-list' }, c.itens.map((o) => h('li', { class: 'mt-opp' },
        h('div', {}, h('a', { href: `#/oportunidades/${o.id}`, onClick: ui.close }, o.programa), h('small', { class: 'muted' }, ` · ${o.universidade} · ${o.anoAcademico}`)),
        h('span', { class: `mt-state s-${o.estado}` }, o.estadoLabel),
        o.abertura || o.prazoFinal ? h('small', {}, `${o.abertura ? `abre ${fmt(o.abertura)}` : ''}${o.prazoFinal ? ` · até ${fmt(o.prazoFinal)}` : ''}`) : null,
        o.demo ? h('span', { class: 'mt-pill o-declarado' }, 'DADO DEMONSTRATIVO') : null))),
        h('p', { class: 'hint' }, 'Situação verificada na fonte oficial.'));
    case 'bolsas':
      return box('Bolsas', 'cap', h('ul', { class: 'mt-list' }, c.itens.map((b) => h('li', {}, h('strong', {}, b.nome), h('small', { class: 'muted' }, ` · ${b.entidade}`), ' ', h('span', { class: `mt-pill ${b.status === 'aberta' ? 'o-oficial' : 'o-declarado'}` }, b.statusLabel), b.salva ? h('span', { class: 'mt-pill' }, 'acompanhando') : null))),
        h('p', { class: 'hint' }, 'Nenhuma bolsa cobre automaticamente o seu mestrado: confira o edital.'));
    case 'documentos':
      return box('Documentos', 'file', h('ul', { class: 'mt-list mt-docs' }, c.itens.map((d) => h('li', { class: d.pendente ? 'pend' : 'ok' },
        icon(d.pendente ? 'minus' : 'check', { size: 13 }), h('span', {}, d.rota ? h('a', { href: `#${d.rota}`, onClick: ui.close }, d.nome) : d.nome, h('small', { class: 'muted' }, ` · ${d.statusSimples || d.statusLabel}${d.exigencia !== 'requerido' ? ` · ${d.exigencia === 'condicional' ? 'conforme o caso' : 'verificar'}` : ''}`)),
        d.pendente ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => ui.send(`Meu ${d.nome.toLowerCase()} está pronto`) }, 'Ficou pronto') : null))),
        c.consulado ? h('p', { class: 'small' }, `Consulado: ${c.consulado.nome}`) : null,
        c.proximo ? h('a', { class: 'btn btn-sm', href: `#${c.proximo.rota}`, onClick: ui.close }, c.proximo.acao || 'Abrir documento') : h('a', { class: 'btn btn-sm btn-ghost', href: '#/documentos', onClick: ui.close }, 'Abrir meus documentos'),
        h('p', { class: 'hint' }, c.aviso || '"Pronto" organiza seu checklist; não é validação oficial.'));
    case 'moradias':
      return box('Moradias', 'home', h('table', { class: 'mt-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Opção'), h('th', {}, '/mês'), h('th', {}, 'Entrada'), h('th', {}, 'Antifraude'))),
        h('tbody', {}, c.itens.map((o) => h('tr', { class: c.destaque === o.id ? 'best' : '' }, h('td', {}, o.nome), h('td', {}, `${o.moeda === 'BRL' ? 'R$' : '€'}${o.mensal}`), h('td', {}, `${o.moeda === 'BRL' ? 'R$' : '€'}${o.entrada}`), h('td', {}, `${o.checklistFeito}/${o.checklistTotal}`))))),
        h('p', { class: 'hint' }, 'Entrada = caução + 1º mês. Valores informados por você.'));
    case 'viagem': {
      const v = c.viagem;
      return box(v.escolhida ? `Minha viagem: ${v.escolhida.percurso || v.escolhida.rota}` : 'Minha viagem', 'plane',
        h('p', { class: 'small' }, `${v.origem?.nome || 'Origem a definir'} → ${v.destino?.cidade || 'destino'} · ${v.statusLabel}${v.dataViagem ? ` · ${fmt(v.dataViagem)}` : ''}`),
        v.cotacoes?.length ? h('ul', { class: 'mt-list small' }, v.cotacoes.map((q) => h('li', {}, h('strong', {}, q.rota), ` - ${q.total === null ? 'preço a consultar' : eur(q.total)}${q.completo ? '' : ' (faltam itens)'}`, q.escolhida ? h('span', { class: 'mt-pill o-oficial' }, q.comprada ? 'comprada' : 'escolhida') : null))) : h('p', { class: 'small muted' }, 'Nenhuma cotação salva ainda.'),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/viagem', onClick: ui.close }, 'Abrir Minha viagem'));
    }
    case 'riscos':
      return box('Sinais de risco', 'shield', c.sinais.length ? h('ul', { class: 'mt-list warn' }, c.sinais.map((s) => h('li', {}, icon('alert', { size: 13 }), ` ${s}`))) : h('p', {}, 'Nenhum sinal identificado no texto, isso não garante segurança.'),
        c.checklist?.length ? h('details', {}, h('summary', {}, `Checklist antifraude (${c.checklist.length} pendente(s))`), h('ul', { class: 'mt-list small' }, c.checklist.map((x) => h('li', {}, x)))) : null);
    case 'email': {
      const text = `Assunto: ${c.assunto}\n\n${c.corpo}`;
      return box('Rascunho de e-mail (não enviado)', 'mail',
        h('p', { class: 'small' }, h('strong', {}, 'Para: '), c.para), h('p', { class: 'small' }, h('strong', {}, 'Assunto: '), c.assunto),
        h('pre', { class: 'mt-email' }, c.corpo),
        h('button', { type: 'button', class: 'btn btn-sm', onClick: async () => { try { await navigator.clipboard.writeText(text); toast('Rascunho copiado. Revise e envie pelo seu e-mail.', 'ok'); } catch { toast('Não consegui copiar: selecione o texto manualmente.', 'err'); } } }, icon('copy', { size: 14 }), ' Copiar'),
        c.dicas?.length ? h('ul', { class: 'mt-list small muted' }, c.dicas.map((d) => h('li', {}, d))) : null);
    }
    case 'fontes':
      return box('Base de conhecimento', 'book', h('ul', { class: 'mt-list' }, c.trechos.map((t) => h('li', {}, h('strong', {}, t.titulo), h('p', { class: 'small' }, t.texto), h('small', { class: 'muted' }, `${t.naturezaLabel}${t.fonte ? ` · ${t.fonte.orgao}` : ''}${t.verificadoEm ? ` · verificado em ${fmt(t.verificadoEm)}` : ''}`)))));
    case 'web':
      // Resultados de busca: título (link), quem publicou, natureza e data — o estudante julga cada fonte.
      return box(`Na web: "${c.consulta}"`, 'globe',
        h('ul', { class: 'mt-web' }, c.itens.map((i) => h('li', { class: `n-${i.natureza}` },
          h('a', { href: i.url, target: '_blank', rel: 'noopener noreferrer' }, i.titulo, ' ', icon('external', { size: 11 })),
          i.resumo ? h('p', { class: 'small muted' }, i.resumo) : null,
          h('small', {}, h('span', { class: 'mt-nat' }, i.naturezaLabel), i.fonte ? ` · ${i.fonte}` : '', i.publicadoEm ? ` · ${fmt(i.publicadoEm.slice(0, 10))}` : '')))),
        h('p', { class: 'small muted' }, `${c.aviso} Consultado em ${new Date(c.consultadoEm).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}.`));
    case 'videos': {
      const player = h('div', { class: 'mt-player' });
      const play = (v) => {
        // Player sem cookies (youtube-nocookie), carregado só quando o estudante toca no vídeo.
        mount(player, h('iframe', { src: `${v.embedUrl}?autoplay=1&rel=0`, title: v.titulo, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' }),
          h('a', { class: 'small', href: v.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir no YouTube ', icon('external', { size: 11 })));
      };
      return box(c.itens?.length ? 'Vídeos e aulas' : 'Buscar no YouTube', 'play',
        c.itens?.length ? [player, h('ul', { class: 'mt-videos' }, c.itens.map((v) => h('li', {},
          h('button', { type: 'button', class: 'mt-video', onClick: () => play(v), 'aria-label': `Assistir: ${v.titulo}` },
            h('img', { src: v.thumb, alt: '', loading: 'lazy', width: 160, height: 90 }),
            h('span', {}, h('strong', {}, v.titulo), h('small', { class: 'muted' }, `${v.canal}${v.publicadoEm ? ` · ${fmt(v.publicadoEm.slice(0, 10))}` : ''}`))))))] : null,
        h('a', { class: 'btn btn-sm btn-ghost', href: c.linkBusca, target: '_blank', rel: 'noopener noreferrer' }, icon('search', { size: 13 }), ` Ver "${c.consulta}" no YouTube`),
        h('p', { class: 'small muted' }, c.aviso));
    }
    case 'lista':
      return box(c.titulo, 'check', h('ul', { class: 'mt-list' }, c.itens.map((x) => h('li', {}, x))));
    case 'memoria':
      return box('O que o Mentor usa', 'user', h('ul', { class: 'mt-list small' }, c.permissoes.map((p) => h('li', {}, icon(p.ativo ? 'check' : 'x', { size: 13 }), ` ${p.rotulo}`))),
        c.notas?.length ? h('p', { class: 'small' }, `Pendências lembradas: ${c.notas.map((n) => n.texto).join('; ')}`) : null);
    default:
      // Resultados estruturados (consulado, checklist, oportunidade, ação): componentes compartilhados com as telas.
      return renderResult(c, { compacto: true, onNavegar: ui.close });
  }
}

// ---------------------------------------------------------------------------
// Proposta (pré-visualização + confirmação + feedback real)
// ---------------------------------------------------------------------------

function proposalCard(p, ui) {
  const edits = {};
  const removed = new Set();
  const step0 = p.passos[0];
  const single = step0?.ferramenta === 'create_calendar_event' && step0.entrada?.itens?.length === 1 ? step0.entrada.itens[0] : null;
  const fields = [];
  if (single && step0.editavel?.includes('data')) {
    const dur = (Number(single.fim.slice(0, 2)) * 60 + Number(single.fim.slice(3))) - (Number(single.inicio.slice(0, 2)) * 60 + Number(single.inicio.slice(3)));
    const d = h('input', { type: 'date', value: single.data, 'aria-label': 'Data' });
    const t = h('input', { type: 'time', value: single.inicio, step: 900, 'aria-label': 'Horário' });
    const sync = () => {
      const m = Number(t.value.slice(0, 2)) * 60 + Number(t.value.slice(3)) + dur;
      edits[0] = { itens: [{ ...single, data: d.value, inicio: t.value, fim: `${String(Math.min(23, Math.floor(m / 60))).padStart(2, '0')}:${String(m >= 1440 ? 59 : m % 60).padStart(2, '0')}` }] };
    };
    d.addEventListener('change', sync); t.addEventListener('change', sync);
    fields.push(h('div', { class: 'mt-edit' }, h('label', {}, 'Dia ', d), h('label', {}, 'Hora ', t)));
  }
  if (step0?.ferramenta === 'update_calendar_event' && step0.editavel) {
    const d = h('input', { type: 'date', value: step0.entrada.data || '', 'aria-label': 'Nova data' });
    const t = h('input', { type: 'time', value: step0.entrada.inicio || '', step: 900, 'aria-label': 'Novo horário' });
    const sync = () => { edits[0] = { data: d.value, ...(t.value ? { inicio: t.value } : {}) }; };
    d.addEventListener('change', sync); t.addEventListener('change', sync);
    fields.push(h('div', { class: 'mt-edit' }, h('label', {}, 'Nova data ', d), h('label', {}, 'Hora ', t)));
  }
  if (step0?.ferramenta === 'register_arrival') {
    const d = h('input', { type: 'date', value: step0.entrada.dataEntrada, max: new Date().toISOString().slice(0, 10), 'aria-label': 'Data de entrada' });
    d.addEventListener('change', () => { edits[0] = { dataEntrada: d.value }; });
    fields.push(h('div', { class: 'mt-edit' }, h('label', {}, 'Data de entrada na Espanha ', d)));
  }
  if (step0?.ferramenta === 'update_financial_resource' && step0.editavel?.includes('valor')) {
    const v = h('input', { type: 'number', min: 0, step: 50, value: step0.entrada.valor, 'aria-label': 'Valor' });
    v.addEventListener('change', () => { edits[0] = { valor: Number(v.value) }; });
    fields.push(h('div', { class: 'mt-edit' }, h('label', {}, `Valor (${step0.entrada.moeda}) `, v)));
  }

  const status = h('div', { class: 'mt-status', 'aria-live': 'polite' });
  const ok = h('button', { type: 'button', class: 'btn btn-cta btn-sm' }, icon('check', { size: 14 }), ` ${p.confirmarRotulo}`);
  const no = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, p.cancelarRotulo);
  const root = h('div', { class: 'mt-card mt-proposal' },
    h('div', { class: 'mt-card-head' }, icon('wand', { size: 15 }), h('strong', {}, p.titulo), h('span', { class: 'mt-pill' }, 'aguardando sua confirmação')),
    h('ol', { class: 'mt-steps' }, p.passos.map((s) => h('li', {}, h('p', {}, s.resumo),
      s.detalhes?.length && !(s.ferramenta === 'create_calendar_event' && s.editavel?.includes('itens')) ? h('ul', { class: 'small muted' }, s.detalhes.slice(0, 8).map((d) => h('li', {}, d))) : null,
      s.avisos?.length ? h('ul', { class: 'small mt-warn' }, s.avisos.map((a) => h('li', {}, icon('alert', { size: 12 }), ` ${a}`))) : null))),
    fields, h('div', { class: 'mt-actions' }, ok, no), status);

  ui.toggleItem = (i, on) => { if (on) removed.delete(i); else removed.add(i); };
  const finish = (cls, text) => { ok.remove(); no.remove(); fields.forEach((f) => f.remove()); root.querySelectorAll('input[type=checkbox]').forEach((c) => { c.disabled = true; }); status.className = `mt-status ${cls}`; status.replaceChildren(text); };
  ok.addEventListener('click', async () => {
    ok.disabled = true; no.disabled = true;
    if (removed.size && step0?.editavel?.includes('itens')) {
      const itens = step0.entrada.itens.filter((_, i) => !removed.has(i));
      if (!itens.length) { ok.disabled = false; no.disabled = false; return toast('Mantenha pelo menos um bloco, ou toque em "Agora não".', 'err'); }
      edits[0] = { itens };
    }
    try {
      const r = await api.post(`/mentor/actions/${p.id}/confirm`, { edicoes: edits });
      finish('ok', h('span', {}, icon('check', { size: 14 }), ' Feito pela Estuvia'));
      invalidate();
      ui.assistantSays(r.texto, { cartoes: eventsCards(r) });
      document.dispatchEvent(new CustomEvent('padapal:data-changed', { detail: { origem: 'mentor', resultados: r.resultados } }));
    } catch (e) {
      finish('err', h('span', {}, icon('alert', { size: 14 }), ` Não executado: ${e.message}`));
      ui.assistantSays(`Não consegui executar: ${e.message}`);
    }
  });
  no.addEventListener('click', async () => {
    ok.disabled = true; no.disabled = true;
    await api.post(`/mentor/actions/${p.id}/cancel`).catch(() => {});
    finish('muted', 'Cancelado: nada foi alterado.');
  });
  return root;
}

// Eventos de progresso devolvidos pelo motor (missão concluída, rodada desbloqueada…).
function eventsCards(r) {
  const evs = (r.resultados || []).flatMap((x) => x.dados?.eventos || []);
  const lines = evs.map((e) => (e.tipo === 'missao-concluida' ? `Missão ${e.label} concluída` : e.tipo === 'rodada-desbloqueada' ? `Rodada ${e.numero} desbloqueada: ${e.titulo}` : e.tipo === 'desbloqueio' ? `Novas missões liberadas: ${e.missoes.map((m) => m.label).join(', ')}` : e.tipo === 'marco' ? `Marco conquistado: ${e.titulo}` : null)).filter(Boolean);
  return lines.length ? [{ tipo: 'lista', titulo: 'Progresso', itens: lines }] : [];
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export function MentorPanel({ compact = false, onClose = null } = {}) {
  ensureStyles();
  const ctx = { ...routeContext(), ...(pending || {}) };
  const key = ctx.journeyId || 'geral';
  const history = conversations.get(key) || [];
  conversations.set(key, history);

  const j = ctx.journeyId ? state.jcache?.get(ctx.journeyId) : null;
  const mission = j && ctx.missaoId ? j.rodadas.flatMap((r) => r.missoes).find((m) => m.id === ctx.missaoId) : null;
  const modeBadge = h('span', { class: 'mt-mode' }, '…');
  const title = h('h2', {}, 'Mentor Estuvia');
  const subtitle = h('p', { class: 'muted small' }, 'Consulta seus dados reais e executa ações quando você confirma.');
  const ctxBar = h('div', { class: 'mt-context' }, icon('target', { size: 13 }),
    h('span', {}, j ? `${j.destino.universidade?.sigla || 'Jornada'} · Rodada ${j.rodadaAtual}${mission ? ` · Missão ${mission.label} - ${mission.titulo}` : ''}` : 'Contexto: suas jornadas e dados cadastrados'));

  const log = h('div', { class: 'mt-log', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 1, maxlength: 3000, placeholder: mission ? `Pergunte sobre a Missão ${mission.label}…` : 'Ex.: "Agende para amanhã a tarefa de pedir meu histórico"', 'aria-label': 'Sua mensagem' });
  const sendBtn = h('button', { class: 'btn btn-cta mt-send', type: 'submit', 'aria-label': 'Enviar' }, icon('send', { size: 16 }));
  const form = h('form', { class: 'mt-form' }, input, sendBtn);
  const quick = h('div', { class: 'mt-quick chips' });

  const ui = {
    proposal: null,
    close: () => { if (onClose) onClose(); },
    act: (a) => {
      if (!a) return;
      if (a.tipo === 'mensagem') return send(a.mensagem, a.rotulo);
      if (a.tipo === 'acao') return send(null, a.rotulo, a.acao);
      if (a.tipo === 'rota') { ui.close(); return go(a.rota); }
      if (a.tipo === 'abrir-memoria') { ui.close(); return go('/mentor/memoria'); }
    },
    send: (m) => send(m),
    assistantSays: (texto, extra = {}) => render({ texto, ...extra }, false),
    toggleItem: () => {},
  };

  const bubble = (role, nodes) => {
    const el = h('div', { class: `mt-msg ${role}` }, role === 'assistant' ? h('span', { class: 'mt-avatar' }, icon('chat', { size: 14 })) : null, h('div', { class: 'mt-bubble' }, nodes));
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el.lastChild;
  };

  function render(r, save = true) {
    const out = bubble('assistant', [
      r.aviso ? h('p', { class: 'mt-notice' }, icon('alert', { size: 13 }), ` ${r.aviso}`) : null,
      richText(r.texto || ''),
    ]);
    ui.proposal = r.proposta || null;
    for (const c of r.cartoes || []) { const el = card(c, ui); if (el) out.append(el); }
    if (r.proposta) out.append(proposalCard(r.proposta, ui));
    if (r.fontes?.length) out.append(h('div', { class: 'mt-sources small' }, 'Fontes: ', r.fontes.map((f, i) => [i ? ' · ' : '', f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.titulo || f.orgao) : (f.titulo || f.orgao)])));
    if (r.sugestoes?.length) out.append(h('div', { class: 'chips mt-sug' }, r.sugestoes.map((s) => h('button', { type: 'button', class: 'chip', onClick: () => ui.act(s) }, s.rotulo))));
    if (r.ferramentas?.length) out.append(h('details', { class: 'mt-trace' }, h('summary', {}, `${r.modo === 'ia' ? 'IA' : 'Modo Guiado'} · ${r.ferramentas.length} consulta(s)`), h('ul', {}, r.ferramentas.map((f) => h('li', {}, `${f.nome} ${f.ok ? '✓' : '✗'}${f.efeito === 'escrita' ? ' (proposta)' : ''}`)))));
    if (save) history.push({ role: 'assistant', content: r.texto || '' });
    log.scrollTop = log.scrollHeight;
  }

  async function send(mensagem, rotulo, acao) {
    const label = rotulo || mensagem;
    if (!label) return;
    bubble('user', richText(label));
    const typing = bubble('assistant', h('span', { class: 'mt-typing' }, h('i'), h('i'), h('i')));
    sendBtn.disabled = true;
    try {
      const r = await api.post('/mentor/message', { ...(acao ? { acao } : { mensagem }), contexto: { journeyId: ctx.journeyId, missaoId: ctx.missaoId, tela: ctx.tela }, historico: history.slice(-10) });
      typing.parentElement.remove();
      history.push({ role: 'user', content: label });
      render(r);
    } catch (e) {
      typing.replaceChildren(h('p', {}, e.message));
    } finally {
      sendBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    input.style.height = 'auto';
    send(q);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; });

  const root = h('section', { class: `mt ${compact ? 'mt-compact' : 'mt-page'}` },
    h('header', { class: 'mt-head' },
      h('span', { class: 'mt-logo' }, icon('chat', { size: 20 })),
      h('div', { class: 'mt-head-text' }, h('div', { class: 'mt-title' }, title, modeBadge), subtitle),
      h('button', { class: 'icon-btn', type: 'button', title: 'O que o Mentor sabe', 'aria-label': 'O que o Mentor sabe', onClick: () => ui.act({ tipo: 'abrir-memoria' }) }, icon('user', { size: 17 })),
      compact ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar Mentor', onClick: ui.close }, icon('x', { size: 18 })) : null),
    ctxBar, log, quick, form);

  const start = (data) => {
    info = data;
    const guided = data.modo === 'guiado';
    title.textContent = guided ? 'Assistente Estuvia' : 'Mentor Estuvia';
    modeBadge.textContent = guided ? 'Modo Guiado' : 'IA ativa';
    modeBadge.title = guided ? 'Respostas por regras e dados reais da Estuvia, sem IA generativa.' : `Provedor: ${data.provedor}`;
    modeBadge.className = `mt-mode ${guided ? 'guided' : 'ai'}`;
    mount(quick, data.acoesRapidas.map((q) => h('button', { type: 'button', class: 'chip', onClick: () => send(null, q.rotulo, q.id) }, q.rotulo)));
    if (!history.length) {
      const name = state.me?.user?.profile?.apelido || state.me?.user?.profile?.nome?.split(' ')[0] || '';
      render({
        texto: `Oi${name ? `, ${name}` : ''}! Eu sou o **${guided ? 'Assistente Estuvia (Modo Guiado)' : 'Mentor Estuvia'}**. ${mission ? `Estou vendo que você está na **Missão ${mission.label} - ${mission.titulo}**. ` : ''}Consulto sua jornada, agenda, documentos e finanças, e faço as ações quando você confirma.\n\nComo posso ajudar?`,
        cartoes: data.avisos?.length ? [{ tipo: 'avisos', itens: data.avisos.slice(0, 3) }] : [],
      }, false);
    } else {
      history.forEach((m) => bubble(m.role, richText(m.content)));
    }
    consume();
  };
  const consume = () => { if (pending) { const p = pending; pending = null; if (p.mensagem || p.acao) send(p.mensagem || null, p.rotulo || p.mensagem, p.acao); } };
  if (info) queueMicrotask(() => start(info));
  api.get('/mentor').then(start).catch(() => { modeBadge.textContent = 'offline'; });
  document.addEventListener('padapal:mentor-ask', () => { if (root.isConnected) { Object.assign(ctx, pending || {}); consume(); } });
  return root;
}

// ---------------------------------------------------------------------------
// Botão flutuante + gaveta (mesma API do painel anterior: mount/open)
// ---------------------------------------------------------------------------

let drawer = null;

/** Abre o Mentor de qualquer tela. ctx opcional: { mensagem?, acao?, rotulo?, missaoId?, journeyId? } */
export function openMentor(ctx = null) {
  pending = ctx;
  if (currentPath() === '/assistente' || currentPath() === '/mentor') return document.dispatchEvent(new CustomEvent('padapal:mentor-ask'));
  openDrawer();
}

export function mountMentorLauncher() {
  ensureStyles();
  const host = document.getElementById('assistant-root');
  if (!host) return;
  // Não aparece no cadastro/login nem durante o onboarding (isFocusPath): o estudante fica no fluxo.
  const show = Boolean(state.me) && !['/assistente', '/mentor'].includes(currentPath()) && !isFocusPath(currentPath());
  if (!show) { closeDrawer(); return mount(host); }
  if (host.querySelector('.mt-fab')) return;
  mount(host, h('button', { class: 'mt-fab', type: 'button', 'aria-label': 'Abrir Mentor Estuvia', onClick: () => openDrawer() }, icon('chat', { size: 22 }), h('span', {}, 'Mentor')));
}

function openDrawer() {
  closeDrawer();
  drawer = h('div', { class: 'mt-drawer', role: 'dialog', 'aria-label': 'Mentor Estuvia' }, MentorPanel({ compact: true, onClose: closeDrawer }));
  document.body.append(drawer);
  requestAnimationFrame(() => drawer?.classList.add('open'));
  drawer.querySelector('textarea')?.focus();
  document.addEventListener('keydown', escClose);
}
function closeDrawer() {
  if (!drawer) return;
  const d = drawer;
  drawer = null;
  d.classList.remove('open');
  setTimeout(() => d.remove(), 200);
  document.removeEventListener('keydown', escClose);
}
const escClose = (e) => { if (e.key === 'Escape') closeDrawer(); };
window.addEventListener('hashchange', () => { if (drawer) closeDrawer(); });

// ---------------------------------------------------------------------------
// Páginas: Mentor em tela cheia e "O que o Mentor sabe"
// ---------------------------------------------------------------------------

export function mentorPageView() {
  ensureStyles();
  return h('div', { class: 'page mt-page-wrap' }, MentorPanel({ compact: false }));
}

export async function mentorMemoryView() {
  ensureStyles();
  const root = h('div', { class: 'page mt-memory' });
  const load = async () => {
    const d = await api.get('/mentor/memory');
    const toggle = (group, id, value) => api.put('/mentor/preferences', { [group]: { [id]: value } }).then(() => toast('Preferência salva.', 'ok')).catch((e) => toast(e.message, 'err'));
    const sw = (checked, onChange) => h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) });
    mount(root,
      h('header', { class: 'page-head' }, h('h1', {}, 'O que o Mentor sabe'), h('p', { class: 'muted' }, d.conversas)),
      h('section', { class: 'mt-card' }, h('div', { class: 'mt-card-head' }, icon('lock', { size: 15 }), h('strong', {}, 'Acessos do Mentor')),
        h('p', { class: 'small muted' }, 'Desligue o que você não quer que o Mentor consulte. Ele explica quando um acesso está desligado.'),
        h('ul', { class: 'mt-switches' }, Object.entries(d.rotulos.permissoes).map(([id, rot]) => h('li', {}, h('label', {}, sw(d.permissoes[id] !== false, (v) => toggle('permissoes', id, v).then(load)), ` ${rot}`))))),
      h('section', { class: 'mt-card' }, h('div', { class: 'mt-card-head' }, icon('bell', { size: 15 }), h('strong', {}, 'Avisos proativos')),
        h('label', {}, sw(d.preferencias.proativo !== false, (v) => api.put('/mentor/preferences', { preferencias: { proativo: v } }).then(load)), ' Receber avisos do Mentor'),
        h('ul', { class: 'mt-switches' }, Object.entries(d.rotulos.tiposAviso).map(([id, rot]) => h('li', {}, h('label', {}, sw(d.preferencias.tiposAviso?.[id] !== false, (v) => api.put('/mentor/preferences', { preferencias: { tiposAviso: { [id]: v } } }).then(load)), ` ${rot}`))))),
      h('section', { class: 'mt-card' }, h('div', { class: 'mt-card-head' }, icon('book', { size: 15 }), h('strong', {}, 'Pendências que pedi para lembrar')),
        d.notas.length ? h('ul', { class: 'mt-list' }, d.notas.map((n) => h('li', {}, `${n.texto} `, h('small', { class: 'muted' }, n.resolvidaEm ? '(resolvida)' : `(${fmt(n.criadaEm.slice(0, 10))})`), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Apagar', onClick: () => api.del(`/mentor/memory/notes/${n.id}`).then(load) }, icon('trash', { size: 14 }))))) : h('p', { class: 'muted' }, 'Nada guardado.')),
      h('section', { class: 'mt-card' }, h('div', { class: 'mt-card-head' }, icon('target', { size: 15 }), h('strong', {}, 'O que o Mentor vê agora (resumo)')), h('pre', { class: 'mt-ctx' }, d.contexto)),
      h('section', { class: 'mt-card' }, h('div', { class: 'mt-card-head' }, icon('clock', { size: 15 }), h('strong', {}, 'Ações do Mentor (registro)')),
        d.historico.length ? h('ul', { class: 'mt-list small' }, d.historico.slice(0, 30).map((x) => h('li', {}, h('strong', {}, new Date(x.em).toLocaleString(locale())), ` · ${x.resultado} · ${x.resumo}`, x.erro ? h('span', { class: 'muted' }, ` (${x.erro})`) : null))) : h('p', { class: 'muted' }, 'Nenhuma ação ainda.')),
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => { await api.del('/mentor/memory'); toast('Memória e registro apagados.', 'ok'); load(); } }, icon('trash', { size: 14 }), ' Apagar pendências e registro'),
    );
  };
  await load();
  return root;
}
