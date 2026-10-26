// Painel de um documento: o que é → próxima ação (uma pergunta) → arquivos → detalhes recolhidos.
// Progressivo: cada resposta mostra só o passo seguinte.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { openMentor } from '../MentorPanel.js';
import { StatusPill, Evidence, STATUS, STATUS_ORDER, fmtDate } from './shared.js';
import { DocumentUpload } from './DocumentUpload.js';

/**
 * Abre o painel. opts: { journeyId, onChange(), onClose() }
 * Retorna { close }.
 */
export async function openDocumentPanel(docId, opts = {}) {
  const q = opts.journeyId ? `?journeyId=${encodeURIComponent(opts.journeyId)}` : '';
  const overlay = h('div', { class: 'dp-overlay', role: 'presentation' });
  const panel = h('aside', { class: 'dp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Documento' }, h('div', { class: 'dp-loading' }, h('span', { class: 'du-spinner' })));
  overlay.append(panel);
  document.body.append(overlay);
  document.body.classList.add('dp-lock');
  requestAnimationFrame(() => overlay.classList.add('open'));
  let flow = null; // resposta escolhida em "Você já possui?"

  const close = () => {
    overlay.classList.remove('open');
    document.body.classList.remove('dp-lock');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 220);
    opts.onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  let doc;
  const changed = (d, { celebrate = false } = {}) => { const was = doc?.pronto; doc = d; draw(); if (celebrate || (!was && d.pronto)) panel.querySelector('.dp-head')?.classList.add('is-celebrate'); opts.onChange?.(); };
  const put = async (body, msg) => { try { const r = await api.put(`/documents/${docId}${q}`, body); if (msg) toast(msg, 'ok'); changed(r.documento); } catch (e) { toast(e.message, 'err'); } };

  try { doc = (await api.get(`/documents/${docId}${q}`)).documento; } catch (e) { toast(e.message, 'err'); close(); return { close }; }

  function draw() {
    const v = doc;
    mount(panel,
      h('header', { class: 'dp-head' },
        h('span', { class: 'dc-icon is-lg' }, icon(v.icone, { size: 26 })),
        h('div', {}, h('p', { class: 'dp-eyebrow' }, v.etapaTitulo), h('h2', {}, v.nome), StatusPill(v)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onClick: close }, icon('x', { size: 18 }))),
      h('div', { class: 'dp-body' },
        h('section', { class: 'dp-what' }, h('h3', {}, 'O que é?'), h('p', {}, v.descricao),
          v.motivo ? h('p', { class: `dp-why${v.status === 'nao-se-aplica' ? ' is-na' : ''}` }, icon(v.status === 'nao-se-aplica' ? 'check' : 'help', { size: 13 }), v.motivo) : null),
        v.alerta ? h('p', { class: 'dp-alert' }, icon('alert', { size: 15 }), h('span', {}, v.alerta)) : null,
        nextAction(v),
        v.validade !== undefined ? validity(v) : null,
        files(v),
        usage(v),
        more(v)));
  }

  // ---------- Próxima ação ----------
  function nextAction(v) {
    if (v.status === 'nao-se-aplica') {
      return section('Próxima ação', h('p', { class: 'dp-text' }, v.statusRegistrado === 'nao-se-aplica' ? 'Você marcou que não precisa deste documento.' : 'Pelo seu perfil e pela sua jornada, você não precisa dele agora. Se isso mudar, ele volta para a lista.'),
        h('div', { class: 'dp-choices' }, v.statusRegistrado === 'nao-se-aplica'
          ? choice('refresh', 'Na verdade, preciso dele', () => put({ status: 'pendente' }, 'Documento de volta à lista.'))
          : choice('check', 'Já tenho mesmo assim', () => put({ status: 'pronto', declarado: true }, 'Registrado como disponível.'))));
    }
    if (v.atencao) {
      return section('Próxima ação', h('p', { class: 'dp-text' }, v.alerta ? 'Resolva isso antes de usar o documento.' : 'Você marcou que este documento precisa de correção.'),
        h('div', { class: 'dp-choices' },
          v.alerta ? null : choice('check', 'Já resolvi', () => put({ status: 'pronto' }, 'Marcado como pronto.')),
          v.alerta ? choice('calendar', 'Lembrar de resolver', () => reminder('validade')) : null,
          choice('help', 'Preciso de ajuda', () => help(v))),
        reminderHost);
    }
    if (v.pronto) {
      return section('Tudo certo por aqui', h('p', { class: 'dp-text' }, v.status === 'enviado' ? 'Você registrou o envio. Guarde o comprovante junto com o arquivo.' : 'Este documento está disponível para usar. Antes de enviar, confira nome, datas e páginas.'),
        Evidence(v, { full: true }),
        h('label', { class: 'dp-check' }, h('input', { type: 'checkbox', checked: Boolean(v.evidencias.conferidoEm), onChange: (e) => put({ conferido: e.target.checked }, e.target.checked ? 'Marcado como conferido por você.' : null) }),
          h('span', {}, 'Conferi nome, datas e páginas')),
        submissions(v));
    }
    // Pendente ou preparando: uma pergunta, quatro respostas.
    const host = h('div', { class: 'dp-flow' });
    const ask = h('div', { class: 'dp-choices' },
      choice('check', 'Sim, já tenho', () => { flow = 'tenho'; put({ status: 'pronto', declarado: true }, 'Ótimo! Registrado como disponível.'); }),
      choice('edit', 'Ainda preciso solicitar', () => { flow = 'solicitar'; drawFlow(); }),
      choice('hourglass', 'Já solicitei e estou aguardando', () => { flow = 'aguardando'; put({ aguardando: true }); }, v.aguardando),
      choice('help', 'Preciso de ajuda', () => help(v)));
    const drawFlow = () => {
      ask.querySelectorAll('.dp-choice').forEach((b, i) => b.classList.toggle('is-on', (flow === 'solicitar' && i === 1) || (v.aguardando && i === 2)));
      if (v.aguardando) {
        return mount(host, h('div', { class: 'dp-step' },
          h('p', {}, h('strong', {}, v.aguardandoDesde ? `Aguardando desde ${fmtDate(v.aguardandoDesde)}.` : 'Aguardando.'), ' Quando chegar, toque em "Sim, já tenho".'),
          h('button', { type: 'button', class: 'btn btn-sm', onClick: () => reminder('verificar') }, icon('calendar', { size: 14 }), 'Lembrar de conferir'),
          reminderHost));
      }
      if (flow === 'solicitar') {
        return mount(host, h('div', { class: 'dp-step' },
          h('ol', { class: 'dp-steps' }, v.comoObter.map((s) => h('li', {}, s))),
          h('div', { class: 'row wrap' },
            h('button', { type: 'button', class: 'btn btn-cta btn-sm', onClick: () => put({ status: 'em-preparacao' }, 'Marcado como "Preparando".') }, 'Comecei a solicitar'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => reminder('solicitar') }, icon('calendar', { size: 14 }), 'Lembrar de solicitar')),
          reminderHost));
      }
      return mount(host);
    };
    drawFlow();
    return section(v.status === 'em-preparacao' && !v.aguardando ? 'Você já começou. Já está com ele?' : 'Você já possui esse documento?', ask, host);
  }

  // ---------- Agenda AI: prévia → confirmação ----------
  const reminderHost = h('div', { class: 'dp-reminder' });
  async function reminder(tipo) {
    try {
      const { previa } = await api.post(`/documents/${docId}/reminder`, { tipo });
      const date = h('input', { type: 'date', value: previa.data, min: new Date().toISOString().slice(0, 10), class: 'dp-date', 'aria-label': 'Data do lembrete' });
      mount(reminderHost, h('div', { class: 'dp-proposal' },
        h('p', { class: 'dp-proposal-title' }, icon('sparkles', { size: 14 }), 'Sugestão da Agenda AI'),
        h('strong', {}, previa.titulo), h('small', {}, previa.motivo),
        h('div', { class: 'row wrap' }, date,
          h('button', { type: 'button', class: 'btn btn-cta btn-sm', onClick: async () => {
            try { const r = await api.post(`/documents/${docId}/reminder${q}`, { tipo, data: date.value, confirmar: true }); toast('Lembrete adicionado à sua agenda.', 'ok'); mount(reminderHost, h('p', { class: 'dp-done' }, icon('check', { size: 14 }), `Na agenda: ${fmtDate(r.evento.data)} às ${r.evento.inicio}.`)); opts.onChange?.(); } catch (e) { toast(e.message, 'err'); }
          } }, 'Adicionar à agenda'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => mount(reminderHost) }, 'Agora não'))));
    } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- Envios por procedimento ----------
  function submissions(v) {
    const proc = h('select', { 'aria-label': 'Onde você enviou' }, doc.procedimentos.map((p) => h('option', { value: p.id, selected: p.id === doc.procedimentoDaEtapa }, p.label)));
    const res = h('select', { 'aria-label': 'Resultado' }, [['enviado', 'Enviei'], ['aceito', 'Foi aceito'], ['correcao', 'Pediram correção']].map(([val, l]) => h('option', { value: val }, l)));
    const form = h('div', { class: 'dp-sub-form', hidden: true }, proc, res,
      h('button', { type: 'button', class: 'btn btn-sm', onClick: async () => {
        try { const r = await api.post(`/documents/${docId}/submissions${q}`, { procedimento: proc.value, resultado: res.value }); toast('Registrado.', 'ok'); changed(r.documento); } catch (e) { toast(e.message, 'err'); }
      } }, 'Registrar'));
    return h('div', { class: 'dp-subs' },
      v.evidencias.envios.length ? h('ul', { class: 'dp-sub-list' }, v.evidencias.envios.map((e) => h('li', {},
        icon(e.resultado === 'aceito' ? 'shield' : e.resultado === 'correcao' ? 'alert' : 'send', { size: 13 }),
        h('span', {}, `${e.procedimentoLabel}: ${{ enviado: 'enviado', aceito: 'aceito', correcao: 'pediram correção' }[e.resultado]} em ${fmtDate(e.em)}`),
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remover registro', onClick: async () => { try { changed((await api.del(`/documents/${docId}/submissions/${e.id}${q}`)).documento); } catch (er) { toast(er.message, 'err'); } } }, icon('x', { size: 12 }))))) : null,
      h('button', { type: 'button', class: 'dp-link', onClick: () => { form.hidden = !form.hidden; } }, icon('send', { size: 13 }), 'Registrar envio a um órgão'),
      form,
      h('small', { class: 'dp-fine' }, 'Cada envio fica separado: enviado ao DUA não conta como apresentado ao consulado.'));
  }

  // ---------- Validade ----------
  function validity(v) {
    const input = h('input', { type: 'date', value: v.validade || '', class: 'dp-date', 'aria-label': 'Válido até' });
    return section('Validade', h('div', { class: 'row wrap' }, h('label', { class: 'dp-inline' }, h('span', {}, 'Válido até'), input),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => put({ validade: input.value || null }, 'Validade registrada.') }, 'Salvar')),
      h('small', { class: 'dp-fine' }, 'A Estuvia compara com a duração prevista da estadia. Regras de validade exigidas: confira na fonte oficial.'));
  }

  // ---------- Arquivos ----------
  function files(v) {
    return section('Arquivos', DocumentUpload(v, {
      onChange: (d) => changed(d),
      onDelete: (fid) => api.del(`/documents/files/${fid}${q}`),
    }), { optional: !v.arquivos.length });
  }

  // ---------- Onde é usado ----------
  function usage(v) {
    if (!v.missoes.length && v.usadoEm.length < 2) return null;
    return section('Onde ele é usado', h('ul', { class: 'dp-uses' },
      v.missoes.map((m) => h('li', {}, m.rota ? h('a', { href: `#${m.rota}`, onClick: close }, icon('flag', { size: 13 }), `Missão ${m.label} — ${m.titulo}`) : `Missão ${m.label}`, h('small', {}, m.status === 'concluida' ? 'concluída' : ''))),
      v.usadoEm.length > 1 ? h('li', { class: 'dp-reuse' }, icon('refresh', { size: 13 }), `Reaproveitado em: ${v.usadoEm.join(' · ')}. Você não precisa cadastrar de novo.`) : null));
  }

  // ---------- Detalhes (recolhidos) ----------
  function more(v) {
    const sel = h('select', { 'aria-label': 'Situação' }, STATUS_ORDER.map((s) => h('option', { value: s, selected: s === v.statusRegistrado }, STATUS[s].label)));
    sel.addEventListener('change', () => put({ status: sel.value }, 'Situação atualizada.'));
    return h('div', { class: 'dp-more' },
      !v.pronto && v.status !== 'nao-se-aplica' && flow !== 'solicitar' && v.comoObter.length ? h('details', {}, h('summary', {}, 'Como conseguir'), h('ol', { class: 'dp-steps' }, v.comoObter.map((s) => h('li', {}, s)))) : null,
      doc.consulado ? h('details', {}, h('summary', {}, 'Lista oficial do seu consulado'), h('p', {}, 'A lista que vale para o visto é a do ', h('strong', {}, doc.consulado.nome), '. ', h('a', { href: doc.consulado.vistoEstudosUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir a página do visto de estudos'))) : null,
      h('details', {}, h('summary', {}, 'Mudar a situação manualmente'), h('div', { class: 'dp-manual' }, sel, h('small', { class: 'dp-fine' }, '"Pronto" e "Enviado" são a sua organização: não significam que um órgão aceitou o documento.'))),
      v.fonte ? h('p', { class: 'dp-source' }, icon('shield', { size: 12 }), 'Fonte: ', v.fonte.url ? h('a', { href: v.fonte.url, target: '_blank', rel: 'noopener noreferrer' }, `${v.fonte.orgao} — ${v.fonte.titulo}`) : `${v.fonte.orgao}`, v.fonte.revisadoEm ? ` · conferida em ${fmtDate(v.fonte.revisadoEm)}` : '') : null);
  }

  function help(v) { close(); openMentor({ mensagem: `Como consigo ${v.nome.toLowerCase()}?` }); }

  draw();
  panel.querySelector('button')?.focus();
  return { close };
}

const section = (title, ...body) => {
  const opts = body.length && body[body.length - 1] && !(body[body.length - 1] instanceof Node) && !Array.isArray(body[body.length - 1]) ? body.pop() : {};
  return h('section', { class: `dp-section${opts.optional ? ' is-optional' : ''}` }, h('h3', {}, title), ...body);
};
const choice = (ic, label, onClick, on = false) => h('button', { type: 'button', class: `dp-choice${on ? ' is-on' : ''}`, onClick }, icon(ic, { size: 16 }), h('span', {}, label));
