// Tool Registry do Mentor: catálogo, validação de entrada, permissões, erros e logs.
// As mesmas ferramentas servem ao Modo Guiado (regras) e a qualquer provedor de IA.
import { z } from 'zod';
import { EFFECTS, ToolError, makeCtx } from './core.js';
import { can, PERMISSIONS } from '../memory.js';
import journey from './journey.js';
import agenda from './agenda.js';
import finance from './finance.js';
import radar from './radar.js';
import documents from './documents.js';
import housing from './housing.js';
import knowledge, { UNAVAILABLE } from './knowledge.js';
import travel from './travel.js';

const ALL = [...journey, ...agenda, ...finance, ...radar, ...documents, ...housing, ...travel, ...knowledge];
export const TOOLS = new Map(ALL.map((t) => [t.name, t]));
export { ToolError, makeCtx, UNAVAILABLE };

const debug = process.env.MENTOR_DEBUG === '1';

/** Catálogo público (documentação, painel e provedores de IA). */
export function catalog() {
  return ALL.map((t) => ({
    name: t.name, descricao: t.descricao, efeito: t.efeito, efeitoLabel: EFFECTS[t.efeito], confirmacao: t.confirmacao,
    permissao: t.permissao, permissaoLabel: t.permissao ? PERMISSIONS[t.permissao] : 'Nenhuma (conteúdo público da Estuvia)',
    entrada: (({ $schema, ...s }) => s)(z.toJSONSchema(t.entrada, { io: 'input', unrepresentable: 'any' })), saida: t.saida,
  }));
}

function check(ctx, name, input) {
  const tool = TOOLS.get(name);
  if (!tool) throw new ToolError('desconhecida', `Ferramenta desconhecida: ${name}.`, 404);
  if (!can(ctx.user, tool.permissao)) throw new ToolError('sem-permissao', `Você desativou o acesso do Mentor a "${PERMISSIONS[tool.permissao]}". Reative em "O que o Mentor sabe" se quiser que eu use esses dados.`, 403);
  const parsed = tool.entrada.safeParse(input || {});
  if (!parsed.success) throw new ToolError('entrada', parsed.error.issues[0]?.message || 'Entrada inválida.', 400);
  return { tool, input: parsed.data };
}

const asError = (err) => (err instanceof ToolError ? { codigo: err.codigo, mensagem: err.message, status: err.status }
  : err?.status && err.message ? { codigo: 'regra', mensagem: err.message, status: err.status }
    : { codigo: 'interno', mensagem: 'Não consegui consultar esse dado agora.', status: 500 });

/**
 * Executa uma ferramenta de leitura/rascunho, ou PREPARA uma de escrita (preview, sem efeito).
 * Retorno: { ok, ferramenta, efeito, dados? , preview?, input?, erro? }
 */
export async function useTool(ctx, name, input) {
  const t0 = Date.now();
  try {
    const { tool, input: valid } = check(ctx, name, input);
    if (tool.efeito === 'escrita') {
      const pv = await tool.preview(ctx, valid);
      const preview = Object.fromEntries(Object.entries(pv).filter(([k]) => !k.startsWith('_')));
      return { ok: true, ferramenta: name, efeito: tool.efeito, preview, input: valid };
    }
    const dados = await tool.run(ctx, valid);
    if (debug) console.debug(`[mentor] ${name} ok ${Date.now() - t0}ms`);
    return { ok: true, ferramenta: name, efeito: tool.efeito, dados };
  } catch (err) {
    const erro = asError(err);
    if (erro.codigo === 'interno') console.error(`[mentor] ferramenta ${name} falhou:`, err);
    else if (debug) console.debug(`[mentor] ${name} recusada: ${erro.codigo}`);
    return { ok: false, ferramenta: name, efeito: TOOLS.get(name)?.efeito || null, erro };
  }
}

/** Executa de verdade uma ferramenta de escrita (somente via confirmação — ver actions.js). */
export async function executeTool(ctx, name, input) {
  try {
    const { tool, input: valid } = check(ctx, name, input);
    if (tool.efeito !== 'escrita') throw new ToolError('entrada', 'Esta ferramenta não altera dados.');
    await tool.preview(ctx, valid); // revalida com o estado atual (pode ter mudado desde a proposta)
    const r = await tool.execute(ctx, valid);
    return { ok: true, ferramenta: name, resumo: r.resumo, dados: r.dados };
  } catch (err) {
    const erro = asError(err);
    if (erro.codigo === 'interno') console.error(`[mentor] execução de ${name} falhou:`, err);
    return { ok: false, ferramenta: name, erro };
  }
}

export const toolCtx = makeCtx;
