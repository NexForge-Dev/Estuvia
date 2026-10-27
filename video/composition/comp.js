// Composição determinística do vídeo: renderAt(t) desenha o quadro do instante t (segundos).
// O renderizador (tools/render.mjs) injeta window.DATA = { timeline, cues, words } e chama setup().
// Coordenadas sobre as telas são normalizadas (0–1) em relação à captura (1600×900 CSS).

const VW = 1440, VH = 810, FX = 240, FY = 56 + 40; // janela: posição da área da tela no palco
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => cl((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  back: (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2),
};
const el = (tag, cls, parent, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; if (parent) parent.append(n); return n; };
const css = (n, o) => Object.assign(n.style, o);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^\w]/g, '');

let D, SC, stage, scenes = [], globals = [];

// Tempo local (na cena) de uma palavra da narração; nth = ocorrência.
function w(id, word, nth = 0) {
  const sc = SC[id];
  const list = D.words[id].filter((x) => norm(x.w) === norm(word));
  const hit = list[Math.min(nth, list.length - 1)];
  if (!hit) { console.warn('palavra não encontrada', id, word); return 0; }
  return sc.voiceAt - sc.start + hit.t;
}
const voiceEnd = (id) => SC[id].voiceAt - SC[id].start + SC[id].voiceDuration;

// Interpola keyframes [[t, ...valores]] com easing entre pontos.
function kf(t, frames, ease = E.io) {
  if (t <= frames[0][0]) return frames[0].slice(1);
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i][0]) {
      const a = frames[i - 1], b = frames[i];
      const k = ease(seg(t, a[0], b[0]));
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
    }
  }
  return frames[frames.length - 1].slice(1);
}

// ---------------------------------------------------------------- componentes

function Frame(layer, seq, cam, { enter = 0, exit = Infinity } = {}) {
  const f = el('div', 'frame', layer);
  el('div', 'frame-bar', f, '<i></i><i></i><i></i><span class="frame-url"><b></b>Estuvia</span>');
  const vp = el('div', 'viewport', f);
  const camEl = el('div', 'cam', vp);
  const imgs = seq.map(([, name]) => { const i = el('img', '', camEl); i.src = `../assets/screens/${name}.png`; return i; });
  const overlay = el('div', '', camEl); // anéis que acompanham o zoom
  let state = { tx: 0, ty: 0, z: 1 };
  const api = {
    el: f, overlay,
    map(nx, ny) { return { x: FX + state.tx + nx * VW * state.z, y: FY + state.ty + ny * VH * state.z }; },
    update(t) {
      const p = E.expo(seg(t, enter, enter + 1.2));
      const q = E.io(seg(t, exit, exit + 0.7));
      css(f, { opacity: p * (1 - q), transform: `perspective(1800px) translateY(${(1 - p) * 90 - q * 30}px) rotateX(${(1 - p) * 9}deg) scale(${0.94 + 0.06 * p - 0.03 * q})`, display: p > 0 ? '' : 'none' });
      let k = 0;
      seq.forEach(([st], i) => { if (t >= st) k = i; });
      imgs.forEach((img, i) => {
        const op = i === k ? (k === 0 ? 1 : E.io(seg(t, seq[k][0], seq[k][0] + 0.5))) : i === k - 1 ? 1 : 0;
        css(img, { opacity: op, zIndex: i, display: op > 0 ? '' : 'none' });
      });
      let [fx, fy, z] = kf(t, cam);
      fx = cl(fx, 0.5 / z, 1 - 0.5 / z); fy = cl(fy, 0.5 / z, 1 - 0.5 / z);
      state = { tx: VW / 2 - fx * VW * z, ty: VH / 2 - fy * VH * z, z };
      camEl.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${z})`;
    },
  };
  return api;
}

// Anel de destaque (coordenadas da tela: centro nx, ny e tamanho nw, nh).
function Ring(layer, frame, t0, t1, nx, ny, nw, nh) {
  const r = el('div', 'ring', layer);
  return (t) => {
    const a = E.out(seg(t, t0, t0 + 0.4)) * (1 - seg(t, t1 - 0.3, t1));
    if (a <= 0) return css(r, { display: 'none' });
    const p = frame.map(nx - nw / 2, ny - nh / 2), q = frame.map(nx + nw / 2, ny + nh / 2);
    const pad = 8 + 6 * (1 - a);
    const pulse = 1 + 0.25 * Math.sin((t - t0) * 5);
    css(r, { display: '', opacity: a, left: `${p.x - pad}px`, top: `${p.y - pad}px`, width: `${q.x - p.x + 2 * pad}px`, height: `${q.y - p.y + 2 * pad}px`, boxShadow: `0 0 0 ${6 * pulse}px rgb(45 212 191 / ${18 * a}%), 0 0 40px rgb(45 212 191 / 45%)` });
  };
}

// Etiqueta. pos: {nx, ny} (ancorada na tela) ou {x, y} (fixa no palco). side: lado em que a etiqueta fica.
function Callout(layer, frame, t0, t1, pos, html, { num, side = 'left' } = {}) {
  const c = el('div', 'callout', layer, (num != null ? `<span class="dot">${num}</span>` : '<span class="dot">✓</span>') + `<span>${html}</span>`);
  return (t) => {
    const a = E.expo(seg(t, t0, t0 + 0.6)) * (1 - E.io(seg(t, t1 - 0.4, t1)));
    if (a <= 0) return css(c, { display: 'none' });
    c.style.display = '';
    const pt = pos.x != null ? pos : frame.map(pos.nx, pos.ny);
    const w = c.offsetWidth, h = c.offsetHeight;
    let x = pt.x, y = pt.y - h / 2;
    if (side === 'left') x = pt.x - w - 18; else if (side === 'right') x = pt.x + 18; else if (side === 'center') x = pt.x - w / 2;
    if (side === 'above') { x = pt.x - w / 2; y = pt.y - h - 18; }
    if (side === 'below') { x = pt.x - w / 2; y = pt.y + 18; }
    x = cl(x, 30, 1890 - w);
    css(c, { display: '', opacity: a, left: `${x}px`, top: `${y + (1 - a) * 16}px` });
  };
}

// Cursor: path [[t, nx, ny]] sobre a tela; clicks [t...].
function Cursor(layer, frame, path, clicks = [], { from = path[0][0], to = path[path.length - 1][0] + 0.6 } = {}) {
  const c = el('div', 'cursor', layer, '<svg viewBox="0 0 24 24" width="38" height="38"><path d="M4 2l15 10.5-6.5 1.3 3.8 7.4-2.9 1.4-3.8-7.4L4 20z" fill="#fff" stroke="#0a0d12" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  const rips = clicks.map(() => el('div', 'ripple', layer));
  return (t) => {
    const a = seg(t, from, from + 0.3) * (1 - seg(t, to - 0.3, to));
    if (a <= 0) { css(c, { display: 'none' }); rips.forEach((r) => css(r, { display: 'none' })); return; }
    const [nx, ny] = kf(t, path);
    const p = frame.map(nx, ny);
    const press = clicks.reduce((m, ct) => Math.max(m, 1 - Math.abs(t - ct) / 0.12), 0);
    css(c, { display: '', opacity: a, left: `${p.x}px`, top: `${p.y}px`, transform: `scale(${1 - 0.18 * cl(press)})` });
    clicks.forEach((ct, i) => {
      const k = seg(t, ct, ct + 0.55);
      if (k <= 0 || k >= 1) return css(rips[i], { display: 'none' });
      css(rips[i], { display: '', left: `${p.x}px`, top: `${p.y}px`, opacity: 1 - k, transform: `scale(${0.3 + 1.3 * E.out(k)})` });
    });
  };
}

// Título grande palavra a palavra. accentFrom: índice da primeira palavra em gradiente.
function Title(layer, text, t0, t1, { accentFrom = Infinity, size } = {}) {
  const box = el('div', 'title-card', layer);
  const h2 = el('h2', '', box);
  if (size) h2.style.fontSize = `${size}px`;
  const words = text.split(' ').map((wd, i) => el('span', `w${i >= accentFrom ? ' grad' : ''}`, h2, wd));
  return (t) => {
    const out = E.io(seg(t, t1 - 0.5, t1));
    if (t < t0 || t > t1) return css(box, { display: 'none' });
    css(box, { display: '' });
    words.forEach((n, i) => {
      const p = E.expo(seg(t, t0 + i * 0.07, t0 + i * 0.07 + 0.9));
      css(n, { opacity: p * (1 - out), transform: `translateY(${(1 - p) * 46 - out * 24}px)`, filter: `blur(${(1 - p) * 10 + out * 8}px)` });
    });
  };
}

function Lower(layer, html, t0, t1, top = 770) {
  const b = el('div', 'lower', layer); const d = el('div', '', b, html); b.style.top = `${top}px`;
  return (t) => {
    const a = E.expo(seg(t, t0, t0 + 0.8)) * (1 - E.io(seg(t, t1 - 0.5, t1)));
    css(b, { display: a > 0 ? '' : 'none', opacity: a, transform: `translateY(${(1 - a) * 30}px) scale(${0.97 + 0.03 * a})` });
  };
}

function Kicker(layer, text, t0, demo = 'Demonstração · dados fictícios') {
  const k = el('div', 'kicker', layer, `<b></b>${text}`);
  const b = demo ? el('div', 'badge-demo', layer, demo) : null;
  return (t) => {
    const a = E.out(seg(t, t0, t0 + 0.6));
    css(k, { opacity: a, transform: `translateX(${(1 - a) * -20}px)` });
    if (b) css(b, { opacity: a });
  };
}

// Camada de uma cena: aparece com fade sobre a anterior.
function scene(id, build) {
  const sc = SC[id];
  const layer = el('div', 'layer', stage);
  const parts = [];
  build(layer, sc, (fn) => { parts.push(fn); return fn; });
  scenes.push({ sc, layer, parts, first: scenes.length === 0 });
}

// ---------------------------------------------------------------- cenas

// Ícones (mesmos traços de public/js/icons.js) para os cartões da abertura.
const ICON = {
  cap: ['M22 10 12 5 2 10l10 5 10-5Z', 'M6 12v5c3 3 9 3 12 0v-5', 'M22 10v6'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
  passport: ['M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z', 'M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M9 17h6'],
  euro: ['M4 10h12', 'M4 14h9', 'M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2'],
  plane: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
};
const svgIcon = (name, size = 30) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[name].map((d) => `<path d="${d}"/>`).join('')}</svg>`;

// Faixa de título sobre a tela (substitui o cartão de tela cheia: mantém o produto à vista).
const sceneTitle = (L, text, t0 = 0.35, t1 = 2.9) => Lower(L, text, t0, t1, 772);

function buildScenes() {
  // 1 — Abertura: a dúvida
  scene('s1-sonho', (L, sc, add) => {
    const id = sc.id;
    // Parede de telas reais em perspectiva, escura e desfocada.
    const wall = el('div', 'screen-wall', L);
    const shots = ['trail', 'agenda-filled', 'finance', 'rounds', 'mentor-answer-top', 'documents', 'housing-b', 'radar-c', 'travel'];
    shots.forEach((n) => { const i = el('img', '', wall); i.src = `../assets/screens/${n}.png`; });
    const vignette = el('div', 'scrim', L); vignette.style.background = 'radial-gradient(ellipse at 50% 45%, rgb(10 13 18 / 55%), #0a0d12 78%)';

    const pill = el('div', 'intro-pill', L, `${svgIcon('plane', 20)}<span>Brazil → Spain</span>`);
    const head = el('div', 'intro-head', L);
    const h1 = el('h1', '', head);
    const words = "Dreaming of a master's degree in Europe?".split(' ').map((wd, i) => el('span', `w${i >= 5 ? ' grad' : ''}`, h1, wd));

    const Q = [
      ['cap', 'Which university?', w(id, 'Which')], ['file', 'Which documents?', w(id, 'Which', 1)],
      ['passport', 'How do I get the visa?', w(id, 'visa') - 0.9], ['euro', 'How much will it all cost?', w(id, 'much') - 0.3],
    ];
    const grid = [[-330, -70], [330, -70], [-330, 90], [330, 90]];
    const cards = Q.map(([ic, txt]) => el('div', 'q-card', L, `<span class="q-ic">${svgIcon(ic, 28)}</span><span>${txt}</span><i class="q-dot"></i>`));
    const tThen = w(id, 'Then') - 0.15;
    const tEnd = voiceEnd(id);
    const flash = el('div', 'intro-flash', L);

    add((t) => {
      css(wall, { transform: `perspective(1400px) rotateX(52deg) translateY(${-120 - t * 22}px) scale(1.25)`, opacity: 0.38 * E.out(seg(t, 0, 1.2)) * (1 - E.io(seg(t, tEnd - 0.3, tEnd + 0.4))) });
      const pa = E.expo(seg(t, 0.15, 0.9)) * (1 - E.io(seg(t, tThen - 0.2, tThen + 0.4)));
      css(pill, { opacity: pa, transform: `translateY(${(1 - pa) * 14}px)` });
      // Título: entra palavra a palavra e sobe para dar lugar às perguntas.
      const up = E.io(seg(t, tThen, tThen + 0.9));
      const out = E.io(seg(t, tEnd - 0.3, tEnd + 0.3));
      css(head, { transform: `translateY(${-210 * up}px) scale(${1 - 0.42 * up})`, opacity: 1 - out, filter: `blur(${out * 10}px)` });
      words.forEach((n, i) => {
        const p = E.expo(seg(t, 0.4 + i * 0.09, 0.4 + i * 0.09 + 0.9));
        css(n, { opacity: p, transform: `translateY(${(1 - p) * 50}px)`, filter: `blur(${(1 - p) * 12}px)` });
      });
      // Perguntas: cartões de vidro em grade, cada um na sua palavra; no fim convergem para o centro.
      cards.forEach((c, i) => {
        const at = Q[i][2];
        const p = E.expo(seg(t, at - 0.1, at + 0.6));
        const conv = E.io(seg(t, tEnd - 0.2, tEnd + 0.55));
        const [gx, gy] = grid[i];
        const x = lerp(gx, 0, conv), y = lerp(gy, 0, conv) + (1 - p) * 40;
        const latest = Q.reduce((k, q, j) => (t >= q[2] - 0.1 ? j : k), -1) === i;
        css(c, { opacity: p * (1 - conv), transform: `translate(-50%, -50%) translate(${x}px, ${y + 120}px) scale(${(0.92 + 0.08 * p) * (1 - 0.6 * conv)})`, borderColor: latest ? 'rgb(45 212 191 / 70%)' : 'rgb(255 255 255 / 12%)', filter: `blur(${conv * 6}px)` });
      });
      const f = seg(t, tEnd + 0.25, tEnd + 0.55) * (1 - seg(t, tEnd + 0.55, sc.duration + 0.4));
      css(flash, { opacity: f, transform: `translate(-50%, -50%) scale(${0.2 + 2.2 * E.out(seg(t, tEnd + 0.25, sc.duration + 0.4))})` });
    });
  });

  // 2 — Apresentando a Estuvia
  scene('s2-estuvia', (L, sc, add) => {
    const logo = el('div', 'logo', L, '<div class="logo-mark"></div><div class="logo-word">Estuvia</div><div class="logo-sub">Your future starts with a <span class="grad">plan.</span></div>');
    css(logo, { top: '250px' });
    const [mark, word, sub] = logo.children;
    const tName = w(sc.id, 'Estuvia');
    const tSub = w(sc.id, 'platform') - 0.2;
    const tFrame = Math.max(3.2, w(sc.id, 'clear') - 1.4);
    const fr = Frame(L, [[0, 'home']], [[tFrame, 0.55, 0.3, 1.05], [sc.duration, 0.56, 0.24, 1.35]], { enter: tFrame });
    add((t) => {
      const a = E.back(seg(t, 0.0, 0.7)), out = E.io(seg(t, tFrame - 0.5, tFrame + 0.3));
      css(mark, { transform: `scale(${(0.5 + 0.5 * a) * (1 - 0.3 * out)})`, opacity: seg(t, 0.0, 0.3) * (1 - out) });
      const wp = E.out(seg(t, tName - 0.4, tName + 0.3));
      css(word, { opacity: wp * (1 - out), transform: `translateY(${(1 - wp) * 30}px)`, letterSpacing: `${-0.04 + 0.05 * (1 - E.out(seg(t, tName - 0.4, tName + 1)))}em` });
      css(sub, { opacity: E.out(seg(t, tSub, tSub + 0.6)) * (1 - out) });
      css(logo, { transform: `translateY(${-out * 60}px)`, filter: `blur(${out * 8}px)` });
      fr.update(t);
    });
    add(Kicker(L, 'Estuvia', tFrame + 0.3, 'Demo · fictitious data'));
    add(Ring(L, fr, tFrame + 1.0, sc.duration + 0.5, 0.336, 0.225, 0.11, 0.05));
  });

  // 3 — Jornada personalizada
  scene('s3-jornada', (L, sc, add) => {
    const id = sc.id;
    const tDest = w(id, 'destination') - 0.8, tPath = w(id, 'path') - 0.4, tArr = w(id, 'arriving') - 0.4, tNext = w(id, 'always') - 0.3;
    const fr = Frame(L, [[0, 'ob-2-formacao'], [tDest, 'ob-5-destino'], [tPath, 'rounds'], [tArr, 'trail']], [
      [0, 0.55, 0.32, 1.25], [tDest - 0.05, 0.55, 0.34, 1.3], [tDest, 0.58, 0.52, 1.2], [tPath - 0.05, 0.58, 0.58, 1.3],
      [tPath, 0.55, 0.4, 1.0], [tArr - 0.05, 0.58, 0.66, 1.25],
      [tArr, 0.6, 0.35, 1.25], [tNext, 0.6, 0.8, 1.25], [sc.duration, 0.62, 0.86, 1.3]], { enter: 0 });
    add((t) => fr.update(t));
    add(sceneTitle(L, 'One journey. <span class="grad">One step at a time.</span>'));
    add(Kicker(L, 'Your journey', 0.2, 'Demo · fictitious data'));
    add(Cursor(L, fr, [[tDest + 0.1, 0.75, 0.8], [tDest + 0.8, 0.58, 0.6], [tDest + 1.3, 0.58, 0.6]], [tDest + 0.95]));
    add(Callout(L, fr, tPath + 0.8, tArr, { nx: 0.48, ny: 0.53 }, 'Rounds and missions, in the right order<small>Round 1 completed · Round 2 in progress</small>', { side: 'above' }));
    add(Ring(L, fr, tNext - 0.1, sc.duration + 0.5, 0.664, 0.94, 0.165, 0.06));
    add(Cursor(L, fr, [[tNext - 0.3, 0.5, 0.7], [tNext + 0.5, 0.664, 0.94], [tNext + 1.2, 0.664, 0.94]], [tNext + 0.7], { to: sc.duration + 0.4 }));
    add(Callout(L, fr, tNext + 0.2, sc.duration + 0.5, { nx: 0.58, ny: 0.94 }, 'Your next step, always in sight', { side: 'left' }));
  });

  // 4 — Mentor
  scene('s4-mentor', (L, sc, add) => {
    const tClick = 1.9, tType = tClick + 0.35, tSend = tType + 0.9, tAns = tSend + 0.35, tBottom = Math.max(tAns + 2.6, w(sc.id, 'Nothing') - 0.3);
    const fr = Frame(L, [[0, 'mission'], [tType, 'mentor-typed'], [tAns, 'mentor-answer-top'], [tBottom, 'mentor-answer']], [
      [0, 0.42, 0.4, 1.15], [tClick - 0.2, 0.5, 0.5, 1.0], [tType, 0.82, 0.85, 1.5], [tSend, 0.84, 0.88, 1.6],
      [tAns, 0.84, 0.22, 1.65], [tBottom - 0.05, 0.84, 0.34, 1.7], [tBottom, 0.82, 0.3, 1.4], [sc.duration, 0.82, 0.27, 1.5]], { enter: 0 });
    add((t) => fr.update(t));
    add(sceneTitle(L, 'Your <span class="grad">Estuvia Mentor.</span>', 0.3, 2.2));
    add(Kicker(L, 'Estuvia Mentor', 0.2, 'Demo · fictitious data'));
    add(Cursor(L, fr, [[0.5, 0.6, 0.6], [tClick - 0.1, 0.952, 0.951], [tType, 0.952, 0.951], [tSend - 0.2, 0.968, 0.946], [tSend + 0.3, 0.968, 0.946]], [tClick, tSend], { from: 0.5, to: tAns + 0.2 }));
    add(Callout(L, fr, tAns + 0.4, tBottom - 0.1, { nx: 0.72, ny: 0.3 }, 'Answers based on your own journey<small>Guided Mode: works even without paid AI</small>', { side: 'left' }));
    add(Ring(L, fr, tBottom + 0.3, sc.duration + 0.5, 0.932, 0.332, 0.072, 0.045));
    add(Callout(L, fr, tBottom + 0.5, sc.duration + 0.5, { nx: 0.89, ny: 0.332 }, 'You confirm every action', { side: 'left' }));
  });

  // 5 — Agenda AI
  scene('s5-agenda', (L, sc, add) => {
    const tClick = 1.7, tSug = tClick + 0.35, tApprove = Math.max(tSug + 3.0, w(sc.id, 'approve') - 0.5), tToast = tApprove + 0.3, tFilled = tToast + 1.2;
    const fr = Frame(L, [[0, 'agenda'], [tSug, 'agenda-suggest'], [tToast, 'agenda-approved'], [tFilled, 'agenda-filled']], [
      [0, 0.6, 0.3, 1.2], [tClick, 0.7, 0.28, 1.35], [tSug, 0.55, 0.22, 1.35], [tApprove - 1.0, 0.55, 0.3, 1.35], [tApprove - 0.4, 0.7, 0.12, 1.45],
      [tToast, 0.5, 0.9, 1.6], [tFilled - 0.05, 0.5, 0.92, 1.65], [tFilled, 0.6, 0.45, 1.2], [sc.duration, 0.58, 0.42, 1.35]], { enter: 0 });
    add((t) => fr.update(t));
    add(sceneTitle(L, 'Plan better. <span class="grad">Move forward with confidence.</span>', 0.3, 2.0));
    add(Kicker(L, 'Agenda AI', 0.2, 'Demo · fictitious data'));
    add(Cursor(L, fr, [[0.4, 0.5, 0.6], [tClick - 0.1, 0.789, 0.248], [tSug, 0.789, 0.248], [tApprove - 0.5, 0.83, 0.12], [tApprove - 0.1, 0.86, 0.057], [tToast, 0.86, 0.057]], [tClick, tApprove], { from: 0.4, to: tToast }));
    add(Callout(L, fr, tSug + 0.4, tApprove - 0.5, { nx: 0.28, ny: 0.2 }, 'AI proposes your week, around your missions', { side: 'below' }));
    add(Ring(L, fr, tApprove - 0.7, tToast, 0.86, 0.057, 0.075, 0.05));
    add(Callout(L, fr, tFilled + 0.3, sc.duration + 0.5, { x: 960, y: 852 }, 'Only what you approve goes on your calendar', { side: 'center' }));
  });

  // 6 — Financiamento
  scene('s6-financas', (L, sc, add) => {
    const id = sc.id;
    const tA = w(id, 'prepare') - 0.2, tB = w(id, 'live') - 0.2, tC = w(id, 'visa') - 0.2;
    const fr = Frame(L, [[0, 'finance']], [[0, 0.505, 0.3, 1.4], [tA - 1.0, 0.51, 0.32, 1.5], [tA - 0.1, 0.6, 0.9, 1.18], [sc.duration, 0.6, 0.9, 1.22]], { enter: 0 });
    add((t) => fr.update(t));
    add(sceneTitle(L, 'Plan your studies <span class="grad">and your budget.</span>', 0.3, 2.2));
    add(Kicker(L, 'Financial planning', 0.2, 'Demo · fictitious values'));
    add(Callout(L, fr, tA + 0.1, sc.duration + 0.5, { nx: 0.36, ny: 0.8 }, 'Cost to prepare', { num: 'A', side: 'above' }));
    add(Callout(L, fr, tB + 0.1, sc.duration + 0.5, { nx: 0.58, ny: 0.8 }, 'Living costs', { num: 'B', side: 'above' }));
    add(Callout(L, fr, tC + 0.1, sc.duration + 0.5, { nx: 0.8, ny: 0.8 }, 'Visa proof of funds', { num: 'C', side: 'above' }));
  });

  // 7 — Documentos, moradia, viagem e chegada
  scene('s7-mudanca', (L, sc, add) => {
    const id = sc.id;
    const tMor = w(id, 'housing') - 0.35, tVia = w(id, 'trip') - 0.35, tChe = w(id, 'land') - 0.45;
    const fr = Frame(L, [[0, 'documents'], [tMor, 'housing-b'], [tVia, 'travel'], [tChe, 'rounds-c']], [
      [0, 0.55, 0.25, 1.35], [tMor - 0.05, 0.56, 0.3, 1.45], [tMor, 0.6, 0.3, 1.2], [tVia - 0.05, 0.6, 0.32, 1.3], [tVia, 0.6, 0.35, 1.15], [tChe - 0.05, 0.62, 0.4, 1.25],
      [tChe, 0.3, 0.2, 1.5], [tChe + 2.5, 0.52, 0.18, 1.45], [sc.duration, 0.55, 0.16, 1.55]], { enter: 0 });
    add((t) => fr.update(t));
    add(Kicker(L, 'Documents · Housing · Travel', 0.2, 'Demo · fictitious data'));
    const chip = (num, txt, a, b) => add(Callout(L, fr, a + 0.2, b + 0.15, { x: 300, y: 150 }, txt, { num, side: 'right' }));
    chip(1, 'My folder: encrypted documents, by stage', 0, tMor); chip(2, 'Compare housing options', tMor, tVia); chip(3, 'Compare routes by total cost', tVia, tChe); chip(4, 'Arrival and residency in Spain', tChe, sc.duration + 0.4);
    add(sceneTitle(L, 'From application <span class="grad">to arrival.</span>', tChe + 0.6, sc.duration + 0.5));
  });

  // 8 — Oportunidades e comunidade
  scene('s8-comunidade', (L, sc, add) => {
    const tCom = w(sc.id, 'learn') - 0.4;
    const fr = Frame(L, [[0, 'radar-c'], [tCom, 'community']], [[0, 0.56, 0.28, 1.25], [tCom - 0.05, 0.56, 0.34, 1.35], [tCom, 0.56, 0.42, 1.3], [sc.duration, 0.57, 0.48, 1.4]], { enter: 0 });
    add((t) => fr.update(t));
    add(sceneTitle(L, 'Discover. <span class="grad">Share. Achieve.</span>', 0.3, 2.3));
    add(Kicker(L, 'Opportunities · Community', 0.2, 'Demo · fictitious data'));
    add(Ring(L, fr, 0.8, tCom, 0.345, 0.24, 0.24, 0.06));
    add(Callout(L, fr, 1.0, tCom, { nx: 0.47, ny: 0.24 }, 'Official dates and sources, with verification date', { side: 'right' }));
    add(Callout(L, fr, tCom + 0.4, sc.duration + 0.5, { x: 960, y: 852 }, 'Learn from students on the same path', { side: 'center' }));
  });

  // 9 — Encerramento
  scene('s9-final', (L, sc, add) => {
    const id = sc.id;
    const tStart = w(id, 'Start') - 0.3, tName = w(id, 'Estuvia');
    const cards = [['trail', -560, 40, 16], ['agenda-filled', 0, -30, 0], ['finance', 560, 40, -16]].map(([n, x, y, r]) => {
      const c = el('div', 'collage-card', L, `<img src="../assets/screens/${n}.png">`); return { c, x, y, r };
    });
    const logo = el('div', 'logo', L, '<div class="logo-mark"></div><div class="logo-word caps">ESTUVIA</div><div class="logo-sub">Your future starts here.</div>'); css(logo, { top: '200px' });
    const sign = el('div', 'sign', L, 'A <b>NEXFORGE</b> creation'); css(sign, { top: '760px' });
    const disc = el('div', 'disclaimer', L, 'Estuvia guides and organizes. Applications, enrollment and visas are submitted by the student through the official systems.'); css(disc, { top: '830px' });
    const black = el('div', 'scrim', L); black.style.background = '#000';
    add((t) => {
      const out = E.io(seg(t, tStart - 0.3, tStart + 0.4));
      cards.forEach(({ c, x, y, r }, i) => {
        const p = E.expo(seg(t, 0.1 + i * 0.15, 1.1 + i * 0.15));
        css(c, { left: `${960 - 320 + x}px`, top: `${300 + y + (1 - p) * 140 - out * 40}px`, opacity: p * (1 - out), transform: `perspective(1600px) rotateY(${r * (0.6 + 0.4 * (1 - p))}deg) scale(${0.9 + 0.1 * p - 0.08 * out})`, filter: `blur(${out * 10}px)` });
      });
      const [mark, word, sub] = logo.children;
      const a = E.back(seg(t, tStart, tStart + 0.7));
      css(mark, { opacity: seg(t, tStart, tStart + 0.35), transform: `scale(${0.6 + 0.4 * a})` });
      css(word, { opacity: E.out(seg(t, tName - 0.6, tName + 0.2)), letterSpacing: `${0.18 + 0.12 * (1 - E.out(seg(t, tName - 0.6, tName + 1.2)))}em` });
      css(sub, { opacity: E.out(seg(t, tStart + 0.3, tStart + 0.9)), transform: `translateY(${(1 - E.out(seg(t, tStart + 0.3, tStart + 0.9))) * 20}px)` });
      css(sign, { opacity: E.out(seg(t, tName + 0.5, tName + 1.2)) });
      css(disc, { opacity: E.out(seg(t, tName + 0.9, tName + 1.6)) * 0.95 });
      css(black, { opacity: seg(t, sc.duration - 0.8, sc.duration) });
    });
  });
}

// ---------------------------------------------------------------- fundo e legendas

function buildGlobals() {
  const bg = el('div', 'layer', stage);
  bg.style.zIndex = -1;
  el('div', 'bg-grid', bg);
  const g1 = el('div', 'bg-glow', bg), g2 = el('div', 'bg-glow', bg);
  css(g1, { width: '900px', height: '900px', background: 'rgb(45 212 191 / 16%)' });
  css(g2, { width: '800px', height: '800px', background: 'rgb(139 92 246 / 14%)' });
  globals.push((t) => {
    css(g1, { left: `${-200 + 120 * Math.sin(t * 0.11)}px`, top: `${-300 + 80 * Math.cos(t * 0.13)}px` });
    css(g2, { left: `${1300 + 100 * Math.cos(t * 0.09)}px`, top: `${400 + 90 * Math.sin(t * 0.12)}px` });
  });
  const cap = el('div', '', stage); cap.id = 'captions';
  const span = el('span', '', cap);
  let last = null;
  globals.push((t) => {
    const c = D.cues.find((x) => t >= x.start && t < x.end);
    if (!c) return css(cap, { opacity: 0 });
    if (c !== last) { span.textContent = c.text; last = c; }
    css(cap, { opacity: Math.min(seg(t, c.start, c.start + 0.12), 1 - seg(t, c.end - 0.12, c.end)) });
  });
}

window.setup = (data) => {
  D = data;
  SC = Object.fromEntries(D.timeline.scenes.map((s) => [s.id, s]));
  stage = document.getElementById('stage');
  buildGlobals();
  buildScenes();
  return Promise.all([...document.images].map((i) => i.decode().catch(() => console.warn('img', i.src))));
};

window.renderAt = (t) => {
  globals.forEach((g) => g(t));
  scenes.forEach(({ sc, layer, parts, first }) => {
    const lt = t - sc.start;
    const visible = lt >= -0.01 && lt <= sc.duration + 0.75;
    if (!visible) { layer.style.display = 'none'; return; }
    layer.style.display = '';
    layer.style.opacity = first ? 1 : E.io(seg(lt, 0, 0.7));
    parts.forEach((p) => p(lt));
  });
};
