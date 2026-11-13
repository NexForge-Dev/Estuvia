// "Processo deste mestrado": o procedimento oficial de candidatura resolvido para o mestrado da jornada
// (server/application-process.js). Cada item diz de onde vem: regra oficial (fonte + artigo), ficha do DUA
// (data da coleta), dedução a partir de um critério da ficha, ou "não confirmado". Nada aqui conclui missões.
import { h } from '../ui.js';
import { icon } from '../icons.js';

const fmt = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);
const ORIGEM = {
  oficial: ['Regra oficial', 'ok'],
  ficha: ['Ficha do DUA', 'ok'],
  derivado: ['Deduzido da ficha: confira o formato', 'pending'],
  'nao-confirmado': ['Não confirmado', 'warn'],
};
const chip = (origem) => { const [l, t] = ORIGEM[origem] || ORIGEM['nao-confirmado']; return h('span', { class: `chip-status t-${t}` }, l); };
const ref = (x) => (x?.fonte ? h('small', { class: 'muted' }, ` (${x.fonte}${x.artigo ? `, ${x.artigo}` : ''})`) : null);
const OFERTA = { 'nao-dua': ['Fora do DUA', 'muted'], geral: ['Fase ordinária', 'ok'], 'se-sobrar': ['Só vagas que sobrarem', 'muted'], 'nao-confirmado': ['Vagas nesta fase não confirmadas', 'pending'], 'canal-nao-confirmado': ['Canal não confirmado', 'warn'], demo: ['Demonstrativo', 'muted'] };
const PERFIL = { sim: null, nao: ['Não se aplica ao seu perfil', 'danger'], verificar: ['Complete o perfil', 'pending'] };

function section(titulo, ...body) {
  return h('section', { class: 'ap-section' }, h('h3', { class: 'small-title' }, titulo), ...body);
}

export function ApplicationProcess(p) {
  if (!p) return h('p', { class: 'notice' }, 'Defina o mestrado desta jornada para ver o processo de candidatura dele.');
  const canalTone = { confirmado: 'ok', 'nao-confirmado': 'warn', demo: 'muted', 'nao-dua': 'pending', 'nao-dua-sem-canal': 'warn' }[p.canal.status];
  const canalLabel = { confirmado: 'Distrito Único Andaluz', 'nao-confirmado': 'Canal não confirmado', demo: 'Demonstrativo', 'nao-dua': 'Fora do DUA: procedimento próprio', 'nao-dua-sem-canal': 'Fora do DUA: canal não publicado' }[p.canal.status];
  const verif = { confirmado: ['Processo confirmado em fontes oficiais', 'ok'], parcial: ['Processo parcialmente confirmado', 'pending'], demo: ['Programa demonstrativo', 'muted'] }[p.verificacao];

  return h('div', { class: 'stack ap' },
    h('div', { class: 'ap-head' },
      h('span', { class: `chip-status t-${verif[1]}` }, verif[0]),
      h('p', { class: 'small muted' }, `${p.procedimento.titulo} · curso ${p.procedimento.ciclo}. Regras conferidas em ${fmt(p.procedimento.revisadoEm)}${p.programa.fichaVerificadaEm ? `; ficha do mestrado coletada em ${fmt(p.programa.fichaVerificadaEm)}` : ''}.`)),

    section('Onde a candidatura é feita',
      h('p', {}, h('span', { class: `chip-status t-${canalTone}` }, canalLabel), ' ', p.canal.texto),
      p.canal.url ? h('a', { href: p.canal.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir o canal oficial ', icon('external', { size: 12 })) : null,
      p.canal.variantes ? h('details', {}, h('summary', {}, `Ver os ${p.canal.variantes.length} códigos no DUA`), h('ul', { class: 'mc-list' }, p.canal.variantes.map((v) => h('li', {}, `${v.codigo}: ${v.nome}`)))) : null,
      p.canal.evidencia ? h('p', { class: 'small muted' }, `Conferido em ${fmt(p.canal.evidencia.consultadoEm)}: ${p.canal.evidencia.fonte}.`) : null,
      h('p', { class: 'small' }, p.maxPedidos.texto, ref(p.maxPedidos)),
      h('p', { class: 'small muted' }, p.taxaSolicitacao.texto, ref(p.taxaSolicitacao))),

    section('Fases do DUA para este mestrado',
      h('ul', { class: 'ap-fases' }, p.fases.map((f) => {
        const [ol, ot] = OFERTA[f.oferta];
        const perfil = PERFIL[f.perfil.status];
        return h('li', { class: `ap-fase${f.declarada ? ' is-mine' : ''}` },
          h('div', { class: 'ap-fase-head' }, h('strong', {}, `Fase ${f.fase}`), f.declarada ? h('span', { class: 'chip-status t-ok' }, 'Minha fase') : null, h('span', { class: `chip-status t-${ot}` }, ol), perfil ? h('span', { class: `chip-status t-${perfil[1]}` }, perfil[0]) : null),
          h('p', { class: 'small' }, f.quem.texto, ref(f.quem)),
          h('p', { class: 'small muted' }, f.ofertaTexto),
          f.perfil.status !== 'sim' ? h('p', { class: 'small' }, icon('alert', { size: 12 }), ' ', f.perfil.texto) : null,
          f.janela ? h('p', { class: 'small' }, icon('calendar', { size: 12 }), ` Solicitação: ${f.janela.texto}`) : h('p', { class: 'small muted' }, 'Datas desta fase ainda não confirmadas no calendário oficial do ciclo.'),
          h('p', { class: 'small' }, icon('cap', { size: 12 }), ' ', f.titulo.texto, f.dataLimiteTitulo ? ` Data-limite oficial: ${fmt(f.dataLimiteTitulo.data)}.` : '', ref(f.titulo)),
          h('p', { class: 'small' }, icon('euro', { size: 12 }), ' ', f.pagamento.texto, ref(f.pagamento)),
          f.listaEsperaSeguinte ? h('p', { class: 'small' }, f.listaEsperaSeguinte.texto, ref(f.listaEsperaSeguinte)) : null);
      }))),

    section('Documentos da solicitação (título estrangeiro não homologado)',
      h('ul', { class: 'mc-list' }, p.documentos.map((d) => h('li', {}, chip(d.origem), ' ', d.texto, d.obrigatorio === false ? h('em', { class: 'small muted' }, ` Não anexar: ${d.consequencia || 'há consequência na avaliação.'}`) : null, ref(d)))),
      h('p', { class: 'small muted' }, p.idiomaDocumentos.texto, ref(p.idiomaDocumentos))),

    section('Requisitos deste mestrado (ficha do DUA)',
      p.requisitosEspecificos.length
        ? h('ul', { class: 'mc-list' }, p.requisitosEspecificos.map((r) => h('li', {}, h('span', { class: `chip-status t-${r.obrigatorio ? 'danger' : 'muted'}` }, r.obrigatorio ? 'Obrigatório' : 'Informativo'), ` ${r.codigo}: “${r.texto}”`)))
        : h('p', { class: 'small muted' }, p.flags.fichaColetada ? 'A ficha do DUA não lista requisitos adicionais para este mestrado.' : 'Ficha do DUA ainda não coletada: leia a ficha oficial.'),
      p.programa.fichaUrl ? h('a', { href: p.programa.fichaUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir a ficha oficial no DUA ', icon('external', { size: 12 })) : null),

    p.documentosDerivados.length ? section('O que os critérios de seleção costumam pedir',
      h('p', { class: 'small muted' }, 'Deduzido do texto oficial de cada critério. O formato exato (modelo, páginas, idioma) é o publicado no portal do DUA para o seu mestrado.'),
      h('ul', { class: 'mc-list' }, p.documentosDerivados.map((d) => h('li', {}, chip('derivado'), ` ${d.texto}`, h('small', { class: 'muted' }, ` · critério: “${d.criterio}”${d.peso != null ? ` (${d.peso}%)` : ''}`))))) : null,

    p.regrasEspecificas.length ? section('Regras oficiais só deste mestrado',
      h('ul', { class: 'mc-list' }, p.regrasEspecificas.map((r) => h('li', {}, chip('oficial'), ' ', r.texto, ref(r), r.aviso ? h('p', { class: 'small muted' }, r.aviso) : null)))) : null,

    section('Regras que valem depois do envio',
      h('ul', { class: 'mc-list' }, p.regras.map((r) => h('li', {}, r.texto, ref(r))))),

    p.pendencias.length ? section('Ainda não confirmado (confira antes de agir)',
      h('ul', { class: 'mc-list' }, p.pendencias.map((x) => h('li', {}, chip('nao-confirmado'), ' ', x.texto)))) : null,

    h('div', { class: 'ap-fontes small muted' }, 'Fontes: ', p.procedimento.fontes.map((s, i) => [i ? ' · ' : '', s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.titulo) : s.titulo])));
}
