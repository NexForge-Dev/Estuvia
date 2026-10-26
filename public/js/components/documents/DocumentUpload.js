// Arquivos de um documento: arrastar e soltar, selecionar, pré-visualizar, nova versão e excluir.
// Os arquivos vão cifrados para a conta do estudante (/api/documents/:id/files). A Estuvia não analisa o conteúdo.
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { fmtDate, fmtSize } from './shared.js';

export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
const MAX = 10 * 1024 * 1024;
const TYPES = /^(application\/pdf|image\/(png|jpeg|webp))$/;

export async function uploadFile(docId, file, { serie, missao, rotulo } = {}) {
  if (file.size > MAX) throw new Error('Arquivo maior que 10 MB.');
  if (file.type && !TYPES.test(file.type)) throw new Error('Use PDF, PNG, JPG ou WEBP.');
  const qs = new URLSearchParams({ ...(serie ? { serie } : {}), ...(missao ? { missao } : {}), ...(rotulo ? { rotulo } : {}) }).toString();
  const res = await fetch(`/api/documents/${docId}/files${qs ? `?${qs}` : ''}`, {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Requested-With': 'travessia', 'X-File-Name': encodeURIComponent(file.name || 'documento') },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
  return data;
}

/** doc = detalhe do documento; onChange(detalheAtualizado) */
export function DocumentUpload(doc, { onChange, onDelete }) {
  const input = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', id: `up-${doc.id}`, multiple: false });
  let replaceSerie = null;
  const busy = h('div', { class: 'du-busy', hidden: true }, h('span', { class: 'du-spinner' }), 'Enviando com segurança…');

  const send = async (file) => {
    if (!file) return;
    busy.hidden = false;
    try {
      const r = await uploadFile(doc.id, file, { serie: replaceSerie });
      toast(replaceSerie ? 'Nova versão guardada.' : 'Arquivo guardado na sua conta.', 'ok');
      onChange(r.documento);
    } catch (e) { toast(e.message, 'err'); } finally { busy.hidden = true; replaceSerie = null; }
  };
  input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; send(f); });

  const drop = h('label', { class: 'du-drop', for: input.id },
    icon('file', { size: 22 }),
    h('strong', {}, doc.arquivos.length ? 'Adicionar outro arquivo' : 'Arraste o arquivo aqui'),
    h('span', {}, 'ou ', h('u', {}, 'escolha no dispositivo'), ' · PDF, JPG, PNG ou WEBP até 10 MB'));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => send(e.dataTransfer?.files?.[0]));

  const fileRow = (f, { old = false } = {}) => {
    const isImg = f.mime.startsWith('image/');
    const confirmBox = h('div', { class: 'du-confirm', hidden: true },
      h('span', {}, 'Excluir este arquivo da sua conta?'),
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: async () => {
        try { const r = await onDelete(f.id); toast('Arquivo excluído.', 'ok'); onChange(r.documento); } catch (e) { toast(e.message, 'err'); }
      } }, 'Excluir'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { confirmBox.hidden = true; } }, 'Cancelar'));
    return h('li', { class: `du-file${old ? ' is-old' : ''}` },
      h('a', { class: 'du-thumb', href: f.url, target: '_blank', rel: 'noopener', 'aria-label': `Abrir ${f.nome}` },
        isImg ? h('img', { src: f.url, alt: '', loading: 'lazy' }) : h('span', { class: 'du-pdf' }, icon('file', { size: 18 }), 'PDF')),
      h('div', { class: 'du-meta' },
        h('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.nome),
        h('small', {}, `${old ? `Versão ${f.versao} · ` : f.versao > 1 ? `Versão ${f.versao} · ` : ''}${fmtDate(f.criadoEm)} · ${f.mime === 'application/pdf' ? 'PDF' : f.mime.split('/')[1].toUpperCase()} · ${fmtSize(f.tamanho)}`)),
      h('div', { class: 'du-actions' },
        old ? null : h('button', { type: 'button', class: 'icon-btn sm', title: 'Enviar nova versão', 'aria-label': `Enviar nova versão de ${f.nome}`, onClick: () => { replaceSerie = f.id; input.click(); } }, icon('refresh', { size: 13 })),
        h('button', { type: 'button', class: 'icon-btn sm', title: 'Excluir', 'aria-label': `Excluir ${f.nome}`, onClick: () => { confirmBox.hidden = false; } }, icon('trash', { size: 13 }))),
      confirmBox);
  };

  const list = h('ul', { class: 'du-list' }, doc.arquivos.map((f) => [
    fileRow(f),
    f.anteriores.length ? h('li', { class: 'du-versions' }, h('details', {}, h('summary', {}, `Versões anteriores (${f.anteriores.length})`), h('ul', { class: 'du-list' }, f.anteriores.map((o) => fileRow(o, { old: true }))))) : null,
  ]));
  const root = h('div', { class: 'du' }, input, doc.arquivos.length ? list : null, drop, busy,
    h('p', { class: 'du-note' }, icon('lock', { size: 12 }), 'Guardado cifrado na sua conta, visível só para você. Guardar aqui não é validação oficial.'));
  return root;
}

// ---------------------------------------------------------------------------
// Arquivos que ficaram só neste navegador (versão antiga dos anexos das missões)
// ---------------------------------------------------------------------------

export async function localDocFiles(userId, docIds) {
  try {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('travessia-anexos');
      r.onupgradeneeded = () => { r.transaction.abort(); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (!db.objectStoreNames.contains('files')) return [];
    const all = await new Promise((resolve, reject) => {
      const q = db.transaction('files').objectStore('files').getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    let sent = [];
    try { sent = JSON.parse(localStorage.getItem('padapal.docs.migrados') || '[]'); } catch { sent = []; }
    // Escopo dos anexos das missões: `${userId}:${journeyId}:${docId}`. Fotos de moradia ficam só no dispositivo.
    return all.filter((f) => typeof f.scope === 'string' && f.scope.startsWith(`${userId}:`) && !f.scope.includes(':moradia:') && docIds.includes(f.scope.split(':').pop()) && !sent.includes(f.id))
      .map((f) => ({ ...f, docId: f.scope.split(':').pop() }));
  } catch {
    return [];
  }
}

export function LocalFilesBanner(files, { onDone }) {
  if (!files.length) return null;
  const host = h('section', { class: 'dc-local' });
  const draw = (sending = false) => mount(host,
    h('span', { class: 'dc-local-ic' }, icon('link', { size: 18 })),
    h('div', {}, h('strong', {}, `${files.length} arquivo${files.length > 1 ? 's' : ''} só neste navegador`),
      h('p', {}, 'Anexados antes nas missões. Envie para a sua conta para acessar de qualquer dispositivo (ficam cifrados).')),
    h('button', { type: 'button', class: 'btn btn-sm', disabled: sending, onClick: async () => {
      draw(true);
      const ok = [];
      for (const f of files) {
        try { await uploadFile(f.docId, new File([f.blob], f.nome, { type: f.tipo })); ok.push(f.id); } catch (e) { toast(`${f.nome}: ${e.message}`, 'err'); }
      }
      try { localStorage.setItem('padapal.docs.migrados', JSON.stringify([...JSON.parse(localStorage.getItem('padapal.docs.migrados') || '[]'), ...ok])); } catch { /* sem storage */ }
      toast(`${ok.length} arquivo(s) enviados para a sua conta.`, 'ok');
      onDone();
    } }, sending ? 'Enviando…' : 'Enviar para minha conta'));
  draw();
  return host;
}
