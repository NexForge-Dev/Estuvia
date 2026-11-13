// Página pública: o que é a Estuvia, como funciona e o que ela faz (e o que não faz).
// Interativa: vídeo de apresentação, missões jogáveis no topo, quiz "onde você está", mapa clicável e demonstração do Mentor. O quiz pré-preenche o onboarding (localStorage 'estuvia:quiz').
// Ocupa a tela inteira (body.landing-mode esconde a lateral do app; ver app.js e css/landing.css).
import { h, tag } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state } from '../app.js';
import { languageSwitcher } from '../i18n.js';

export const QUIZ_KEY = 'estuvia:quiz';

const FEATURES = [
  ['map', 'Jornada visual', 'Rodadas em cards e uma trilha de missões em zigue-zague, com dependências reais e trilhas paralelas.'],
  ['target', 'Missões executáveis', 'Cada missão é uma central: o que fazer numa frase, guia, documentos, prazos, link oficial e confirmação.'],
  ['calendar', 'Agenda', 'Encaixa as missões na sua semana com as missões certas, respeita seus horários e replaneja quando algo muda.'],
  ['euro', 'Planejador financeiro', 'Separa o custo de preparar, o de morar lá e o que o visto exige comprovar. Mostra se o plano fecha.'],
  ['file', 'Documentos', 'Minha pasta com arquivos cifrados, carteira por etapa, status, validade e o que falta para cada envio.'],
  ['cap', 'Mestrados', 'Catálogo com filtros por cidade, área e duração, requisitos e até 6 opções salvas para comparar.'],
  ['home2', 'Meu novo lar', 'Compare moradias, confira antes de pagar com o checklist antifraude e ligue a escolha ao orçamento.'],
  ['plane', 'Minha viagem', 'Rotas cotadas pelo custo total, itinerário e uma chegada planejada passo a passo.'],
  ['chat', 'Mentor', 'Conhece sua jornada, prazos e finanças. Cita fontes, não inventa requisitos e pede confirmação antes de agir.'],
  ['globe', 'Radar de oportunidades', 'Acompanha fontes oficiais e avisa quando saem novas datas, editais e convocatórias.'],
  ['users', 'Comunidade', 'Pergunte a quem já passou pelo processo, num espaço moderado e focado na sua etapa.'],
  ['trophy', 'Conquistas', 'Marcos e conquistas que mostram o quanto você já avançou, para manter o ritmo até o fim.'],
];

const FAQ = [
  ['A Estuvia faz a candidatura por mim?', 'Não. A Estuvia orienta e organiza: mostra o que fazer, quando e com quais documentos. A candidatura no DUA, a matrícula, o visto e os demais pedidos oficiais são feitos por você nos sistemas competentes, com o link oficial ao lado.'],
  ['Para quem é a plataforma?', 'Para brasileiros que querem cursar um Máster Universitario oficial na Espanha. A primeira jornada completa é a da Andaluzia (Distrito Único Andaluz), começando pela Universidad de Granada.'],
  ['Preciso já saber qual mestrado quero?', 'Não. A Rodada 1 existe justamente para isso: explorar universidades, comparar programas e verificar se você atende aos requisitos antes de gastar com documentos.'],
  ['E se eu não tiver dinheiro guardado?', 'Você começa do mesmo jeito. A trilha "Como vou financiar meus estudos?" roda desde a Rodada 1: mostra quanto o projeto custa, quanto o visto exige comprovar, bolsas e caminhos alternativos. Sem promessas: só números com fonte.'],
  ['As informações são confiáveis?', 'Cada regra tem um selo: verificada em norma ou página oficial (com data de revisão), prática de quem já passou, estimativa com premissas explícitas ou pendente de confirmação. A Central de fontes reúne tudo.'],
  ['O Mentor pode errar?', 'O Mentor responde com base na sua jornada e nas fontes da plataforma, cita de onde tirou cada informação e nunca executa uma ação sem a sua confirmação. Para decisões oficiais, confirme sempre na fonte indicada.'],
  ['Meus documentos ficam seguros?', 'Os arquivos da Minha pasta ficam cifrados no servidor e só abrem pela sua conta, com links que expiram. Guardar um documento na Estuvia não é validação oficial: universidade e consulado conferem os originais.'],
];

// Etapa declarada → rodada em que a jornada começa (mesma ordem de content/rounds.js).
const STAGE_ROUND = { inicio: 1, 'mestrado-escolhido': 2, 'documentos-prontos': 3, 'candidatura-enviada': 3, admitido: 4, matriculado: 5, 'visto-aprovado': 6, 'na-espanha': 7 };

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(QUIZ_KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(QUIZ_KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } },
};

export async function landingView() {
  const logged = Boolean(state.me);
  const all = state.content.rounds;
  const rounds = all.filter((r) => !r.transversal);
  const transversal = all.find((r) => r.transversal);
  const appName = state.app?.nome || 'Estuvia';
  const facts = await api.get('/content/landing').catch(() => null);

  // Função, não elemento: o mesmo botão aparece em vários pontos da página.
  const primary = (label = 'Começar minha jornada') => (logged
    ? h('a', { href: '#/', class: 'btn btn-cta btn-lg' }, 'Ir para o meu painel', icon('arrow', { size: 16 }))
    : h('a', { href: '#/cadastro', class: 'btn btn-cta btn-lg' }, label, icon('arrow', { size: 16 })));

  const root = h('div', { class: 'lp' },
    nav(logged, appName),
    hero(primary, logged),
    stats(rounds.length),
    videoSection(primary),
    quiz(rounds, facts, logged),
    journeyMap(rounds, transversal),
    beforeAfter(),
    mentorDemo(facts),
    spotlights(),
    featureGrid(),
    trust(),
    faq(),
    finalCta(primary, logged),
    footer(appName, logged),
    logged ? null : stickyBar(),
  );
  setupReveal(root);
  return root;
}

// ---------- Seções ----------

function nav(logged, appName) {
  return h('header', { class: 'lp-nav' },
    h('div', { class: 'lp-wrap lp-nav-inner' },
      h('a', { class: 'brand', href: '#/', 'aria-label': `${appName}, início` }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', {}, appName)),
      h('nav', { class: 'lp-links', 'aria-label': 'Seções da página' },
        anchor('video', 'Vídeo'), anchor('diagnostico', 'Onde você está'), anchor('rodadas', 'Rodadas'), anchor('mentor', 'Mentor'), anchor('perguntas', 'Perguntas')),
      h('div', { class: 'lp-nav-actions' },
        languageSwitcher(),
        logged
          ? h('a', { href: '#/', class: 'btn btn-cta btn-sm' }, 'Meu painel')
          : [h('a', { href: '#/entrar', class: 'btn btn-ghost btn-sm' }, 'Entrar'), h('a', { href: '#/cadastro', class: 'btn btn-cta btn-sm' }, 'Criar conta')])));
}

function hero(primary, logged) {
  return h('section', { class: 'lp-hero' },
        h('div', { class: 'lp-wrap lp-hero-grid' },
      h('div', { class: 'lp-hero-copy' },
        h('span', { class: 'lp-pill' }, 'Mestrado oficial na Espanha, começando por Granada'),
        h('h1', {}, 'Seu mestrado na Espanha, um passo de cada vez.'),
        h('p', { class: 'lp-lead' }, 'Escolher o curso, se candidatar no DUA, juntar o dinheiro, tirar o visto, achar onde morar e se regularizar na chegada. A Estuvia põe tudo isso numa lista de passos, com os prazos oficiais e os documentos de cada um.'),
        h('div', { class: 'lp-ctas' }, primary(),
          logged ? null
            : h('a', { href: '#diagnostico', class: 'btn btn-ghost btn-lg', onClick: scrollTo('diagnostico') }, icon('target', { size: 16 }), 'Descobrir onde estou')),
        h('a', { href: '#video', class: 'lp-watch', onClick: (e) => { scrollTo('video')(e); playVideo(); } }, h('span', { class: 'lp-watch-icon' }, icon('play', { size: 14 })), 'Assistir ao vídeo', h('small', {}, '1 min 30')),
        h('ul', { class: 'lp-checks' },
          check('Fontes oficiais citadas'), check('Você confirma cada passo'), check('Documentos cifrados'))),
      playableMock(logged)));
}

// Mock jogável: o visitante conclui missões e vê a jornada andar.
function playableMock(logged) {
  const MISSIONS = [
    'Preparar meu passaporte', 'Preparar meu diploma', 'Preparar meu histórico acadêmico',
    'Verificar certificação de idioma', 'Organizar minha documentação',
  ];
  const MENTOR = [
    'Faltam 12 dias para a 1ª fase do DUA. Quer reservar 2 h na quinta para o histórico?',
    'Histórico pronto. Agora vale conferir se o seu mestrado exige certificado de idioma.',
    'Idioma conferido. Última missão da rodada: organizar a documentação para o envio.',
    'Rodada concluída. Na sua conta, a lista é montada para o seu caso.',
  ];
  let step = 0;
  const pctEl = h('span', {}, '38%');
  const fill = h('span', { class: 'bar-fill' });
  const mentorText = h('p', {}, MENTOR[0]);
  const hint = h('span', { class: 'lp-mock-hint' }, icon('target', { size: 14 }), 'Toque na missão atual para concluí-la');
  const finale = h('div', { class: 'lp-mock-finale', hidden: true },
    h('strong', {}, 'Rodada 2 concluída'),
    h('p', {}, 'Assim é avançar na Estuvia: um passo claro de cada vez.'),
    logged ? h('a', { href: '#/', class: 'btn btn-cta' }, 'Ir para a minha jornada', icon('arrow', { size: 14 }))
      : h('a', { href: '#/cadastro', class: 'btn btn-cta' }, 'Criar a minha jornada', icon('arrow', { size: 14 })));
  const items = MISSIONS.map((title) => h('li', { class: 'lp-mm' },
    h('span', { class: 'lp-mm-dot' }, icon('check', { size: 12 })),
    h('span', { class: 'lp-mm-text' }, h('strong', {}, title), h('small', {}))));

  const paint = () => {
    const current = 2 + step;
    items.forEach((li, i) => {
      const st = i < current ? 'done' : i === current ? 'now' : i === current + 1 ? 'next' : 'lock';
      li.className = `lp-mm lp-mm-${st}`;
      li.querySelector('small').textContent = { done: 'Concluída', now: 'Você está aqui · toque para concluir', next: 'Próxima missão', lock: 'Disponível em breve' }[st];
      li.tabIndex = st === 'now' ? 0 : -1;
      if (st === 'now') { li.setAttribute('role', 'button'); li.setAttribute('aria-label', `Concluir: ${MISSIONS[i]}`); } else { li.removeAttribute('role'); li.removeAttribute('aria-label'); }
    });
    const pct = [38, 46, 54, 62][step];
    fill.style.width = `${pct}%`;
    pctEl.textContent = `${pct}%`;
    mentorText.textContent = MENTOR[step];
    hint.hidden = step >= 3;
    finale.hidden = step < 3;
  };
  const advance = (li) => {
    if (step >= 3 || !li.classList.contains('lp-mm-now')) return;
    burst(li);
    step += 1;
    paint();
  };
  items.forEach((li) => {
    li.addEventListener('click', () => advance(li));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(li); } });
  });
  paint();

  return h('div', { class: 'lp-mock' },
    h('div', { class: 'lp-mock-win' },
      h('div', { class: 'lp-mock-bar' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, 'Minha jornada · demonstração')),
      h('div', { class: 'lp-mock-body' },
        h('div', { class: 'lp-mock-head' },
          h('img', { src: '/img/cities/granada.svg', alt: '' }),
          h('div', {}, h('small', {}, 'Brasil → Andaluzia'), h('strong', {}, 'Universidad de Granada'), h('span', { class: 'lp-mock-progress' }, h('span', { class: 'bar' }, fill), pctEl))),
        h('p', { class: 'lp-mock-label' }, 'Rodada 2 · Preparando minha candidatura'),
        h('ul', { class: 'lp-mm-list' }, items), hint, finale)),
    h('div', { class: 'lp-float lp-float-mentor', 'aria-live': 'polite' },
      h('span', { class: 'lp-float-icon' }, icon('chat', { size: 16 })),
      h('div', {}, h('strong', {}, 'Mentor'), mentorText)),
    h('div', { class: 'lp-float lp-float-agenda', 'aria-hidden': 'true' },
      h('span', { class: 'lp-float-icon lp-ic-warn' }, icon('calendar', { size: 16 })),
      h('div', {}, h('strong', {}, 'Qui · 19:00'), h('p', {}, 'Histórico acadêmico · 2 h'))));
}

function stats(nRounds) {
  const stat = (value, label) => h('div', { class: 'lp-stat' }, h('strong', {}, value), h('span', {}, label));
  return h('section', { class: 'lp-wrap lp-stats lp-reveal', 'aria-label': 'A plataforma em números' },
    stat(nRounds, 'rodadas até a estadia regularizada'),
    stat('2 min', 'para criar a conta e montar a jornada'),
    stat(FEATURES.length, 'ferramentas na mesma conta'),
    stat('Fonte', 'citada em cada regra'));
}

// ---------- Vídeo de apresentação (public/video, gerado em video/) ----------

let playVideo = () => {};

function videoSection(primary) {
  const video = h('video', { src: '/video/estuvia-apresentacao.mp4', poster: '/video/estuvia-capa.jpg', preload: 'none', playsinline: true, controls: true, 'aria-label': 'Vídeo de apresentação da Estuvia, com narração e legendas em inglês' });
  const cover = h('button', { type: 'button', class: 'lp-video-play', 'aria-label': 'Assistir ao vídeo de apresentação' },
    h('span', { class: 'lp-video-btn' }, icon('play', { size: 30 })),
    h('span', { class: 'lp-video-meta' }, h('strong', {}, 'Conheça a Estuvia'), h('small', {}, '1 min 30 · em inglês, com legendas')));
  playVideo = () => { cover.hidden = true; video.play().catch(() => { cover.hidden = false; }); };
  cover.addEventListener('click', playVideo);
  video.addEventListener('play', () => { cover.hidden = true; });
  video.addEventListener('ended', () => { cover.hidden = false; });

  return h('section', { class: 'lp-section lp-video-section', id: 'video' },
    h('div', { class: 'lp-wrap' },
      sectionHead('Em 1 minuto e meio', 'Veja a Estuvia funcionando', 'Telas reais da plataforma: a jornada, o Mentor, a agenda, as finanças e os documentos.'),
      h('div', { class: 'lp-video lp-reveal' }, video, cover),
      h('div', { class: 'lp-ctas lp-ctas-center lp-reveal' }, primary('Quero começar a minha'))));
}

// ---------- Quiz: onde você está ----------

function quiz(rounds, facts, logged) {
  const etapas = facts?.etapas || [{ id: 'inicio', rotulo: 'Estou começando do zero' }];
  const year = new Date().getFullYear();
  const cycles = [1, 2].map((i) => `${year + i - 1}/${String((year + i) % 100).padStart(2, '0')}`);
  const QUESTIONS = [
    { id: 'etapa', q: 'Em que ponto você está hoje?', opts: etapas.map((e) => [e.id, e.rotulo]) },
    { id: 'espanhol', q: 'Como está o seu espanhol?', opts: [['nenhum', 'Ainda não falo'], ['A2', 'Básico (A1–A2)'], ['B1', 'Intermediário (B1)'], ['B2', 'Avançado (B2 ou mais)']] },
    { id: 'dinheiro', q: 'Já tem dinheiro separado para o projeto?', opts: [['nada', 'Ainda não'], ['pouco', 'Um pouco'], ['parte', 'Boa parte'], ['tudo', 'Acho que tenho tudo']] },
    { id: 'ano', q: 'Quando você quer começar as aulas?', opts: [...cycles.map((c) => [c, `Ano acadêmico ${c}`]), ['nao-sei', 'Ainda não sei']] },
  ];
  const answers = { ...(store.get() || {}) };
  let i = 0;
  const box = h('div', { class: 'lp-quiz-card lp-reveal', 'aria-live': 'polite' });

  const draw = () => {
    box.replaceChildren();
    if (i >= QUESTIONS.length) return box.append(result());
    const Q = QUESTIONS[i];
    const progress = h('span', { class: 'bar-fill' });
    progress.style.width = `${(i / QUESTIONS.length) * 100}%`;
    box.append(
      h('div', { class: 'lp-quiz-top' }, h('span', {}, `Pergunta ${i + 1} de ${QUESTIONS.length}`), h('span', { class: 'bar' }, progress)),
      h('h3', {}, Q.q),
      h('div', { class: 'lp-quiz-opts' }, Q.opts.map(([v, label]) => h('button', {
        type: 'button', class: `lp-opt${answers[Q.id] === v ? ' is-on' : ''}`,
        onClick: () => { answers[Q.id] = v; i += 1; draw(); },
      }, h('span', {}, label), icon('arrow', { size: 14 })))),
      i > 0 ? h('button', { type: 'button', class: 'lp-quiz-back', onClick: () => { i -= 1; draw(); } }, icon('back', { size: 14 }), 'Voltar') : null);
  };

  const result = () => {
    const start = STAGE_ROUND[answers.etapa] || 1;
    const startRound = rounds.find((r) => r.numero === start) || rounds[0];
    const tips = [];
    if (start > 1) tips.push(['check', 'Você não precisa refazer nada: as rodadas anteriores ficam marcadas como “declaradas por você”.']);
    if (['nenhum', 'A2'].includes(answers.espanhol)) tips.push(['lang', 'Alguns mestrados exigem B2 com certificado, outros não. A missão de idioma mostra o que vale para o programa que você escolher.']);
    else if (answers.espanhol) tips.push(['lang', 'Seu espanhol ajuda. Ainda assim, confira se o programa pede certificado oficial (DELE, SIELE…).']);
    if (['nada', 'pouco'].includes(answers.dinheiro)) tips.push(['euro', 'Sem problema: a trilha “Como vou financiar meus estudos?” começa já na Rodada 1, com bolsas e caminhos alternativos.']);
    else if (answers.dinheiro) tips.push(['euro', 'O planejador separa o que você gasta do que o consulado pede para comprovar. Assim você sabe se o plano fecha de verdade.']);
    if (answers.ano && answers.ano !== 'nao-sei') {
      const y = Number(answers.ano.slice(0, 4));
      const now = new Date();
      const months = Math.max(0, (y - now.getFullYear()) * 12 + (8 - now.getMonth()));
      tips.push(['clock', `Faltam cerca de ${months} meses até setembro de ${y}, quando as aulas costumam começar. Os prazos do DUA vêm bem antes, por isso vale começar agora.`]);
    } else if (answers.ano) tips.push(['clock', 'Sem data definida? A Rodada 1 ajuda a escolher o ano certo, olhando prazos e quanto tempo você precisa para juntar dinheiro.']);
    store.set({ ...answers, salvoEm: new Date().toISOString() });

    return h('div', { class: 'lp-quiz-result' },
      h('span', { class: 'eyebrow' }, 'Seu ponto de partida'),
      h('h3', {}, `Sua jornada começa na Rodada ${start}: `, startRound.titulo),
      h('ol', { class: 'lp-quiz-track', 'aria-label': 'Rodadas da sua jornada' }, rounds.map((r) => h('li', {
        class: r.numero < start ? 'is-done' : r.numero === start ? 'is-here' : '',
      }, h('span', {}, r.numero < start ? icon('check', { size: 12 }) : r.numero), h('small', {}, r.titulo)))),
      h('ul', { class: 'lp-quiz-tips' }, tips.map(([ic, txt]) => h('li', {}, h('span', { class: 'lp-tip-icon' }, icon(ic, { size: 16 })), h('span', {}, txt)))),
      h('div', { class: 'lp-ctas' },
        logged ? h('a', { href: '#/', class: 'btn btn-cta btn-lg' }, 'Ir para o meu painel', icon('arrow', { size: 16 }))
          : h('a', { href: '#/cadastro', class: 'btn btn-cta btn-lg' }, 'Criar conta e gerar minha jornada', icon('arrow', { size: 16 })),
        h('button', { type: 'button', class: 'btn btn-ghost btn-lg', onClick: () => { i = 0; draw(); } }, icon('refresh', { size: 16 }), 'Refazer')),
      logged ? null : h('p', { class: 'lp-note' }, icon('lock', { size: 13 }), 'Suas respostas ficam só neste navegador e já vêm preenchidas no cadastro.'));
  };
  draw();

  return h('section', { class: 'lp-section lp-alt', id: 'diagnostico' },
    h('div', { class: 'lp-wrap lp-quiz' },
      h('div', { class: 'lp-quiz-intro lp-reveal' },
        h('span', { class: 'eyebrow' }, 'Diagnóstico em 30 segundos'),
        h('h2', {}, 'Onde você está nessa jornada?'),
        h('p', {}, 'Responda 4 perguntas rápidas e veja por qual rodada você começaria, o que já conta a seu favor e o que merece atenção. Sem cadastro.'),
        h('ul', { class: 'lp-bullets' },
          h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Feito para quem parte do Brasil')),
          h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Sem promessas: só o caminho e o que depende de você')),
          h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Resultado na hora')))),
      box));
}

// ---------- Mapa clicável das rodadas ----------

function journeyMap(rounds, transversal) {
  let sel = 0;
  const detail = h('div', { class: 'lp-map-detail', 'aria-live': 'polite' });
  const tabs = rounds.map((r, i) => h('button', {
    type: 'button', role: 'tab', class: 'lp-map-step', onClick: () => { sel = i; draw(); },
  }, h('span', { class: 'lp-map-n' }, r.numero), h('span', { class: 'lp-map-t' }, r.titulo)));
  const fill = h('span', { class: 'lp-map-fill' });
  const draw = () => {
    tabs.forEach((t, i) => { t.classList.toggle('is-on', i === sel); t.classList.toggle('is-past', i < sel); t.setAttribute('aria-selected', String(i === sel)); });
    fill.style.width = `${(sel / (rounds.length - 1)) * 100}%`;
    const r = rounds[sel];
    detail.replaceChildren(
      h('img', { src: r.banner, alt: '' }),
      h('div', { class: 'lp-map-copy' },
        h('span', { class: 'eyebrow' }, `Rodada ${r.numero} de ${rounds.length}`),
        h('h3', {}, r.titulo),
        r.etapa ? h('p', { class: 'lp-map-etapa' }, r.etapa) : null,
        r.resumo ? h('p', {}, r.resumo) : null,
        h('div', { class: 'lp-map-nav' },
          h('button', { type: 'button', class: 'btn btn-ghost', disabled: sel === 0, onClick: () => { sel -= 1; draw(); } }, icon('back', { size: 16 }), 'Anterior'),
          sel < rounds.length - 1
            ? h('button', { type: 'button', class: 'btn btn-cta', onClick: () => { sel += 1; draw(); } }, 'Próxima rodada', icon('arrow', { size: 16 }))
            : h('a', { href: state.me ? '#/' : '#/cadastro', class: 'btn btn-cta' }, 'Começar pela Rodada 1', icon('arrow', { size: 16 })))));
  };
  draw();

  return h('section', { class: 'lp-section', id: 'rodadas' },
    h('div', { class: 'lp-wrap' },
      sectionHead('A jornada', `${rounds.length} rodadas até a sua estadia regularizada`, 'Clique numa rodada para ver o que tem nela. Cada uma abre quando a anterior termina, mas os prazos oficiais ficam visíveis desde o começo.'),
      h('div', { class: 'lp-map lp-reveal' },
        h('div', { class: 'lp-map-steps', role: 'tablist', 'aria-label': 'Rodadas' }, h('span', { class: 'lp-map-line' }, fill), tabs),
        detail),
      transversal ? h('div', { class: 'lp-track lp-reveal' },
        h('span', { class: 'lp-track-icon' }, icon('euro', { size: 22 })),
        h('div', {},
          h('small', {}, 'Trilha transversal'),
          h('h3', {}, transversal.titulo),
          h('p', {}, transversal.resumo || 'Começa na Rodada 1 e segue até o visto: custos, recursos, bolsas e comprovação financeira.'))) : null));
}

// ---------- Antes × depois (alternável) ----------

function beforeAfter() {
  const before = [
    'Dezenas de abas abertas e regras que mudam a cada ano',
    'Prazos do DUA, do visto e da matrícula anotados em lugares diferentes',
    'Não saber se o dinheiro fecha até perto do visto',
    'Documentos perdidos entre e-mail, drive e celular',
    'Dúvidas respondidas com “acho que é assim” em grupos',
  ];
  const after = [
    'Uma jornada com rodadas e missões, sempre com o próximo passo à vista',
    'Prazos oficiais com fonte, direto na sua Agenda',
    'Planejamento financeiro desde a Rodada 1, com caminhos se faltar',
    'Minha pasta: todos os documentos cifrados, organizados por etapa',
    'Regras com selo de verificação e um Mentor que cita as fontes',
  ];
  let on = false;
  const title = h('h3', {});
  const list = h('ul', {});
  const card = h('div', { class: 'lp-cmp' }, title, list);
  const btnOff = h('button', { type: 'button', onClick: () => { on = false; draw(); } }, 'Sem a Estuvia');
  const btnOn = h('button', { type: 'button', onClick: () => { on = true; draw(); } }, 'Com a Estuvia');
  const draw = () => {
    btnOff.classList.toggle('is-on', !on); btnOn.classList.toggle('is-on', on);
    btnOff.setAttribute('aria-pressed', String(!on)); btnOn.setAttribute('aria-pressed', String(on));
    card.className = `lp-cmp ${on ? 'lp-cmp-after' : 'lp-cmp-before'}`;
    title.textContent = on ? 'Com a Estuvia' : 'Sem a Estuvia';
    list.replaceChildren(...(on ? after : before).map((t) => h('li', {}, icon(on ? 'check' : 'x', { size: 16 }), h('span', {}, t))));
  };
  draw();
  return h('section', { class: 'lp-section lp-alt' },
    h('div', { class: 'lp-wrap lp-narrow' },
      sectionHead('Sem a Estuvia', 'Hoje a informação está espalhada', 'Site da universidade, do DUA, do consulado, grupo de WhatsApp, vídeo no YouTube. Veja a diferença.'),
      h('div', { class: 'lp-switch lp-reveal', role: 'group', 'aria-label': 'Comparar' }, btnOff, btnOn),
      h('div', { class: 'lp-reveal' }, card)));
}

// ---------- Demonstração do Mentor ----------

function mentorDemo(facts) {
  const ipremTxt = facts ? `€ ${facts.visto.ipremMensal}/mês em ${facts.visto.ano}` : 'o valor do ano';
  const QA = [
    ['Por onde eu começo?', 'Pela Rodada 1: escolher o mestrado e ler a ficha oficial com calma. Eu comparo os requisitos com o seu perfil e mostro o que você já atende e o que falta comprovar.'],
    ['Quanto preciso comprovar para o visto?', `Como referência geral, 100% do IPREM por mês de estadia: ${ipremTxt}. Deduções, como alojamento já pago, dependem do consulado. Na plataforma eu calculo com os seus meses e recursos.`],
    ['Vocês fazem a candidatura por mim?', 'Não. Eu te mostro o que fazer, quando e com quais documentos, com o link oficial ao lado. O envio é seu, no sistema competente. Nada é marcado como concluído sem a sua confirmação.'],
    ['Não sei quais documentos preparar.', 'Começo pelos que levam mais tempo: diploma, histórico e, se o curso pedir, o certificado de idioma. A lista que vale é sempre a da convocatória ou do consulado, e eu aponto qual é.'],
  ];
  const log = h('div', { class: 'lp-chat-log', 'aria-live': 'polite' });
  let busy = false;
  const ask = (q, a, btn) => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    log.append(h('p', { class: 'lp-bubble lp-bubble-me' }, q));
    const ans = h('p', { class: 'lp-bubble' });
    const typing = h('p', { class: 'lp-bubble lp-typing', 'aria-label': 'Digitando' }, h('i', {}), h('i', {}), h('i', {}));
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    setTimeout(() => {
      typing.replaceWith(ans);
      if (reducedMotion()) { ans.textContent = a; busy = false; return; }
      let k = 0;
      const id = setInterval(() => {
        k += 3;
        ans.textContent = a.slice(0, k);
        log.scrollTop = log.scrollHeight;
        if (k >= a.length) { clearInterval(id); busy = false; }
      }, 18);
    }, reducedMotion() ? 0 : 650);
  };
  const chips = QA.map(([q, a]) => { const b = h('button', { type: 'button', class: 'lp-chip' }, q); b.addEventListener('click', () => ask(q, a, b)); return b; });
  log.append(h('p', { class: 'lp-bubble' }, 'Oi. Escolha uma das perguntas abaixo.'));

  return h('section', { class: 'lp-section lp-alt', id: 'mentor' },
    h('div', { class: 'lp-wrap lp-spot' },
      h('div', { class: 'lp-spot-copy lp-reveal' },
        h('span', { class: 'eyebrow' }, 'Mentor'),
        h('h3', {}, 'Pergunte. Ele conhece o seu caso.'),
        h('p', {}, 'Na plataforma, o Mentor lê a sua jornada, prazos, documentos e finanças. Responde curto, explica os termos e propõe ações, que só acontecem se você confirmar.'),
        h('ul', { class: 'lp-bullets' },
          h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Cita a fonte de cada regra')),
          h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Funciona até sem IA paga, em modo guiado')),
          h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Você vê e controla o que ele lembra')))),
      h('div', { class: 'lp-spot-visual lp-reveal' },
        h('div', { class: 'lp-vis lp-chat lp-chat-live' },
          h('div', { class: 'lp-chat-head' }, h('span', { class: 'lp-float-icon' }, icon('chat', { size: 16 })), h('strong', {}, 'Mentor Estuvia'), h('small', {}, 'exemplo de conversa')),
          log,
          h('div', { class: 'lp-chips' }, chips)))));
}

// ---------- Destaques, recursos, confiança, perguntas ----------

function spotlights() {
  const spot = (eyebrow, title, text, bullets, visual, flip) => h('div', { class: `lp-spot lp-reveal${flip ? ' lp-spot-flip' : ''}` },
    h('div', { class: 'lp-spot-copy' },
      h('span', { class: 'eyebrow' }, eyebrow), h('h3', {}, title), h('p', {}, text),
      h('ul', { class: 'lp-bullets' }, bullets.map((b) => h('li', {}, icon('check', { size: 16 }), h('span', {}, b))))),
    h('div', { class: 'lp-spot-visual', 'aria-hidden': 'true' }, visual));

  const agendaVisual = h('div', { class: 'lp-vis lp-agenda' },
    ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((d, i) => h('div', { class: 'lp-ag-col' },
      h('small', {}, d),
      i === 0 ? h('span', { class: 'lp-ev lp-ev-a lp-h2' }, 'Passaporte') : null,
      i === 1 ? h('span', { class: 'lp-ev lp-ev-b lp-h1' }, 'Mentor') : null,
      i === 2 ? h('span', { class: 'lp-ev lp-ev-c lp-h3' }, 'Prazo DUA') : null,
      i === 3 ? h('span', { class: 'lp-ev lp-ev-a lp-h3' }, 'Histórico') : null,
      i === 4 ? h('span', { class: 'lp-ev lp-ev-b lp-h2' }, 'Bolsas') : null)));

  const docsVisual = h('div', { class: 'lp-vis lp-docs' },
    docRow('passport', 'Passaporte', 'Pronto', 't-ok'),
    docRow('cap', 'Diploma', 'Enviado', 't-ok'),
    docRow('file', 'Histórico acadêmico', 'Preparando', 't-warn'),
    docRow('shield', 'Seguro saúde', 'Pendente', 't-muted'));

  return h('section', { class: 'lp-section' },
    h('div', { class: 'lp-wrap lp-spots' },
      sectionHead('Por dentro', 'As partes se falam', 'Concluiu uma missão? A agenda, o orçamento e a lista de documentos já se ajustam.'),
      spot('Agenda', 'Sua semana organizada sozinha', 'Diga quando você tem tempo livre e a Agenda distribui as missões liberadas, sempre respeitando os prazos oficiais.',
        ['Clique e arraste para criar, mover ou mudar a duração', 'Sugere horários para as missões, e você aprova', 'Replanejar o que ficou para trás', 'Horário da Espanha lado a lado'], agendaVisual),
      spot('Documentos', 'Tudo pronto para a imigração', 'Guarde passaporte, carta de aceitação, seguro e passagem num só lugar e saiba exatamente o que falta para cada etapa.',
        ['Arquivos cifrados: só você acessa', 'Carteira por etapa com status e validade', 'Foto do documento direto do celular', 'Baixe tudo antes de embarcar'], docsVisual, true)));
}

function featureGrid() {
  return h('section', { class: 'lp-section lp-alt', id: 'recursos' },
    h('div', { class: 'lp-wrap' },
      sectionHead('Recursos', 'O que tem na plataforma', null),
      h('div', { class: 'lp-features' },
        FEATURES.map(([ic, title, text]) => h('article', { class: 'lp-feature lp-reveal' },
          h('span', { class: 'lp-feature-icon' }, icon(ic, { size: 20 })), h('h3', {}, title), h('p', {}, text))))));
}

function trust() {
  return h('section', { class: 'lp-section' },
    h('div', { class: 'lp-wrap' },
      sectionHead('De onde vem a informação', 'Cada regra mostra a fonte', 'Você vai gastar tempo e dinheiro com isso. Por isso cada informação diz de onde veio, e a plataforma deixa claro o que ela não faz.'),
      h('div', { class: 'lp-trust' },
        h('div', { class: 'lp-trust-card lp-reveal' },
          h('span', { class: 'lp-feature-icon' }, icon('shield', { size: 20 })),
          h('h3', {}, 'Cada regra tem um selo'),
          h('ul', { class: 'tag-legend' },
            h('li', {}, tag('verificado'), ' Conferida em norma ou página oficial, com data de revisão.'),
            h('li', {}, tag('pratica'), ' Sugestão de quem já passou pelo processo.'),
            h('li', {}, tag('estimativa'), ' Valor calculado com premissas explícitas.'),
            h('li', {}, tag('pendente'), ' Depende do curso, consulado, ano ou da sua situação.'))),
        h('div', { class: 'lp-trust-card lp-reveal' },
          h('span', { class: 'lp-feature-icon' }, icon('alert', { size: 20 })),
          h('h3', {}, 'O que a Estuvia não faz'),
          h('ul', { class: 'lp-bullets lp-bullets-muted' },
            h('li', {}, icon('minus', { size: 16 }), h('span', {}, 'Não envia candidaturas nem pedidos oficiais em seu nome.')),
            h('li', {}, icon('minus', { size: 16 }), h('span', {}, 'Não garante admissão, bolsa nem visto.')),
            h('li', {}, icon('minus', { size: 16 }), h('span', {}, 'Não marca missões como concluídas sem a sua confirmação.')),
            h('li', {}, icon('minus', { size: 16 }), h('span', {}, 'Não substitui a conferência nas fontes oficiais do seu ciclo.')))),
        h('div', { class: 'lp-trust-card lp-reveal' },
          h('span', { class: 'lp-feature-icon' }, icon('lock', { size: 20 })),
          h('h3', {}, 'Privacidade de verdade'),
          h('ul', { class: 'lp-bullets' },
            h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Documentos cifrados na sua conta.')),
            h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Você controla a memória do Mentor.')),
            h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Ações da IA só com a sua aprovação.')),
            h('li', {}, icon('check', { size: 16 }), h('span', {}, 'Central de fontes aberta para consulta.'))),
          h('a', { href: '#/fontes', class: 'lp-link' }, 'Ver a Central de fontes', icon('arrow', { size: 14 }))))));
}

function faq() {
  return h('section', { class: 'lp-section lp-alt', id: 'perguntas' },
    h('div', { class: 'lp-wrap lp-narrow' },
      sectionHead('Perguntas frequentes', 'Dúvidas comuns', null),
      h('div', { class: 'lp-faq' },
        FAQ.map(([q, a], i) => h('details', { class: 'lp-qa lp-reveal', open: i === 0 },
          h('summary', {}, h('span', {}, q), icon('chevron', { size: 18 })),
          h('p', {}, a))))));
}

function finalCta(primary, logged) {
  return h('section', { class: 'lp-section lp-final-wrap' },
    h('div', { class: 'lp-wrap' },
      h('div', { class: 'lp-final lp-reveal' },
        h('div', { class: 'lp-glow lp-glow-c', 'aria-hidden': 'true' }),
        h('h2', {}, logged ? 'Sua jornada continua.' : 'Comece pela primeira rodada.'),
        h('p', {}, logged ? 'Volte ao painel e siga o próximo passo recomendado.' : 'Crie a conta e responda 5 perguntas. A jornada sai na hora, montada para o seu caso.'),
        h('div', { class: 'lp-ctas lp-ctas-center' }, primary(),
          logged ? null : h('a', { href: '#/entrar', class: 'btn btn-ghost btn-lg' }, 'Já tenho conta')))));
}

function footer(appName, logged) {
  return h('footer', { class: 'lp-footer' },
    h('div', { class: 'lp-wrap lp-footer-inner' },
      h('div', {},
        h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', {}, appName)),
        h('p', {}, 'A Estuvia orienta e organiza: candidatura, matrícula, visto e demais pedidos oficiais são feitos nos sistemas competentes. Confirme sempre nas fontes oficiais do seu ciclo.')),
      h('nav', { class: 'lp-footer-links', 'aria-label': 'Links do rodapé' },
        logged ? h('a', { href: '#/fontes' }, 'Central de fontes') : null, // a central exige login
        logged ? null : [
          h('a', { href: '#/manual' }, 'Como funciona'),
          h('a', { href: '#/entrar' }, 'Entrar'),
          h('a', { href: '#/cadastro' }, 'Criar conta')],
        h('a', { href: '#/privacidade' }, 'Privacidade'),
        h('a', { href: '#/termos' }, 'Termos de uso'))),
    h('p', { class: 'lp-wrap lp-copy' }, `© ${new Date().getFullYear()} ${appName}`));
}

// Barra fixa de chamada: aparece depois do topo e some perto da chamada final.
function stickyBar() {
  const link = h('a', { href: '#/cadastro', class: 'btn btn-cta btn-sm' }, 'Criar minha jornada', icon('arrow', { size: 14 }));
  const bar = h('div', { class: 'lp-sticky' },
    h('div', { class: 'lp-wrap lp-sticky-inner' },
      h('span', {}, h('strong', {}, 'Seu mestrado na Espanha'), h('span', { class: 'lp-sticky-sub' }, ' · comece pela Rodada 1 hoje')),
      link));
  const onScroll = () => {
    if (!bar.isConnected) return removeEventListener('scroll', onScroll);
    const final = document.querySelector('.lp-final-wrap');
    const nearEnd = final && final.getBoundingClientRect().top < innerHeight;
    const on = scrollY > innerHeight * 0.9 && !nearEnd;
    bar.classList.toggle('is-on', on);
    link.tabIndex = on ? 0 : -1;
  };
  addEventListener('scroll', onScroll, { passive: true });
  link.tabIndex = -1;
  return bar;
}

// ---------- Pedaços ----------

function sectionHead(eyebrow, title, text) {
  return h('div', { class: 'lp-head lp-reveal' }, h('span', { class: 'eyebrow' }, eyebrow), h('h2', {}, title), text ? h('p', {}, text) : null);
}

const check = (text) => h('li', {}, icon('check', { size: 14 }), text);

// Âncoras da própria página: rolam até a seção sem mudar a rota do roteador por hash.
const scrollTo = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); };
const anchor = (id, label) => h('a', { href: `#${id}`, onClick: scrollTo(id) }, label);

const docRow = (ic, name, status, tone) => h('div', { class: 'lp-doc' },
  h('span', { class: 'lp-doc-icon' }, icon(ic, { size: 16 })), h('strong', {}, name), h('span', { class: `chip-status ${tone}` }, status));

// Pequena explosão de partículas ao concluir uma missão no mock.
function burst(target) {
  if (reducedMotion()) return;
  const r = target.getBoundingClientRect();
  const layer = h('div', { class: 'lp-burst', 'aria-hidden': 'true' });
  layer.style.left = `${r.left + 22}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < 14; i++) {
    const p = h('i', {});
    const a = (i / 14) * Math.PI * 2;
    p.style.setProperty('--dx', `${Math.cos(a) * (40 + (i % 3) * 18)}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * (40 + (i % 3) * 18)}px`);
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 800);
}

// Elementos aparecem ao rolar; sem IntersectionObserver ou com movimento reduzido, tudo já fica visível.
function setupReveal(root) {
  if (!('IntersectionObserver' in window) || reducedMotion()) return;
  root.classList.add('lp-anim');
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  requestAnimationFrame(() => root.querySelectorAll('.lp-reveal').forEach((el) => io.observe(el)));
}
