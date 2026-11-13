// Arquivos de um documento: arrastar e soltar ou escolher → prévia (nome sugerido, papel) → salvar.
// Um documento pode ter vários arquivos agrupados por papel (original, frente/verso, apostila, tradução…),
// cada um com versões. Os arquivos vão cifrados para a conta (/api/documents/:id/files); a Estuvia não analisa o conteúdo.
// Antes do primeiro arquivo, o estudante lê e aceita como eles são tratados (consentimento).
import { h, mount, toast } from '../../ui.js';
import { icon } from '../../icons.js';
import { api } from '../../api.js';
import { fmtDate, fmtSize } from './shared.js';

export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
const MAX = 10 * 1024 * 1024;
const TYPES = /^(application\/pdf|image\/(png|jpeg|webp))$/;
export const CONSENT_VERSION = '2026-11-13';

// ---------------------------------------------------------------------------
// Consentimento (uma vez): explica o tratamento antes do primeiro arquivo.
// ---------------------------------------------------------------------------
let consentPromise = null;
export function ensureConsent() {
  consentPromise ??= new Promise((resolve) => {
    const chk = h('input', { type: 'checkbox', id: 'du-consent' });
    const ok = h('button', { type: 'button', class: 'btn btn-cta', disabled: true }, 'Aceitar e continuar');
    const close = (v) => { overlay.remove(); consentPromise = null; resolve(v); };
    chk.addEventListener('change', () => { ok.disabled = !chk.checked; });
    ok.addEventListener('click', async () => {
      try { await api.post('/documents/consent', { aceito: true, versao: CONSENT_VERSION }); close(true); } catch (e) { toast(e.message, 'err'); }
    });
    const overlay = h('div', { class: 'dp-overlay open du-consent', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'du-consent-title' },
      h('div', { class: 'du-consent-card' },
        h('h2', { id: 'du-consent-title' }, icon('lock', { size: 18 }), ' Antes de guardar seus arquivos'),
        h('ul', {},
          h('li', {}, 'Os arquivos ficam cifrados no servidor e só abrem pela sua conta, com login e por links que expiram.'),
          h('li', {}, 'A chave da cifra fica no servidor da Estuvia, que decifra o arquivo para entregá-lo a você. Não é criptografia ponta a ponta. A equipe não abre seus arquivos pelo painel.'),
          h('li', {}, 'A Estuvia não analisa nem valida o conteúdo: "pronto" é a sua organização.'),
          h('li', {}, 'Seus documentos não são enviados para inteligência artificial nem usados para treinar modelos.'),
          h('li', {}, 'Você pode baixar ou excluir tudo quando quiser e revogar este consentimento em Documentos → Privacidade. Ao revogar ou excluir a conta, os arquivos são apagados.'),
          h('li', {}, 'Não envie senhas, PIN, CVV ou códigos de acesso.')),
        h('label', { class: 'dp-check', for: 'du-consent' }, chk, h('span', {}, 'Li e concordo com o tratamento dos meus documentos.')),
        h('div', { class: 'row wrap' }, ok, h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => close(false) }, 'Agora não'))));
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
    document.body.append(overlay);
    chk.focus();
  });
  return consentPromise;
}

export async function uploadFile(docId, file, { serie, missao, rotulo, papel, nome } = {}) {
  if (file.size > MAX) throw new Error('Arquivo maior que 10 MB.');
  if (file.type && !TYPES.test(file.type)) throw new Error('Use PDF, PNG, JPG ou WEBP.');
  const qs = new URLSearchParams({ ...(serie ? { serie } : {}), ...(missao ? { missao } : {}), ...(rotulo ? { rotulo } : {}), ...(papel ? { papel } : {}) }).toString();
  const send = () => fetch(`/api/documents/${docId}/files${qs ? `?${qs}` : ''}`, {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Requested-With': 'travessia', 'X-File-Name': encodeURIComponent(nome || file.name || 'documento') },
  });
  let res = await send();
  if (res.status === 428) {
    if (!(await ensureConsent())) throw new Error('Envio cancelado: sem o seu consentimento, nenhum arquivo é guardado.');
    res = await send();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
  return data;
}

const kind = (f) => (f.mime === 'application/pdf' ? 'PDF' : f.mime.split('/')[1].toUpperCase());
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);

/** doc = detalhe do documento; onChange(detalheAtualizado), onDelete(fid) → Promise<{documento}> */
export function DocumentUpload(doc, { onChange, onDelete, missao }) {
  const input = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', id: `up-${doc.id}` });
  let replaceSerie = null;
  const stage = h('div', { class: 'du-stage' });
  const papeis = doc.papeis || [{ id: 'original', label: 'Original' }];
  const defaultRole = () => {
    if (!doc.partes) return 'original';
    const used = new Set(doc.arquivos.map((f) => f.papel));
    return doc.partes.find((p) => !used.has(p)) || 'original';
  };

  // Prévia antes de salvar: miniatura, nome sugerido (editável) e papel do arquivo.
  function preview(file) {
    if (!file) return;
    if (file.size > MAX) return toast('Arquivo maior que 10 MB.', 'err');
    if (file.type && !TYPES.test(file.type)) return toast('Use PDF, PNG, JPG ou WEBP.', 'err');
    const ext = (file.name.match(/\.([a-z0-9]{2,4})$/i)?.[1] || (file.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
    const role = h('select', { 'aria-label': 'Que arquivo é este?' }, papeis.map((p) => h('option', { value: p.id, selected: p.id === defaultRole() }, p.label)));
    const name = h('input', { type: 'text', maxlength: 100, 'aria-label': 'Nome do arquivo' });
    const suggest = () => { name.value = `${slug(doc.nome)}${role.value !== 'original' ? `_${role.value}` : ''}.${ext}`; };
    suggest();
    role.addEventListener('change', suggest);
    let thumb = h('span', { class: 'du-pdf' }, icon('file', { size: 20 }), ext.toUpperCase());
    if (file.type.startsWith('image/')) {
      // Prévia local por FileReader (data: é permitido pela CSP; blob: não).
      thumb = h('img', { alt: 'Prévia', class: 'du-preview-img' });
      const fr = new FileReader();
      fr.onload = () => { thumb.src = fr.result; };
      fr.readAsDataURL(file);
    }
    const save = h('button', { type: 'button', class: 'btn btn-cta btn-sm' }, icon('lock', { size: 13 }), ' Salvar na carteira');
    save.addEventListener('click', async () => {
      save.disabled = true;
      save.textContent = 'Enviando com segurança…';
      try {
        const r = await uploadFile(doc.id, file, { serie: replaceSerie, papel: replaceSerie ? undefined : role.value, nome: name.value.trim() || file.name, missao });
        toast(replaceSerie ? 'Nova versão guardada.' : 'Arquivo guardado na sua conta.', 'ok');
        replaceSerie = null;
        mount(stage);
        onChange(r.documento);
      } catch (e) { toast(e.message, 'err'); save.disabled = false; save.textContent = 'Salvar na carteira'; }
    });
    mount(stage, h('div', { class: 'du-preview' },
      h('div', { class: 'du-thumb' }, thumb),
      h('div', { class: 'du-preview-form' },
        h('small', { class: 'muted' }, `${file.name} · ${fmtSize(file.size)}${replaceSerie ? ' · nova versão' : ''}`),
        h('label', { class: 'dp-inline' }, h('span', {}, 'Nome'), name),
        replaceSerie ? null : h('label', { class: 'dp-inline' }, h('span', {}, 'Este arquivo é'), role),
        h('div', { class: 'row wrap' }, save, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { replaceSerie = null; mount(stage); } }, 'Cancelar')))));
  }
  input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; preview(f); });

  const drop = h('label', { class: 'du-drop', for: input.id },
    icon('file', { size: 22 }),
    h('strong', {}, doc.arquivos.length ? 'Adicionar arquivo' : 'Enviar arquivo'),
    h('span', {}, 'PDF ou foto, até 10 MB'),
    doc.partes ? h('small', {}, 'Frente e verso ficam juntos aqui.') : null);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => preview(e.dataTransfer?.files?.[0]));

  const fileRow = (f, { old = false } = {}) => {
    const isImg = f.mime.startsWith('image/');
    const dl = `${f.url}${f.url.includes('?') ? '&' : '?'}download=1`;
    const confirmBox = h('div', { class: 'du-confirm', hidden: true },
      h('span', {}, 'Excluir este arquivo definitivamente?'),
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: async () => {
        try { const r = await onDelete(f.id); toast('Arquivo excluído.', 'ok'); onChange(r.documento); } catch (e) { toast(e.message, 'err'); }
      } }, 'Excluir'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { confirmBox.hidden = true; } }, 'Cancelar'));
    const role = old ? null : h('select', { class: 'du-role', 'aria-label': `Tipo de ${f.nome}` }, papeis.map((p) => h('option', { value: p.id, selected: p.id === f.papel }, p.label)));
    role?.addEventListener('change', async () => {
      try { const r = await api.patch(`/documents/files/${f.id}`, { papel: role.value }); onChange(r.documento); } catch (e) { toast(e.message, 'err'); }
    });
    return h('li', { class: `du-file${old ? ' is-old' : ''}` },
      h('a', { class: 'du-thumb', href: f.url, target: '_blank', rel: 'noopener', 'aria-label': `Visualizar ${f.nome}` },
        isImg ? h('img', { src: f.url, alt: '', loading: 'lazy' }) : h('span', { class: 'du-pdf' }, icon('file', { size: 18 }), 'PDF')),
      h('div', { class: 'du-meta' },
        h('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.nome),
        h('small', {}, `${f.versao > 1 ? `Versão ${f.versao} · ` : ''}${fmtDate(f.criadoEm)} · ${kind(f)} · ${fmtSize(f.tamanho)}`),
        role),
      h('div', { class: 'du-actions' },
        h('a', { class: 'icon-btn sm', href: dl, title: 'Baixar', 'aria-label': `Baixar ${f.nome}` }, icon('arrow', { size: 13 })),
        old ? null : h('button', { type: 'button', class: 'icon-btn sm', title: 'Substituir (nova versão)', 'aria-label': `Substituir ${f.nome}`, onClick: () => { replaceSerie = f.id; input.click(); } }, icon('refresh', { size: 13 })),
        h('button', { type: 'button', class: 'icon-btn sm', title: 'Excluir', 'aria-label': `Excluir ${f.nome}`, onClick: () => { confirmBox.hidden = false; } }, icon('trash', { size: 13 }))),
      confirmBox);
  };

  const list = h('ul', { class: 'du-list' }, doc.arquivos.map((f) => [
    fileRow(f),
    f.anteriores.length ? h('li', { class: 'du-versions' }, h('details', {}, h('summary', {}, `Versões anteriores (${f.anteriores.length})`), h('ul', { class: 'du-list' }, f.anteriores.map((o) => fileRow(o, { old: true }))))) : null,
  ]));
  return h('div', { class: 'du' }, input, doc.arquivos.length ? list : null, stage, drop,
    h('p', { class: 'du-note' }, icon('lock', { size: 12 }), 'Cifrado no servidor. Abre só pela sua conta.'));
}

// ---------------------------------------------------------------------------
// Arquivos que ficaram só neste navegador (versão antiga dos anexos das missões)
// ---------------------------------------------------------------------------

/** docIds = lista de ids aceitos, ou null para qualquer documento. */
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
    return all.filter((f) => typeof f.scope === 'string' && f.scope.startsWith(`${userId}:`) && !f.scope.includes(':moradia:') && (!docIds || docIds.includes(f.scope.split(':').pop())) && !sent.includes(f.id))
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
