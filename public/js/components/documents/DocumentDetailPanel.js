// Painel de um documento. Mostra primeiro o essencial (o que é, se vale para você, a próxima ação e os arquivos);
// o resto fica em seções recolhíveis: sobre o documento, apostila e tradução, onde é usado, informações,
// situação e fontes. Para um item-checklist (ex.: "Apostilas dos documentos acadêmicos"), mostra os documentos reunidos.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { openMentor } from '../MentorPanel.js';
import { EstadoPill, ExigenciaTag, Evidence, fmtDate } from './shared.js';
import { DocumentUpload } from './DocumentUpload.js';

const MARKS = [['', 'Não sei ainda'], ['nao-precisa', 'Não precisa'], ['precisa', 'O órgão pediu'], ['solicitada', 'Já pedi'], ['pronta', 'Pronta / anexada']];

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
  let flow = null;
  const opened = new Set(); // seções recolhíveis abertas (mantidas entre redesenhos)

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
  const changed = (d) => { const was = doc?.pronto; doc = d; draw(); if (!was && d.pronto) panel.querySelector('.dp-head')?.classList.add('is-celebrate'); opts.onChange?.(); };
  const put = async (body, msg) => { try { const r = await api.put(`/documents/${docId}${q}`, body); if (msg) toast(msg, 'ok'); changed(r.documento); } catch (e) { toast(e.message, 'err'); } };
  const reopen = async (id) => { close(); setTimeout(() => openDocumentPanel(id, opts), 240); };

  try { doc = (await api.get(`/documents/${docId}${q}`)).documento; } catch (e) { toast(e.message, 'err'); close(); return { close }; }

  function draw() {
    const v = doc;
    const scroll = panel.querySelector('.dp-body')?.scrollTop || 0;
    mount(panel,
      h('header', { class: 'dp-head' },
        h('span', { class: 'dc-icon is-lg' }, icon(v.icone, { size: 26 })),
        h('div', {}, h('p', { class: 'dp-eyebrow' }, v.categoriaNome || v.etapaTitulo), h('h2', {}, v.nome),
          h('div', { class: 'dp-pills' }, v.agregado ? null : EstadoPill(v), ExigenciaTag(v))),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onClick: close }, icon('x', { size: 18 }))),
      h('div', { class: 'dp-body' },
        v.avisoEditorial ? h('p', { class: 'dp-alert is-info' }, icon('bell', { size: 15 }), h('span', {}, h('strong', {}, 'Atualização da equipe: '), v.avisoEditorial)) : null,
        h('section', { class: 'dp-what' }, h('p', {}, v.oque || v.descricao),
          v.motivo ? h('p', { class: `dp-why${v.exigencia === 'nao-necessario' ? ' is-na' : ''}` }, icon(v.exigencia === 'nao-necessario' ? 'check' : 'help', { size: 13 }), v.motivo) : null),
        v.alerta ? h('p', { class: 'dp-alert' }, icon('alert', { size: 15 }), h('span', {}, v.alerta)) : null,
        v.aviso ? h('p', { class: 'dp-alert is-info' }, icon('clock', { size: 15 }), h('span', {}, v.aviso)) : null,
        v.agregado ? aggregate(v) : [nextAction(v), files(v)],
        v.agregado ? null : about(v),
        v.agregado ? null : apostilleTranslation(v),
        usage(v),
        v.agregado ? null : info(v),
        v.agregado ? null : manual(v),
        sources(v)));
    const body = panel.querySelector('.dp-body');
    if (body) body.scrollTop = scroll;
  }

  // Seção recolhível que lembra se estava aberta.
  const fold = (id, title, ...body) => {
    const el = h('details', { class: 'dp-fold', open: opened.has(id) }, h('summary', {}, title), h('div', { class: 'dp-fold-body' }, body));
    el.addEventListener('toggle', () => { if (el.open) opened.add(id); else opened.delete(id); });
    return el;
  };

  // ---------- Item-checklist (agregado) ----------
  function aggregate(v) {
    const a = v.agregado;
    const tipo = { apostila: 'apostila', traducao: 'tradução', documentos: 'documento' }[a.tipo];
    return section(a.tipo === 'documentos' ? 'Documentos reunidos aqui' : `Situação das ${a.tipo === 'apostila' ? 'apostilas' : 'traduções'}`,
      h('p', { class: 'dp-text' }, a.tipo === 'documentos'
        ? 'Cada documento fica guardado uma vez só, no próprio lugar. Toque para abrir.'
        : `A ${tipo} fica anexada dentro de cada documento. Marque em cada um se o órgão pediu e anexe quando tiver.`),
      h('ul', { class: 'dp-members' }, a.membros.filter((m) => m.exigencia !== 'nao-necessario').map((m) => h('li', {},
        h('button', { type: 'button', class: 'cw-row', onClick: () => reopen(m.id) },
          h('span', { class: 'cw-row-main' }, h('strong', {}, m.nome),
            a.tipo === 'documentos' ? null : h('small', { class: 'cw-row-sub' }, { precisa: 'O órgão pediu', solicitada: 'Já pedi', pronta: 'Pronta', 'nao-precisa': 'Não precisa' }[m.marcacao] || 'Não marcado')),
          h('span', { class: `dc-pill t-${m.estadoTom}` }, m.estadoLabel), icon('chevron', { size: 14, cls: 'cw-row-chev' }))))));
  }

  // ---------- Próxima ação ----------
  function nextAction(v) {
    if (v.estado === 'nao-aplicavel') {
      return section('Próxima ação', h('p', { class: 'dp-text' }, 'Você não precisa dele agora.'),
        h('div', { class: 'dp-choices' }, choice('check', 'Tenho mesmo assim', () => put({ estado: 'pronto', declarado: true }, 'Registrado como disponível.'))));
    }
    if (v.estado === 'dispensado') {
      return section('Próxima ação', h('p', { class: 'dp-text' }, 'Marcado como dispensado.'),
        h('div', { class: 'dp-choices' }, choice('refresh', 'Na verdade, preciso dele', () => put({ estado: 'nao-iniciado' }, 'Documento de volta à lista.'))));
    }
    if (v.atencao) {
      return section('Próxima ação', h('p', { class: 'dp-text' }, v.estado === 'vencido' ? 'Venceu: renove e registre a nova data.' : v.alerta ? 'Resolva antes de usar.' : 'Precisa de correção.'),
        h('div', { class: 'dp-choices' },
          v.alerta || v.estado === 'vencido' ? null : choice('check', 'Já resolvi', () => put({ estado: 'pronto' }, 'Marcado como pronto.')),
          v.alerta || v.estado === 'vencido' ? choice('calendar', 'Lembrar de resolver', () => reminder('validade')) : null,
          choice('help', 'Ajuda', () => help(v))),
        reminderHost);
    }
    if (['precisa-apostila', 'precisa-traducao'].includes(v.estado)) {
      const ap = v.estado === 'precisa-apostila';
      return section('Próxima ação', h('p', { class: 'dp-text' }, ap ? 'Faça no cartório e anexe abaixo como "Apostila".' : 'Anexe abaixo como "Tradução".'),
        h('div', { class: 'dp-choices' },
          choice('hourglass', 'Já pedi', () => put(ap ? { apostila: 'solicitada' } : { traducao: 'solicitada' }, 'Registrado.'), (ap ? v.apostila.marcacao : v.traducao.marcacao) === 'solicitada'),
          choice('check', 'Está pronto', () => put({ estado: 'pronto' }, 'Pronto!')),
          choice('help', 'Como faço', () => { opened.add('ap'); draw(); panel.querySelector('.dp-fold[open] .dp-guide')?.scrollIntoView({ behavior: 'smooth' }); })));
    }
    if (v.pronto) {
      return section('Tudo certo', h('p', { class: 'dp-text' }, v.status === 'enviado' ? 'Envio registrado.' : 'Pronto. Confira nome e datas antes de enviar.'),
        Evidence(v, { full: true }),
        h('label', { class: 'dp-check' }, h('input', { type: 'checkbox', checked: Boolean(v.evidencias.conferidoEm), onChange: (e) => put({ conferido: e.target.checked }, e.target.checked ? 'Marcado como conferido por você.' : null) }),
          h('span', {}, 'Conferi')),
        submissions(v));
    }
    // Pendente ou em andamento: uma pergunta, poucas respostas.
    const host = h('div', { class: 'dp-flow' });
    const ask = h('div', { class: 'dp-choices' },
      choice('check', 'Já tenho', () => put({ estado: 'pronto', declarado: true }, 'Pronto!')),
      v.atendidoPorOpcoes?.length ? choice('link', `Meu ${v.atendidoPorOpcoes[0].nome.split(' ')[0].toLowerCase()} já mostra isso`, () => put({ atendidoPor: v.atendidoPorOpcoes[0].id }, 'Registrado.')) : null,
      choice('edit', 'Preciso pedir', () => { flow = 'solicitar'; put({ estado: 'solicitar' }); }, v.estado === 'solicitar'),
      choice('hourglass', 'Já pedi', () => put({ estado: 'aguardando' }), v.estado === 'aguardando'),
      choice('help', 'Ajuda', () => help(v)));
    if (v.estado === 'aguardando') {
      mount(host, h('div', { class: 'dp-step' },
        h('p', {}, v.aguardandoDesde ? `Aguardando desde ${fmtDate(v.aguardandoDesde)}.` : 'Aguardando.'),
        h('button', { type: 'button', class: 'btn btn-sm', onClick: () => reminder('verificar') }, icon('calendar', { size: 14 }), 'Lembrar'),
        reminderHost));
    } else if (v.estado === 'solicitar' || flow === 'solicitar') {
      mount(host, h('div', { class: 'dp-step' },
        v.onde ? h('p', {}, h('strong', {}, 'Onde: '), v.onde) : null,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => reminder('solicitar') }, icon('calendar', { size: 14 }), 'Lembrar'),
        reminderHost));
    }
    return section('Você já tem?', ask, host);
  }

  // ---------- Agenda: prévia → confirmação ----------
  const reminderHost = h('div', { class: 'dp-reminder' });
  async function reminder(tipo) {
    try {
      const { previa } = await api.post(`/documents/${docId}/reminder`, { tipo });
      const date = h('input', { type: 'date', value: previa.data, min: new Date().toISOString().slice(0, 10), class: 'dp-date', 'aria-label': 'Data do lembrete' });
      mount(reminderHost, h('div', { class: 'dp-proposal' },
        h('p', { class: 'dp-proposal-title' }, icon('calendar', { size: 14 }), 'Sugestão da Agenda'),
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
        h('span', {}, `${e.procedimentoLabel}: ${{ enviado: 'enviado', aceito: 'aceito (registrado por você)', correcao: 'pediram correção' }[e.resultado]} em ${fmtDate(e.em)}`),
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remover registro', onClick: async () => { try { changed((await api.del(`/documents/${docId}/submissions/${e.id}${q}`)).documento); } catch (er) { toast(er.message, 'err'); } } }, icon('x', { size: 12 }))))) : null,
      h('button', { type: 'button', class: 'dp-link', onClick: () => { form.hidden = !form.hidden; } }, icon('send', { size: 13 }), 'Registrar envio'),
      form);
  }

  // ---------- Arquivos ----------
  function files(v) {
    return section('Arquivos', DocumentUpload(v, {
      missao: opts.missao,
      onChange: (d) => changed(d),
      onDelete: (fid) => api.del(`/documents/files/${fid}${q}`),
    }), !v.arquivos.length ? h('small', { class: 'dp-fine' }, 'Opcional: basta marcar "Já tenho".') : null);
  }

  // ---------- Sobre o documento ----------
  function about(v) {
    const row = (title, text) => (text ? h('div', { class: 'dp-about-row' }, h('h4', {}, title), h('p', {}, text)) : null);
    return fold('about', 'Sobre este documento',
      row('O que é?', v.oque), row('Para que serve?', v.para), row('Onde conseguir?', v.onde), row('Quando solicitar?', v.quando),
      v.comoObter?.length > 2 ? h('div', { class: 'dp-about-row' }, h('h4', {}, 'Passo a passo'), h('ol', { class: 'dp-steps' }, v.comoObter.map((s) => h('li', {}, s)))) : null,
      v.tipoValidade === 'data' ? row('Tem validade?', 'Sim: registre a data de vencimento em "Informações" para receber alertas.') : v.tipoValidade === 'recencia' ? row('Tem validade?', 'Não tem vencimento impresso, mas o órgão pode exigir que seja recente. A Estuvia não inventa prazo: confira na fonte oficial do seu procedimento.') : row('Tem validade?', 'Não tem prazo de validade.'));
  }

  // ---------- Apostila e tradução ----------
  function apostilleTranslation(v) {
    if (v.apostila.regra === 'nao' && v.traducao.regra === 'nao') return null;
    const mark = (field, current) => {
      const s = h('select', { 'aria-label': field === 'apostila' ? 'Apostila' : 'Tradução' }, MARKS.map(([val, l]) => h('option', { value: val, selected: (current || '') === val }, l)));
      s.addEventListener('change', () => put({ [field]: s.value || null }, 'Registrado.'));
      return s;
    };
    const guide = (g) => (g ? h('div', { class: 'dp-guide' },
      h('p', {}, g.oque), h('p', {}, h('strong', {}, 'Quando: '), g.quando),
      g.onde ? h('p', {}, h('strong', {}, 'Onde: '), g.onde) : null, g.quem ? h('p', {}, h('strong', {}, 'Quem faz: '), g.quem) : null,
      h('p', {}, h('strong', {}, 'Como vincular: '), g.vincular),
      g.fonte ? h('p', { class: 'dp-source' }, icon('shield', { size: 12 }), h('a', { href: g.fonte.url, target: '_blank', rel: 'noopener noreferrer' }, `${g.fonte.orgao} - ${g.fonte.titulo}`)) : null) : null);
    const block = (title, x, field) => (x.regra === 'nao'
      ? h('div', { class: 'dp-about-row' }, h('h4', {}, title), h('p', {}, 'Não se aplica a este documento.'))
      : h('div', { class: 'dp-about-row' }, h('h4', {}, title),
        h('p', {}, x.nota || 'Pode ser exigida, conforme o procedimento. Não é automática: só providencie se o órgão pedir.'),
        h('label', { class: 'dp-inline' }, h('span', {}, 'No seu caso'), mark(field, x.marcacao)),
        guide(x.guia)));
    return fold('ap', 'Apostila da Haia e tradução', block('Precisa apostilar?', v.apostila, 'apostila'), block('Precisa traduzir?', v.traducao, 'traducao'));
  }

  // ---------- Onde é usado ----------
  function usage(v) {
    const usos = (v.usos || []).filter((u) => u.exigencia !== 'nao-necessario');
    if (!usos.length && !v.missoes?.length) return null;
    const LABEL = { requerido: 'necessário', recomendado: 'opcional', condicional: 'contingência', verificar: 'contingência, a confirmar' };
    const ORD = { requerido: 0, recomendado: 1, condicional: 2, verificar: 3 };
    usos.sort((a, b) => ORD[a.exigencia] - ORD[b.exigencia]);
    const seen = new Set();
    return fold('uso', `Utilizado em ${v.usadoEm?.length || usos.length} etapa(s)`,
      h('ul', { class: 'dp-uses' },
        usos.filter((u) => !seen.has(`${u.categoria}${u.rotulo}`) && seen.add(`${u.categoria}${u.rotulo}`)).map((u) => h('li', {}, icon('folder', { size: 13 }), h('span', {}, h('strong', {}, u.categoriaNome), u.rotulo ? ` - ${u.rotulo}` : '', h('small', {}, ` · ${LABEL[u.exigencia]}${u.condicao ? `: ${u.condicao}` : ''}`)))),
        (v.missoes || []).map((m) => h('li', {}, m.rota ? h('a', { href: `#${m.rota}`, onClick: close }, icon('flag', { size: 13 }), `${m.rodada ? (m.rodada.sigla ? `Trilha ${m.rodada.sigla}` : `Rodada ${m.rodada.numero}`) + ' · ' : ''}Missão ${m.label} - ${m.titulo}`) : `Missão ${m.label}`, h('small', {}, `${m.prepara ? ' · é aqui que você consegue este documento' : ''}${m.status === 'concluida' ? ' · concluída' : ''}`)))),
      h('p', { class: 'dp-fine' }, icon('refresh', { size: 12 }), ' Guardado uma vez só: atualizar aqui atualiza todas as etapas e missões que o usam.'));
  }

  // ---------- Informações ----------
  function info(v) {
    const i = v.informacoes;
    const field = (label, el) => h('label', { class: 'dp-field' }, h('span', {}, label), el);
    const emissor = h('input', { type: 'text', maxlength: 120, value: i.emissor || '', placeholder: 'Ex.: Polícia Federal, universidade' });
    const pais = h('input', { type: 'text', maxlength: 60, value: i.pais || '', placeholder: 'Ex.: Brasil' });
    const emitido = h('input', { type: 'date', value: i.emitidoEm || '' });
    const validade = v.tipoValidade === 'data' ? h('input', { type: 'date', value: i.validade || '' }) : null;
    const alerta = v.tipoValidade === 'data' ? h('select', {}, [['', 'Padrão (60 dias)'], ['30', '30 dias antes'], ['90', '90 dias antes'], ['180', '180 dias antes']].map(([val, l]) => h('option', { value: val, selected: String(i.alertaDias || '') === val }, l))) : null;
    const obs = h('textarea', { rows: 2, maxlength: 1000, placeholder: 'Anotações pessoais (nunca senhas ou códigos)' }, i.observacoes || '');
    const save = () => put({
      emissor: emissor.value.trim() || null, pais: pais.value.trim() || null, emitidoEm: emitido.value || null, observacoes: obs.value.trim() || null,
      ...(validade ? { validade: validade.value || null, alertaDias: alerta.value ? Number(alerta.value) : null } : {}),
    }, 'Informações salvas.');
    return fold('info', 'Informações do documento',
      h('div', { class: 'dp-grid' }, field('Órgão emissor', emissor), field('País de emissão', pais), field('Data de emissão', emitido), validade ? field('Válido até', validade) : null, alerta ? field('Avisar', alerta) : null),
      field('Observações', obs),
      i.enviadoACarteiraEm ? h('p', { class: 'dp-fine' }, `Na carteira desde ${fmtDate(i.enviadoACarteiraEm)}.`) : null,
      h('button', { type: 'button', class: 'btn btn-sm', onClick: save }, 'Salvar informações'));
  }

  // ---------- Situação manual ----------
  function manual(v) {
    const sel = h('select', { 'aria-label': 'Situação' }, doc.estados.map((s) => h('option', { value: s.id, selected: s.id === v.estado }, s.label)));
    sel.addEventListener('change', () => put({ estado: sel.value }, 'Situação atualizada.'));
    return fold('manual', 'Mudar a situação manualmente', h('div', { class: 'dp-manual' }, sel,
      h('small', { class: 'dp-fine' }, '"Pronto para utilização" é a sua organização. A Estuvia verifica só se o arquivo existe; não afirma que uma universidade ou um consulado aprovou o documento.')));
  }

  // ---------- Fontes ----------
  function sources(v) {
    const list = v.fontes?.length ? v.fontes : v.fonte ? [v.fonte] : [];
    if (!list.length) return null;
    return h('div', { class: 'dp-sources' },
      h('p', { class: 'dp-source' }, icon('shield', { size: 12 }), 'Consultar exigências: ', list.map((f, k) => [k ? ' · ' : '', f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.orgao) : f.orgao])),
      v.revisadoEm ? h('p', { class: 'dp-fine' }, `Informação revisada em ${fmtDate(v.revisadoEm)}. Regras mudam: confira sempre a fonte vigente.`) : null,
      doc.consulado ? h('p', { class: 'dp-fine' }, 'Para o visto, vale a lista do ', h('strong', {}, doc.consulado.nome), ' · ', h('a', { href: doc.consulado.vistoEstudosUrl, target: '_blank', rel: 'noopener noreferrer' }, 'página oficial')) : null);
  }

  function help(v) { close(); openMentor({ mensagem: `Como consigo ${v.nome.toLowerCase()}?` }); }

  draw();
  panel.querySelector('button')?.focus();
  return { close };
}

const section = (title, ...body) => h('section', { class: 'dp-section' }, h('h3', {}, title), ...body);
const choice = (ic, label, onClick, on = false) => h('button', { type: 'button', class: `dp-choice${on ? ' is-on' : ''}`, onClick }, icon(ic, { size: 16 }), h('span', {}, label));
