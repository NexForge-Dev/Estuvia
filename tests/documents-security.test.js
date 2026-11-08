// Carteira de documentos: detecção de PDF com conteúdo ativo (escapes e fluxos de objetos comprimidos)
// e integridade da cifra (AES-256-GCM com etiqueta completa).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docsec-'));
process.env.DATA_FILE = path.join(tmp, 'db.json');
process.env.RADAR_DATA_FILE = path.join(tmp, 'radar.json');
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.DOCS_DIR = path.join(tmp, 'docfiles');
process.env.DOC_RULES_FILE = path.join(tmp, 'document-rules.json');
process.env.RADAR_SCHEDULER = 'off';

const { createApp } = await import('../server/app.js');
const { flush, users } = await import('../server/store.js');
const { pdfHasActiveContent, CONSENT_VERSION } = await import('../server/routes/documents.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await flush();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'travessia', ...(body !== undefined && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...extra };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: Buffer.isBuffer(body) ? body : body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const buf = Buffer.from(await res.arrayBuffer());
    let data;
    try { data = JSON.parse(buf.toString('utf8')); } catch { data = buf; }
    return { status: res.status, data, headers: res.headers };
  };
}

const objStm = (inner, dict = '/Filter /FlateDecode') => {
  const body = dict.includes('FlateDecode') ? zlib.deflateSync(Buffer.from(inner, 'latin1')) : Buffer.from(inner, 'latin1');
  return Buffer.concat([
    Buffer.from(`%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 1 /First 4 ${dict} /Length ${body.length} >>\nstream\n`, 'latin1'),
    body,
    Buffer.from('\nendstream\nendobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n', 'latin1'),
  ]);
};

test('PDF: nome com escape #xx não esconde /JavaScript nem /OpenAction', () => {
  assert.equal(pdfHasActiveContent(Buffer.from('%PDF-1.4\n1 0 obj<< /Op#65nAction << /S /J#61vaScript /J#53 (app.alert(1)) >> >>endobj\n%%EOF')), true);
  assert.equal(pdfHasActiveContent(Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R /Lang (pt#2DBR) >>endobj\n%%EOF')), false);
});

test('PDF: /OpenAction dentro de fluxo de objetos comprimido é encontrado', () => {
  assert.equal(pdfHasActiveContent(objStm('1 0 << /Type /Catalog /OpenAction 2 0 R >> << /S /JavaScript /JS (x) >>')), true);
  // Dicionário do fluxo com escape (/Obj#53tm) também é reconhecido.
  assert.equal(pdfHasActiveContent(Buffer.from(objStm('1 0 << /OpenAction 2 0 R >>').toString('latin1').replace('/ObjStm', '/Obj#53tm'), 'latin1')), true);
  // Fluxo de objetos comum (sem ação) passa.
  assert.equal(pdfHasActiveContent(objStm('1 0 << /Type /Catalog /Pages 2 0 R >>')), false);
  // Filtro que não sabemos abrir num fluxo de objetos: não dá para conferir, recusa.
  assert.equal(pdfHasActiveContent(objStm('qualquer coisa', '/Filter /LZWDecode')), true);
  // Fluxo corrompido (não descomprime): recusa.
  const broken = Buffer.from(objStm('1 0 << >>').toString('latin1').replace(/stream\n[\s\S]*?\nendstream/, 'stream\nlixo-que-nao-e-zlib\nendstream'), 'latin1');
  assert.equal(pdfHasActiveContent(broken), true);
});

test('envio recusa PDF com ação escondida em fluxo comprimido; etiqueta GCM truncada não abre o arquivo', async () => {
  const req = client();
  const reg = await req('POST', '/auth/register', { nome: 'Dora Cifra', email: 'dora@cifra.dev', senha: 'segura123', aceite: true });
  assert.equal(reg.status, 201);
  assert.equal((await req('POST', '/documents/consent', { aceito: true, versao: CONSENT_VERSION })).status, 200);
  const evil = objStm('1 0 << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>');
  assert.equal((await req('POST', '/documents/rg-cin/files', evil, { 'Content-Type': 'application/pdf' })).status, 415);

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<<>>\n%%EOF\n');
  const up = await req('POST', '/documents/rg-cin/files', pdf, { 'Content-Type': 'application/pdf', 'X-File-Name': 'rg.pdf' });
  assert.equal(up.status, 201);
  const url = up.data.arquivo.url.replace('/api', '');
  const ok = await req('GET', url);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data, pdf);

  // Na base, a etiqueta de 16 bytes vira só os 4 primeiros (ataque de etiqueta truncada): a decifra precisa recusar.
  const u = users.findById(reg.data.user.id);
  const meta = u.docFiles.find((f) => f.id === up.data.arquivo.id);
  const full = meta.tag;
  meta.tag = Buffer.from(full, 'base64').subarray(0, 4).toString('base64');
  assert.equal((await req('GET', url)).status, 410);
  meta.tag = full;
  assert.equal((await req('GET', url)).status, 200);
});
