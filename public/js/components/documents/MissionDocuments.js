// Documentos de uma missão (central da missão): lê e grava na CARTEIRA (/api/documents), nunca só no navegador.
// O mesmo documento serve a várias missões e rodadas sem duplicar: o que você guarda aqui aparece em Documentos
// (na categoria certa) e em todas as missões que o usam. Ordem fixa: necessários → opcionais → contingência.
// Enviar arquivo nunca é obrigatório: "Já tenho" basta.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { ensureStyles, EstadoPill, GRUPOS } from './shared.js';
import { openDocumentPanel } from './DocumentDetailPanel.js';
import { uploadFile, ACCEPT } from './DocumentUpload.js';

/** opts: { journeyId, missionId, onChange } — devolve o elemento e carrega sozinho. */
export function MissionDocuments({ journeyId, missionId, onChange }) {
  ensureStyles();
  const root = h('div', { class: 'md-docs' }, h('span', { class: 'du-spinner' }));
  const q = `?journeyId=${journeyId}`;
  const changed = () => { load(); onChange?.(); };
  const open = (id) => openDocumentPanel(id, { journeyId, missao: missionId, onChange: changed });
  const put = async (id, body, msg) => { try { await api.put(`/documents/${id}${q}`, body); toast(msg, 'ok'); changed(); } catch (e) { toast(e.message, 'err'); } };

  // Envio direto: o arquivo vai para a Carteira (cifrado), ligado a esta missão.
  const picker = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', 'aria-hidden': 'true', tabindex: '-1' });
  let target = null;
  picker.addEventListener('change', async () => {
    const f = picker.files[0];
    picker.value = '';
    if (!f || !target) return;
    try {
      await uploadFile(target.id, f, { missao: missionId });
      toast(`Guardado em Documentos › ${target.categoriaNome || 'Carteira'}: ${target.nome}.`, 'ok');
      changed();
    } catch (e) { toast(e.message, 'err'); }
  });
  const send = (v) => { target = v; picker.click(); };

  const row = (v, { acoes = false } = {}) => h('li', { class: 'md-doc-item' },
    h('button', { type: 'button', class: 'md-doc', onClick: () => open(v.id) },
      h('span', { class: 'dc-icon' }, icon(v.icone || 'file', { size: 16 })),
      h('span', { class: 'md-doc-name' }, v.nome, v.anexos ? h('small', {}, icon('file', { size: 11 }), ` ${v.anexos}`) : null),
      EstadoPill(v), icon('chevron', { size: 14 })),
    acoes && v.mensagem ? h('p', { class: 'md-doc-msg' }, v.mensagem) : null,
    acoes ? h('div', { class: 'md-doc-actions' },
      h('button', { type: 'button', class: 'btn btn-sm btn-cta', onClick: () => send(v) }, icon('file', { size: 13 }), ' Enviar'),
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => put(v.id, { estado: 'pronto', declarado: true }, `"${v.nome}" marcado como já obtido na sua Carteira.`) }, icon('check', { size: 13 }), ' Já tenho'),
      v.atendivelPor?.length ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => put(v.id, { atendidoPor: v.atendivelPor[0].id }, 'Registrado: o outro documento já atende.') }, icon('link', { size: 13 }), ` Meu ${v.atendivelPor[0].nome.split(' ')[0].toLowerCase()} já mostra isso`) : null,
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => open(v.id) }, icon('help', { size: 13 }), ' Como conseguir')) : null);

  const load = async () => {
    let d;
    try { d = await api.get(`/documents/missions/${journeyId}/${missionId}`); } catch (e) { toast(e.message, 'err'); return; }
    const nec = d.necessarios || [];
    const prontos = nec.filter((v) => v.pronto && !v.atencao);
    const pend = (v) => !v.resolvido || v.atencao;
    const grupo = (g, items) => {
      if (!items.length) return null;
      if (g.id === 'necessarios') {
        return h('section', { class: 'md-group' },
          h('p', { class: 'md-docs-label' }, g.titulo.replace('Documentos ', '')),
          h('ul', { class: 'md-docs-list' }, items.filter(pend).map((v) => row(v, { acoes: true })), items.filter((v) => !pend(v)).map((v) => row(v))));
      }
      // Opcionais e contingência: recolhidos, para a missão continuar limpa.
      return h('details', { class: 'md-docs-more' }, h('summary', {}, `${g.titulo.replace('Documentos ', '')} (${items.length})`),
        h('ul', { class: 'md-docs-list' }, items.map((v) => row(v))));
    };
    mount(root,
      picker,
      h('div', { class: 'md-docs-head' },
        h('strong', {}, nec.length ? (prontos.length === nec.length ? 'Tudo pronto para esta missão' : `${prontos.length} de ${nec.length} necessários prontos`) : 'Nenhum documento necessário aqui'),
        h('a', { href: `#/documentos`, class: 'md-docs-all' }, 'Ver em Documentos', icon('arrow', { size: 12 }))),
      grupo(GRUPOS[0], nec),
      grupo(GRUPOS[1], d.opcionais || []),
      grupo(GRUPOS[2], d.contingencia || []),
      d.naoNecessarios.length ? h('p', { class: 'md-docs-na' }, `Não se aplicam a você: ${d.naoNecessarios.map((v) => v.nome.replace(/ \(.*\)$/, '')).join(', ')}.`) : null,
      h('p', { class: 'md-docs-na' }, icon('lock', { size: 11 }), ' Vai para Documentos, cifrado. Enviar é opcional.'));
  };
  load();
  return root;
}
