// Comparação lado a lado das opções salvas (Missão 3.4). Os dados vêm de GET /me/choices/compare,
// que reaproveita a elegibilidade da Missão 1.4 para cada opção. A comparação não ordena: a ordem é do estudante.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const TONE = {
  declarado: ['Atende (declarado)', 'ok'], 'pref-alta': ['Preferência alta', 'ok'], 'pref-media': ['Preferência média', 'ok'],
  'pref-baixa': ['Preferência baixa', 'warn'], 'fora-da-lista': ['Fora da lista', 'warn'], 'falta-comprovar': ['Falta comprovar', 'warn'],
  'falta-informar': ['Falta informar', 'warn'], 'nao-confirmado': ['Não confirmado', 'pending'], 'nao-exigido': ['Não exigido', 'muted'],
};
const fmtData = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
const nd = (txt = 'Sem dado da ficha do DUA') => h('span', { class: 'muted small' }, txt);

function status(item, vazio) {
  if (!item) return nd(vazio);
  const [label, tone] = TONE[item.status] || TONE['nao-confirmado'];
  return h('div', { class: 'cmp-cell' }, h('span', { class: `chip-status t-${tone}` }, label), h('p', { class: 'small muted' }, item.texto));
}

function selecao(o) {
  if (!o.criterios) return nd();
  if (o.somenteNotaExpediente) return h('span', {}, 'Só pela nota média do histórico');
  return h('ul', { class: 'cmp-list' }, o.criterios.map((c) => h('li', {}, `${c.descricao}: ${c.peso ?? '?'}%`)));
}

const ROWS = [
  ['Universidade', (o) => (o.universidade ? h('span', {}, `${o.universidade.sigla} · ${o.universidade.cidade}`) : nd('Não informada'))],
  ['Início das aulas', (o) => (fmtData(o.inicioCurso) ? h('span', {}, fmtData(o.inicioCurso)) : nd())],
  ['Duração', (o) => (o.duracaoMeses ? h('span', {}, `${o.duracaoMeses} meses`) : nd('Não informada'))],
  ['Graduação aceita', (o) => status(o.graduacao, 'Sem a lista de graduações da ficha')],
  ['Idioma (espanhol)', (o) => status(o.idioma, 'Não informado')],
  ['Outros idiomas', (o) => (o.outrosIdiomas.length ? h('div', { class: 'stack-sm' }, o.outrosIdiomas.map((x) => status(x))) : h('span', { class: 'muted small' }, o.temFichaDua ? 'Nenhum exigido pela ficha' : 'Sem dado da ficha do DUA'))],
  ['Como é a seleção', selecao],
  ['Peso da nota média', (o) => (o.pesoNota == null ? nd() : o.pesoNota === 0 ? h('span', {}, 'A nota não entra nos critérios') : h('strong', {}, `${o.pesoNota}%`))],
  ['Sua nota na escala espanhola', (o) => (o.pesoNota ? status(o.nota) : h('span', { class: 'muted small' }, '—'))],
  ['Pontos de atenção', (o) => h('span', { class: `chip-status t-${o.pontosDeAtencao ? 'warn' : 'ok'}` }, o.pontosDeAtencao ? `${o.pontosDeAtencao} ponto(s)` : 'Nenhum')],
  ['Fontes', (o) => h('div', { class: 'stack-sm' },
    o.fichaDuaUrl ? h('a', { href: o.fichaDuaUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Ficha no DUA ', icon('external', { size: 12 })) : null,
    o.url ? h('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer' }, 'Página do máster ', icon('external', { size: 12 })) : null)],
];

/** Tabela com uma coluna por opção salva. Carrega os dados sozinha. */
export function ChoicesCompare() {
  const box = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Carregando a comparação…'));
  api.get('/me/choices/compare').then(({ opcoes }) => {
    box.replaceChildren();
    const validas = opcoes.filter((o) => !o.indisponivel);
    if (validas.length < 2) {
      box.append(h('p', { class: 'muted' }, validas.length ? 'Adicione mais uma opção em "Minhas opções" para comparar lado a lado.' : 'Adicione opções em "Minhas opções" para comparar lado a lado.'),
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/oportunidades' }, 'Explorar mestrados no Radar', icon('arrow', { size: 12 })));
      return;
    }
    const sem = opcoes.filter((o) => o.indisponivel).length;
    box.append(...[
      h('div', { class: 'table-wrap' }, h('table', { class: 'cmp cmp-choices' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Opção'), validas.map((o) => h('th', { scope: 'col' }, h('span', { class: 'cmp-pos' }, String(o.posicao)), ' ', o.nome, o.demo ? h('span', { class: 'tag tag-pending' }, 'demonstração') : null)))),
        h('tbody', {}, ROWS.map(([label, cell]) => h('tr', {}, h('th', { scope: 'row' }, label), validas.map((o) => h('td', {}, cell(o)))))))),
      sem ? h('p', { class: 'muted small' }, `${sem} opção(ões) não estão mais no catálogo e ficaram de fora.`) : null,
      h('p', { class: 'hint' }, 'A comparação usa a ficha de cada máster no DUA e o que você declarou no perfil. Ela não ordena por você e não garante admissão: a ordem de preferência é sua e a decisão é da universidade.'),
    ].filter(Boolean)); // Element.append escreveria "null" como texto
  }).catch((e) => box.replaceChildren(h('p', { class: 'muted' }, `Não foi possível carregar a comparação: ${e.message}`)));
  return box;
}
