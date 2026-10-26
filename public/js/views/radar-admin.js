// Radar de Oportunidades — painel administrativo: fontes, verificações, erros, fila de revisão,
// registro manual (ex.: BOJA), correções com evidência, histórico e simulação de desenvolvimento.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const REVIEW = { conflito: 'Conflito entre fontes', 'alteracao-critica': 'Alteração crítica', 'extracao-incerta': 'Extração incerta', 'ciclo-inconsistente': 'Ano acadêmico inconsistente', 'programa-ausente': 'Programa ausente', 'rotulo-desconhecido': 'Rótulo desconhecido', comunidade: 'Comunidade (verificar)' };

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

  async function act(fn, ok) {
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok, 'ok'); await draw(); } catch (e) { toast(e.message, 'err'); }
  }

  async function draw() {
    let o;
    try { o = await api.get('/radar/admin'); } catch (e) {
      return mount(root, h('section', { class: 'rd-empty' }, icon('lock', { size: 26 }), h('h2', {}, 'Acesso restrito'), h('p', { class: 'muted' }, e.message),
        h('p', { class: 'small muted' }, 'Inclua seu e-mail em RADAR_ADMIN_EMAILS no .env do servidor e reinicie.')));
    }
    const t = o.totais;
    const open = o.revisoes.filter((r) => r.status === 'aberta');
    mount(root,
      h('section', { class: 'rd-hero rd-hero-admin' },
        h('p', { class: 'rd-eyebrow' }, icon('shield', { size: 16 }), 'Radar — painel administrativo'),
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
          h('div', { class: 'row wrap' },
            r.proposta ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/reviews/${r.id}`, { decisao: 'aprovar' }), 'Alteração aprovada e publicada.') }, icon('check', { size: 14 }), 'Aprovar e publicar') : null,
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.post(`/radar/admin/reviews/${r.id}`, { decisao: 'rejeitar' }), 'Revisão descartada.') }, r.proposta ? 'Rejeitar' : 'Marcar como conferida')),
        ))) : h('p', { class: 'muted' }, 'Nada pendente. Conflitos, extrações incertas e alterações críticas de prazo aparecem aqui antes de serem publicados.'),
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
              s.metodo === 'html-publico' ? h('button', { class: 'btn btn-sm', type: 'button', onClick: (e) => { e.target.disabled = true; act(() => api.post(`/radar/admin/sources/${s.id}/run`), (r) => `Verificação: ${r.run.resultado}${r.run.erro ? ` — ${r.run.erro}` : ''}`); } }, icon('refresh', { size: 14 }), 'Verificar agora') : null,
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
          h('p', { class: 'small muted' }, 'Toda correção exige motivo e URL de evidência, entra no histórico e reavalia os alertas já enviados.'),
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

      o.ambiente === 'desenvolvimento' ? h('section', { class: 'rd-panel rd-dev' },
        h('h2', {}, icon('wand', { size: 18 }), 'Simulação (somente desenvolvimento)'),
        h('p', { class: 'small' }, 'Publica um calendário DEMONSTRATIVO para testar alertas e Agenda. Os registros ficam marcados como demonstrativos em toda a interface e nunca sobrescrevem um calendário oficial.'),
        formOf([['anoAcademico', 'Ano acadêmico', { required: true, placeholder: '2027/2028' }], ['abertura', 'Abertura', { type: 'date', required: true }], ['encerramento', 'Encerramento', { type: 'date', required: true }]],
          'Simular publicação', (d) => act(() => api.post('/radar/admin/dev/simulate', d), (r) => `Simulação publicada. ${r.alertas} alerta(s) demonstrativo(s).`)),
        o.demo ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => act(() => api.del('/radar/admin/dev/simulate'), 'Dados demonstrativos removidos.') }, icon('trash', { size: 14 }), 'Remover dados demonstrativos') : null,
      ) : null,

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('clock', { size: 18 }), 'Verificações recentes'),
        h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Início', 'Fonte', 'Resultado', 'Itens', 'Alterações', 'Erro'].map((x) => h('th', {}, x)))),
          h('tbody', {}, o.execucoes.slice(0, 30).map((r) => h('tr', { class: r.resultado === 'erro' ? 'rd-row-err' : '' },
            h('td', {}, fmtDT(r.inicio)), h('td', {}, r.sourceId), h('td', {}, r.resultado), h('td', {}, String(r.itens ?? '')), h('td', {}, String(r.mudancas)), h('td', { class: 'small' }, r.erro || '')))))),
      ),

      h('section', { class: 'rd-panel' },
        h('h2', {}, icon('book', { size: 18 }), 'Histórico global'),
        h('div', { class: 'rd-table-wrap' }, h('table', { class: 'rd-table' },
          h('thead', {}, h('tr', {}, ['Quando', 'Registro', 'Campo', 'Antes', 'Depois', 'Validação', 'Por'].map((x) => h('th', {}, x)))),
          h('tbody', {}, o.historico.slice(0, 50).map((r) => h('tr', {},
            h('td', {}, fmtDT(r.em)), h('td', { class: 'small' }, r.entidadeId), h('td', {}, r.campo), h('td', {}, String(r.anterior ?? '—')), h('td', {}, String(r.novo ?? '—')), h('td', {}, r.validacao), h('td', { class: 'small' }, r.por)))))),
      ),
    );
  }

  await draw();
  return root;
}
