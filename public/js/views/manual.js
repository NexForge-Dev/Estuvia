// Manual (só sem conta): explica a plataforma e o mapa do processo, em linguagem simples.
// Mostra rodadas e nomes das missões — a execução passo a passo fica em "Minha Jornada",
// liberada depois do cadastro, conforme o estudante avança.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { GLOSSARY } from '../glossary.js';

export async function manualView() {
  const { rounds } = await api.get('/content/manual');
  const main = rounds.filter((r) => !r.transversal);
  const fin = rounds.find((r) => r.transversal);

  const roundBlock = (r) => h('details', { class: 'panel manual-round', id: `r-${r.numero}` },
    h('summary', {},
      h('img', { src: r.banner, alt: '' }),
      h('span', {}, h('small', {}, r.sigla ? 'Trilha paralela' : `Rodada ${r.numero}`), h('strong', {}, r.titulo), h('span', { class: 'muted small' }, r.resumo))),
    h('ol', { class: 'manual-list' }, r.missoes.map((m) => h('li', {}, h('span', {}, m.titulo), m.trilha ? h('small', { class: 'tag tag-info' }, 'pode adiantar') : null, m.opcional ? h('small', { class: 'chip-demo' }, 'opcional') : null))),
    h('p', { class: 'small' }, h('strong', {}, 'Ao final: '), r.conclusao));

  return h('article', { class: 'manual stack-lg' },
    h('header', { class: 'page-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'Como funciona'),
      h('h1', {}, 'O caminho até o seu mestrado na Espanha'),
      h('p', { class: 'muted' }, 'Aqui está o mapa completo, para você ter uma visão geral. Ao criar sua conta, a plataforma transforma esse mapa numa jornada guiada: um passo de cada vez, com prazos, documentos e o Mentor por perto.'))),
    h('div', { class: 'lp-ctas' },
      h('a', { class: 'btn btn-cta btn-lg', href: '#/cadastro' }, icon('play', { size: 16 }), 'Criar minha conta'),
      h('a', { class: 'btn btn-ghost btn-lg', href: '#/entrar' }, 'Já tenho conta')),
    h('section', { class: 'panel' }, h('h2', {}, 'Em resumo'),
      h('ol', { class: 'manual-summary' },
        h('li', {}, 'Escolher o mestrado e ver o que ele exige.'),
        h('li', {}, 'Juntar os documentos.'),
        h('li', {}, 'Se candidatar no site do DUA.'),
        h('li', {}, 'Acompanhar o resultado e fazer a matrícula.'),
        h('li', {}, 'Pedir o visto no consulado.'),
        h('li', {}, 'Organizar moradia e viagem.'),
        h('li', {}, 'Chegar e regularizar a estadia (TIE).')),
      h('p', { class: 'notice' }, 'Dinheiro e bolsas começam desde o início, em paralelo. Datas e regras mudam a cada ano: confira sempre a fonte oficial do seu ciclo.')),
    h('section', { class: 'stack' }, h('h2', {}, 'As rodadas'), main.map(roundBlock), fin ? roundBlock(fin) : null),
    h('section', { class: 'panel' }, h('h2', {}, 'Palavras que você vai ver'),
      h('dl', { class: 'glossary' }, GLOSSARY.map((g) => [h('dt', {}, g.termo), h('dd', {}, g.texto)]))),
  );
}
