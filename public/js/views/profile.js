// Meu perfil (UserProfile): resumo com o quanto falta preencher, seções navegáveis (sobre mim, formação,
// idiomas, planos, nota média, o que já tenho, aparência, conta) e uma barra de salvar que só aparece
// quando há alterações. Os campos e o formato enviado a PUT /me/profile são os mesmos de antes.
import { h, field, toast } from '../ui.js';
import { skeletonLines } from '../motion.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, logout, invalidate } from '../app.js';
import { Select } from '../components/Select.js';
import { countries, countryCode, countryName, divisionsFor, divisionLabel, PRIORITY_COUNTRIES } from '../data/geo.js';
import { FORMACOES, AREAS, INSTITUTIONS } from '../data/academic.js';
import { GradeCalculator } from '../components/GradeCalculator.js';

const AVATARS = ['🎓', '🚀', '🌍', '📚', '🦉', '🌻', '⚡', '🧉', '🎒', '🐢'];
const CORES = [['turquesa', 'Turquesa'], ['azul', 'Azul'], ['verde', 'Verde'], ['roxo', 'Roxo'], ['laranja', 'Laranja'], ['rosa', 'Rosa']];
const NIVEIS = [['nenhum', 'Não falo'], ...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => [n, n]), ['nativo', 'Nativo'], ['nao-sei', 'Ainda não sei meu nível']];
const CERT_NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => [n, n]);
const CERTS = [['nenhum', 'Não tenho certificado'], ['DELE', 'DELE'], ['SIELE', 'SIELE'], ['outro', 'Outro']];
const NIVEL_LABEL = Object.fromEntries(NIVEIS);

const SECOES = [
  ['sobre', 'Sobre mim', 'user'], ['formacao', 'Formação', 'cap'], ['idiomas', 'Idiomas', 'lang'], ['planos', 'Planos e motivação', 'flag'],
  ['nota', 'Nota média no DUA', 'scale'], ['tenho', 'O que já tenho', 'folder'], ['aparencia', 'Aparência', 'wand'], ['conta', 'Conta e segurança', 'shield'],
];

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

// O que ainda falta no perfil (cada item aponta para a seção onde se resolve).
function pendencias(p) {
  const brasil = countryCode(p.paisResidencia) === 'BR';
  return [
    [!p.nacionalidade || !p.paisResidencia, 'País de origem e de residência', 'sobre'],
    [brasil && !p.estado, 'Estado onde mora', 'sobre'],
    [!p.formacao, 'Formação', 'formacao'],
    [!p.instituicao, 'Instituição de origem', 'formacao'],
    [!p.graduacao, 'Curso como no diploma', 'formacao'],
    [!p.espanhol, 'Nível de espanhol', 'idiomas'],
    [!p.ingles, 'Nível de inglês', 'idiomas'],
    [p.orcamentoSituacao !== 'nao-sei' && p.orcamentoDisponivel == null, 'Orçamento', 'planos'],
    [!p.porque, 'Seu porquê', 'planos'],
    [p.notaMedia == null, 'Nota média', 'nota'],
  ];
}

function scrollToSection(id) {
  const el = document.getElementById(`prf-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('input:not([type=hidden]), textarea, button')?.focus({ preventScroll: true });
}

function Hero(p) {
  const itens = pendencias(p);
  const total = itens.length;
  const faltam = itens.filter(([falta]) => falta);
  const pct = Math.round(((total - faltam.length) / total) * 100);
  const bar = h('span', { class: 'prf-meter-fill' });
  bar.style.setProperty('width', `${pct}%`);
  // "Paraíba (PB)" → "Paraíba": o nome por extenso, sem a sigla.
  const estado = p.estado ? divisionLabel(p.paisResidencia, p.estado).replace(/\s*\([A-Z]{2,3}\)$/, '') : null;
  const onde = [estado, p.paisResidencia].filter(Boolean).join(', ');
  const chips = [
    p.formacao ? [icon('cap', { size: 14 }), p.instituicao ? `${p.formacao} · ${String(p.instituicao).split(' - ')[0]}` : p.formacao] : null,
    p.espanhol ? [icon('lang', { size: 14 }), `Espanhol ${NIVEL_LABEL[p.espanhol] || p.espanhol}`] : null,
    p.ingles ? [icon('lang', { size: 14 }), `Inglês ${NIVEL_LABEL[p.ingles] || p.ingles}`] : null,
  ].filter(Boolean);
  return h('section', { class: 'prf-hero panel' },
    h('div', { class: 'prf-id' },
      h('span', { class: 'prf-avatar', 'aria-hidden': 'true' }, p.avatar || '🎓'),
      h('div', { class: 'prf-id-text' },
        h('h1', {}, p.apelido || p.nome || 'Meu perfil'),
        p.apelido && p.nome ? h('p', { class: 'muted' }, p.nome) : null,
        onde ? h('p', { class: 'prf-where' }, icon('pin', { size: 14 }), p.nacionalidade && p.nacionalidade !== p.paisResidencia ? `${p.nacionalidade} · mora em ${onde}` : `Mora em ${onde}`) : null,
        chips.length ? h('div', { class: 'prf-chips' }, chips.map((c) => h('span', { class: 'prf-chip' }, c))) : null)),
    h('div', { class: 'prf-progress' },
      h('div', { class: 'prf-progress-head' }, h('strong', {}, faltam.length ? `Perfil ${pct}% completo` : 'Perfil completo'), h('span', { class: 'muted small' }, `${total - faltam.length} de ${total}`)),
      h('span', { class: 'prf-meter', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Perfil preenchido' }, bar),
      faltam.length
        ? h('div', { class: 'prf-missing' }, h('span', { class: 'muted small' }, 'Falta:'), faltam.slice(0, 5).map(([, rotulo, sec]) => h('button', { type: 'button', class: 'prf-missing-item', onClick: () => scrollToSection(sec) }, rotulo)), faltam.length > 5 ? h('span', { class: 'muted small' }, `+${faltam.length - 5}`) : null)
        : h('p', { class: 'muted small' }, 'Tudo preenchido: a jornada usa estes dados para decidir quais missões se aplicam a você.')));
}

const Section = (id, titulo, desc, iconName, ...body) => h('section', { class: 'panel prf-section', id: `prf-${id}`, 'aria-labelledby': `prf-${id}-t` },
  h('header', { class: 'prf-section-head' },
    h('span', { class: 'prf-section-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 18 })),
    h('div', {}, h('h2', { id: `prf-${id}-t` }, titulo), desc ? h('p', { class: 'muted small' }, desc) : null)),
  ...body);

// "O que eu já tenho": corrigir as respostas do onboarding. Quem já tem um documento não refaz a missão dele.
function HavePanel() {
  const host = h('div', { class: 'stack' }, skeletonLines(4));
  api.get('/journeys/requirements').then(({ perguntas, respostas }) => {
    host.replaceChildren(h('div', { class: 'grid-2' }, perguntas.map((q) => {
      const sel = Select({
        ariaLabel: q.pergunta, value: respostas[q.id] || '', placeholder: 'Não respondi', options: q.opcoes, searchable: false,
        onChange: async (v) => {
          try { await api.put('/journeys/requirements', { respostas: { [q.id]: v } }); invalidate(); toast('Atualizado. Sua jornada foi recalculada.', 'ok'); } catch (e) { toast(e.message, 'err'); }
        },
      });
      return field(q.pergunta, sel, q.somenteNaEspanha ? 'Vale depois que você registrar a chegada à Espanha.' : null);
    })));
  }).catch(() => host.replaceChildren(h('p', { class: 'muted small' }, 'Não foi possível carregar.')));
  return Section('tenho', 'O que eu já tenho', 'Responder "Sim, já tenho" marca o requisito como já atendido, e a missão correspondente não precisa ser refeita. Salva na hora.', 'folder', host);
}

function AccountPanel() {
  const pwd = h('form', { class: 'stack' },
    h('h3', { class: 'prf-sub' }, 'Trocar senha'),
    field('Senha atual', h('input', { name: 'atual', type: 'password', autocomplete: 'current-password', required: true })),
    field('Nova senha', h('input', { name: 'nova', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }), 'Mínimo de 8 caracteres, com letras e números. As outras sessões são encerradas.'),
    h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Trocar senha'));
  pwd.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.post('/auth/change-password', Object.fromEntries(new FormData(pwd))); pwd.reset(); toast('Senha alterada. Outras sessões foram encerradas.', 'ok'); } catch (ex) { toast(ex.message, 'err'); }
  });
  const del = h('form', { class: 'stack' },
    h('p', { class: 'small' }, 'Apaga a sua conta, as jornadas e os arquivos guardados. Não dá para desfazer: baixe os seus dados antes, se quiser guardar uma cópia.'),
    field('Confirme sua senha para excluir a conta', h('input', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true })),
    h('button', { class: 'btn btn-danger', type: 'submit' }, 'Excluir minha conta e meus dados'));
  del.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.del('/me', Object.fromEntries(new FormData(del))); toast('Conta excluída.', 'ok'); await logout(); } catch (ex) { toast(ex.message, 'err'); }
  });
  const acao = (iconName, titulo, desc, control) => h('div', { class: 'prf-action' },
    h('span', { class: 'prf-action-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 16 })),
    h('div', { class: 'prf-action-text' }, h('strong', {}, titulo), h('span', { class: 'muted small' }, desc)), control);
  return Section('conta', 'Conta e segurança', null, 'shield',
    h('div', { class: 'prf-account' }, pwd,
      h('div', { class: 'prf-actions' },
        h('h3', { class: 'prf-sub' }, 'Seus dados e sessões'),
        acao('file', 'Baixar meus dados', 'Arquivo JSON com tudo o que a Estuvia guarda sobre você.', h('a', { class: 'btn btn-ghost btn-sm', href: '/api/me/export', download: 'meus-dados.json' }, 'Baixar')),
        acao('lock', 'Sair de todos os dispositivos', 'Encerra as sessões abertas em outros navegadores.', h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => { await api.post('/auth/logout-all'); await logout(); } }, 'Sair de todos')),
        acao('arrow', 'Sair desta conta', 'Só neste navegador.', h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: logout }, 'Sair')))),
    h('details', { class: 'danger-zone prf-danger' }, h('summary', {}, 'Excluir minha conta'), del));
}

export function profileView() {
  const p = state.me.user.profile;
  let dirty = false;
  const saved = { cor: p.cor || 'turquesa', tema: p.tema === 'claro' ? 'claro' : 'escuro' };

  // ---- Aparência: avatar, cor e tema com pré-visualização imediata (só fica valendo ao salvar). ----
  let avatar = p.avatar || '🎓';
  const corInput = h('input', { type: 'hidden', name: 'cor', value: saved.cor });
  const temaInput = h('input', { type: 'hidden', name: 'tema', value: saved.tema });
  const preview = () => {
    document.documentElement.dataset.accent = corInput.value;
    document.documentElement.dataset.theme = temaInput.value === 'claro' ? 'light' : 'dark';
  };
  const radioGroup = (cls, label, options, current, onPick, render) => {
    const group = h('div', { class: cls, role: 'radiogroup', 'aria-label': label });
    group.append(...options.map(([v, l]) => {
      const b = h('button', { type: 'button', class: `${cls}-opt`, role: 'radio', 'aria-checked': String(v === current), 'aria-label': l, title: l, dataset: { v } }, render(v, l));
      b.addEventListener('click', () => {
        group.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        onPick(v);
        markDirty();
      });
      return b;
    }));
    return group;
  };
  const avatarPicker = radioGroup('prf-avatars', 'Escolha seu avatar', AVATARS.map((a) => [a, a]), avatar, (v) => { avatar = v; }, (v) => v);
  const swatches = radioGroup('prf-swatches', 'Cor de destaque', CORES, saved.cor, (v) => { corInput.value = v; preview(); },
    (v, l) => [h('span', { class: `prf-dot prf-dot-${v}`, 'aria-hidden': 'true' }), h('span', {}, l)]);
  const temas = radioGroup('prf-seg', 'Tema', [['escuro', 'Escuro'], ['claro', 'Claro']], saved.tema, (v) => { temaInput.value = v; preview(); },
    (v, l) => [icon(v === 'claro' ? 'sun' : 'moon', { size: 15 }), h('span', {}, l)]);

  const inp = (name, attrs = {}) => h('input', { name, value: p[name] ?? '', ...attrs });

  // Divisão administrativa depende do país (estado no Brasil, província na Espanha...); sem lista, sem campo.
  const divisionHost = h('div', { class: 'field-slot' });
  const paintDivision = (country, value) => {
    const d = divisionsFor(country);
    divisionHost.replaceChildren(d
      ? field(d.rotulo, Select({ name: 'estado', value, options: d.options, searchable: true, placeholder: 'Selecione', ariaLabel: d.rotulo }), countryCode(country) === 'BR' ? 'Define o consulado que atende o seu visto.' : null)
      : h('input', { type: 'hidden', name: 'estado', value: '' }));
  };
  paintDivision(p.paisResidencia || '', p.estado || '');

  // Nível do certificado só aparece quando há certificado.
  const certNivelHost = h('div', { class: 'field-slot' });
  const paintCertNivel = (cert) => {
    certNivelHost.replaceChildren(cert && cert !== 'nenhum'
      ? field('Nível do certificado', Select({ name: 'certificadoNivel', value: p.certificadoNivel || '', options: CERT_NIVEIS, searchable: false, placeholder: 'Selecione', ariaLabel: 'Nível do certificado' }))
      : h('input', { type: 'hidden', name: 'certificadoNivel', value: '' }));
  };
  paintCertNivel(p.certificadoEspanhol || '');

  const budgetUnknown = h('input', { type: 'checkbox', checked: p.orcamentoSituacao === 'nao-sei' });
  const budget = inp('orcamentoDisponivel', { type: 'number', min: 0, step: 100, inputmode: 'numeric', placeholder: 'Ex.: 12000', disabled: p.orcamentoSituacao === 'nao-sei' });
  budgetUnknown.addEventListener('change', () => { budget.disabled = budgetUnknown.checked; if (budgetUnknown.checked) budget.value = ''; });
  const porque = h('textarea', { name: 'porque', rows: 4, maxlength: 400, placeholder: 'Ex.: Quero me especializar em inteligência artificial e trabalhar com pesquisa na Europa.' }, p.porque || '');
  const contador = h('span', { class: 'prf-count muted small' });
  const conta = () => { contador.textContent = `${porque.value.length}/400`; };
  porque.addEventListener('input', conta);
  conta();

  const sobre = Section('sobre', 'Sobre mim', 'O país e o estado onde você mora definem o consulado e as regras que valem para você.', 'user',
    h('div', { class: 'grid-2' },
      field('Nome completo', inp('nome', { maxlength: 60, required: true, autocomplete: 'name' }), 'Como no passaporte.'),
      field('Como gosta de ser chamado(a)', inp('apelido', { maxlength: 30, placeholder: 'Ex.: João' })),
      field('Nacionalidade', Select({ name: 'nacionalidade', value: countryCode(p.nacionalidade) ? countryName(countryCode(p.nacionalidade)) : (p.nacionalidade || ''), options: countryOptions(), searchable: true, placeholder: 'Selecione o país', ariaLabel: 'Nacionalidade' })),
      field('País de residência', Select({ name: 'paisResidencia', value: p.paisResidencia || '', options: countryOptions(), searchable: true, placeholder: 'Selecione o país', ariaLabel: 'País de residência', onChange: (v) => paintDivision(v, '') })),
      divisionHost));

  const formacao = Section('formacao', 'Formação', 'A sua graduação é comparada com as graduações que cada máster aceita.', 'cap',
    h('div', { class: 'grid-2' },
      field('Área da graduação', Select({ name: 'formacao', value: p.formacao || '', options: FORMACOES.map((f) => ({ value: f.value, label: f.value })), searchable: true, placeholder: 'Selecione', ariaLabel: 'Área da graduação' })),
      field('Instituição de origem', suggest('instituicao', p.instituicao, INSTITUTIONS.map((i) => i.value), { maxlength: 120, placeholder: 'Busque pela sigla ou escreva o nome' })),
      field('Curso, como está no diploma', suggest('graduacao', p.graduacao, Object.values(AREAS).flat(), { maxlength: 120, placeholder: p.formacao ? `Ex.: ${p.formacao}` : 'Ex.: Biologia' }), 'A Missão 1.4 compara este nome com as graduações aceitas pelo máster.'),
      field('Área de interesse do mestrado', suggest('area', p.area, Object.values(AREAS).flat(), { maxlength: 80, placeholder: 'Ex.: Inteligência artificial' }))));

  const idiomas = Section('idiomas', 'Idiomas', 'Muitos másteres exigem espanhol B1 ou B2 com certificado. Sem certificado, o nível que você informar é só uma declaração.', 'lang',
    h('div', { class: 'prf-lang' },
      h('div', { class: 'prf-lang-card' }, h('h3', { class: 'prf-sub' }, 'Espanhol'),
        field('Meu nível', Select({ name: 'espanhol', value: p.espanhol || '', options: NIVEIS, searchable: false, placeholder: 'Selecione', ariaLabel: 'Nível de espanhol' })),
        field('Certificado', Select({ name: 'certificadoEspanhol', value: p.certificadoEspanhol || '', options: CERTS, searchable: false, placeholder: 'Selecione', ariaLabel: 'Certificado de espanhol', onChange: (v) => paintCertNivel(v) })),
        certNivelHost),
      h('div', { class: 'prf-lang-card' }, h('h3', { class: 'prf-sub' }, 'Inglês'),
        field('Meu nível', Select({ name: 'ingles', value: p.ingles || '', options: NIVEIS, searchable: false, placeholder: 'Selecione', ariaLabel: 'Nível de inglês' })))));

  const planos = Section('planos', 'Planos e motivação', 'Vale como lembrete para você e dá contexto ao Mentor. O orçamento é só uma referência: não conta como recurso comprovado para o visto.', 'flag',
    h('div', { class: 'grid-2' },
      field('Orçamento disponível (€, aproximado)', h('div', { class: 'stack-sm' }, budget, h('label', { class: 'check' }, budgetUnknown, h('span', {}, 'Ainda não sei meu orçamento')))),
      field('Meta pessoal', inp('metaPessoal', { maxlength: 200, placeholder: 'Ex.: Estar em Granada em setembro de 2027' }))),
    h('label', { class: 'field' }, h('span', { class: 'field-label prf-label-row' }, 'Por que você quer fazer esse mestrado?', contador), porque));

  const aparencia = Section('aparencia', 'Aparência', 'A pré-visualização é imediata; fica valendo quando você salva.', 'wand',
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Avatar'), avatarPicker),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Cor de destaque'), swatches),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tema'), temas),
    corInput, temaInput);

  // ---- Barra de salvar: aparece só com alterações pendentes. ----
  const saveBtn = h('button', { class: 'btn btn-cta', type: 'submit' }, icon('check', { size: 16 }), 'Salvar alterações');
  const savebar = h('div', { class: 'prf-savebar', role: 'region', 'aria-label': 'Alterações não salvas', hidden: true },
    h('span', { class: 'prf-savebar-text' }, h('span', { class: 'prf-savebar-dot', 'aria-hidden': 'true' }), 'Você tem alterações não salvas'),
    h('div', { class: 'prf-savebar-btns' },
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => discard() }, 'Descartar'),
      saveBtn));
  function markDirty() {
    if (dirty) return;
    dirty = true;
    savebar.hidden = false;
  }

  const form = h('form', { class: 'stack-lg prf-form', novalidate: false }, sobre, formacao, idiomas, planos, aparencia, savebar);
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  const heroHost = h('div', {}, Hero(p));

  // Sair da página sem salvar: volta à aparência salva (a pré-visualização não fica presa).
  const onLeave = () => {
    window.removeEventListener('hashchange', onLeave);
    if (dirty) setMe({});
  };
  window.addEventListener('hashchange', onLeave);

  function discard() {
    dirty = false;
    setMe({});
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const body = { avatar };
    for (const [k, v] of new FormData(form)) body[k] = k === 'orcamentoDisponivel' ? (v === '' ? null : Number(v)) : String(v).trim();
    if (!body.certificadoNivel || body.certificadoEspanhol === 'nenhum') body.certificadoNivel = '';
    // Escolhas vazias não são enviadas (o servidor só aceita valores da lista).
    for (const k of ['espanhol', 'ingles', 'certificadoEspanhol']) if (!body[k]) delete body[k];
    if (budgetUnknown.checked) Object.assign(body, { orcamentoSituacao: 'nao-sei', orcamentoDisponivel: null });
    else if (typeof body.orcamentoDisponivel === 'number') body.orcamentoSituacao = 'informado';
    saveBtn.disabled = true;
    try {
      const me = await api.put('/me/profile', body);
      setMe(me);
      dirty = false;
      savebar.hidden = true;
      heroHost.replaceChildren(Hero(me.user.profile));
      toast('Perfil salvo. Sua jornada foi recalculada.', 'ok');
    } catch (ex) { toast(ex.message, 'err'); } finally { saveBtn.disabled = false; }
  });

  // ---- Navegação por seções (lateral no computador, faixa rolável no celular). ----
  const navBtns = new Map();
  const nav = h('nav', { class: 'prf-nav', 'aria-label': 'Seções do perfil' },
    SECOES.map(([id, rotulo, ic]) => {
      const b = h('button', { type: 'button', class: 'prf-nav-item', onClick: () => scrollToSection(id) }, icon(ic, { size: 16 }), h('span', {}, rotulo));
      navBtns.set(`prf-${id}`, b);
      return b;
    }));
  const content = h('div', { class: 'prf-content stack-lg' },
    form,
    Section('nota', 'Minha nota média no DUA', 'Muitos másteres selecionam pela nota média do histórico. Veja quanto a sua média vale na escala espanhola (0 a 10). Tem um botão de salvar próprio.', 'scale', GradeCalculator()),
    HavePanel(),
    AccountPanel());

  // Destaca no menu a seção que está na tela.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        navBtns.forEach((b, id) => b.classList.toggle('active', id === en.target.id));
        const ativo = navBtns.get(en.target.id);
        if (ativo && nav.scrollWidth > nav.clientWidth) ativo.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    }, { rootMargin: '-30% 0px -60% 0px' });
    requestAnimationFrame(() => content.querySelectorAll('.prf-section').forEach((s) => io.observe(s)));
  }

  return h('div', { class: 'prf-page stack-lg' },
    h('header', { class: 'prf-top' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Meu perfil'), h('p', { class: 'muted' }, 'Seus dados definem quais missões se aplicam a você. Mantenha tudo atualizado: a jornada é recalculada sempre que você salva.')),
      h('a', { class: 'prf-mission', href: '#/jornadas' }, icon('map', { size: 14 }), 'Missão 1.1 da jornada')),
    heroHost,
    h('div', { class: 'prf-layout' }, nav, content));
}
