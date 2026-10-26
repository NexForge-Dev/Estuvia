// Meus Documentos: carteira digital organizada pela jornada.
//   resumo da etapa atual → "o que preparar agora" (uma ação) → etapas (atual aberta, futuras só como prévia).
// Dados e regras: /api/documents (server/document-engine.js). Status "pronto" é organização do estudante.
import { h, mount, toast } from '../ui.js';
import { icon, ring } from '../icons.js';
import { api } from '../api.js';
import { state, loadJourneys, invalidate, checkAchievements } from '../app.js';
import { ensureStyles, StatusPill } from '../components/documents/shared.js';
import { DocumentCard } from '../components/documents/DocumentCard.js';
import { openDocumentPanel } from '../components/documents/DocumentDetailPanel.js';
import { localDocFiles, LocalFilesBanner } from '../components/documents/DocumentUpload.js';
import { MyFolder } from '../components/documents/MyFolder.js';

const KEY_JOURNEY = 'padapal.docs.journey';
const KEY_SKIP_DECLARE = 'padapal.docs.declarar.pular';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } } };
const pct = (x) => `${Math.round(x * 100)}%`;

export async function documentsView(docId) {
  ensureStyles();
  const journeys = await loadJourneys().catch(() => []);
  let jid = journeys.some((j) => j.id === store.get(KEY_JOURNEY)) ? store.get(KEY_JOURNEY) : journeys[0]?.id || null;
  const root = h('div', { class: 'dc-page' });
  const expanded = new Set();
  let d;

  const load = async () => {
    d = await api.get(`/documents/dashboard${jid ? `?journeyId=${jid}` : ''}`);
    draw();
  };
  const refresh = () => { invalidate(); checkAchievements(); load().catch((e) => toast(e.message, 'err')); };
  const open = (id) => {
    history.replaceState(null, '', `#/documentos/${id}`);
    openDocumentPanel(id, { journeyId: jid, onChange: refresh, onClose: () => history.replaceState(null, '', '#/documentos') });
  };

  function draw() {
    const atual = d.etapas.find((e) => e.id === d.etapaAtual);
    mount(root,
      header(atual),
      folder,
      summary(atual),
      nextCard(),
      d.declarou || store.get(KEY_SKIP_DECLARE) ? null : declare(atual),
      localHost,
      d.antecedencia.length ? early() : null,
      h('section', { class: 'dc-stages', 'aria-label': 'Documentos por etapa da jornada' }, d.etapas.map(stage)),
      h('p', { class: 'dc-footnote' }, icon('lock', { size: 12 }), ' Arquivos ficam cifrados na sua conta e só você acessa. "Pronto" é a sua organização: a Estuvia não valida documentos.'));
  }

  // ---------- Cabeçalho ----------
  function header() {
    const sel = journeys.length > 1 ? h('select', { class: 'dc-journey', 'aria-label': 'Jornada' }, journeys.map((j) => h('option', { value: j.id, selected: j.id === jid }, j.destino?.programa?.nome || j.destino?.universidade?.sigla || 'Jornada'))) : null;
    sel?.addEventListener('change', () => { jid = sel.value; store.set(KEY_JOURNEY, jid); load(); });
    return h('header', { class: 'dc-header' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Gerenciador documental'), h('h1', {}, 'Meus Documentos ', h('span', { 'aria-hidden': 'true' }, '📁')),
        h('p', { class: 'dc-sub' }, 'Organize seus documentos para estudar no exterior.', d.programa ? h('span', { class: 'dc-prog' }, ` · ${d.programa}`) : null)),
      sel);
  }

  // ---------- Resumo da etapa atual ----------
  function summary(atual) {
    const c = d.resumo;
    const stat = (n, label, tone, ic) => h('div', { class: `dc-stat t-${tone}` }, icon(ic, { size: 16 }), h('strong', {}, String(n)), h('span', {}, label));
    return h('section', { class: 'dc-summary', 'aria-label': 'Resumo da etapa atual' },
      h('div', { class: 'dc-ring' }, ring(c.progresso, { size: 76, stroke: 7 }), h('span', {}, pct(c.progresso))),
      h('div', { class: 'dc-summary-text' }, h('small', {}, 'Etapa atual'), h('strong', {}, atual.titulo), h('span', {}, `${c.prontos} de ${c.total} documentos prontos`)),
      h('div', { class: 'dc-stats' },
        stat(c.prontos, 'prontos', 'ok', 'check'),
        stat(c.pendentes, c.pendentes === 1 ? 'pendente' : 'pendentes', 'muted', 'hourglass'),
        stat(c.atencao, 'precisam de atenção', c.atencao ? 'warn' : 'muted', 'alert')));
  }

  // ---------- O que preparar agora ----------
  function nextCard() {
    const p = d.proximo;
    if (!p) {
      return h('section', { class: 'dc-next is-done' },
        h('span', { class: 'dc-next-ic' }, icon('trophy', { size: 26 })),
        h('div', { class: 'dc-next-body' }, h('p', { class: 'dc-next-eyebrow' }, 'Etapa em dia'), h('h2', {}, 'Tudo pronto por aqui!'),
          h('p', {}, d.proximaEtapa ? `Quando a jornada avançar, a etapa "${d.proximaEtapa.titulo}" aparece aqui.` : 'Todos os documentos da sua jornada estão organizados.')),
        d.journeyId ? h('a', { class: 'btn btn-cta btn-lg', href: `#/j/${d.journeyId}` }, 'Continuar minha jornada', icon('arrow', { size: 16 })) : null);
    }
    const v = p.documento;
    return h('section', { class: `dc-next${v.atencao ? ' is-warn' : ''}` },
      h('span', { class: 'dc-next-ic' }, icon(v.icone, { size: 28 })),
      h('div', { class: 'dc-next-body' },
        h('p', { class: 'dc-next-eyebrow' }, v.antecedencia && v.etapa !== d.etapaAtual ? 'Prepare com antecedência' : 'O que você precisa preparar agora'),
        h('h2', {}, p.titulo, '.'),
        h('p', {}, p.frase),
        h('div', { class: 'dc-next-meta' }, StatusPill(v), v.motivo && v.exigencia !== 'requerido' ? h('small', {}, v.motivo) : null)),
      h('button', { type: 'button', class: 'btn btn-cta btn-lg dc-next-btn', onClick: () => open(v.id) },
        v.atencao ? 'Resolver agora' : v.aguardando ? 'Acompanhar' : p.acao, icon('arrow', { size: 16 })));
  }

  // ---------- "O que você já tem?" ----------
  function declare(atual) {
    const opts = atual.documentos.filter((v) => !v.resolvido && v.exigencia !== 'nao-necessario' && ['passaporte', 'diploma', 'historico', 'idioma', 'escala-notas', 'acesso-pos', 'especificos', 'admissao', 'seguro', 'meios'].includes(v.id)).slice(0, 6);
    if (!opts.length) return null;
    const chosen = new Set();
    const chips = opts.map((v) => {
      const b = h('button', { type: 'button', class: 'dc-have', 'aria-pressed': 'false' }, icon(v.icone, { size: 16 }), h('span', {}, v.nome.replace(/ \(.*\)$/, '').replace(/ válido$/, '')), h('i', { class: 'dc-have-check' }, icon('check', { size: 12 })));
      b.addEventListener('click', () => { chosen.has(v.id) ? chosen.delete(v.id) : chosen.add(v.id); b.classList.toggle('is-on', chosen.has(v.id)); b.setAttribute('aria-pressed', String(chosen.has(v.id))); });
      return b;
    });
    return h('section', { class: 'dc-declare' },
      h('div', {}, h('h2', {}, 'Você já tem algum destes?'), h('p', {}, 'Marque o que já está com você. Não vamos pedir de novo o que você já tem: você pode corrigir quando quiser.')),
      h('div', { class: 'dc-have-grid' }, chips),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn btn-cta', onClick: async () => {
          try {
            d = await api.post(`/documents/declare${jid ? `?journeyId=${jid}` : ''}`, { itens: Object.fromEntries(opts.map((v) => [v.id, chosen.has(v.id) ? 'tenho' : 'nao-tenho'])) });
            toast(chosen.size ? `${chosen.size} documento(s) registrados como disponíveis.` : 'Tudo bem, vamos preparar juntos.', 'ok');
            invalidate(); draw();
          } catch (e) { toast(e.message, 'err'); }
        } }, 'Salvar'),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { store.set(KEY_SKIP_DECLARE, '1'); draw(); } }, 'Agora não')));
  }

  // ---------- Antecedência (exceção ao desbloqueio) ----------
  function early() {
    return h('section', { class: 'dc-early' },
      h('h2', {}, icon('clock', { size: 16 }), 'Comece cedo'),
      h('p', { class: 'dc-early-sub' }, 'Estes são de etapas futuras, mas levam tempo para ficar prontos.'),
      h('div', { class: 'dc-grid is-compact' }, d.antecedencia.map((v) => DocumentCard(v, { onOpen: open, compact: true, destaque: v.id === d.proximo?.documento.id }))));
  }

  // ---------- Etapas ----------
  function stage(e, i) {
    const isOpen = e.estado === 'atual' || expanded.has(e.id);
    const c = e.contagem;
    const fill = h('span');
    fill.style.width = pct(c.progresso); // CSSOM: a CSP não permite atributo style inline
    const bar = h('span', { class: 'dc-stage-bar' }, fill);
    const badge = { atual: ['Etapa atual', 'is-current'], concluida: ['Concluída', 'is-done'], disponivel: ['Liberada', 'is-open'], futura: ['Em breve', 'is-future'] }[e.estado];
    const head = h('div', { class: 'dc-stage-head' },
      h('span', { class: 'dc-stage-num' }, e.estado === 'concluida' ? icon('check', { size: 16 }) : e.estado === 'futura' ? icon('lock', { size: 14 }) : String(i + 1)),
      h('div', { class: 'dc-stage-title' }, h('h2', {}, e.titulo), h('p', {}, e.resumo)),
      h('div', { class: 'dc-stage-side' },
        h('span', { class: `dc-stage-badge ${badge[1]}` }, badge[0]),
        e.estado !== 'futura' ? h('small', {}, `${c.prontos}/${c.total} prontos`) : h('small', {}, `${e.previa.total} documento${e.previa.total === 1 ? '' : 's'}`)));
    if (e.estado === 'futura') {
      return h('article', { class: 'dc-stage is-future' }, head,
        h('div', { class: 'dc-preview' }, e.previa.icones.map((ic) => h('span', { class: 'dc-icon is-ghost' }, icon(ic, { size: 18 }))),
          h('p', {}, 'Libera quando a jornada chegar a esta etapa. Até lá, nada aqui é pendência.')));
    }
    const toggle = e.estado === 'atual' ? null : h('button', { type: 'button', class: 'dc-stage-toggle', 'aria-expanded': String(isOpen), onClick: () => { isOpen ? expanded.delete(e.id) : expanded.add(e.id); draw(); } }, isOpen ? 'Recolher' : 'Ver documentos', icon('chevron', { size: 14 }));
    const relevant = e.documentos.filter((v) => v.status !== 'nao-se-aplica');
    const na = e.documentos.filter((v) => v.status === 'nao-se-aplica');
    return h('article', { class: `dc-stage ${badge[1]}${isOpen ? ' is-open' : ''}` }, head, e.estado !== 'atual' ? bar : null, toggle,
      isOpen ? h('div', { class: 'dc-stage-body' },
        e.reutiliza.length ? h('p', { class: 'dc-reuse' }, icon('refresh', { size: 13 }), 'Reaproveitados de outras etapas: ',
          e.reutiliza.map((r, k) => [k ? ', ' : '', h('button', { type: 'button', class: `dc-reuse-item${r.pronto ? ' is-ok' : ''}`, onClick: () => open(r.id) }, r.nome.replace(/ \(.*\)$/, ''), r.pronto ? ' ✓' : '')])) : null,
        e.id === 'visto' && d.consulado ? h('p', { class: 'dc-consul' }, icon('passport', { size: 13 }), 'A lista que vale é a do ', h('strong', {}, d.consulado.nome), ' · ', h('a', { href: d.consulado.vistoEstudosUrl, target: '_blank', rel: 'noopener noreferrer' }, 'página oficial do visto')) : null,
        h('div', { class: 'dc-grid' }, relevant.map((v) => DocumentCard(v, { onOpen: open, prioridade: e.estado === 'atual', destaque: v.id === d.proximo?.documento.id }))),
        na.length ? h('details', { class: 'dc-na' }, h('summary', {}, `Não necessários para você (${na.length})`), h('div', { class: 'dc-grid is-compact' }, na.map((v) => DocumentCard(v, { onOpen: open, compact: true })))) : null) : null);
  }

  // Minha pasta: criada uma vez e mantida entre os redesenhos (guarda o próprio estado).
  const folder = MyFolder({ onChange: refresh });

  // Arquivos antigos guardados só neste navegador → oferta discreta de enviar para a conta.
  const localHost = h('div');
  try { await load(); } catch (e) { return h('div', { class: 'empty' }, h('h2', {}, 'Não foi possível abrir seus documentos'), h('p', { class: 'muted' }, e.message)); }
  localDocFiles(state.me.user.id, d.etapas.flatMap((e) => e.documentos.map((v) => v.id)).concat(d.antecedencia.map((v) => v.id)))
    .then((files) => mount(localHost, LocalFilesBanner(files, { onDone: () => { mount(localHost); refresh(); } })));
  if (docId) setTimeout(() => open(docId), 0);
  return root;
}
