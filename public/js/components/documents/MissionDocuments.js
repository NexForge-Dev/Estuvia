// Documentos de uma missão (para a central da missão): "X de Y prontos", o que falta e o que já está pronto.
// Lê a carteira (/api/documents/missions/:jid/:mid): reaproveita os registros, sem pedir o mesmo documento de novo.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { ensureStyles, StatusPill } from './shared.js';
import { openDocumentPanel } from './DocumentDetailPanel.js';

/** opts: { journeyId, missionId, onChange } — devolve o elemento e carrega sozinho. */
export function MissionDocuments({ journeyId, missionId, onChange }) {
  ensureStyles();
  const root = h('div', { class: 'md-docs' }, h('span', { class: 'du-spinner' }));
  const load = async () => {
    let d;
    try { d = await api.get(`/documents/missions/${journeyId}/${missionId}`); } catch (e) { toast(e.message, 'err'); return; }
    const total = d.prontos.length + d.faltam.length;
    const open = (id) => openDocumentPanel(id, { journeyId, onChange: () => { load(); onChange?.(); } });
    const row = (v) => h('li', {}, h('button', { type: 'button', class: 'md-doc', onClick: () => open(v.id) },
      h('span', { class: 'dc-icon' }, icon(v.icone || 'file', { size: 16 })),
      h('span', { class: 'md-doc-name' }, v.nome.replace(/ \(.*\)$/, ''), v.anexos ? h('small', {}, icon('file', { size: 11 }), ` ${v.anexos}`) : null),
      StatusPill(v), icon('chevron', { size: 14 })));
    mount(root,
      h('div', { class: 'md-docs-head' },
        h('strong', {}, total ? `${d.prontos.length} de ${total} prontos` : 'Nenhum documento necessário aqui'),
        h('a', { href: '#/documentos', class: 'md-docs-all' }, 'Abrir carteira', icon('arrow', { size: 12 }))),
      d.faltam.length ? [h('p', { class: 'md-docs-label' }, 'Falta organizar'), h('ul', { class: 'md-docs-list' }, d.faltam.map(row))] : h('p', { class: 'md-docs-ok' }, icon('check', { size: 14 }), 'Tudo pronto para esta missão.'),
      d.prontos.length ? h('details', { class: 'md-docs-more' }, h('summary', {}, `Prontos (${d.prontos.length})`), h('ul', { class: 'md-docs-list' }, d.prontos.map(row))) : null,
      d.naoNecessarios.length ? h('p', { class: 'md-docs-na' }, `Não necessários para você: ${d.naoNecessarios.map((v) => v.nome.replace(/ \(.*\)$/, '')).join(', ')}.`) : null);
  };
  load();
  return root;
}
