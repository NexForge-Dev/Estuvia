import { h, field, formData, toast } from '../ui.js';
import { api } from '../api.js';
import { refreshMe, go, state } from '../app.js';

function errorBox() {
  return h('p', { class: 'form-error', role: 'alert', hidden: true });
}

function showError(box, message) {
  box.textContent = message;
  box.hidden = false;
}

export function loginView() {
  const err = errorBox();
  const form = h('form', { class: 'stack', novalidate: true },
    field('E-mail', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true })),
    field('Senha', h('input', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true })),
    err,
    h('button', { class: 'btn btn-lg', type: 'submit' }, 'Entrar'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api.post('/auth/login', formData(form));
      await refreshMe();
      toast(`Oi de novo, ${state.me.user.profile.apelido}.`, 'ok');
      go('/');
    } catch (ex) {
      showError(err, ex.message);
    } finally {
      btn.disabled = false;
    }
  });

  return h('section', { class: 'auth card' },
    h('h1', {}, 'Bem-vindo(a) de volta'),
    h('p', { class: 'muted' }, 'Sua jornada está te esperando exatamente onde você parou.'),
    form,
    h('p', {}, h('a', { href: '#/esqueci-senha' }, 'Esqueci minha senha')),
    h('p', {}, 'Ainda não tem conta? ', h('a', { href: '#/cadastro' }, 'Crie a sua grátis')),
  );
}

export function registerView() {
  const err = errorBox();
  const form = h('form', { class: 'stack', novalidate: true },
    field('Como quer ser chamado(a)?', h('input', { name: 'nome', autocomplete: 'name', required: true, maxlength: 60 })),
    field('E-mail', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true })),
    field('Senha', h('input', { name: 'senha', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }),
      'Mínimo de 8 caracteres, com letras e números.'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', name: 'aceite', required: true }),
      h('span', {}, 'Li e aceito os ', h('a', { href: '#/termos', target: '_blank', rel: 'noopener' }, 'Termos de Uso'), ' e a ', h('a', { href: '#/privacidade', target: '_blank', rel: 'noopener' }, 'Política de Privacidade'), '. Entendo que a plataforma orienta, mas não substitui os sistemas oficiais (você pode exportar ou excluir seus dados quando quiser).'),
    ),
    err,
    h('button', { class: 'btn btn-lg', type: 'submit' }, 'Criar conta e começar'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(form);
    data.aceite = form.aceite.checked;
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api.post('/auth/register', data);
      await refreshMe();
      toast('Conta criada. Sua jornada já está pronta.', 'ok');
      go('/jornadas/nova');
    } catch (ex) {
      showError(err, ex.message);
    } finally {
      btn.disabled = false;
    }
  });

  return h('section', { class: 'auth card' },
    h('h1', {}, 'Comece sua jornada'),
    h('p', { class: 'muted' }, 'Grátis. Leva 1 minuto. Você não precisa enviar nenhum documento.'),
    form,
    h('p', {}, 'Já tem conta? ', h('a', { href: '#/entrar' }, 'Entrar')),
  );
}

// Recuperação de senha: pede o e-mail; o link enviado abre #/redefinir-senha/<token>.
export function forgotPasswordView() {
  const err = errorBox();
  const done = h('p', { class: 'form-ok', role: 'status', hidden: true });
  const form = h('form', { class: 'stack', novalidate: true },
    field('E-mail da sua conta', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true })),
    err,
    h('button', { class: 'btn btn-lg', type: 'submit' }, 'Enviar link'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    err.hidden = true;
    try {
      const r = await api.post('/auth/forgot-password', formData(form));
      done.textContent = r.message;
      done.hidden = false;
      form.hidden = true;
    } catch (ex) {
      showError(err, ex.message);
    } finally {
      btn.disabled = false;
    }
  });
  return h('section', { class: 'auth card' },
    h('h1', {}, 'Esqueci minha senha'),
    h('p', { class: 'muted' }, 'Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.'),
    form, done,
    h('p', {}, h('a', { href: '#/entrar' }, 'Voltar para o login')),
  );
}

export function resetPasswordView(token) {
  const err = errorBox();
  const form = h('form', { class: 'stack', novalidate: true },
    field('Nova senha', h('input', { name: 'senha', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }),
      'Mínimo de 8 caracteres, com letras e números.'),
    err,
    h('button', { class: 'btn btn-lg', type: 'submit' }, 'Salvar nova senha'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api.post('/auth/reset-password', { token, senha: form.senha.value });
      toast('Senha alterada. Entre com a nova senha.', 'ok');
      go('/entrar');
    } catch (ex) {
      showError(err, ex.message);
    } finally {
      btn.disabled = false;
    }
  });
  return h('section', { class: 'auth card' },
    h('h1', {}, 'Criar nova senha'),
    h('p', { class: 'muted' }, 'Por segurança, você sairá de todos os dispositivos depois da troca.'),
    form,
  );
}
