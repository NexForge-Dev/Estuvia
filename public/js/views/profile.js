// Meu perfil (UserProfile): personalização, perfil acadêmico (Missão 1.1), segurança e privacidade.
import { h, field, select, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe, logout, invalidate } from '../app.js';

const AVATARS = ['🎓', '🚀', '🌍', '📚', '🦉', '🌻', '⚡', '🧉', '🎒', '🐢'];
const CORES = [['turquesa', 'Turquesa (Estuvia)'], ['azul', 'Azul'], ['verde', 'Verde'], ['roxo', 'Roxo'], ['laranja', 'Laranja'], ['rosa', 'Rosa']];
const NIVEIS = ['nenhum', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'nativo'].map((n) => [n, n === 'nenhum' ? 'Nenhum' : n === 'nativo' ? 'Nativo' : n]);
const ESTADOS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// "O que eu já tenho": corrigir as respostas do onboarding. Quem já tem um documento não refaz a missão dele.
function HavePanel() {
  const host = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Carregando…'));
  api.get('/journeys/requirements').then(({ perguntas, respostas }) => {
    host.replaceChildren(...perguntas.map((q) => {
      const sel = h('select', { 'aria-label': q.pergunta }, h('option', { value: '' }, 'Não respondi'), q.opcoes.map(([v, l]) => h('option', { value: v, selected: respostas[q.id] === v }, l)));
      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        try { await api.put('/journeys/requirements', { respostas: { [q.id]: sel.value } }); invalidate(); toast('Atualizado. Sua jornada foi recalculada.', 'ok'); } catch (e) { toast(e.message, 'err'); }
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

  const form = h('form', { class: 'stack' },
    h('h2', {}, 'Quem é você'),
    h('div', { class: 'grid-2' }, field('Nome', inp('nome', { maxlength: 60, required: true })), field('Como gosta de ser chamado(a)', inp('apelido', { maxlength: 30 }))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Avatar'), picker),
    h('div', { class: 'grid-2' }, field('Cor de destaque', select('cor', CORES, p.cor || 'turquesa')), field('Tema', select('tema', [['escuro', 'Escuro'], ['claro', 'Claro']], p.tema === 'claro' ? 'claro' : 'escuro'))),
    h('h2', {}, 'Perfil acadêmico'),
    h('div', { class: 'grid-2' },
      field('Nacionalidade', inp('nacionalidade', { maxlength: 40 })),
      field('País de residência', inp('paisResidencia', { maxlength: 40 })),
      field('Estado (se no Brasil)', select('estado', ESTADOS.map((e) => [e, e || 'Selecione']), p.estado || ''), 'Define o consulado do seu visto.'),
      field('Graduação', inp('formacao', { maxlength: 120 })),
      field('Instituição de origem', inp('instituicao', { maxlength: 120 })),
      field('Área de interesse', inp('area', { maxlength: 80 })),
      field('Espanhol', select('espanhol', NIVEIS, p.espanhol || 'nenhum')),
      field('Certificado de espanhol', select('certificadoEspanhol', [['nenhum', 'Não tenho'], ['DELE', 'DELE'], ['SIELE', 'SIELE'], ['outro', 'Outro']], p.certificadoEspanhol || 'nenhum')),
      field('Nível do certificado', select('certificadoNivel', [['', '-'], ...NIVEIS.slice(1)], p.certificadoNivel || '')),
      field('Inglês', select('ingles', NIVEIS, p.ingles || 'nenhum')),
      field('Orçamento disponível (€, aproximado)', inp('orcamentoDisponivel', { type: 'number', min: 0, step: 100 }))),
    h('h2', {}, 'Seu porquê'),
    field('Por que você quer fazer esse mestrado?', h('textarea', { name: 'porque', rows: 3, maxlength: 400 }, p.porque || '')),
    field('Meta pessoal', inp('metaPessoal', { maxlength: 200, placeholder: 'Ex.: Estar em Granada em setembro de 2027' })),
    h('button', { class: 'btn btn-cta btn-lg', type: 'submit' }, 'Salvar perfil'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { avatar };
    for (const [k, v] of new FormData(form)) body[k] = k === 'orcamentoDisponivel' ? (v === '' ? null : Number(v)) : String(v).trim();
    if (!body.certificadoNivel) body.certificadoNivel = '';
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
    HavePanel(),
    h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, icon('shield', { size: 18 }), 'Segurança e privacidade'),
      h('div', { class: 'grid-2' }, pwd, h('div', { class: 'stack' },
        h('a', { class: 'btn btn-ghost', href: '/api/me/export', download: 'meus-dados.json' }, 'Baixar meus dados (JSON)'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: async () => { await api.post('/auth/logout-all'); await logout(); } }, 'Sair de todos os dispositivos'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: logout }, 'Sair'))),
      h('details', { class: 'danger-zone' }, h('summary', {}, 'Zona de perigo'), del)),
  );
}
