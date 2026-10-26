import { h } from '../ui.js';
import { icon } from '../icons.js';
import { getSources } from '../data.js';
import { tag } from '../ui.js';

export async function sourcesView() {
  const sources = await getSources();
  return h('div', { class: 'stack-lg' },
    h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Confiabilidade'), h('h1', {}, icon('search', { size: 26 }), ' Central de fontes'),
      h('p', { class: 'muted' }, 'Toda regra da plataforma aponta para uma destas fontes, com data de revisão. Regras vencidas ou contraditórias perdem o selo de verificadas e voltam para revisão.'))),
    h('section', { class: 'panel' }, h('ul', { class: 'tag-legend' }, h('li', {}, tag('verificado')), h('li', {}, tag('pratica')), h('li', {}, tag('estimativa')), h('li', {}, tag('pendente')))),
    h('section', { class: 'panel' },
      h('ul', { class: 'source-list' }, sources.map((s) => h('li', {},
        h('span', { class: 'cite' }, s.id),
        h('div', {},
          h('strong', {}, s.titulo),
          h('p', { class: 'muted small' }, `${s.orgao} · revisado em ${new Date(`${s.revisadoEm}T12:00:00`).toLocaleDateString('pt-BR')}${s.pendente ? ' · link informado pelo idealizador, a confirmar' : ''}${s.tipo === 'demo' ? ' · não usar para decisões reais' : ''}`),
          s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir fonte ', icon('external', { size: 12 })) : null)))),
      h('p', { class: 'notice' }, 'Datas de ingresso, regras de idioma, listas de cursos, valores (ex.: IPREM) e instruções consulares precisam ser reconfirmados para o ciclo de cada candidato.')),
  );
}
