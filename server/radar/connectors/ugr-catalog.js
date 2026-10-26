// Conector: listado oficial de másteres da Universidad de Granada.
// Página pública: https://masteres.ugr.es/informacion/titulaciones
// Estrutura observada: <h1>Listado de Másteres Curso AAAA/AAAA</h1>, um <h2 class="sidebar"> por ramo
// e linhas <tr><td><a href="/informacion/titulaciones/slug">Nome</a></td><td>Código</td><td><a href="web">Web</a></td></tr>.

import { htmlText } from '../http.js';
import { parseAcademicYear } from '../dates.js';

const BASE = 'https://masteres.ugr.es';

export const slugToId = (slug) => `ugr-${slug.replace(/[^a-z0-9-]/g, '').slice(0, 90)}`;

export function parse(html) {
  const avisos = [];
  const curso = parseAcademicYear(/Listado de M[aá]steres\s+Curso\s+(20\d{2}\/20\d{2})/i.exec(htmlText(html))?.[1]);
  if (!curso) avisos.push({ tipo: 'ciclo-inconsistente', motivo: 'O listado não informa o curso acadêmico.' });

  const programas = new Map();
  const sections = String(html).split(/<h2 class="sidebar">/i).slice(1);
  for (const section of sections) {
    const ramo = htmlText(section.slice(0, section.indexOf('</h2>')));
    for (const m of section.matchAll(/<tr><td><a href="(\/informacion\/titulaciones\/([^"]+))"[^>]*>([\s\S]*?)<\/a><\/td><td>([\s\S]*?)<\/td><td>(?:<a[^>]*href="([^"]+)")?/gi)) {
      const [, path, slug, nome, codigo, web] = m;
      const id = slugToId(slug);
      const existing = programas.get(id);
      if (existing) {
        if (!existing.ramos.includes(ramo)) existing.ramos.push(ramo);
        continue;
      }
      const nomeLimpo = htmlText(nome).replace(/\s+/g, ' ').trim();
      programas.set(id, {
        id,
        universidadeId: 'ugr',
        nome: nomeLimpo,
        codigo: htmlText(codigo) || null,
        ramos: [ramo],
        fichaUrl: BASE + path,
        // Mestrados duplos listam duas webs no mesmo campo ("url1  y  url2"): guardamos a primeira.
        webPropria: web ? web.trim().split(/\s+/)[0] : null,
        tipoTitulo: /^M[aá]ster Doble/i.test(nomeLimpo) ? 'duplo' : /Erasmus Mundus/i.test(nomeLimpo) ? 'erasmus-mundus' : 'oficial',
        // A própria UGR sinaliza no endereço quando a oferta é condicionada à verificação do título.
        ofertaCondicionada: /condicionada|pendiente-verificacion/.test(slug),
        cursoCatalogo: curso?.rotulo || null,
      });
    }
  }
  if (!programas.size) avisos.push({ tipo: 'extracao-incerta', motivo: 'Nenhum mestrado encontrado: a estrutura da página pode ter mudado.' });
  return { ok: programas.size > 0 && Boolean(curso), tipo: 'catalogo', universidadeId: 'ugr', anoAcademico: curso?.rotulo || null, programas: [...programas.values()], avisos };
}
