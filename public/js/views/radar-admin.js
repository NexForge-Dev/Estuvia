// Radar de Oportunidades — painel administrativo: fontes, verificações, erros, fila de revisão,
// registro manual (ex.: BOJA), correções com evidência, histórico e simulação de desenvolvimento.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
const REVIEW = { conflito: 'Conflito entre fontes', 'alteracao-critica': 'Alteração crítica', 'extracao-incerta': 'Extração incerta', 'ciclo-inconsistente': 'Ano acadêmico inconsistente', 'programa-ausente': 'Programa ausente', 'rotulo-desconhecido': 'Rótulo desconhecido', comunidade: 'Comunidade (verificar)', 'possivel-renomeacao': 'Possível renomeação / código novo', 'vinculo-dua': 'Vínculo com o DUA' };
const ENTIDADE = { Program: 'Programa', Opportunity: 'Oportunidade', AdmissionWindow: 'Janela de candidatura', AdmissionEvent: 'Evento do calendário' };
const EDITAVEIS = 'Programa: nome, webPropria, duaCodigo, codigo, modalidade · Oportunidade: suspensao · Janela: abertura, encerramento, confirmacao · Evento: inicio, fim, rotulo';
const show = (v) => (v === null || v === undefined || v === '' ? '-' : typeof v === 'object' ? (v.motivo ? `suspensa: ${v.motivo}` : JSON.stringify(v)) : String(v));

function formOf(fields, submitLabel, onSubmit) {
  const form = h('form', { class: 'rd-admin-form' },
    fields.map(([name, label, attrs = {}]) => h('label', { class: 'rd-field' }, h('span', {}, label), attrs.options
      ? h('select', { name }, attrs.options.map(([v, l]) => h('option', { value: v }, l)))
      : h('input', { name, ...attrs }))),
    h('button', { class: 'btn btn-sm', type: 'submit' }, submitLabel));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try { await onSubmit(data); form.reset(); } catch (err) { toast(err.message, 'err'); }
  });
  return form;
}

export async function radarAdminView() {
  const root = h('div', { class: 'rd rd-admin stack-lg' });
  const historyHost = h('div', { class: 'rd-history-host' });

  // Histórico completo de um registro: revisões (inclusive invalidadas) e correções vigentes.
  async function loadHistory(entidade, id) {
    try {
      const r = await api.get(`/radar/admin/history?entidade=${encodeURIComponent(entidade)}&id=${encodeURIComponent(id)}`);
      mount(historyHost,
        h('h3', {}, `${ENTIDADE[r.entidade]}: ${r.rotulo}`, h('small', { class: 'muted' }, ` · ${r.id}${r.existe ? '' : ' (não encontrado)'}`)),
        r.correcoes.length ? h('p', { class: 'small' }, h('strong', {}, 'Correções vigentes: '), r.correcoes.map((c) => `${c.campo} = ${show(c.valor)} (fonte: ${show(c.valorFonte)})`).join(' · ')) : null,
        r.revisoes.length ? h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Quando', 'Campo', 'Antes', 'Depois', 'Validação', 'Por', 'Nota / evidência', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, r.revisoes.slice().reverse().map((x) => h('tr', { class: x.invalidada ? 'rd-row-invalid' : '' },
            h('td', {}, fmtDT(x.em)), h('td', {}, x.campo), h('td', {}, show(x.anterior)), h('td', {}, show(x.novo)),
            h('td', {}, x.validacao, x.invalidada ? h('div', { class: 'small muted' }, `invalidada por ${x.invalidada.por}: ${x.invalidada.motivo}`) : null),
            h('td', { class: 'small' }, x.por),
            h('td', { class: 'small' }, x.nota || x.evidencia?.nota || '', x.evidencia?.url ? [' ', h('a', { href: x.evidencia.url, target: '_blank', rel: 'noopener noreferrer' }, 'evidência')] : null,
              x.evidencia?.snapshotId ? [' ', h('a', { href: `/api/radar/admin/snapshots/${x.evidencia.snapshotId}/evidencia`, target: '_blank', rel: 'noopener' }, 'página original')] : null),
            h('td', {}, x.invalidada ? null : invalidateControl(x, () => loadHistory(entidade, id))))))))
          : h('p', { class: 'muted small' }, 'Sem revisões registradas para este registro.'));
    } catch (e) { toast(e.message, 'err'); }
  }

  // Invalidar = marcar como registrada por engano (nunca apagar). Pede o motivo na própria linha.
  function invalidateControl(rev, after) {
    const box = h('span', { class: 'rd-invalidate', hidden: true });
    const motivo = h('input', { type: 'text', placeholder: 'Motivo (mín. 10 caracteres)', 'aria-label': 'Motivo da invalidação' });
    const ok = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/revisions/${rev.id}/invalidate`, { motivo: motivo.value }), 'Revisão marcada como inválida (continua no histórico).').then(after) }, 'Confirmar');
    box.append(motivo, ok);
    const open = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { box.hidden = false; open.hidden = true; motivo.focus(); } }, 'Invalidar');
    return h('span', {}, open, box);
  }

  async function act(fn, ok) {
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok, 'ok'); await draw(); } catch (e) { toast(e.message, 'err'); }
  }

  // Reconciliação: escolher qual programa antigo é o mesmo mestrado (mantém o identificador antigo) ou rejeitar.
  function reconcileControls(r) {
    const sel = h('select', { 'aria-label': 'Programa antigo' }, r.proposta.candidatos.map((c) => h('option', { value: c }, c)));
    return h('div', { class: 'row wrap' },
      h('span', { class: 'small' }, `Novo: ${r.proposta.novoId} · é o mesmo que `), sel,
      h('button', { class: 'btn btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/reviews/${r.id}`, { decisao: 'aprovar', antigoId: sel.value }), 'Unidos: o identificador antigo foi mantido.') }, icon('check', { size: 14 }), 'Mesmo mestrado'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/reviews/${r.id}`, { decisao: 'rejeitar' }), 'Mantidos como mestrados diferentes.') }, 'São diferentes'));
  }

  async function draw() {
    let o;
    try { o = await api.get('/radar/admin'); } catch (e) {
      return mount(root, h('section', { class: 'rd-empty' }, icon('lock', { size: 26 }), h('h2', {}, 'Acesso restrito'), h('p', { class: 'muted' }, e.message),
        h('p', { class: 'small muted' }, 'Peça ao administrador para conceder o papel "Equipe do Radar" à sua conta (painel admin → aluno → Papel).')));
    }
    const t = o.totais;
    const open = o.revisoes.filter((r) => r.status === 'aberta');
    mount(root,
      h('section', { class: 'rd-hero rd-hero-admin' },
        h('p', { class: 'rd-eyebrow' }, icon('shield', { size: 16 }), 'Radar, painel administrativo'),
        h('h1', {}, 'Auditoria das oportunidades'),
        h('div', { class: 'rd-stats' },
          h('div', { class: 'rd-stat' }, h('strong', {}, String(o.pendentes)), h('span', {}, 'Revisões pendentes')),
          h('div', { class: 'rd-stat' }, h('strong', {}, String(o.erros.length)), h('span', {}, 'Erros recentes de coleta')),
          h('div', { class: 'rd-stat' }, h('strong', {}, String(o.desatualizadas.length)), h('span', {}, 'Fontes desatualizadas')),
          h('div', { class: 'rd-stat' }, h('strong', {}, `${t.programas} / ${t.janelas}`), h('span', {}, 'Programas / janelas oficiais')),
        ),
        h('p', { class: 'rd-footnote' }, `${t.oportunidades} oportunidades · ${t.eventos} eventos · ${t.assinaturas} acompanhamentos · ${t.alertas} alertas · ${t.historico} revisões · ${o.programasSemFicha} programas sem ficha conferida · ambiente: ${o.ambiente}`),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('alert', { size: 18 }), `Fila de revisão (${open.length})`),
        open.length ? h('ul', { class: 'rd-reviews' }, open.map((r) => h('li', { class: `rd-review rd-review-${r.impacto}` },
          h('div', {}, h('strong', {}, REVIEW[r.tipo] || r.tipo), h('span', { class: 'muted small' }, ` · ${r.sourceId} · ${fmtDT(r.criadaEm)} · impacto ${r.impacto}`)),
          h('p', {}, r.motivo),
          r.proposta?.parsed?.fases ? h('details', {}, h('summary', {}, 'Ver proposta extraída'),
            h('ul', {}, r.proposta.parsed.fases.map((f) => { const c = f.itens.find((i) => i.tipo === 'candidatura'); return h('li', {}, `Fase ${f.fase}: ${c?.inicio || '?'} – ${c?.fim || '?'} (${f.confirmacao})`); }))) : null,
          r.proposta?.kind === 'reconciliacao' ? reconcileControls(r) : h('div', { class: 'row wrap' },
            r.proposta ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/reviews/${r.id}`, { decisao: 'aprovar' }), 'Alteração aprovada e publicada.') }, icon('check', { size: 14 }), 'Aprovar e publicar') : null,
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/reviews/${r.id}`, { decisao: 'rejeitar' }), 'Revisão descartada.') }, r.proposta ? 'Rejeitar' : 'Marcar como conferida')),
        ))) : h('p', { class: 'muted' }, 'Nada pendente. Conflitos, extrações incertas e alterações críticas de prazo aparecem aqui antes de serem publicados.'),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('wand', { size: 18 }), `Correções manuais (${o.correcoes.length})`),
        h('p', { class: 'small muted' }, 'Campos corrigidos pelo admin ficam protegidos: as coletas seguintes atualizam só o "valor da fonte" e nunca o valor corrigido. Remover a correção volta ao valor mais recente da fonte.'),
        o.correcoes.length ? h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Registro', 'Campo', 'Valor da fonte', 'Valor do admin', 'Quem / quando / motivo', 'Ações'].map((x) => h('th', {}, x)))),
          h('tbody', {}, o.correcoes.map((c) => h('tr', { class: c.divergeDaFonte ? 'rd-row-override' : '' },
            h('td', {}, show(c.rotulo), h('br'), h('small', { class: 'muted' }, `${ENTIDADE[c.entidade]} · ${c.id}`)),
            h('td', {}, c.campo),
            h('td', {}, show(c.valorFonte), c.fonteAtualizadaEm ? h('div', { class: 'small muted' }, `fonte mudou em ${fmtDT(c.fonteAtualizadaEm)}`) : null),
            h('td', {}, h('strong', {}, show(c.valorAdmin))),
            h('td', { class: 'small' }, `${c.por} · ${fmtDT(c.em)}`, h('br'), c.motivo, c.url ? [' ', h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'evidência')] : null),
            h('td', { class: 'rd-td-actions' },
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => loadHistory(c.entidade, c.id) }, 'Histórico'),
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.del('/radar/admin/corrections', { entidade: c.entidade, id: c.id, campo: c.campo, motivo: 'Removida pelo painel' }), 'Correção removida: vale o valor da fonte.') }, 'Remover correção')),
          ))))) : h('p', { class: 'muted small' }, 'Nenhuma correção manual vigente.'),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('book', { size: 18 }), 'Histórico de um registro'),
        formOf([
          ['entidade', 'Registro', { options: Object.entries(ENTIDADE) }],
          ['id', 'ID do registro', { required: true, placeholder: 'ugr-master-universitario-…' }],
        ], 'Ver histórico', (d) => loadHistory(d.entidade, d.id)),
        historyHost,
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('globe', { size: 18 }), 'Fontes monitoradas'),
        h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Fonte', 'Método', 'Estado', 'Última verificação ok', 'Próxima', 'Ações'].map((x) => h('th', {}, x)))),
          h('tbody', {}, o.fontes.map((s) => h('tr', {},
            h('td', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titulo), h('br'), h('small', { class: 'muted' }, `${s.instituicao} · prioridade ${s.prioridade} · a cada ${s.frequenciaHoras} h`), s.ultimoErro ? h('div', { class: 'rd-err small' }, s.ultimoErro) : null, s.nota ? h('div', { class: 'small muted' }, s.nota) : null),
            h('td', {}, s.metodo),
            h('td', {}, h('span', { class: `rd-src rd-src-${s.estado}` }, s.indisponivelManual ? 'indisponível (manual)' : s.estado)),
            h('td', {}, fmtDT(s.ultimaVerificacaoOk)),
            h('td', {}, fmtDT(s.proximaVerificacao)),
            h('td', { class: 'rd-td-actions' },
              s.metodo === 'html-publico' ? h('button', { class: 'btn btn-sm', type: 'button', onClick: (e) => { e.target.disabled = true; act(() => api.post(`/radar/admin/sources/${s.id}/run`), (r) => `Verificação: ${r.run.resultado}${r.run.erro ? ` - ${r.run.erro}` : ''}`); } }, icon('refresh', { size: 14 }), 'Verificar agora') : null,
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.put(`/radar/admin/sources/${s.id}/availability`, { indisponivel: !s.indisponivelManual }), 'Fonte atualizada.') }, s.indisponivelManual ? 'Reativar' : 'Marcar indisponível')),
          ))))),
        h('details', {}, h('summary', {}, 'Cadastrar nova fonte (revisão manual)'),
          formOf([
            ['id', 'Identificador', { required: true, pattern: '[a-z0-9-]{3,40}' }], ['titulo', 'Título', { required: true }], ['instituicao', 'Instituição', { required: true }],
            ['rotuloPublico', 'Rótulo público', { required: true }], ['url', 'URL', { type: 'url', required: true }],
            ['tipo', 'Tipo', { options: [['calendario', 'Calendário'], ['catalogo', 'Catálogo'], ['programa', 'Programa'], ['normativa', 'Normativa'], ['portal-candidatura', 'Portal de candidatura'], ['bolsa', 'Bolsa'], ['orientacao', 'Orientação']] }],
            ['prioridade', 'Prioridade (0 = normativa)', { type: 'number', min: 0, max: 5, value: 2 }], ['frequenciaHoras', 'Frequência (h)', { type: 'number', min: 6, max: 720, value: 24 }],
          ], 'Cadastrar fonte', (d) => act(() => api.post('/radar/admin/sources', { ...d, prioridade: Number(d.prioridade), frequenciaHoras: Number(d.frequenciaHoras) }), 'Fonte cadastrada.'))),
      ),

      h('div', { class: 'rd-two' },
        h('section', { class: 'rd-panel' },
          h('h2', {}, icon('edit', { size: 18 }), 'Registrar calendário oficial'),
          h('p', { class: 'small muted' }, 'Para resoluções publicadas (ex.: BOJA). Alterar um calendário já publicado sempre passa pela fila de revisão.'),
          formOf([
            ['sourceId', 'Fonte', { options: o.fontes.map((s) => [s.id, s.titulo]) }], ['url', 'URL do documento oficial', { type: 'url', required: true }],
            ['anoAcademico', 'Ano acadêmico', { required: true, placeholder: '2027/2028' }], ['fase', 'Fase', { type: 'number', min: 1, max: 5, value: 1 }],
            ['abertura', 'Abertura', { type: 'date', required: true }], ['encerramento', 'Encerramento', { type: 'date', required: true }],
            ['previsto', 'Situação', { options: [['', 'Confirmado em boletim oficial'], ['sim', 'Apenas previsão institucional']] }],
          ], 'Registrar', (d) => act(() => api.post('/radar/admin/calendars', { sourceId: d.sourceId, url: d.url, anoAcademico: d.anoAcademico, previsto: d.previsto === 'sim', fases: [{ fase: Number(d.fase), abertura: d.abertura, encerramento: d.encerramento }] }), (r) => (r.revisao ? 'Enviado para a fila de revisão.' : 'Calendário publicado.'))),
        ),
        h('section', { class: 'rd-panel' },
          h('h2', {}, icon('wand', { size: 18 }), 'Corrigir informação'),
          h('p', { class: 'small muted' }, 'Toda correção exige motivo e URL de evidência, fica protegida contra as próximas coletas, entra no histórico e reavalia os alertas já enviados.'),
          h('p', { class: 'small muted' }, `Campos editáveis: ${EDITAVEIS}.`),
          formOf([
            ['entidade', 'Registro', { options: [['AdmissionWindow', 'Janela de candidatura'], ['AdmissionEvent', 'Evento do calendário'], ['Program', 'Programa'], ['Opportunity', 'Oportunidade (suspensão)']] }],
            ['id', 'ID do registro', { required: true, placeholder: 'dua-masteres:2027/2028:F1' }], ['campo', 'Campo', { required: true, placeholder: 'abertura' }],
            ['valor', 'Novo valor', { placeholder: 'AAAA-MM-DD ou texto (vazio remove suspensão)' }], ['motivo', 'Motivo', { required: true }], ['url', 'URL da evidência', { type: 'url', required: true }],
          ], 'Aplicar correção', (d) => act(() => api.post('/radar/admin/corrections', { ...d, valor: d.valor || null }), (r) => `Corrigido. ${r.alertasReavaliados} alerta(s) de correção enviados.`)),
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post('/radar/admin/republish'), (r) => `Republicado. ${r.alertas} alerta(s) gerado(s).`) }, icon('refresh', { size: 14 }), 'Republicar e reavaliar alertas'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post('/radar/admin/community/import'), (r) => (r.indisponivel ? 'Módulo Comunidade indisponível.' : `${r.importados} item(ns) da Comunidade enviados para revisão.`)) }, icon('users', { size: 14 }), 'Importar verificados da Comunidade')),
        ),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('clock', { size: 18 }), 'Verificações recentes'),
        h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Início', 'Fonte', 'Origem', 'Resultado', 'Alvos / páginas', 'Alterações', 'Gravado', 'Duração', 'Erro'].map((x) => h('th', {}, x)))),
          h('tbody', {}, o.execucoes.slice(0, 30).map((r) => h('tr', { class: r.resultado === 'erro' ? 'rd-row-err' : '' },
            h('td', {}, fmtDT(r.inicio), h('br'), h('small', { class: 'muted' }, r.id)), h('td', {}, r.sourceId), h('td', {}, r.origem || 'manual'), h('td', {}, r.resultado),
            h('td', {}, `${r.alvos ?? '-'} / ${r.itens ?? '-'}`), h('td', {}, String(r.mudancas)),
            h('td', {}, r.persistido === true ? 'sim' : r.persistido === false ? 'NÃO' : '-'), h('td', {}, r.duracaoMs != null ? `${Math.round(r.duracaoMs / 100) / 10} s` : '-'),
            h('td', { class: 'small' }, r.erro || '')))))),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('book', { size: 18 }), 'Histórico global'),
        h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Quando', 'Registro', 'Campo', 'Antes', 'Depois', 'Validação', 'Por', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, o.historico.slice(0, 50).map((r) => h('tr', { class: r.invalidada ? 'rd-row-invalid' : '' },
            h('td', {}, fmtDT(r.em)), h('td', { class: 'small' }, r.entidadeId), h('td', {}, r.campo), h('td', {}, show(r.anterior)), h('td', {}, show(r.novo)), h('td', {}, r.validacao), h('td', { class: 'small' }, r.por),
            h('td', {}, r.entidade ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => loadHistory(r.entidade, r.entidadeId) }, 'Histórico') : null)))))),
      ),
    );
  }

  await draw();
  return root;
}
