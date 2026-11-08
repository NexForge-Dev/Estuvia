// Conector: calendário de pré-inscrição em másteres do Distrito Único Andaluz (DUA).
// Página pública: .../sguit/?q=masteres&d=mo_calendario.php
// Estrutura observada (curso 2026/2027): <span class="badge">CURSO AAAA/AAAA</span> e uma tabela
// por fase (id="tablaF1".."tablaF3") com linhas <th>rótulo</th><td>expressão de data</td>.

import { htmlText } from '../http.js';
import { parseAcademicYear, parseSpanishDateExpr } from '../dates.js';

export const PROCEDURE_ID = 'dua-masteres';

// Classificação determinística do rótulo oficial → tipo de evento.
export function classifyRow(label) {
  const l = label.toLowerCase();
  if (/entrega de solicitudes/.test(l)) return 'candidatura';
  if (/derechos de expedici/.test(l)) return 'pagamento-titulo';
  if (/evaluaci[oó]n de las solicitudes/.test(l)) return 'avaliacao';
  if (/^publicaci[oó]n de .*resulta/.test(l)) return 'resultas';
  if (/^publicaci[oó]n de .*adjudicaci/.test(l)) return 'adjudicacao';
  if (/alegaci|revisi[oó]n|reclamaci/.test(l)) return 'reclamacao';
  if (/matr[ií]cula|reserva|confirmaci[oó]n|pago a cuenta/.test(l)) return 'confirmacao';
  return 'outro';
}

const PUBLICO = { 1: 'estrangeiros', 2: 'todos', 3: 'todos' };

export function parse(html) {
  const avisos = [];
  const noComments = String(html).replace(/<!--[\s\S]*?-->/g, ' ');
  const cursoText = /CURSO\s+(20\d{2}\s*\/\s*20\d{2})/i.exec(htmlText(noComments))?.[1];
  const curso = parseAcademicYear(cursoText);
  if (!curso) {
    return { ok: false, avisos: [{ tipo: 'ciclo-inconsistente', motivo: 'Não foi possível identificar o curso acadêmico na página do calendário.' }] };
  }

  const fases = [];
  for (const m of noComments.matchAll(/<table[^>]*id="tablaF(\d)"[^>]*>([\s\S]*?)<\/table>/gi)) {
    const fase = Number(m[1]);
    const body = m[2];
    const titulo = htmlText(/<h6[^>]*>([\s\S]*?)<\/h6>/i.exec(body)?.[1] || `Fase ${fase}`).replace(/\s+/g, ' ');
    // Selo "pendiente de publicación en Boletín Oficial" visível = datas ainda não oficializadas.
    const previsto = /pendiente de publicaci[oó]n/i.test(htmlText(body));
    const itens = [];
    let ordem = 0;
    for (const row of body.matchAll(/<tr[^>]*>\s*<th[^>]*class="bg-light"[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      const rotulo = htmlText(row[1]).replace(/[.:]\s*$/, '');
      const texto = htmlText(row[2]);
      const d = parseSpanishDateExpr(texto, curso.rotulo);
      const tipo = classifyRow(rotulo);
      ordem += 1;
      itens.push({ ordem, rotulo, tipo, texto, inicio: d.inicio, fim: d.fim, incerto: d.incerto });
      if (d.incerto) avisos.push({ tipo: 'extracao-incerta', fase, rotulo, texto, motivo: d.motivo });
      if (tipo === 'outro') avisos.push({ tipo: 'rotulo-desconhecido', fase, rotulo, texto, motivo: 'Rótulo não classificado, conferir manualmente.' });
    }
    if (!itens.some((i) => i.tipo === 'candidatura')) {
      avisos.push({ tipo: 'extracao-incerta', fase, motivo: `Fase ${fase} sem período de entrega de solicitações identificado.` });
    }
    fases.push({ fase, titulo, publico: PUBLICO[fase] || 'todos', confirmacao: previsto ? 'previsto' : 'confirmado', itens });
  }
  if (!fases.length) avisos.push({ tipo: 'extracao-incerta', motivo: 'Nenhuma tabela de fase encontrada: a estrutura da página pode ter mudado.' });

  return { ok: fases.length > 0, tipo: 'calendario', procedimentoId: PROCEDURE_ID, anoAcademico: curso.rotulo, fases, avisos };
}
