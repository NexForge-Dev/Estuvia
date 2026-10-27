// Tela de execução de uma missão: objetivo, porquê, checklist interativo, instruções,
// ferramenta da missão, documentos (com anexos locais), fontes, prazos, assistente e conclusão.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { progressBar, statusChip, priorityTag, deadlineTag, fmtDate, pctLabel } from './common.js';
import { MissionTool } from './MissionTools.js';
import { MissionDocuments } from './documents/MissionDocuments.js';

export const DOC_STATUS = [['pendente', 'Pendente'], ['em-preparacao', 'Em preparação'], ['pronto', 'Pronto para envio'], ['enviado', 'Enviado'], ['correcao', 'Necessita correção'], ['nao-se-aplica', 'Não se aplica']];
const EXIG = { requerido: ['Requerido', 'req-requerido'], condicional: ['Conforme o caso', 'req-verificar'], verificar: ['Verificar', 'req-verificar'] };
const TAGS = { verificado: ['Fonte oficial verificada', 'tag-ok'], pratica: ['Orientação prática', 'tag-info'], estimativa: ['Estimativa', 'tag-warn'], pendente: ['Pendente de confirmação', 'tag-pending'] };

// ---------- Checklist de objetivos (MissionChecklist) ----------

export function MissionChecklist(objetivos, { disabled, situacaoAberta, onToggle, onValue }) {
  return h('ol', { class: 'checklist' }, objetivos.map((o) => {
    const box = h('span', { class: 'ck-box', 'aria-hidden': 'true' }, o.feito ? icon('check', { size: 14 }) : null);
    if (o.tipo === 'auto') {
      return h('li', { class: `ck auto ${o.feito ? 'done' : ''}` }, box,
        h('span', { class: 'ck-text' }, o.texto, h('small', { class: 'ck-hint' }, icon('refresh', { size: 12 }), o.dica)));
    }
    if (o.tipo === 'situacao') {
      const sel = h('select', { disabled: !situacaoAberta, 'aria-label': o.texto }, o.opcoes.map(([v, l]) => h('option', { value: v, selected: v === o.valor }, l)));
      sel.addEventListener('change', () => onValue(o, sel.value));
      return h('li', { class: `ck field situ ${o.feito ? 'done' : ''}` }, box,
        h('label', { class: 'ck-text' }, o.texto, sel, h('small', { class: 'ck-hint' }, icon('globe', { size: 12 }), o.dica)));
    }
    if (o.tipo === 'data' || o.tipo === 'texto') {
      const input = h('input', { type: o.tipo === 'data' ? 'date' : 'text', value: o.valor || '', maxlength: 300, disabled, 'aria-label': o.texto, placeholder: o.tipo === 'texto' ? 'Digite aqui' : null });
      input.addEventListener('change', () => onValue(o, input.value.trim()));
      return h('li', { class: `ck field ${o.feito ? 'done' : ''}` }, box, h('label', { class: 'ck-text' }, o.texto, input));
    }
    const btn = h('button', { type: 'button', class: `ck ${o.feito ? 'done' : ''}`, role: 'checkbox', 'aria-checked': String(o.feito), disabled }, box, h('span', { class: 'ck-text' }, o.texto));
    btn.addEventListener('click', () => onToggle(o, !o.feito));
    return h('li', {}, btn);
  }));
}

// ---------- Documentos: sempre na Carteira (cifrados na conta), nunca só neste navegador ----------

/** Documentos da missão, lidos e gravados na Carteira. scope: "<userId>:<journeyId>" (formato antigo). */
export function DocumentsBlock(m, { scope }) {
  const journeyId = String(scope || '').split(':')[1];
  return MissionDocuments({ journeyId, missionId: m.id });
}

// ---------- Tela completa ----------

export function MissionDetail(m, ctx) {
  const { journey, api } = ctx;
  const def = m.definicao;
  const locked = m.status === 'bloqueada';
  const na = m.status === 'nao-aplicavel';
  const done = m.status === 'concluida';
  const editable = !locked && !na && !done;
  const [tagLabel, tagCls] = TAGS[def.tag] || TAGS.pratica;
  const base = `/journeys/${journey.id}/missions/${m.id}`;

  const section = (ic, title, ...body) => h('section', { class: 'md-section' }, h('h2', {}, icon(ic, { size: 18 }), title), ...body);
  const expandable = (title, body, open = false) => h('details', { class: 'md-expand', open }, h('summary', {}, h('span', {}, title), icon('chevron', { size: 16, cls: 'chev' })), h('div', { class: 'md-expand-body' }, body));

  const header = h('header', { class: 'md-header' },
    h('img', { class: 'md-banner', src: def.rodadaBanner, alt: '' }),
    h('div', { class: 'md-head-content' },
      h('p', { class: 'eyebrow' }, def.rodadaSigla ? `Trilha ${def.rodadaSigla} · ${def.rodadaTitulo}` : `Rodada ${def.rodada} · ${def.rodadaTitulo}`),
      h('h1', {}, h('span', { class: 'md-id' }, `Missão ${m.label}`), def.titulo),
      h('div', { class: 'row wrap' }, statusChip(m.status, m.statusLabel), priorityTag(m.prioridade), def.opcional ? h('span', { class: 'chip-demo' }, 'Recomendação opcional') : null,
        h('span', { class: 'meta-pill' }, icon('clock', { size: 13 }), def.tempoEstimado), deadlineTag(m.prazo), h('span', { class: `tag ${tagCls}` }, tagLabel)),
      h('div', { class: 'md-progress' }, progressBar(m.progresso, { label: 'Progresso da missão', cls: 'bar-lg' }), h('span', {}, `${m.objetivosFeitos}/${m.objetivosTotal} objetivos · ${pctLabel(m.progresso)}`)),
    ),
  );

  const banners = [];
  if (locked) {
    const internas = m.bloqueadaPor.filter((b) => !b.externo);
    const externas = m.bloqueadaPor.filter((b) => b.externo);
    banners.push(h('div', { class: 'md-banner-state locked' }, icon('lock', { size: 20 }), h('div', {},
      h('strong', {}, externas.length && !internas.length ? 'Aguardando uma decisão externa' : 'Missão bloqueada por dependência'),
      internas.length ? h('p', {}, 'Para liberar, conclua: ', internas.map((b, i) => [i ? ', ' : '', h('a', { href: `#/j/${journey.id}/m/${b.id}` }, `${b.label} ${b.titulo}`)])) : null,
      externas.length ? h('p', {}, `Depende de: ${externas.map((b) => b.titulo).join(', ')}. Isso não é atraso seu, registre a decisão quando ela sair (painel "Situação" da jornada).`) : null)));
  }
  if (na) banners.push(h('div', { class: 'md-banner-state na' }, icon('minus', { size: 20 }), h('div', {}, h('strong', {}, 'Não se aplica ao seu caso'), h('p', {}, m.motivoNaoAplicavel))));
  if (done) {
    banners.push(h('div', { class: 'md-banner-state done' }, h('span', { class: 'done-check' }, icon('check', { size: 22 })),
      h('div', {}, h('strong', {}, 'Missão concluída'), h('p', {}, `Registrada em ${fmtDate(m.concluidaEm)}.`)),
      journey.proximaMissao ? h('a', { class: 'btn btn-cta btn-sm', href: `#/j/${journey.id}/m/${journey.proximaMissao.id}` }, `Próxima: ${journey.proximaMissao.label}`, icon('arrow', { size: 14 })) : null));
  }
  if (m.aguardandoAuto) banners.push(h('div', { class: 'md-banner-state wait' }, icon('hourglass', { size: 20 }), h('p', {}, 'Aguardando terceiros pela situação que você registrou. Enquanto isso, adiante outras missões, a Agenda reserva só uma verificação curta para esta.')));
  m.alertas.forEach((a) => banners.push(h('div', { class: 'md-banner-state warn' }, icon('alert', { size: 20 }), h('p', {}, a.texto))));
  if (m.info) banners.push(h('div', { class: 'md-banner-state info' }, icon('lang', { size: 20 }), h('p', {}, m.info)));
  if (def.condicional && !na) banners.push(h('div', { class: 'md-banner-state info' }, icon('target', { size: 20 }), h('p', {}, `Missão condicional: ${def.condicaoTexto}`)));

  const tool = MissionTool(m, { journey, onChange: ctx.reload });

  const main = h('div', { class: 'md-main' },
    section('target', 'Objetivo', h('p', { class: 'md-objective' }, def.objetivo)),
    expandable('Por que preciso fazer isso?', h('p', {}, def.porque), true),
    section('check', 'O que devo fazer?',
      MissionChecklist(m.objetivos, {
        disabled: !editable,
        situacaoAberta: !na && !done,
        onToggle: (o, feito) => ctx.mutate(api.put(`${base}/objectives/${o.id}`, { feito })),
        onValue: (o, valor) => ctx.mutate(api.put(`${base}/objectives/${o.id}`, { valor })),
      })),
    tool,
    def.comoExecutar.length ? section('book', 'Como executar?', ...def.comoExecutar.map((c, i) => expandable(c.titulo, h('p', {}, c.texto), i === 0))) : null,
    m.acoes.length ? section('link', 'Ações', h('div', { class: 'row wrap' }, m.acoes.map((a) => (a.tipo === 'oficial'
      ? h('a', { class: 'btn btn-ghost btn-sm', href: a.url, target: '_blank', rel: 'noopener noreferrer' }, a.rotulo, icon('external', { size: 13 }))
      : h('a', { class: 'btn btn-ghost btn-sm', href: `#${a.rota}` }, a.rotulo, icon('arrow', { size: 13 })))))) : null,
    m.documentos.length ? section('file', 'Documentos necessários', DocumentsBlock(m, {
      scope: `${ctx.userId}:${journey.id}`,
      onDocStatus: async (d, status) => { try { await ctx.saveDoc(d.id, status); toast('Documento atualizado.', 'ok'); } catch (e) { toast(e.message, 'err'); } },
    })) : null,
    section('shield', 'Fontes oficiais', h('ul', { class: 'md-sources' }, m.fontes.map((s) => h('li', {},
      s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titulo, icon('external', { size: 13 })) : h('span', {}, s.titulo),
      h('small', { class: 'muted' }, `${s.orgao} · revisado em ${fmtDate(s.revisadoEm)}${s.pendente ? ' · link a confirmar' : ''}`))))),
  );

  // ----- Coluna de ações -----
  const confirm = h('input', { type: 'checkbox', id: 'md-confirm', disabled: !m.podeConcluir });
  const completeBtn = h('button', { class: 'btn btn-cta btn-block btn-lg', type: 'button', disabled: true }, icon('check', { size: 18 }), 'Concluir missão');
  confirm.addEventListener('change', () => { completeBtn.disabled = !confirm.checked; });
  completeBtn.addEventListener('click', () => ctx.mutate(api.post(`${base}/complete`, { confirmo: true })));

  const actionCard = h('section', { class: 'panel md-action' },
    h('h2', { class: 'panel-title' }, icon('flag', { size: 18 }), 'Ação principal'),
    h('p', { class: 'small' }, h('strong', {}, 'Critério de conclusão: '), def.criterio),
    done
      ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', onClick: () => ctx.mutate(api.post(`${base}/reopen`, {})) }, icon('refresh', { size: 16 }), 'Reabrir missão')
      : na ? null : [
          h('label', { class: `check ${m.podeConcluir ? '' : 'is-disabled'}`, for: 'md-confirm' }, confirm,
            h('span', {}, 'Confirmo que realizei este procedimento (abrir um link não conta).')),
          completeBtn,
          !m.podeConcluir && editable ? h('p', { class: 'hint' }, `Conclua os ${m.objetivosTotal - m.objetivosFeitos} objetivo(s) restante(s) para liberar.`) : null,
        ],
    def.aguardavel && !locked && !na && !done && !m.aguardandoAuto
      ? h('button', { class: `btn btn-ghost btn-block ${m.aguardando ? 'is-on' : ''}`, type: 'button', onClick: () => ctx.mutate(api.put(`${base}/state`, { aguardando: !m.aguardando })) },
          icon('hourglass', { size: 16 }), m.aguardando ? 'Não estou mais aguardando' : 'Estou aguardando terceiros')
      : null,
    (def.condicional || def.opcional) && !done
      ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', onClick: () => ctx.mutate(api.put(`${base}/state`, { naoAplicavel: !m.naoAplicavelMarcado })) },
          icon('minus', { size: 16 }), m.naoAplicavelMarcado ? 'Voltar a considerar esta missão' : def.opcional ? 'Não vou seguir esta recomendação' : 'Conferi: não se aplica a mim')
      : null,
  );

  const deadlineCard = def.prazo?.tipo === 'usuario'
    ? (() => {
        const input = h('input', { type: 'date', value: m.prazoDeclarado || '', 'aria-label': def.prazo.rotulo });
        input.addEventListener('change', () => ctx.mutate(api.put(`${base}/state`, { prazo: input.value || null })));
        return h('section', { class: 'panel' },
          h('h2', { class: 'panel-title' }, icon('calendar', { size: 18 }), 'Prazo'),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, def.prazo.rotulo), input),
          m.prazo ? deadlineTag(m.prazo) : null,
          h('p', { class: 'hint' }, 'Copie a data da fonte oficial do seu ciclo. Ela aparece na Agenda como "declarada por você" e gera lembretes.'));
      })()
    : m.prazo ? h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('calendar', { size: 18 }), 'Prazo'), h('p', {}, m.prazo.rotulo), deadlineTag(m.prazo), h('p', { class: 'hint' }, m.prazo.origem === 'previsto' ? 'Calculado a partir da sua data prevista de chegada.' : 'Calculado pela regra oficial a partir da sua data de entrada.')) : null;

  const plan = h('form', { class: 'stack plan-form' },
    h('div', { class: 'grid-3 tight' },
      h('input', { type: 'date', name: 'data', required: true, 'aria-label': 'Data' }),
      h('input', { type: 'time', name: 'inicio', value: '09:00', required: true, step: 900, 'aria-label': 'Início' }),
      h('input', { type: 'time', name: 'fim', value: '10:00', required: true, step: 900, 'aria-label': 'Fim' })),
    h('button', { class: 'btn btn-ghost btn-block', type: 'submit' }, icon('calendar', { size: 16 }), 'Reservar horário na Agenda'));
  plan.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/planner', { titulo: `Missão ${m.label} - ${def.titulo}`.slice(0, 120), categoria: ctx.categoryForRound(def.rodada), data: plan.data.value, inicio: plan.inicio.value, fim: plan.fim.value, journeyId: journey.id, missaoId: m.id, prioridade: m.prioridade === 'critica' ? 'critica' : m.prioridade === 'alta' ? 'alta' : 'normal' });
      toast('Horário reservado na Agenda.', 'ok');
      plan.reset();
    } catch (err) { toast(err.message, 'err'); }
  });

  const assistant = h('section', { class: 'panel md-ai' },
    h('h2', { class: 'panel-title' }, icon('chat', { size: 18 }), 'Mentor da missão'),
    h('p', { class: 'small muted' }, `O Mentor já sabe que você está na Missão ${m.label}.`),
    h('div', { class: 'chips' }, [['dificuldade', 'Estou com dificuldade'], ['simples', 'Explique mais simples'], ['documentos', 'Quais documentos preciso?'], ['custo', 'Quanto isso custa?']].map(([acao, label]) =>
      h('button', { type: 'button', class: 'chip', onClick: () => ctx.openAssistant({ journeyId: journey.id, missaoId: m.id, acao }) }, label))),
  );

  const aside = h('aside', { class: 'md-aside' }, actionCard, deadlineCard, h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('clock', { size: 18 }), 'Planejar execução'), plan), assistant);

  return h('article', { class: `mission-detail md-${m.status}` },
    h('nav', { class: 'crumbs', 'aria-label': 'Navegação' },
      h('a', { href: '#/jornadas' }, 'Minhas Jornadas'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${journey.id}` }, journey.destino.universidade?.sigla || 'Jornada'), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('a', { href: `#/j/${journey.id}/r/${def.rodada}` }, def.rodadaSigla ? 'Financiamento' : `Rodada ${def.rodada}`), icon('chevron', { size: 12, cls: 'crumb-sep' }),
      h('span', { 'aria-current': 'page' }, `Missão ${m.label}`)),
    header,
    banners.length ? h('div', { class: 'stack' }, banners) : null,
    h('div', { class: 'md-grid' }, main, aside),
  );
}
