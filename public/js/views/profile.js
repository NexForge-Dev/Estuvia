// Meu perfil (UserProfile): personalização, perfil acadêmico (Missão 1.1), segurança e privacidade.
import { h, field, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, logout, invalidate } from '../app.js';
import { Select } from '../components/Select.js';
import { countries, countryCode, countryName, divisionsFor, PRIORITY_COUNTRIES } from '../data/geo.js';
import { FORMACOES, AREAS, INSTITUTIONS } from '../data/academic.js';
import { GradeCalculator } from '../components/GradeCalculator.js';

const AVATARS = ['🎓', '🚀', '🌍', '📚', '🦉', '🌻', '⚡', '🧉', '🎒', '🐢'];
const CORES = [['turquesa', 'Turquesa (Estuvia)'], ['azul', 'Azul'], ['verde', 'Verde'], ['roxo', 'Roxo'], ['laranja', 'Laranja'], ['rosa', 'Rosa']];
const NIVEIS = [['nenhum', 'Não falo'], ...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => [n, n]), ['nativo', 'Nativo'], ['nao-sei', 'Ainda não sei meu nível']];
const CERT_NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => [n, n]);
const countryOptions = () => {
  const all = countries();
  return [
    ...PRIORITY_COUNTRIES.map((c) => all.find((x) => x.code === c)).filter(Boolean).map((c) => ({ value: c.nome, label: c.nome, group: 'Mais comuns', keywords: c.code })),
    ...all.filter((c) => !PRIORITY_COUNTRIES.includes(c.code)).map((c) => ({ value: c.nome, label: c.nome, group: 'Outros países', keywords: c.code })),
  ];
};
// Campo de texto com sugestões: o valor livre continua aceito (quem não encontra a sua instituição escreve).
const suggest = (name, value, list, attrs) => {
  const id = `dl-${name}`;
  return [h('input', { name, value: value ?? '', list: id, autocomplete: 'off', ...attrs }), h('datalist', { id }, list.map((v) => h('option', { value: v })))];
};

// "O que eu já tenho": corrigir as respostas do onboarding. Quem já tem um documento não refaz a missão dele.
function HavePanel() {
  const host = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Carregando…'));
  api.get('/journeys/requirements').then(({ perguntas, respostas }) => {
    host.replaceChildren(...perguntas.map((q) => {
      const sel = Select({
        ariaLabel: q.pergunta, value: respostas[q.id] || '', placeholder: 'Não respondi', options: q.opcoes, searchable: false,
        onChange: async (v) => {
          try { await api.put('/journeys/requirements', { respostas: { [q.id]: v } }); invalidate(); toast('Atualizado. Sua jornada foi recalculada.', 'ok'); } catch (e) { toast(e.message, 'err'); }
        },
      });
      return field(q.pergunta, sel, q.somenteNaEspanha ? 'Vale depois que você registrar a chegada à Espanha.' : null);
    }), h('p', { class: 'hint' }, 'Marcar "Sim, já tenho" registra o requisito como já atendido (diferente de uma missão feita na plataforma).'));
  }).catch(() => host.replaceChildren(h('p', { class: 'muted small' }, 'Não foi possível carregar.')));
  return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('folder', { size: 18 }), 'O que eu já tenho'), host);
}

export function profileView() {
  const p = state.me.user.profile;
  let avatar = p.avatar || '🎓';
  const picker = h('div', { class: 'avatar-picker', role: 'radiogroup', 'aria-label': 'Escolha seu avatar' }, AVATARS.map((a) => {
    const b = h('button', { type: 'button', class: `avatar-opt ${a === avatar ? 'selected' : ''}`, role: 'radio', 'aria-checked': String(a === avatar) }, a);
    b.addEventListener('click', () => { avatar = a; picker.querySelectorAll('.avatar-opt').forEach((x) => { x.classList.toggle('selected', x === b); x.setAttribute('aria-checked', String(x === b)); }); });
    return b;
  }));
  const inp = (name, attrs = {}) => h('input', { name, value: p[name] ?? '', ...attrs });
  // Divisão administrativa depende do país (estado no Brasil, província na Espanha...); sem lista, sem campo.
  const divisionHost = h('div', { class: 'field-slot' });
  const paintDivision = (country, value) => {
    const d = divisionsFor(country);
    divisionHost.replaceChildren(d
      ? field(d.rotulo, Select({ name: 'estado', value, options: d.options, searchable: true, placeholder: 'Selecione', ariaLabel: d.rotulo }), countryCode(country) === 'BR' ? 'Define o consulado do seu visto.' : null)
      : h('input', { type: 'hidden', name: 'estado', value: '' }));
  };
  paintDivision(p.paisResidencia || '', p.estado || '');
  const budgetUnknown = h('input', { type: 'checkbox', checked: p.orcamentoSituacao === 'nao-sei' });
  const budget = inp('orcamentoDisponivel', { type: 'number', min: 0, step: 100, disabled: p.orcamentoSituacao === 'nao-sei' });
  budgetUnknown.addEventListener('change', () => { budget.disabled = budgetUnknown.checked; if (budgetUnknown.checked) budget.value = ''; });

  const form = h('form', { class: 'stack' },
    h('h2', {}, 'Quem é você'),
    h('div', { class: 'grid-2' }, field('Nome', inp('nome', { maxlength: 60, required: true })), field('Como gosta de ser chamado(a)', inp('apelido', { maxlength: 30 }))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Avatar'), picker),
    h('div', { class: 'grid-2' }, field('Cor de destaque', Select({ name: 'cor', value: p.cor || 'turquesa', options: CORES, searchable: false, ariaLabel: 'Cor de destaque' })), field('Tema', Select({ name: 'tema', value: p.tema === 'claro' ? 'claro' : 'escuro', options: [['escuro', 'Escuro'], ['claro', 'Claro']], searchable: false, ariaLabel: 'Tema' }))),
    h('h2', {}, 'Perfil acadêmico'),
    h('div', { class: 'grid-2' },
      field('Nacionalidade', Select({ name: 'nacionalidade', value: countryCode(p.nacionalidade) ? countryName(countryCode(p.nacionalidade)) : (p.nacionalidade || ''), options: countryOptions(), searchable: true, placeholder: 'Selecione o país', ariaLabel: 'Nacionalidade' })),
      field('País de residência', Select({ name: 'paisResidencia', value: p.paisResidencia || '', options: countryOptions(), searchable: true, placeholder: 'Selecione o país', ariaLabel: 'País de residência', onChange: (v) => paintDivision(v, '') })),
      divisionHost,
      field('Formação acadêmica', Select({ name: 'formacao', value: p.formacao || '', options: FORMACOES.map((f) => ({ value: f.value, label: f.value })), searchable: false, placeholder: 'Selecione', ariaLabel: 'Formação acadêmica' })),
      field('Instituição de origem', suggest('instituicao', p.instituicao, INSTITUTIONS.map((i) => i.value), { maxlength: 120, placeholder: 'Busque pela sigla ou escreva o nome' })),
      field('Curso da graduação', suggest('graduacao', p.graduacao, Object.values(AREAS).flat(), { maxlength: 120, placeholder: 'Ex.: Biologia' }), 'Usado na Missão 1.4 para comparar com as graduações aceitas pelo máster.'),
      field('Área de interesse', suggest('area', p.area, Object.values(AREAS).flat(), { maxlength: 80, placeholder: 'Ex.: Engenharia Civil' })),
      field('Espanhol', Select({ name: 'espanhol', value: p.espanhol || '', options: NIVEIS, searchable: false, placeholder: 'Selecione', ariaLabel: 'Nível de espanhol' })),
      field('Certificado de espanhol', Select({ name: 'certificadoEspanhol', value: p.certificadoEspanhol || '', options: [['nenhum', 'Não tenho certificação'], ['DELE', 'DELE'], ['SIELE', 'SIELE'], ['outro', 'Outro']], searchable: false, placeholder: 'Selecione', ariaLabel: 'Certificado de espanhol' })),
      field('Nível do certificado', Select({ name: 'certificadoNivel', value: p.certificadoNivel || '', options: [['', 'Sem certificado'], ...CERT_NIVEIS], searchable: false, placeholder: 'Sem certificado', ariaLabel: 'Nível do certificado' })),
      field('Inglês', Select({ name: 'ingles', value: p.ingles || '', options: NIVEIS, searchable: false, placeholder: 'Selecione', ariaLabel: 'Nível de inglês' })),
      field('Orçamento disponível (€, aproximado)', h('div', { class: 'stack-sm' }, budget, h('label', { class: 'check' }, budgetUnknown, h('span', {}, 'Ainda não sei meu orçamento'))), 'Referência no Planejamento financeiro (não conta como recurso comprovado).')),
    h('h2', {}, 'Seu porquê'),
    field('Por que você quer fazer esse mestrado?', h('textarea', { name: 'porque', rows: 3, maxlength: 400 }, p.porque || '')),
    field('Meta pessoal', inp('metaPessoal', { maxlength: 200, placeholder: 'Ex.: Estar em Granada em setembro de 2027' })),
    h('button', { class: 'btn btn-cta btn-lg', type: 'submit' }, 'Salvar perfil'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { avatar };
    for (const [k, v] of new FormData(form)) body[k] = k === 'orcamentoDisponivel' ? (v === '' ? null : Number(v)) : String(v).trim();
    if (!body.certificadoNivel || body.certificadoEspanhol === 'nenhum') body.certificadoNivel = '';
    // Escolhas vazias não são enviadas (o servidor só aceita valores da lista).
    for (const k of ['espanhol', 'ingles', 'certificadoEspanhol']) if (!body[k]) delete body[k];
    if (budgetUnknown.checked) Object.assign(body, { orcamentoSituacao: 'nao-sei', orcamentoDisponivel: null });
    else if (typeof body.orcamentoDisponivel === 'number') body.orcamentoSituacao = 'informado';
    try { setMe(await api.put('/me/profile', body)); toast('Perfil salvo. Sua jornada foi recalculada.', 'ok'); } catch (ex) { toast(ex.message, 'err'); }
  });

  const pwd = h('form', { class: 'stack' },
    field('Senha atual', h('input', { name: 'atual', type: 'password', autocomplete: 'current-password', required: true })),
    field('Nova senha', h('input', { name: 'nova', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }), 'Mínimo de 8 caracteres, com letras e números.'),
    h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Trocar senha'));
  pwd.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.post('/auth/change-password', Object.fromEntries(new FormData(pwd))); pwd.reset(); toast('Senha alterada. Outras sessões foram encerradas.', 'ok'); } catch (ex) { toast(ex.message, 'err'); }
  });
  const del = h('form', { class: 'stack' },
    field('Confirme sua senha para excluir a conta', h('input', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true })),
    h('button', { class: 'btn btn-danger', type: 'submit' }, 'Excluir minha conta e meus dados'));
  del.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.del('/me', Object.fromEntries(new FormData(del))); toast('Conta excluída.', 'ok'); await logout(); } catch (ex) { toast(ex.message, 'err'); }
  });

  return h('div', { class: 'stack-lg' },
    h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Missão 1.1'), h('h1', {}, 'Meu perfil'), h('p', { class: 'muted' }, 'A plataforma é sua: personalize e mantenha seu perfil acadêmico atualizado, ele define quais missões se aplicam a você.'))),
    h('section', { class: 'panel' }, form),
    h('section', { class: 'panel', id: 'nota' }, h('h2', { class: 'panel-title' }, icon('scale', { size: 18 }), 'Minha nota média no DUA'),
      h('p', { class: 'muted small' }, 'Muitos másteres selecionam pela nota média do histórico. Veja quanto a sua média vale na escala espanhola.'),
      GradeCalculator()),
    HavePanel(),
    h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('shield', { size: 18 }), 'Segurança e privacidade'),
      h('div', { class: 'grid-2' }, pwd, h('div', { class: 'stack' },
        h('a', { class: 'btn btn-ghost', href: '/api/me/export', download: 'meus-dados.json' }, 'Baixar meus dados (JSON)'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: async () => { await api.post('/auth/logout-all'); await logout(); } }, 'Sair de todos os dispositivos'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: logout }, 'Sair'))),
      h('details', { class: 'danger-zone' }, h('summary', {}, 'Zona de perigo'), del)),
  );
}
