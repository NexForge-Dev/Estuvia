// Ferramentas acopladas às missões (campo "ferramenta" no conteúdo).
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state } from '../app.js';
import { ConsulateResult } from './ResultCard.js';
import { locale } from '../i18n.js';
import { GradeCalculator } from './GradeCalculator.js';

const eur = (v) => `€ ${Math.round(v || 0).toLocaleString(locale())}`;
const EL_STATUS = {
  declarado: ['Atende (declarado por você)', 'ok'],
  'falta-comprovar': ['Falta comprovar', 'warn'],
  'falta-informar': ['Falta informar', 'warn'],
  'nao-confirmado': ['Não confirmado', 'pending'],
  'nao-exigido': ['Não exigido (pela regra cadastrada)', 'muted'],
  informativo: ['Regra oficial', 'muted'],
};

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado para a área de transferência.', 'ok'); } catch { toast('Não foi possível copiar automaticamente: selecione o texto e copie.', 'err'); }
}

function draftBox(subject, body, to) {
  const ta = h('textarea', { class: 'draft', rows: 12, 'aria-label': 'Rascunho do e-mail' }, `Asunto: ${subject}\n\n${body}`);
  const mailto = to ? `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
  return h('div', { class: 'stack' },
    ta,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => copy(ta.value) }, icon('copy', { size: 14 }), 'Copiar rascunho'),
      mailto ? h('a', { class: 'btn btn-ghost btn-sm', href: mailto }, icon('mail', { size: 14 }), 'Abrir no meu e-mail') : null),
    h('p', { class: 'hint' }, 'O envio é feito por você, no seu e-mail. A Estuvia não envia mensagens em seu nome.'),
  );
}

export function MissionTool(m, { journey, onChange }) {
  const t = m.definicao.ferramenta;
  if (!t) return null;
  const p = state.me.user.profile;
  const wrap = (title, ic, ...body) => h('section', { class: 'md-section md-tool' }, h('h2', {}, icon(ic, { size: 18 }), title), ...body);

  if (t === 'elegibilidade') {
    if (!m.elegibilidade?.length) return wrap('Elegibilidade preliminar', 'scale', h('p', { class: 'muted' }, 'Defina o mestrado desta jornada para comparar requisitos.'));
    return wrap('Elegibilidade preliminar', 'scale',
      h('ul', { class: 'elig' }, m.elegibilidade.map((e) => {
        const [label, tone] = EL_STATUS[e.status] || EL_STATUS['nao-confirmado'];
        return h('li', { class: `elig-${tone}` }, h('div', {}, h('strong', {}, e.requisito), h('p', { class: 'small' }, e.texto)), h('span', { class: `chip-status t-${tone}` }, label));
      })),
      h('p', { class: 'hint' }, 'Nenhum destes estados significa que você é elegível ou será admitido: a decisão é da universidade.'));
  }

  if (t === 'nota-dua') {
    return wrap('Minha nota média no DUA', 'scale',
      h('p', {}, 'Converta a média do seu histórico para a escala espanhola (5 a 10), com a fórmula oficial do Distrito Único Andaluz.'),
      GradeCalculator({ onSaved: onChange }));
  }

  if (t === 'consulado' || t === 'email-consulado') {
    const c = m.consulado;
    const sug = c?.sugerido;
    // Resultado estruturado do servidor (base consular verificada): consulado, contatos, fonte e ação principal.
    const info = c?.resultado ? ConsulateResult(c.resultado, { compacto: true }) : h('p', { class: 'muted small' }, 'Informe seu estado no perfil para encontrarmos o consulado.');
    if (t === 'consulado') return wrap('Consulado responsável', 'passport', info);
    const prog = journey.destino.programa?.nome || '[máster]';
    const body = `Estimados señores:\n\nMe llamo ${p.nome || '[nombre]'}, de nacionalidad ${p.nacionalidade || 'brasileña'}, residente en ${p.estado || '[estado]'}, Brasil. He sido admitido/a (o estoy en proceso de admisión) en el ${prog} de la ${journey.destino.universidade?.nome || '[universidad]'}, con una duración prevista de ${journey.destino.duracaoMeses || '[n]'} meses.\n\nQuisiera confirmar, para solicitar el visado de estudios:\n1. La lista de documentos necesarios para mi caso.\n2. Cómo solicitar el visado y si es necesario pedir cita previa.\n3. Las tasas aplicables.\n4. Qué documentos financieros se aceptan (incluido el apoyo económico de un familiar, si procede).\n5. Qué documentos requieren traducción o apostilla.\n\nMuchas gracias por su atención.\n\nAtentamente,\n${p.nome || '[nombre]'}`;
    return wrap('E-mail ao consulado', 'mail', info,
      sug?.emailVistos ? h('p', { class: 'small' }, 'Contato do setor de vistos: ', h('strong', {}, sug.emailVistos), h('span', { class: 'tag tag-pending' }, 'Confirme no site oficial'), h('br'), h('span', { class: 'muted small' }, sug.emailFonte)) : null,
      draftBox(`Consulta visado de estudios: ${p.nome || ''}`.trim(), body, sug?.emailVistos));
  }

  if (t === 'contato-academico') {
    const list = h('ul', { class: 'contacts' });
    const draw = (contatos) => mount(list, ...(contatos.length ? contatos.map((c) => {
      const sent = h('input', { type: 'date', value: c.enviadoEm || '', 'aria-label': 'Data de envio' });
      sent.addEventListener('change', async () => { try { await api.put(`/journeys/${journey.id}/contacts/${c.id}`, { enviadoEm: sent.value }); onChange(); } catch (e) { toast(e.message, 'err'); } });
      return h('li', { class: 'contact' },
        h('div', {}, h('strong', {}, c.nome), c.cargo ? h('span', { class: 'muted small' }, ` · ${c.cargo}`) : null,
          c.email ? h('p', { class: 'small' }, icon('mail', { size: 12 }), ' ', c.email) : null,
          h('a', { class: 'small', href: c.fonteUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Fonte oficial', icon('external', { size: 11 }))),
        h('label', { class: 'field sm' }, h('span', { class: 'field-label' }, 'Enviei em'), sent),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remover contato', onClick: async () => { await api.del(`/journeys/${journey.id}/contacts/${c.id}`); onChange(); } }, icon('trash', { size: 14 })));
    }) : [h('li', { class: 'muted small' }, 'Nenhum contato registrado ainda.')]));
    draw(m.contatos || []);
    const f = h('form', { class: 'stack' },
      h('div', { class: 'grid-2 tight' },
        h('input', { name: 'nome', placeholder: 'Nome (ex.: coordenação do máster)', required: true, maxlength: 100 }),
        h('input', { name: 'cargo', placeholder: 'Cargo (coordenador, professor…)', maxlength: 100 }),
        h('input', { name: 'email', type: 'email', placeholder: 'E-mail institucional (do diretório oficial)', maxlength: 120 }),
        h('input', { name: 'fonteUrl', type: 'url', placeholder: 'Link da página oficial onde encontrou', required: true, maxlength: 300 })),
      h('input', { name: 'duvida', placeholder: 'Sua dúvida específica (vai para o rascunho)', maxlength: 500 }),
      h('button', { class: 'btn btn-ghost', type: 'submit' }, icon('users', { size: 16 }), 'Registrar contato'));
    const draftHost = h('div');
    const renderDraft = (duvida) => {
      const prog = journey.destino.programa?.nome || '[nombre del máster]';
      mount(draftHost, draftBox(`Consulta sobre el ${prog}`, `Estimado/a profesor/a:\n\nMe llamo ${p.nome || '[nombre]'} y soy ${p.formacao ? `graduado/a en ${p.formacao}` : '[formación]'}${p.instituicao ? ` por la ${p.instituicao}` : ''} (Brasil). He presentado mi solicitud al ${prog} a través del Distrito Único Andaluz.\n\nQuisiera consultarle lo siguiente: ${duvida || '[su duda concreta]'}.\n\nMuchas gracias por su atención.\n\nAtentamente,\n${p.nome || '[nombre]'}`, null));
    };
    renderDraft('');
    f.duvida.addEventListener('input', () => renderDraft(f.duvida.value.trim()));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(f)].filter(([, v]) => String(v).trim()));
      try { await api.post(`/journeys/${journey.id}/contacts`, body); f.reset(); toast('Contato registrado.', 'ok'); onChange(); } catch (err) { toast(err.message, 'err'); }
    });
    const isUgr = journey.destino.universidade?.id === 'ugr';
    return wrap('Encontrar contato acadêmico', 'users',
      h('ol', { class: 'steps' },
        h('li', {}, 'Abra a página oficial do mestrado', journey.destino.programa?.url ? [' (', h('a', { href: journey.destino.programa.url, target: '_blank', rel: 'noopener noreferrer' }, 'abrir'), ')'] : null, '.'),
        h('li', {}, 'Procure "Profesorado", "Coordinación", "Organización" ou "Contacto".'),
        h('li', {}, 'Identifique o coordenador ou o professor relacionado à sua dúvida.'),
        h('li', {}, isUgr ? ['Confirme o e-mail institucional no ', h('a', { href: 'https://directorio.ugr.es/', target: '_blank', rel: 'noopener noreferrer' }, 'diretório oficial da UGR'), ' (portal de másteres: ', h('a', { href: 'https://masteres.ugr.es/', target: '_blank', rel: 'noopener noreferrer' }, 'masteres.ugr.es'), ').'] : 'Confirme o e-mail institucional no diretório oficial da universidade.'),
        h('li', {}, 'Registre o contato abaixo com o link da fonte, revise o rascunho e envie pelo seu e-mail.')),
      h('p', { class: 'notice' }, 'Recomendação do idealizador, não exigência de admissão. Escrever não aumenta, por si, suas chances, e mensagens genéricas em massa não ajudam.'),
      list, f, h('h3', { class: 'small-title' }, 'Rascunho em espanhol'), draftHost);
  }

  if (t === 'financeiro' && m.financeiro) {
    const f = m.financeiro;
    return wrap('Resumo financeiro', 'euro',
      h('dl', { class: 'fin fin-3' },
        h('div', {}, h('dt', {}, 'Exigência do visto (A)'), h('dd', {}, eur(f.exigenciaVisto))),
        h('div', {}, h('dt', {}, 'Orçamento real (B)'), h('dd', {}, eur(f.orcamento))),
        h('div', { class: f.deficit > 0 ? 'neg' : 'pos' }, h('dt', {}, f.deficit > 0 ? 'Falta' : 'Recursos confirmados'), h('dd', {}, eur(f.deficit > 0 ? f.deficit : f.confirmados)))),
      h('p', { class: 'hint' }, `A = ${Math.round(f.iprem.percentual * 100)}% do IPREM mensal (€${f.iprem.mensal}, ${f.iprem.ano}${f.iprem.aproximado ? ', ano mais recente cadastrado' : ''}; ${f.iprem.status === 'pendente' ? 'valor pendente de confirmação' : 'verificado'}) × ${f.meses} meses. Confirme deduções e documentos com o consulado.`),
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/financiamento' }, 'Abrir "Como vou financiar meus estudos?"', icon('arrow', { size: 14 })));
  }

  const links = {
    'novo-lar': ['Meu novo lar', 'home2', '/novo-lar', 'Cadastre e compare moradias, com verificação antifraude. A escolhida entra no seu orçamento.'],
    viagem: ['Planejamento de viagem', 'plane', '/viagem', 'Compare rotas pelo custo total (voo + bagagem + trecho terrestre) e registre sua chegada.'],
    bolsas: ['Buscador de bolsas', 'trophy', '/financiamento#bolsas', 'Salve oportunidades, acompanhe prazos e o resultado, a Agenda cria as tarefas.'],
    documentos: ['Área de documentos', 'file', '/documentos', 'Organize cada documento: pendente, em preparação, pronto para envio, enviado ou necessita correção.'],
    catalogo: ['Catálogo de mestrados', 'cap', '/mestrados', 'Filtre por universidade, cidade, área, modalidade e duração.'],
  };
  if (links[t]) {
    const [title, ic, href, text] = links[t];
    return wrap(title, ic, h('p', {}, text), h('a', { class: 'btn btn-ghost', href: `#${href}` }, `Abrir ${title}`, icon('arrow', { size: 14 })));
  }

  if (t === 'guia-cidade') {
    const g = state.content.cityGuides?.[journey.destino.cidade];
    if (!g) return wrap('Guia da cidade', 'pin', h('p', { class: 'muted' }, `O guia de ${journey.destino.cidade || 'sua cidade'} ainda não está disponível, começamos por Granada.`));
    return wrap(`Guia de ${g.cidade}`, 'pin', h('p', {}, g.intro), ...g.secoes.map((s) => h('details', { class: 'md-expand' }, h('summary', {}, h('span', {}, s.titulo), icon('chevron', { size: 16, cls: 'chev' })), h('ul', { class: 'md-expand-body' }, s.itens.map((i) => h('li', {}, i))))), h('span', { class: 'tag tag-info' }, 'Orientação prática'));
  }
  return null;
}
