// Resultados estruturados: em vez de um parágrafo + link genérico, a tela mostra o que a Estuvia
// encontrou. Toda ferramenta (missão, Mentor, Radar…) devolve dados { tipo, ... } e o front escolhe
// o componente pelo tipo — sem depender de Markdown.
//
//   A. Resultado            → cabeçalho com ícone, estado e título ("Encontramos seu consulado!")
//   B. Informação essencial → destaque + poucos campos (copiáveis quando útil)
//   C. Próxima ação         → UM botão principal, com ação específica
//   D. Ajuda opcional       → ações secundárias discretas + detalhes recolhidos + fonte oficial
//
// renderResult(dados, opts) escolhe o componente; registerResult(tipo, fn) acrescenta novos tipos.
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';

let styled = false;
function ensureStyles() {
  if (styled || document.querySelector('link[href="/css/results.css"]')) { styled = true; return; }
  styled = true;
  document.head.append(h('link', { rel: 'stylesheet', href: '/css/results.css' }));
}

const fmtDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

async function copy(text, label = 'Copiado') {
  try { await navigator.clipboard.writeText(text); toast(`${label}!`, 'ok'); return true; } catch { toast('Não consegui copiar: selecione o texto manualmente.', 'err'); return false; }
}

// Ação = { rotulo, icone?, href?, externo?, onClick?, copiar? }. Externo abre em outra aba.
function action(a, cls) {
  if (!a) return null;
  const ic = a.icone ? icon(a.icone, { size: cls === 'rc-primary' ? 18 : 14 }) : null;
  const trail = a.externo ? icon('external', { size: cls === 'rc-primary' ? 15 : 12 }) : null;
  if (a.copiar) {
    const b = h('button', { type: 'button', class: cls }, ic || icon('copy', { size: 14 }), h('span', {}, a.rotulo));
    b.addEventListener('click', async () => { if (await copy(a.copiar, a.feedback || 'Copiado')) { b.classList.add('is-done'); setTimeout(() => b.classList.remove('is-done'), 1400); } });
    return b;
  }
  if (a.href) return h('a', { class: cls, href: a.href, ...(a.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {}), onClick: a.onClick }, ic, h('span', {}, a.rotulo), trail);
  return h('button', { type: 'button', class: cls, onClick: a.onClick }, ic, h('span', {}, a.rotulo), trail);
}

/**
 * Cartão de resultado genérico.
 * { tom: 'ok'|'info'|'warn'|'neutral', icone, selo, titulo, subtitulo,
 *   destaque: { nome, sub, icone }, campos: [{ rotulo, valor, icone, copiar, href, externo }],
 *   aviso, acaoPrincipal, acoes: [], detalhes: [{ titulo, conteudo }], fonte: { orgao, titulo, url, verificadoEm },
 *   compacto }
 */
export function ResultCard(r) {
  ensureStyles();
  const tom = r.tom || 'ok';
  const field = (f) => {
    if (!f?.valor) return null;
    const value = f.href ? h('a', { href: f.href, ...(f.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, f.valor) : h('span', {}, f.valor);
    return h('div', { class: 'rc-field' },
      h('span', { class: 'rc-field-ic' }, icon(f.icone || 'check', { size: 15 })),
      h('div', { class: 'rc-field-body' }, h('small', {}, f.rotulo), value),
      f.copiar ? h('button', { type: 'button', class: 'rc-copy', 'aria-label': `Copiar ${f.rotulo.toLowerCase()}`, title: 'Copiar', onClick: (e) => { copy(f.copiar === true ? f.valor : f.copiar, `${f.rotulo} copiado`); e.currentTarget.classList.add('is-done'); } }, icon('copy', { size: 14 })) : null);
  };
  const fields = (r.campos || []).map(field).filter(Boolean);
  const details = (r.detalhes || []).filter((d) => d?.conteudo);
  return h('article', { class: `rc rc-${tom}${r.compacto ? ' rc-compact' : ''}`, 'aria-live': 'polite' },
    // A. Resultado
    h('header', { class: 'rc-head' },
      h('span', { class: 'rc-ic' }, icon(r.icone || 'check', { size: r.compacto ? 20 : 26 })),
      h('div', {},
        r.selo ? h('p', { class: 'rc-badge' }, icon(tom === 'ok' ? 'check' : tom === 'warn' ? 'alert' : 'help', { size: 12 }), r.selo) : null,
        h('h2', { class: 'rc-title' }, r.titulo),
        r.subtitulo ? h('p', { class: 'rc-sub' }, r.subtitulo) : null)),
    // B. Informação essencial
    r.destaque ? h('div', { class: 'rc-hero' },
      h('span', { class: 'rc-hero-ic' }, icon(r.destaque.icone || 'pin', { size: 20 })),
      h('div', {}, h('strong', {}, r.destaque.nome), r.destaque.sub ? h('p', {}, r.destaque.sub, r.destaque.acao ? [' ', action(r.destaque.acao, 'rc-inline')] : null) : null)) : null,
    fields.length ? h('div', { class: 'rc-fields' }, fields) : null,
    r.aviso ? h('p', { class: 'rc-note' }, icon('alert', { size: 14 }), h('span', {}, r.aviso)) : null,
    // C. Próxima ação
    r.acaoPrincipal || r.acoes?.length ? h('div', { class: 'rc-actions' },
      action(r.acaoPrincipal, 'rc-primary'),
      // D. Ajuda opcional
      r.acoes?.length ? h('div', { class: 'rc-secondary' }, r.acoes.map((a) => action(a, 'rc-link'))) : null) : null,
    details.length ? h('div', { class: 'rc-more' }, details.map((d) => h('details', {}, h('summary', {}, d.titulo), h('div', { class: 'rc-more-body' }, d.conteudo)))) : null,
    r.fonte ? SourceLine(r.fonte) : null);
}

export function SourceLine(f) {
  return h('footer', { class: 'rc-source' }, icon('shield', { size: 12 }),
    h('span', {}, 'Fonte oficial: ', f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.titulo ? `${f.orgao} - ${f.titulo}` : f.orgao) : f.orgao,
      f.verificadoEm ? ` · conferido em ${fmtDate(f.verificadoEm)}` : ''));
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Consulado (dados de consulateResult no servidor).
 * opts: { acaoPrincipal, onAjuda, onEstado, compacto }
 */
export function ConsulateResult(d, opts = {}) {
  const help = opts.onAjuda ? { rotulo: 'Preciso de ajuda', icone: 'help', onClick: opts.onAjuda } : null;
  if (d.status === 'encontrado') {
    const c = d.consulado;
    return ResultCard({
      tom: 'ok', icone: 'passport', selo: 'Consulado identificado', titulo: 'Encontramos seu consulado!', compacto: opts.compacto,
      destaque: { nome: c.nome, sub: `Atende quem mora ${d.estado.em || `em ${d.estado.nome}`}.`, icone: 'pin', acao: opts.onEstado ? { rotulo: 'Não mora mais lá?', onClick: opts.onEstado } : null },
      campos: [
        { rotulo: c.emailRotulo, valor: c.email, icone: 'mail', copiar: true },
        { rotulo: 'Cidade', valor: `${c.cidade} (${c.uf})`, icone: 'map' },
      ],
      acaoPrincipal: opts.acaoPrincipal || { rotulo: 'Ver documentos do meu visto', icone: 'file', href: '#/documentos', onClick: opts.onNavegar },
      acoes: [
        { rotulo: 'Copiar e-mail', copiar: c.email, feedback: 'E-mail copiado' },
        { rotulo: 'Página oficial do visto', href: c.vistoEstudosUrl, externo: true },
        help,
      ].filter(Boolean),
      detalhes: [
        c.endereco || c.telefone ? { titulo: 'Endereço e telefone', conteudo: h('div', { class: 'rc-kv' }, c.endereco ? h('p', {}, c.endereco) : null, c.telefone ? h('p', {}, c.telefone) : null, c.contatoUrl ? h('a', { href: c.contatoUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Horário de atendimento (site oficial)') : null) } : null,
        c.emailEspecificoVistos ? null : { titulo: 'Sobre este e-mail', conteudo: h('p', {}, 'O consulado não publica um e-mail exclusivo de vistos: este é o e-mail que aparece na página oficial de contato. Na página do visto de estudos estão a lista de documentos e o agendamento.') },
      ].filter(Boolean),
      fonte: d.fonte,
    });
  }
  if (d.status === 'sem-estado') return null; // a tela pergunta o estado antes
  // Sem dado confirmado: diz isso com clareza e entrega o procedimento oficial, sem inventar.
  return ResultCard({
    tom: 'warn', icone: 'passport', selo: 'Ainda não confirmado', compacto: opts.compacto,
    titulo: d.status === 'fora-do-brasil' ? `Ainda não temos os consulados para quem mora em ${d.pais}` : `Ainda não temos confirmado o consulado de ${d.estado?.nome || 'seu estado'}`,
    subtitulo: 'Preferimos não adivinhar. A página oficial abaixo mostra qual repartição atende cada região.',
    acaoPrincipal: { rotulo: d.procedimento.rotulo, href: d.procedimento.url, externo: true, icone: 'search' },
    acoes: [opts.onConfirmar ? { rotulo: 'Já sei qual é o meu', icone: 'check', onClick: opts.onConfirmar } : null, help, opts.onEstado ? { rotulo: 'Mudar meu estado', icone: 'edit', onClick: opts.onEstado } : null].filter(Boolean),
    fonte: { orgao: d.procedimento.orgao, url: d.procedimento.url },
  });
}

/**
 * Checklist (documentos, pendências).
 * { tipo:'checklist', titulo, itens:[{ nome, situacao, pronto, acao? }], acaoPrincipal?, fonte? }
 */
export function ChecklistResult(d, opts = {}) {
  ensureStyles();
  const done = d.itens.filter((i) => i.pronto).length;
  const total = d.itens.length;
  const bar = h('span', { class: 'rc-bar-fill' });
  bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  const next = d.itens.find((i) => !i.pronto);
  return ResultCard({
    tom: done === total ? 'ok' : 'info', icone: 'file', compacto: opts.compacto,
    selo: done === total ? 'Tudo pronto' : `${done} de ${total} prontos`,
    titulo: d.titulo || (done === total ? 'Seus documentos estão prontos' : `Falta${total - done > 1 ? 'm' : ''} ${total - done} documento${total - done > 1 ? 's' : ''}`),
    subtitulo: next ? `Próximo: ${next.nome}` : null,
    campos: [],
    acaoPrincipal: d.acaoPrincipal || next?.acao || null,
    acoes: opts.acoes,
    detalhes: [{
      titulo: `Ver lista (${total})`,
      conteudo: h('div', {}, h('div', { class: 'rc-bar' }, bar), h('ul', { class: 'rc-checklist' }, d.itens.map((i) => h('li', { class: i.pronto ? 'is-done' : '' }, icon(i.pronto ? 'check' : 'minus', { size: 13 }), h('span', {}, i.nome), i.situacao ? h('small', {}, i.situacao) : null)))),
    }],
    fonte: d.fonte,
  });
}

/**
 * Oportunidade (bolsa, programa, edital).
 * { tipo:'oportunidade', titulo, instituicao, estado:{ rotulo, tom }, prazo, cobertura, compatibilidade, requisitos[], link, acaoPrincipal?, fonte? }
 */
export function OpportunityResult(d, opts = {}) {
  const dias = d.prazo ? Math.ceil((new Date(`${d.prazo}T23:59:59`) - new Date()) / 86400000) : null;
  return ResultCard({
    tom: d.estado?.tom || 'info', icone: opts.icone || 'trophy', selo: d.estado?.rotulo, titulo: d.titulo, subtitulo: d.instituicao, compacto: opts.compacto,
    campos: [
      d.prazo ? { rotulo: 'Prazo', valor: `${fmtDate(d.prazo)}${dias !== null && dias >= 0 ? ` · faltam ${dias} dia(s)` : dias !== null ? ' · encerrado' : ''}`, icone: 'calendar' } : null,
      d.cobertura ? { rotulo: 'Cobertura', valor: d.cobertura, icone: 'euro' } : null,
      d.compatibilidade ? { rotulo: 'Para você', valor: d.compatibilidade, icone: 'target' } : null,
    ].filter(Boolean),
    acaoPrincipal: d.acaoPrincipal || (d.link ? { rotulo: 'Abrir edital oficial', href: d.link, externo: true, icone: 'file' } : null),
    acoes: opts.acoes,
    detalhes: d.requisitos?.length ? [{ titulo: `Requisitos (${d.requisitos.length})`, conteudo: h('ul', { class: 'rc-checklist' }, d.requisitos.map((x) => h('li', {}, icon('check', { size: 13 }), h('span', {}, x)))) }] : [],
    fonte: d.fonte,
  });
}

/** Próxima ação: { tipo:'acao', titulo, motivo, acaoPrincipal, tempo? } */
export function ActionResult(d, opts = {}) {
  return ResultCard({
    tom: 'info', icone: d.icone || 'target', selo: d.tempo ? `Leva ${d.tempo}` : 'Próximo passo', titulo: d.titulo, subtitulo: d.motivo, compacto: opts.compacto,
    acaoPrincipal: d.acaoPrincipal, acoes: opts.acoes,
  });
}

/**
 * Documento da carteira (get_document_guide): o que é, situação e como conseguir.
 * { tipo:'documento', id, nome, descricao, icone, status, statusLabel, motivo, alerta, comoObter[], acao, rota, fonte, consulado? }
 */
export function DocumentGuideResult(d, opts = {}) {
  const pronto = ['pronto', 'enviado'].includes(d.status);
  const na = d.status === 'nao-se-aplica';
  const steps = (d.comoObter || []).length ? h('ol', { class: 'rc-steps' }, d.comoObter.map((s) => h('li', {}, s))) : null;
  return ResultCard({
    tom: d.alerta ? 'warn' : pronto || na ? 'ok' : 'info', icone: d.icone || 'file', compacto: opts.compacto,
    selo: d.statusLabel, titulo: d.nome, subtitulo: na ? d.motivo : d.descricao,
    aviso: d.alerta || null,
    campos: [],
    acaoPrincipal: { rotulo: pronto || na ? 'Abrir documento' : d.aguardando ? 'Acompanhar documento' : d.acao || 'Preparar documento', icone: 'file', href: `#${d.rota}`, onClick: opts.onNavegar },
    detalhes: [
      !na && steps ? { titulo: 'Como conseguir', conteudo: steps } : null,
      d.consulado ? { titulo: 'Lista do seu consulado', conteudo: h('p', {}, 'Para o visto, vale a lista do ', h('strong', {}, d.consulado.nome), '. ', h('a', { href: d.consulado.vistoEstudosUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Página oficial do visto')) } : null,
    ].filter(Boolean),
    fonte: d.fonte ? { orgao: d.fonte.orgao, titulo: d.fonte.titulo, url: d.fonte.url, verificadoEm: d.fonte.revisadoEm } : null,
  });
}

const REGISTRY = new Map([
  ['consulado', ConsulateResult],
  ['documento', DocumentGuideResult],
  ['checklist', ChecklistResult],
  ['oportunidade', OpportunityResult],
  ['acao', ActionResult],
]);

export const registerResult = (tipo, fn) => REGISTRY.set(tipo, fn);
export const hasResult = (tipo) => REGISTRY.has(tipo);

/** Renderiza qualquer resultado estruturado pelo tipo. Tipo desconhecido → null (quem chama decide o fallback). */
export function renderResult(d, opts) {
  const fn = d && REGISTRY.get(d.tipo);
  return fn ? fn(d, opts) : null;
}
