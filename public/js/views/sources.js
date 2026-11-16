import { h } from '../ui.js';
import { icon } from '../icons.js';
import { getSources } from '../data.js';
import { tag } from '../ui.js';

// Fotos das universidades (capas das jornadas): Wikimedia Commons, atribuição exigida pela licença.
const PHOTO_CREDITS = [
  ["UGR", "José Luis Filpo Cabana", "CC BY 4.0", "https://commons.wikimedia.org/wiki/File:El_Hospital_Real_de_Granada_desde_los_Jardines_del_Triunfo.jpg"],
  ["US", "Anual", "CC BY 3.0", "https://commons.wikimedia.org/wiki/File:Universidad_de_Sevilla_(rectorado)_001_(cropped).jpg"],
  ["UMA", "Diego Delso", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Rectorado_de_la_Universidad_de_M%C3%A1laga,_M%C3%A1laga,_Espa%C3%B1a,_2023-05-20,_DD_77.jpg"],
  ["UCO", "Kent Wang from Barcelona, Spain", "CC BY-SA 2.0", "https://commons.wikimedia.org/wiki/File:Universidad_de_C%C3%B3rdoba_(52018268584).jpg"],
  ["UCA", "Emilio J. Rodríguez Posada", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Facultad_de_Medicina,_Universidad_de_C%C3%A1diz,_Espa%C3%B1a.jpg"],
  ["UHU", "Luis Rogelio HM", "CC BY-SA 2.0", "https://commons.wikimedia.org/wiki/File:Universidad_de_Huelva,_facultad_de_la_Merced_(2).jpg"],
  ["UJA", "Borrismanuel", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Rectorado,_edificio_B1,_Universidad_de_Ja%C3%A9n,_Ja%C3%A9n,_Espa%C3%B1a,_2025.jpg"],
  ["UAL", "Ludmillaortega", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Campus_UAL.jpg"],
  ["UPO", "Universidad Pablo de Olavide", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Vista_upo.JPG"],
  ["UNIA", "CarlosVdeHabsburgo", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Rectorado_UNIA.jpg"],
];

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
    h('section', { class: 'panel' }, h('h2', {}, 'Créditos das fotos das universidades'),
      h('ul', { class: 'muted small' }, PHOTO_CREDITS.map(([sigla, autor, licenca, url]) => h('li', {}, `${sigla}: foto de ${autor}, ${licenca}, via `, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Wikimedia Commons'))))),
  );
}
