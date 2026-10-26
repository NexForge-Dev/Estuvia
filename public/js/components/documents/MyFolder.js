// Minha pasta: todos os arquivos guardados num lugar só, de qualquer etapa da jornada.
// Serve para "levar na viagem": passaporte, carta de aceitação, seguro, passagem… e também
// documentos fora do catálogo ("Outro documento": RG, CNH, carteira de vacinação).
// Os arquivos usam a mesma API cifrada da carteira (/api/documents/:id/files).
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { fmtDate, fmtSize } from './shared.js';
import { uploadFile, ACCEPT } from './DocumentUpload.js';

// Os de viagem primeiro no seletor; o resto do catálogo vem depois.
const TRAVEL_FIRST = ['passaporte', 'admissao', 'visto', 'seguro', 'passagem', 'comprovante-moradia', 'meios', 'carta-bolsa'];

export function MyFolder({ onChange } = {}) {
  const root = h('section', { class: 'mf', 'aria-labelledby': 'mf-title' });
  let data = { arquivos: [], tipos: [] };
  let adding = false;

  const load = async () => {
    try { data = await api.get('/documents/files'); } catch (e) { toast(e.message, 'err'); }
    draw();
  };

  function draw() {
    const n = data.arquivos.length;
    mount(root,
      h('div', { class: 'mf-head' },
        h('div', {},
          h('h2', { id: 'mf-title' }, icon('folder', { size: 18 }), 'Minha pasta'),
          h('p', { class: 'mf-sub' }, n ? `${n} arquivo${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''} para levar com você.` : 'Guarde aqui passaporte, carta de aceitação, seguro, passagem… e abra pelo celular quando precisar.')),
        adding ? null : h('button', { type: 'button', class: 'btn btn-cta', onClick: () => { adding = true; draw(); } }, icon('file', { size: 16 }), 'Guardar documento')),
      adding ? form() : null,
      n ? h('ul', { class: 'mf-list' }, data.arquivos.map(row)) : null);
  }

  function form() {
    const types = [...data.tipos].sort((a, b) => rank(a.id) - rank(b.id));
    const select = h('select', { id: 'mf-type', required: true },
      h('option', { value: '' }, 'Escolha…'),
      types.map((t) => h('option', { value: t.id }, t.nome)));
    const label = h('input', { id: 'mf-label', type: 'text', maxlength: 60, placeholder: 'Ex.: RG, CNH, carteira de vacinação' });
    const labelField = h('div', { class: 'field', hidden: true }, h('label', { class: 'field-label', for: 'mf-label' }, 'Nome do documento'), label);
    select.addEventListener('change', () => { labelField.hidden = select.value !== 'pessoal'; if (!labelField.hidden) label.focus(); });
    const file = h('input', { id: 'mf-file', type: 'file', accept: ACCEPT, required: true });
    const send = h('button', { type: 'submit', class: 'btn btn-cta' }, 'Guardar');

    const el = h('form', { class: 'mf-form' },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'mf-type' }, 'Que documento é?'), select),
      labelField,
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'mf-file' }, 'Arquivo (PDF ou foto, até 10 MB)'), file),
      h('div', { class: 'row wrap' }, send, h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { adding = false; draw(); } }, 'Cancelar')));
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = file.files[0];
      if (!select.value || !f) return toast('Escolha o tipo e o arquivo.', 'err');
      if (select.value === 'pessoal' && !label.value.trim()) return toast('Dê um nome ao documento.', 'err');
      send.disabled = true;
      send.textContent = 'Enviando…';
      try {
        await uploadFile(select.value, f, { rotulo: select.value === 'pessoal' ? label.value.trim() : undefined });
        toast('Guardado na sua pasta.', 'ok');
        adding = false;
        onChange?.();
        await load();
      } catch (err) {
        toast(err.message, 'err');
        send.disabled = false;
        send.textContent = 'Guardar';
      }
    });
    return el;
  }

  function row(f) {
    const isImg = f.mime.startsWith('image/');
    const confirm = h('div', { class: 'mf-confirm', hidden: true },
      h('span', {}, 'Excluir este arquivo?'),
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: async () => {
        try { await api.del(`/documents/files/${f.id}`); toast('Arquivo excluído.', 'ok'); onChange?.(); await load(); } catch (e) { toast(e.message, 'err'); }
      } }, 'Excluir'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { confirm.hidden = true; } }, 'Cancelar'));
    return h('li', { class: 'mf-item' },
      h('a', { class: 'mf-thumb', href: f.url, target: '_blank', rel: 'noopener', 'aria-label': `Abrir ${f.docNome}` },
        isImg ? h('img', { src: f.url, alt: '', loading: 'lazy' }) : h('span', { class: 'mf-pdf' }, icon('file', { size: 18 }), 'PDF')),
      h('div', { class: 'mf-meta' },
        h('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.docNome),
        h('small', {}, `${f.nome} · ${fmtDate(f.criadoEm)} · ${fmtSize(f.tamanho)}`)),
      h('div', { class: 'mf-actions' },
        h('a', { class: 'icon-btn sm', href: `${f.url}?download=1`, title: 'Baixar', 'aria-label': `Baixar ${f.docNome}` }, icon('arrow', { size: 14, cls: 'mf-down' })),
        h('button', { type: 'button', class: 'icon-btn sm', title: 'Excluir', 'aria-label': `Excluir ${f.docNome}`, onClick: () => { confirm.hidden = false; } }, icon('trash', { size: 14 }))),
      confirm);
  }

  load();
  return root;
}

function rank(id) {
  if (id === 'pessoal') return 1000;
  const i = TRAVEL_FIRST.indexOf(id);
  return i === -1 ? 100 : i;
}
