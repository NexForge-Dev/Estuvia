// Anexos de documentos guardados SOMENTE no navegador do estudante (IndexedDB).
// Nada é enviado ao servidor: privacidade por padrão e nenhuma "validação" implícita.

const DB = 'travessia-anexos';
const STORE = 'files';
const MAX_BYTES = 15 * 1024 * 1024;
export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('scope', 'scope');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export async function listFiles(scope) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).index('scope').getAll(scope);
      req.onsuccess = () => resolve(req.result.map(({ blob, ...meta }) => ({ ...meta, blob })));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return []; // navegação privada / armazenamento bloqueado
  }
}

export async function addFile(scope, file) {
  if (file.size > MAX_BYTES) throw new Error('Arquivo maior que 15 MB.');
  if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)) throw new Error('Use PDF, PNG, JPG ou WEBP.');
  const record = { id: crypto.randomUUID(), scope, nome: file.name.slice(0, 120), tipo: file.type, tamanho: file.size, adicionadoEm: new Date().toISOString(), blob: file };
  await tx('readwrite', (s) => s.put(record));
  return record;
}

export const removeFile = (id) => tx('readwrite', (s) => s.delete(id));

export const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
