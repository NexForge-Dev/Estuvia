// Matriz de conformidade: UMA linha por mestrado real, com evidências e classificação.
//
// Compara, para cada mestrado:
//   oficial  — ficha do DUA e catálogo do DUA reconsultados (fichas.json gerado pela coleta de evidências)
//   banco    — o que produção guarda e usa (dump público GET /api/radar/opportunities/:id)
//   sistema  — o processo que a jornada aplica (server/application-process.js, regras e canais conferidos)
//
// Classificação (a mais grave vence):
//   INCORRECT           o banco/sistema diverge da fonte oficial (dado desatualizado, vínculo errado, regra mal aplicada)
//   UNVERIFIED          sem evidência suficiente (canal não confirmado, ficha oficial ilegível)
//   INSTITUTIONAL_PENDING o canal de candidatura depende de confirmação da universidade (sem fonte pública)
//   NON_DUA_PROCESS     procedimento próprio, fora do DUA, confirmado pela universidade, com canal publicado
//   PARTIALLY_VERIFIED  tudo conferido, mas resta informação essencial sem fonte pública (ex.: oferta da Fase 1)
//   VERIFIED            todas as informações aplicáveis confirmadas em fonte oficial
// Uso: node scripts/audit-conformidade.mjs <dump.json> <fichas.json> <saida-prefixo>

import fs from 'node:fs';
import { applicationProcess } from '../server/application-process.js';
import { DUA_MASTERES, PROGRAM_SPECIFIC } from '../server/content/application-procedures.js';
import { sourceById } from '../server/content/sources.js';
import { CHANNELS, MANUAL_DUA_LINKS } from '../server/content/program-channels.js';
import { languageRequirements } from '../server/radar/connectors/dua-program.js';
import { sameJson } from '../server/json-equal.js';

const [dumpFile, fichasFile, saida, linksFile] = process.argv.slice(2);
// Resultado da verificação de links (scripts/audit-links.mjs), quando informado: canal quebrado vira pendência.
const links = linksFile && fs.existsSync(linksFile) ? new Map(JSON.parse(fs.readFileSync(linksFile, 'utf8')).map((l) => [l.url, l])) : new Map();
const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
const oficial = JSON.parse(fs.readFileSync(fichasFile, 'utf8'));
const radar = JSON.parse(fs.readFileSync(new URL('../data/radar.json', import.meta.url), 'utf8'));
const CICLO = '2026/2027';
const calendario = {
  windows: radar.windows.filter((w) => w.anoAcademico === CICLO && w.confirmacao === 'confirmado'),
  events: radar.events.filter((e) => e.anoAcademico === CICLO && e.confirmacao === 'confirmado'),
};
const FICHA_URL = (c) => `https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?c_peticion=${encodeURIComponent(c)}&d=mo_catalogo_top.php&q=masteres`;
const up = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const words = (s) => up(s).replace(/MASTER (UNIVERSITARIO|DOBLE)( EN)?|\(.*?\)/g, ' ').replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
const similar = (a, b) => { const A = new Set(words(a)); const B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n += 1; return n / Math.max(A.size, B.size); };
const catalogo = new Map(Object.entries(oficial.catalogos).flatMap(([u, c]) => c.programas.map((p) => [p.codigo, { ...p, universidadeId: u, consultadoEm: c.consultadoEm }])));

// Categorias dos requisitos da ficha (conferência individual do texto oficial).
const CATS = [
  ['idioma', /IDIOMA|LENGUA|ESPANOL|CASTELLANO|INGLES|FRANCES|ALEMAN|\b[ABC][12]\b|MCER|MARCO COMUN/],
  ['homologacao-reconhecimento', /HOMOLOG|EQUIVALENCIA|RECONOCIMIENTO|CNU\/1309|CREDENCIAL/],
  ['prova-entrevista', /ENTREVISTA|PRUEBA|EXAMEN|TEST\b/],
  ['complementos-formativos', /COMPLEMENTOS? (DE )?FORMACION|COMPLEMENTOS FORMATIVOS/],
  ['documento-especifico', /CARTA|CURRICUL|PORTFOLIO|PORTAFOLIO|MEMORIA|PROYECTO|CERTIFICADO|ACREDITA|DOCUMENT|AVAL/],
  ['experiencia', /EXPERIENCIA|PRACTICAS|LABORAL|PROFESIONAL/],
  ['titulacao-perfil', /TITULACION|GRADO EN|LICENCIAD|INGENIER|ARQUITECT|TITULO/],
];
const cats = (t) => { const u = up(t); const c = CATS.filter(([, re]) => re.test(u)).map(([k]) => k); return c.length ? c : ['outro']; };

// Resumo comparável de uma ficha (oficial ou do banco).
const req = (rs) => (rs || []).map((r) => ({ codigo: r.codigo, texto: up(r.texto).replace(/\s+/g, ' ').trim(), obrigatorio: Boolean(r.obrigatorio) })).sort((a, b) => a.codigo.localeCompare(b.codigo));
const bar = (bs) => (bs || []).map((b) => ({ d: up(b.descricao || b.original).replace(/\s+/g, ' ').trim(), p: b.peso ?? null })).sort((a, b) => a.d.localeCompare(b.d));
const tit = (ts) => [...new Set((ts || []).map((t) => up(t)))].sort();

// Regras do procedimento com fonte e artigo (R1..Rn), referenciadas por todas as linhas do DUA.
const REGRAS = [
  ['Máximo de pedidos', DUA_MASTERES.maxPedidos], ['Taxa de solicitação', DUA_MASTERES.taxaSolicitacao], ['Idioma dos documentos', DUA_MASTERES.idiomaDocumentos],
  ...DUA_MASTERES.fases.flatMap((f) => [[`Fase ${f.fase}: quem`, f.quem], [`Fase ${f.fase}: título`, f.titulo], [`Fase ${f.fase}: pagamento`, f.pagamento], ...(f.listaEsperaSeguinte ? [[`Fase ${f.fase}: lista de espera`, f.listaEsperaSeguinte]] : [])]),
  ...DUA_MASTERES.documentos.map((d) => [`Documento: ${d.docId}`, d]), ...DUA_MASTERES.regras.map((r) => [`Regra: ${r.id}`, r]),
  ...PROGRAM_SPECIFIC.map((r) => [`Específica: ${r.id}`, r]),
].map(([titulo, r], i) => ({ id: `R${i + 1}`, titulo, texto: r.texto, fonte: r.fonte, fonteUrl: sourceById(r.fonte)?.url || null, fonteTitulo: sourceById(r.fonte)?.titulo || null, artigo: r.artigo, revisadoEm: r.revisadoEm, original: r.original || null, especifica: titulo.startsWith('Específica:') ? titulo.slice(12).trim() : null }));
const linhas = [];
for (const o of dump.detalhes) {
  const a = o.admissao;
  const canalCfg = CHANNELS[o.programId] || null;
  const codigoBanco = a?.codigoDua || (o.programId.startsWith('dua-') ? o.programa.codigo : null);
  const codigo = codigoBanco || MANUAL_DUA_LINKS[o.programId] || null;
  const ficha = codigo ? oficial.fichas[codigo] : null;
  const fd = ficha?.dados;
  const problemas = []; // divergências → INCORRECT
  const pendencias = []; // informação essencial sem fonte → PARTIALLY / UNVERIFIED
  const evid = [];
  const corrigidos = []; // divergências da produção atual que o código desta auditoria corrige (pendentes de publicação)

  // ---- Identidade e canal ----
  const cat = codigo ? catalogo.get(codigo) : null;
  if (codigo) {
    if (!cat) problemas.push(`O código DUA ${codigo} não está no catálogo do DUA de ${CICLO} consultado em ${oficial.catalogos[o.universidade.id]?.consultadoEm?.slice(0, 10)}.`);
    else {
      evid.push({ tipo: 'catalogo', url: 'https://www.juntadeandalucia.es/economiaconocimientoempresasyuniversidad/sguit/?q=masteres&d=mo_catalogo_top.php', documento: `Catálogo de másteres do DUA (${o.universidade.sigla}, curso ${CICLO})`, consultadoEm: cat.consultadoEm, trecho: `${codigo} - ${cat.nome}` });
      if (cat.universidadeId !== o.universidade.id) problemas.push(`O código ${codigo} pertence a ${cat.universidadeId.toUpperCase()} no catálogo, não a ${o.universidade.sigla}.`);
      const sim = similar(o.programa.nome, cat.nome);
      if (sim < 0.5) problemas.push(`Identidade: o nome no banco ("${o.programa.nome}") não corresponde ao do DUA ("${cat.nome}", similaridade ${sim.toFixed(2)}).`);
    }
  }

  // ---- Ficha oficial reconsultada × banco ----
  const divergencias = [];
  if (codigo && !canalCfg?.tipo?.startsWith('nao-')) {
    if (!ficha || ficha.erro) pendencias.push(`Ficha oficial ${codigo} não pôde ser reconsultada (${ficha?.erro || 'sem resposta'}).`);
    else if (!fd) pendencias.push(`Ficha oficial ${codigo} devolvida em branco pelo DUA.`);
    else {
      evid.push({ tipo: 'ficha', url: FICHA_URL(codigo), documento: `Ficha do máster no DUA: ${codigo} - ${fd.titulo}`, consultadoEm: ficha.consultadoEm, trecho: `${fd.requisitos.length} requisito(s), ${fd.baremo.length} critério(s), ${fd.titulacoes.length} titulação(ões)` });
      if (ficha.avisos?.length) pendencias.push(`Extração da ficha com aviso: ${ficha.avisos.map((x) => x.motivo).join(' ')}`);
      if (!a) {
        // Banco ainda sem ficha (vínculo manual novo): não é divergência, é coleta pendente após a publicação.
        pendencias.push('Produção ainda não tem a ficha deste máster (vínculo conferido nesta auditoria; o Radar coleta após a publicação).');
      } else {
        if (!sameJson(req(a.requisitos), req(fd.requisitos))) divergencias.push('requisitos');
        if (!sameJson(bar(a.criterios.map((c) => ({ descricao: c.original, peso: c.peso }))), bar(fd.baremo))) divergencias.push('critérios de seleção');
        const titBanco = tit([...a.titulacoes.alta, ...a.titulacoes.media, ...a.titulacoes.baixa]);
        if (!sameJson(titBanco, tit(fd.titulacoes.map((t) => t.nome)))) divergencias.push('titulações de acesso');
        if (divergencias.length) problemas.push(`Dado desatualizado no banco (ficha coletada em ${a.verificadaEm?.slice(0, 10)}): ${divergencias.join(', ')} diferem da ficha oficial reconsultada em ${ficha.consultadoEm.slice(0, 10)}.`);
      }
    }
  }

  // ---- Requisitos da ficha: conferência individual e reflexo no sistema ----
  const requisitos = (fd?.requisitos || []).map((r) => ({ codigo: r.codigo, obrigatorio: r.obrigatorio, categorias: cats(r.texto), texto: r.texto }));
  if (fd) {
    // Idioma obrigatório de espanhol com nível na ficha precisa virar a exigência usada pela Missão 2.5.
    // Nível de espanhol que o sistema aplica × o MAIOR nível obrigatório escrito em cada requisito da ficha.
    const NIV = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const sistema = languageRequirements(fd.requisitos).find((l) => l.idioma === 'espanhol' && l.obrigatorio);
    const porRequisito = fd.requisitos.filter((x) => x.obrigatorio).flatMap((r) => languageRequirements([r]).filter((l) => l.idioma === 'espanhol' && l.nivel).map((l) => ({ ...l, codigo: r.codigo })));
    const maior = porRequisito.sort((x, y) => NIV.indexOf(y.nivel) - NIV.indexOf(x.nivel))[0];
    if (maior && (!sistema || NIV.indexOf(sistema.nivel) < NIV.indexOf(maior.nivel))) {
      problemas.push(`Idioma: a ficha exige espanhol ${maior.nivel} (requisito ${maior.codigo}), mas o sistema aplica ${sistema?.nivel || 'nenhuma exigência'}.`);
    }
    // Produção (código publicado) ainda usa o idioma guardado: registra o que a correção local resolve.
    const prodEs = (a?.idiomas || []).find((l) => l.idioma === 'espanhol' && l.obrigatorio);
    if (maior && a && (!prodEs || NIV.indexOf(prodEs.nivel) < NIV.indexOf(maior.nivel))) {
      corrigidos.push(`Idioma: produção orienta espanhol ${prodEs?.nivel || '(nenhum)'}, a ficha exige ${maior.nivel} (requisito ${maior.codigo}). Corrigido no código (interpretador e leitura), pendente de publicação.`);
    }
    if (maior) evid.push({ tipo: 'idioma', url: FICHA_URL(codigo), documento: `Requisito ${maior.codigo} da ficha ${codigo}`, consultadoEm: ficha.consultadoEm, trecho: maior.texto });
  }

  // ---- Processo aplicado pelo sistema (código atual) ----
  const programa = {
    id: o.programId, universidadeId: o.universidade.id, nome: o.programa.nome, url: o.programa.webPropria || o.programa.fichaUrl,
    duaCodigo: codigo, fichaDuaUrl: codigo ? FICHA_URL(codigo) : null,
    requisitosFicha: fd ? fd.requisitos : a ? a.requisitos : null,
    criteriosOriginais: fd ? fd.baremo.map((c) => ({ original: c.descricao, peso: c.peso })) : null,
    criterios: fd ? fd.baremo : null, fichaVerificadaEm: ficha?.consultadoEm || null,
  };
  const proc = applicationProcess(programa, { calendario, profile: { nacionalidade: 'Brasileira' } });
  const regras = proc.regrasEspecificas.map((r) => r.id);
  if (/PROFESORADO/i.test(o.programa.nome) && !regras.includes('profesorado')) corrigidos.push('A regra do Máster en Profesorado (prazo da acreditação de idioma) era aplicada a este máster, que não é o de Profesorado. Corrigido no código, pendente de publicação.');
  if (canalCfg) corrigidos.push(`Canal: produção não tinha o canal deste máster (${canalCfg.tipo}). Configuração individual conferida nesta auditoria, pendente de publicação.`);
  if (proc.canal.status === 'nao-confirmado') pendencias.push(proc.canal.texto);
  if (proc.canal.status === 'nao-dua-sem-canal') pendencias.push(proc.canal.texto);
  if (proc.canal.status === 'confirmado') pendencias.push('Oferta de vagas na Fase 1 (estrangeiros): nenhuma fonte oficial pública a informa por máster; confirmar no portal do DUA durante o prazo ou com a universidade.');
  if (proc.canal.variantes) pendencias.push(`Máster com ${proc.canal.variantes.length} códigos no DUA: requisitos por variante (fichas próprias).`);
  if (canalCfg) evid.push({ tipo: 'canal', url: canalCfg.evidencia.url, documento: canalCfg.evidencia.fonte, consultadoEm: canalCfg.evidencia.consultadoEm, trecho: canalCfg.evidencia.trecho });
  // PGS: a ficha deve conter algum requisito sobre a certificação (confirmação cruzada; ausência é registrada, não presumida).
  if (regras.includes('psicologia-geral-sanitaria') && fd && !fd.requisitos.some((r) => /CNU|HOMOLOG|EQUIVALENC|RESOLUCION/.test(up(r.texto)))) {
    pendencias.push('A ficha do DUA de Psicología General Sanitaria não repete a exigência da certificação (O2 art. 9): a regra vem do acordo; confirme a documentação específica no portal.');
  }

  // ---- Variantes (vários códigos DUA): cada ficha reconsultada, e se os requisitos coincidem entre elas ----
  let variantes = null;
  if (proc.canal.variantes) {
    variantes = proc.canal.variantes.map((v) => {
      const fv = oficial.fichas[v.codigo];
      const es = fv?.dados ? languageRequirements(fv.dados.requisitos).find((l) => l.idioma === 'espanhol') : null;
      if (fv?.dados) evid.push({ tipo: 'ficha-variante', url: FICHA_URL(v.codigo), documento: `Ficha ${v.codigo} - ${fv.dados.titulo}`, consultadoEm: fv.consultadoEm, trecho: `${fv.dados.requisitos.length} requisito(s)` });
      return { codigo: v.codigo, nome: v.nome, ficha: Boolean(fv?.dados), obrigatorios: fv?.dados ? fv.dados.requisitos.filter((r) => r.obrigatorio).map((r) => r.codigo) : null, espanhol: es ? es.nivel || 'sem nível' : null, chave: fv?.dados ? JSON.stringify(req(fv.dados.requisitos)) : null };
    });
    if (variantes.some((v) => !v.ficha)) pendencias.push(`Ficha oficial não reconsultada para a(s) variante(s) ${variantes.filter((v) => !v.ficha).map((v) => v.codigo).join(', ')}.`);
    const iguais = new Set(variantes.filter((v) => v.chave).map((v) => v.chave)).size <= 1;
    if (!iguais) pendencias.push('As variantes têm requisitos DIFERENTES entre si: o estudante precisa ler a ficha da variante escolhida.');
  }

  // ---- Conteúdo da linha (o que vale para este mestrado, com a base de cada item) ----
  const langs = fd ? languageRequirements(fd.requisitos) : [];
  const fases = proc.canal.status.startsWith('nao-dua') ? 'Fora do DUA (procedimento do programa)'
    : proc.canal.status !== 'confirmado' ? 'Indeterminado (canal não confirmado)'
    : 'F1: só nacionalidade estrangeira, oferta do máster não confirmada (O1 arts. 1, 2, 9) · F2: ordinária (O2 art. 3) · F3: vagas que sobrarem (O2 art. 3). Título concluído até a data-limite da fase (O1 art. 4; O2 Anexo I)';
  const academicos = fd ? `Título concluído que dê acesso a máster no país emissor (O1 art. 2; O2 art. 2 req. 3) · ${fd.titulacoes.length} graduações na ficha (alta ${fd.titulacoes.filter((t) => t.preferencia === 'alta').length}, média ${fd.titulacoes.filter((t) => t.preferencia === 'media').length}, baixa ${fd.titulacoes.filter((t) => t.preferencia === 'baixa').length}) · ${fd.condicionadas.length} com admissão condicionada · ${fd.restoComAcesso.length} outras com acesso` : null;
  const linguisticos = fd ? (langs.length ? langs.map((l) => `${l.idioma} ${l.nivel || '(sem nível)'}${l.obrigatorio ? ' obrigatório' : ''} (req. ${l.codigo})`).join(' · ') : 'A ficha não lista exigência de idioma') : null;
  const documentacao = proc.canal.status === 'confirmado' ? proc.documentos.filter((d) => d.obrigatorio === true).map((d) => d.docId).join(', ') + ` (${proc.documentos.find((d) => d.docId === 'certificacao-pgs') ? 'O2 art. 9; ' : ''}O1 art. 4; O2 Tabla 3)` : proc.canal.status.startsWith('nao-dua') ? 'Definida pelo programa (canal oficial)' : null;

  let classe;
  if (problemas.length) classe = 'INCORRECT';
  else if (['nao-confirmado', 'nao-dua-sem-canal'].includes(proc.canal.status)) classe = 'INSTITUTIONAL_PENDING';
  else if (codigo && !canalCfg?.tipo?.startsWith('nao-') && (!ficha || ficha.erro || !fd)) classe = 'UNVERIFIED';
  else if (proc.canal.status === 'nao-dua') classe = 'NON_DUA_PROCESS';
  else if (pendencias.length) classe = 'PARTIALLY_VERIFIED';
  else classe = 'VERIFIED';

  // Regras gerais (BOJA) só valem para quem usa o DUA; as específicas, só para o máster cujo nome oficial casa.
  const regrasAplicaveis = proc.canal.status === 'confirmado' || proc.canal.status === 'nao-confirmado'
    ? REGRAS.filter((r) => !r.especifica || regras.includes(r.especifica)).map((r) => r.id) : [];
  // Ficha: consultada (resposta recebida) ≠ validada (extraída sem aviso e comparada com o banco sem divergência).
  const fichaConsulta = !codigo || canalCfg?.tipo?.startsWith('nao-') ? { status: 'nao-aplicavel' }
    : !ficha ? { codigo, status: 'nao-consultada' }
    : ficha.erro ? { codigo, status: 'falha', erro: ficha.erro }
    : !fd ? { codigo, status: 'em-branco', consultadoEm: ficha.consultadoEm }
    : { codigo, consultadoEm: ficha.consultadoEm, status: ficha.avisos?.length ? 'consultada-com-aviso' : !a ? 'consultada-sem-base-para-comparar' : divergencias.length ? 'divergente' : 'validada' };
  const link = proc.canal.url && proc.canal.status !== 'confirmado' ? links.get(proc.canal.url) : null;
  if (link && !link.ok) pendencias.push(`Link do canal não respondeu na verificação automática (${link.erro || link.status}); conferido manualmente quando indicado no relatório.`);
  linhas.push({
    id: o.programId, universidade: o.universidade.sigla, nome: o.programa.nome, codigoDua: codigo, canal: proc.canal.status, canalUrl: proc.canal.url || null,
    regrasAplicaveis, fichaConsulta, canalLink: link ? { ok: link.ok, status: link.status, final: link.final || null, erro: link.erro || null, verificadoEm: link.verificadoEm } : null,
    classe, problemas, pendencias, divergencias, corrigidos,
    fases, academicos, linguisticos, documentacao, variantes,
    requisitos, requisitosObrigatorios: requisitos.filter((r) => r.obrigatorio).length,
    categoriasRequisitos: [...new Set(requisitos.flatMap((r) => r.categorias))],
    criterios: fd ? fd.baremo.map((b) => `${b.descricao} ${b.peso ?? '?'}%`) : [],
    regrasEspecificas: regras, evidencias: evid,
  });
}

// ---- Duplicidades no banco ----
const porCodigo = new Map();
for (const l of linhas) if (l.codigoDua) porCodigo.set(l.codigoDua, [...(porCodigo.get(l.codigoDua) || []), l]);
const duplicados = [...porCodigo.entries()].filter(([, ls]) => ls.length > 1).map(([c, ls]) => ({ codigo: c, mestrados: ls.map((l) => `${l.id} (${l.nome})`) }));
const porNome = new Map();
for (const l of linhas) { const k = `${l.universidade}:${up(l.nome)}`; porNome.set(k, [...(porNome.get(k) || []), l.id]); }
const nomesRepetidos = [...porNome.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ nome: k, ids }));

const conta = (c) => linhas.filter((l) => l.classe === c).length;
const resumo = {
  geradoEm: new Date().toISOString(), ciclo: CICLO, fonteBanco: `dump de produção ${dump.coletadoEm}`,
  fichasReconsultadas: Object.values(oficial.fichas).filter((f) => f.dados).length,
  total: linhas.length,
  ...Object.fromEntries(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NON_DUA_PROCESS', 'INSTITUTIONAL_PENDING', 'INCORRECT'].map((c) => [c, conta(c)])),
  porUniversidade: Object.fromEntries([...new Set(linhas.map((l) => l.universidade))].sort().map((u) => [u, Object.fromEntries([['total', linhas.filter((l) => l.universidade === u).length], ...['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NON_DUA_PROCESS', 'INSTITUTIONAL_PENDING', 'INCORRECT'].map((c) => [c, linhas.filter((l) => l.universidade === u && l.classe === c).length])])])),
  regrasConfirmadas: REGRAS.length,
  fichasConsultadas: Object.keys(oficial.fichas).length,
  fichasFalhas: Object.entries(oficial.fichas).filter(([, f]) => f.erro).map(([c, f]) => ({ codigo: c, erro: f.erro })),
  fichasEmBranco: Object.entries(oficial.fichas).filter(([, f]) => !f.erro && !f.dados).map(([c]) => c),
  fichasComAviso: Object.entries(oficial.fichas).filter(([, f]) => f.dados && f.avisos?.length).map(([c, f]) => ({ codigo: c, avisos: f.avisos.map((x) => x.motivo) })),
  fichasPorStatus: linhas.reduce((m, l) => ({ ...m, [l.fichaConsulta.status]: (m[l.fichaConsulta.status] || 0) + 1 }), {}),
  multiplosCodigos: linhas.filter((l) => l.variantes).map((l) => ({ id: l.id, nome: l.nome, codigos: l.variantes.map((v) => v.codigo) })),
  regras: REGRAS,
  fichasSemMestradoNoBanco: Object.keys(oficial.fichas).filter((c) => !linhas.some((l) => l.codigoDua === c || l.variantes?.some((v) => v.codigo === c))),
  corrigidosNaoPublicados: linhas.filter((l) => l.corrigidos.length).length,
  conferidosExcetoFase1: linhas.filter((l) => l.classe === 'PARTIALLY_VERIFIED' && l.pendencias.every((p) => /^Oferta de vagas na Fase 1/.test(p))).length,
  comRequisitosObrigatorios: linhas.filter((l) => l.requisitosObrigatorios).length,
  porCategoria: Object.fromEntries(CATS.map(([k]) => [k, linhas.filter((l) => l.requisitos.some((r) => r.obrigatorio && r.categorias.includes(k))).length])),
  regrasEspecificas: { 'psicologia-geral-sanitaria': linhas.filter((l) => l.regrasEspecificas.includes('psicologia-geral-sanitaria')).length, profesorado: linhas.filter((l) => l.regrasEspecificas.includes('profesorado')).length },
  duplicados, nomesRepetidos,
};
fs.writeFileSync(`${saida}.json`, JSON.stringify({ resumo, linhas }, null, 1));

const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const md = [
  `# Matriz de conformidade dos processos de candidatura`,
  ``,
  `Gerada em ${resumo.geradoEm.slice(0, 16).replace('T', ' ')} UTC. Banco: ${resumo.fonteBanco}. Fichas oficiais reconsultadas no DUA: ${resumo.fichasReconsultadas}. Ciclo dos acordos: ${CICLO}.`,
  ``,
  `| Classe | Total |`, `|---|---|`,
  ...['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NON_DUA_PROCESS', 'INSTITUTIONAL_PENDING', 'INCORRECT'].map((c) => `| ${c} | ${resumo[c]} |`),
  ``,
  `## Por universidade`, ``,
  `| Univ. | Total | ${['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NON_DUA_PROCESS', 'INSTITUTIONAL_PENDING', 'INCORRECT'].join(' | ')} |`, `|---|---|${['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NON_DUA_PROCESS', 'INSTITUTIONAL_PENDING', 'INCORRECT'].map(() => '---').join('|')}|`,
  ...Object.entries(resumo.porUniversidade).map(([u, x]) => `| ${u} | ${x.total} | ${['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NON_DUA_PROCESS', 'INSTITUTIONAL_PENDING', 'INCORRECT'].map((c) => x[c]).join(' | ')} |`),
  ``,
  `## Regras do procedimento (fonte, artigo, data)`, ``,
  `Valem para todo mestrado do DUA. O1 = BOJA 245/2025 (Fase 1); O2 = BOJA 84/2026 (Fases 2 e 3).`, ``,
  `| Id | Regra | Texto aplicado | Fonte | Artigo | Conferida em |`, `|---|---|---|---|---|---|`,
  ...REGRAS.map((r) => `| ${r.id} | ${esc(r.titulo)} | ${esc(r.texto)}${r.original ? ` (texto original: “${esc(r.original)}”)` : ''} | [${r.fonte}](${r.fonteUrl}) | ${esc(r.artigo)} | ${r.revisadoEm} |`),
  ``,
  `Conferidos em tudo, exceto a oferta da Fase 1 (sem fonte pública por máster): **${resumo.conferidosExcetoFase1}**.`,
  ``,
  `## Uma linha por mestrado`,
  ``,
  `| # | Univ. | Mestrado (id) | Código DUA | Canal | Estado | Ficha oficial (status, consulta) | Regras do BOJA aplicadas | Fases | Acadêmicos | Idioma | Documentação obrigatória | Req. específicos (obrig.) | Regras específicas | Problemas / pendências | Corrigido no código (a publicar) | Evidência (consulta) |`,
  `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ...linhas.map((l, i) => `| ${i + 1} | ${l.universidade} | ${esc(l.nome)} (${l.id}) | ${l.codigoDua || (l.variantes ? l.variantes.map((v) => v.codigo).join(', ') : '-')} | ${l.canal}${l.canalUrl ? ` ${l.canalUrl}` : ''} | ${l.classe} | ${l.fichaConsulta.status}${l.fichaConsulta.consultadoEm ? ` ${l.fichaConsulta.consultadoEm.slice(0, 16).replace('T', ' ')} UTC` : ''} | ${l.regrasAplicaveis.length ? `${l.regrasAplicaveis.length} regras (${l.regrasAplicaveis[0]}–${l.regrasAplicaveis.filter((r) => !REGRAS.find((x) => x.id === r)?.especifica).at(-1)}${l.regrasAplicaveis.filter((r) => REGRAS.find((x) => x.id === r)?.especifica).map((r) => ` + ${r}`).join('')})` : '-'} | ${esc(l.fases)} | ${esc(l.academicos || '-')} | ${esc(l.linguisticos || (l.variantes ? l.variantes.map((v) => `${v.codigo}: ${v.espanhol || '-'}`).join('; ') : '-'))} | ${esc(l.documentacao || '-')} | ${l.requisitos.filter((r) => r.obrigatorio).map((r) => `${r.codigo} [${r.categorias.join('/')}]`).join(', ') || '-'} | ${l.regrasEspecificas.join(', ') || '-'} | ${esc([...l.problemas, ...l.pendencias.filter((p) => !/^Oferta de vagas na Fase 1/.test(p))].join(' · ')) || (l.classe === 'PARTIALLY_VERIFIED' ? 'Só a oferta da Fase 1' : '-')} | ${esc(l.corrigidos.join(' · ')) || '-'} | ${l.evidencias.map((e) => `[${e.tipo}](${e.url}) ${e.consultadoEm?.slice(0, 10)}`).join(' ')} |`),
].join('\n');
fs.writeFileSync(`${saida}.md`, md);
// CSV (uma linha por mestrado, para revisão em planilha), com o texto oficial de cada requisito obrigatório.
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const cols = ['id', 'universidade', 'nome', 'codigoDua', 'variantes', 'canal', 'canalUrl', 'estado', 'fichaStatus', 'fichaConsultadaEm', 'regrasAplicaveis', 'fases', 'academicos', 'idioma', 'documentacao', 'requisitosObrigatorios', 'regrasEspecificas', 'problemas', 'pendencias', 'corrigidosNaoPublicados', 'evidencias'];
fs.writeFileSync(`${saida}.csv`, String.fromCharCode(0xfeff) + [cols.join(';'), ...linhas.map((l) => [l.id, l.universidade, l.nome, l.codigoDua, (l.variantes || []).map((v) => v.codigo).join(' '), l.canal, l.canalUrl, l.classe, l.fichaConsulta.status, l.fichaConsulta.consultadoEm, l.regrasAplicaveis.join(' '), l.fases, l.academicos, l.linguisticos, l.documentacao, l.requisitos.filter((r) => r.obrigatorio).map((r) => `${r.codigo}: ${r.texto}`).join(' || '), l.regrasEspecificas.join(' '), l.problemas.join(' || '), l.pendencias.join(' || '), l.corrigidos.join(' || '), l.evidencias.map((e) => `${e.tipo} ${e.url} (${e.consultadoEm?.slice(0, 10)}): ${e.trecho}`).join(' || ')].map(csv).join(';'))].join('\n'));
console.log(JSON.stringify({ ...resumo, duplicados: duplicados.length, nomesRepetidos: nomesRepetidos.length }, null, 1));
