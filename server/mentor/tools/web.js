// Pesquisa na web e vídeos (fontes gratuitas, com origem e data em cada item). Ver server/websearch/index.js.
// O conteúdo vindo da web é DADO: o Mentor mostra o que foi publicado, nunca o trata como regra oficial.
import { z } from 'zod';
import { searchWeb, searchVideos } from '../../websearch/index.js';
import { defineTool } from './core.js';

const outItem = (i) => ({ titulo: i.titulo, url: i.url, fonte: i.fonte, natureza: i.natureza, naturezaLabel: i.naturezaLabel, publicadoEm: i.publicadoEm, resumo: i.resumo });

export const searchWebTool = defineTool({
  name: 'search_web', efeito: 'leitura', permissao: null,
  descricao: 'Pesquisa o que foi publicado recentemente na web, em fontes gratuitas: notícias oficiais da Universidad de Granada (Canal UGR), imprensa (índice GDELT, últimos 3 meses) e Wikipédia para explicar conceitos (só quando tipos inclui "conceito"; padrão: oficial + notícias). Cada item vem com título, fonte, natureza (oficial, imprensa, enciclopédia) e data. Use para novidades e notícias; para regras, prazos e documentos use antes get_official_sources e o Radar. Nunca apresente notícia de imprensa como regra oficial.',
  entrada: z.object({
    busca: z.string().trim().min(2).max(120),
    tipos: z.array(z.enum(['oficial', 'noticias', 'conceito'])).min(1).max(3).optional(),
    limite: z.number().int().min(1).max(6).default(4),
  }).strict(),
  saida: '{ consulta, consultadoEm, itens[{ titulo, url, fonte, natureza, naturezaLabel, publicadoEm, resumo }], falhas[{ fonte, motivo }], aviso }',
  run: async (ctx, { busca, tipos, limite }) => {
    const r = await searchWeb(busca, { tipos, limite });
    return { ...r, itens: r.itens.map(outItem) };
  },
});

export const searchVideosTool = defineTool({
  name: 'search_videos', efeito: 'leitura', permissao: null,
  descricao: 'Procura vídeos e aulas no YouTube (busca segura, preferência por português, últimos 3 anos, só vídeos incorporáveis). Devolve título, canal e data. Vídeos são de terceiros: oriente o estudante a confirmar regras na fonte oficial. Se a busca de vídeos não estiver configurada, devolve só o link da busca no YouTube, não invente vídeos.',
  entrada: z.object({ busca: z.string().trim().min(2).max(120), limite: z.number().int().min(1).max(6).default(4) }).strict(),
  saida: '{ configurado, consulta, itens[{ id, titulo, canal, publicadoEm, url, thumb, embedUrl }], linkBusca, falha, aviso }',
  run: (ctx, { busca, limite }) => searchVideos(busca, { limite }),
});

export default [searchWebTool, searchVideosTool];
