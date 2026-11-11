// Autenticação: login, cadastro e recuperação de senha. Telas em "modo foco" (sem menu lateral nem
// Mentor: ver isFocusPath em app.js), com o mesmo esqueleto visual entre si.
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { refreshMe, go, state } from '../app.js';
import { languageSwitcher } from '../i18n.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- Peças compartilhadas ----------

function shell({ title, subtitle, tabs = null, body, foot = null, aside = true }) {
  return h('div', { class: `auth-shell${aside ? '' : ' no-aside'}` },
    h('header', { class: 'flow-top' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Estuvia, início' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', {}, state.app?.nome || 'Estuvia')),
      languageSwitcher({ compact: true })),
    h('div', { class: 'auth-grid' },
      aside ? h('aside', { class: 'auth-aside', 'aria-hidden': 'true' },
        h('p', { class: 'eyebrow' }, 'Mestrado na Espanha'),
        h('p', { class: 'auth-aside-title' }, 'Do primeiro passo à chegada, com um plano feito para você.'),
        h('ul', { class: 'auth-points' },
          h('li', {}, icon('map', { size: 18 }), h('span', {}, 'Rodadas e missões montadas a partir do seu perfil')),
          h('li', {}, icon('calendar', { size: 18 }), h('span', {}, 'Prazos oficiais e lembretes no lugar certo')),
          h('li', {}, icon('shield', { size: 18 }), h('span', {}, 'Seus dados protegidos e exportáveis a qualquer momento')))) : null,
      h('section', { class: 'auth-card' },
        tabs,
        h('h1', {}, title),
        subtitle ? h('p', { class: 'auth-sub' }, subtitle) : null,
        body,
        foot)));
}

function tabs(active) {
  const tab = (href, label, key) => h('a', { href, class: `auth-tab${active === key ? ' is-active' : ''}`, 'aria-current': active === key ? 'page' : null }, label);
  return h('nav', { class: 'auth-tabs', 'aria-label': 'Acesso' }, tab('#/entrar', 'Entrar', 'login'), tab('#/cadastro', 'Criar conta', 'register'));
}

function errorBox() {
  return h('div', { class: 'auth-error', role: 'alert', hidden: true });
}
function showError(box, message) {
  box.replaceChildren(icon('alert', { size: 16 }), h('span', {}, message));
  box.hidden = false;
}

// Campo com rótulo, mensagem de erro própria e (para senha) botão de mostrar/ocultar.
function input(label, attrs, hint) {
  const el = h('input', { class: 'auth-input', ...attrs, id: `auth-${attrs.name}` });
  const err = h('small', { class: 'field-error', id: `auth-${attrs.name}-err`, hidden: true });
  let control = el;
  if (attrs.type === 'password') {
    const eye = h('button', { type: 'button', class: 'auth-eye', 'aria-label': 'Mostrar senha', 'aria-pressed': 'false' }, h('span', {}, 'Mostrar'));
    eye.addEventListener('click', () => {
      const show = el.type === 'password';
      el.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      eye.lastChild.textContent = show ? 'Ocultar' : 'Mostrar';
    });
    control = h('div', { class: 'auth-pass' }, el, eye);
  }
  const wrap = h('div', { class: 'field' }, h('label', { class: 'field-label', for: el.id }, label), control, hint ? h('small', { class: 'hint' }, hint) : null, err);
  wrap.setError = (msg) => {
    err.textContent = msg || '';
    err.hidden = !msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) el.setAttribute('aria-describedby', err.id); else el.removeAttribute('aria-describedby');
    wrap.classList.toggle('is-invalid', Boolean(msg));
  };
  el.addEventListener('input', () => wrap.setError(''));
  wrap.input = el;
  return wrap;
}

function submitButton(label) {
  return h('button', { class: 'btn btn-cta btn-lg btn-block auth-submit', type: 'submit' }, h('span', { class: 'btn-spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, label));
}
async function busy(btn, fn) {
  btn.disabled = true;
  btn.classList.add('is-loading');
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
  }
}

const checkEmail = (f) => {
  const v = f.input.value.trim();
  if (!v) return f.setError('Informe seu e-mail.'), false;
  if (!EMAIL_RE.test(v)) return f.setError('Esse e-mail não parece válido.'), false;
  return true;
};
const checkPassword = (f, { strong = false } = {}) => {
  const v = f.input.value;
  if (!v) return f.setError('Informe sua senha.'), false;
  if (strong && (v.length < 8 || !/[a-zA-Z]/.test(v) || !/\d/.test(v))) return f.setError('Use pelo menos 8 caracteres, com letras e números.'), false;
  return true;
};

// ---------- Telas ----------

export function loginView() {
  const err = errorBox();
  const email = input('E-mail', { name: 'email', type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const senha = input('Senha', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true });
  const btn = submitButton('Entrar');
  const form = h('form', { class: 'auth-form', novalidate: true },
    email, senha,
    h('div', { class: 'auth-row' }, h('a', { href: '#/esqueci-senha', class: 'auth-link' }, 'Esqueci minha senha')),
    err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const ok = [checkEmail(email), checkPassword(senha)];
    if (ok.includes(false)) return form.querySelector('[aria-invalid="true"]')?.focus();
    await busy(btn, async () => {
      try {
        await api.post('/auth/login', { email: email.input.value.trim(), senha: senha.input.value });
        await refreshMe();
        toast(`Oi de novo, ${state.me.user.profile.apelido}.`, 'ok');
        go(state.me.user.profile.onboardingConcluido ? '/' : '/jornadas/nova');
      } catch (ex) { showError(err, ex.message); }
    });
  });
  queueMicrotask(() => email.input.focus());
  return shell({
    tabs: tabs('login'),
    title: 'Bem-vindo de volta',
    subtitle: 'Sua jornada continua exatamente de onde você parou.',
    body: form,
    foot: h('p', { class: 'auth-foot' }, 'Ainda não tem conta? ', h('a', { href: '#/cadastro' }, 'Crie a sua grátis')),
  });
}

export function registerView() {
  const err = errorBox();
  const nome = input('Como quer ser chamado(a)?', { name: 'nome', autocomplete: 'given-name', required: true, maxlength: 60 });
  const email = input('E-mail', { name: 'email', type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const senha = input('Senha', { name: 'senha', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }, 'Mínimo de 8 caracteres, com letras e números.');
  const aceite = h('input', { type: 'checkbox', name: 'aceite', id: 'auth-aceite' });
  const aceiteErr = h('small', { class: 'field-error', hidden: true }, 'Para criar a conta, aceite os Termos e a Política de Privacidade.');
  aceite.addEventListener('change', () => { aceiteErr.hidden = true; });
  const btn = submitButton('Criar conta e começar');
  const form = h('form', { class: 'auth-form', novalidate: true },
    nome, email, senha,
    h('div', { class: 'auth-consent' },
      h('label', { class: 'check', for: 'auth-aceite' }, aceite,
        h('span', {}, 'Li e aceito os ', h('a', { href: '#/termos', target: '_blank', rel: 'noopener' }, 'Termos de Uso'), ' e a ', h('a', { href: '#/privacidade', target: '_blank', rel: 'noopener' }, 'Política de Privacidade'), '. A Estuvia orienta, mas não substitui os sistemas oficiais.')),
      aceiteErr),
    err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const n = nome.input.value.trim();
    const ok = [n.length >= 2 || (nome.setError('Informe como quer ser chamado(a), com pelo menos 2 letras.'), false), checkEmail(email), checkPassword(senha, { strong: true })];
    if (!aceite.checked) { aceiteErr.hidden = false; ok.push(false); }
    if (ok.includes(false)) return (form.querySelector('[aria-invalid="true"]') || aceite).focus();
    await busy(btn, async () => {
      try {
        await api.post('/auth/register', { nome: n, email: email.input.value.trim(), senha: senha.input.value, aceite: true });
        await refreshMe();
        toast('Conta criada. Agora vamos montar a sua jornada.', 'ok');
        go('/jornadas/nova');
      } catch (ex) { showError(err, ex.message); }
    });
  });
  queueMicrotask(() => nome.input.focus());
  return shell({
    tabs: tabs('register'),
    title: 'Comece sua jornada',
    subtitle: 'Grátis. Leva 1 minuto e você não precisa enviar nenhum documento.',
    body: form,
    foot: h('p', { class: 'auth-foot' }, 'Já tem conta? ', h('a', { href: '#/entrar' }, 'Entrar')),
  });
}

// Recuperação de senha: pede o e-mail; o link enviado abre #/redefinir-senha/<token>.
export function forgotPasswordView() {
  const err = errorBox();
  const done = h('div', { class: 'auth-ok', role: 'status', hidden: true });
  const email = input('E-mail da sua conta', { name: 'email', type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const btn = submitButton('Enviar link');
  const form = h('form', { class: 'auth-form', novalidate: true }, email, err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!checkEmail(email)) return email.input.focus();
    await busy(btn, async () => {
      try {
        const r = await api.post('/auth/forgot-password', { email: email.input.value.trim() });
        done.replaceChildren(icon('check', { size: 16 }), h('span', {}, r.message));
        done.hidden = false;
        form.hidden = true;
      } catch (ex) { showError(err, ex.message); }
    });
  });
  return shell({
    aside: false,
    title: 'Esqueci minha senha',
    subtitle: 'Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.',
    body: h('div', {}, form, done),
    foot: h('p', { class: 'auth-foot' }, h('a', { href: '#/entrar' }, '← Voltar para o login')),
  });
}

export function resetPasswordView(token) {
  const err = errorBox();
  const senha = input('Nova senha', { name: 'senha', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }, 'Mínimo de 8 caracteres, com letras e números.');
  const btn = submitButton('Salvar nova senha');
  const form = h('form', { class: 'auth-form', novalidate: true }, senha, err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!checkPassword(senha, { strong: true })) return senha.input.focus();
    await busy(btn, async () => {
      try {
        await api.post('/auth/reset-password', { token, senha: senha.input.value });
        toast('Senha alterada. Entre com a nova senha.', 'ok');
        go('/entrar');
      } catch (ex) { showError(err, ex.message); }
    });
  });
  return shell({
    aside: false,
    title: 'Criar nova senha',
    subtitle: 'Por segurança, você sairá de todos os dispositivos depois da troca.',
    body: form,
  });
}
