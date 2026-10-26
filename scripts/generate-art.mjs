// Gera as ilustrações da plataforma (capas de cidades e banners das rodadas) como SVG.
// Arte própria, sem fotos de terceiros. Uso: node scripts/generate-art.mjs
// Para usar fotos reais no lugar, basta salvar um arquivo com o mesmo nome em public/img/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');
const W = 1200;
const H = 520;

const svg = (id, [top, bottom], body, glow = { x: 900, y: 140, r: 260, color: '#ffffff', o: 0.18 }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
  <radialGradient id="${id}-glow" cx="${glow.x}" cy="${glow.y}" r="${glow.r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow.color}" stop-opacity="${glow.o}"/><stop offset="1" stop-color="${glow.color}" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>
<rect width="${W}" height="${H}" fill="url(#${id}-glow)"/>
${body}
<rect width="${W}" height="${H}" fill="url(#${id}-fade)"/>
</svg>`;

const rand = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const stars = (n, seed, maxY = 260) => { const r = rand(seed); return Array.from({ length: n }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * maxY).toFixed(0)}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.6 + 0.2).toFixed(2)}"/>`).join(''); };
const lights = (n, seed, y0, y1, color = '#ffd27a') => { const r = rand(seed); return Array.from({ length: n }, () => `<rect x="${(r() * W).toFixed(0)}" y="${(y0 + r() * (y1 - y0)).toFixed(0)}" width="3" height="3" fill="${color}" opacity="${(r() * 0.7 + 0.3).toFixed(2)}"/>`).join(''); };
const crenels = (x, y, w, h, step = 18, fill = '#000') => Array.from({ length: Math.floor(w / step) }, (_, i) => i % 2 ? '' : `<rect x="${x + i * step}" y="${y - h}" width="${step}" height="${h}" fill="${fill}"/>`).join('');
const cypress = (x, y, h, fill) => `<path d="M${x} ${y} C ${x - h * 0.16} ${y - h * 0.5}, ${x - h * 0.05} ${y - h * 0.9}, ${x} ${y - h} C ${x + h * 0.05} ${y - h * 0.9}, ${x + h * 0.16} ${y - h * 0.5}, ${x} ${y} Z" fill="${fill}"/>`;
const palm = (x, y, h, fill) => `<path d="M${x} ${y} q 8 ${-h * 0.5} 2 ${-h}" stroke="${fill}" stroke-width="7" fill="none" stroke-linecap="round"/>${[-70, -30, 10, 50, 90, 130].map((a) => `<path d="M${x + 2} ${y - h} q ${Math.cos((a * Math.PI) / 180) * 40} ${-20 + Math.sin((a * Math.PI) / 180) * 10} ${Math.cos((a * Math.PI) / 180) * 80} ${Math.abs(Math.sin((a * Math.PI) / 180)) * 30}" stroke="${fill}" stroke-width="6" fill="none" stroke-linecap="round"/>`).join('')}`;

// ---------- Cidades ----------

const cities = {
  granada: svg('gr', ['#1b1340', '#e07a4a'], `
    ${stars(50, 7, 200)}
    <path d="M0 300 L150 190 L230 240 L360 150 L470 230 L600 170 L720 250 L860 160 L990 240 L1100 190 L1200 230 L1200 520 L0 520Z" fill="#3a2f63"/>
    <path d="M330 168 L360 150 L392 172 L372 170 L360 160 L346 172Z M830 180 L860 160 L893 182 L873 180 L860 170 L846 182Z M570 188 L600 170 L628 190 L610 188 L600 180 L588 190Z" fill="#f3eefc" opacity=".9"/>
    <path d="M0 360 Q 300 300 600 330 T 1200 320 L1200 520 L0 520Z" fill="#2a1f3d"/>
    <g fill="#c4703d">
      <rect x="260" y="282" width="560" height="60"/>
      ${crenels(260, 282, 560, 12, 16, '#c4703d')}
      <rect x="300" y="236" width="70" height="106"/>${crenels(300, 236, 70, 10, 14, '#c4703d')}
      <rect x="520" y="250" width="56" height="92"/>${crenels(520, 250, 56, 10, 14, '#c4703d')}
      <rect x="700" y="228" width="84" height="114"/>${crenels(700, 228, 84, 10, 14, '#c4703d')}
    </g>
    <g fill="#8e4a26"><rect x="318" y="262" width="10" height="16" rx="5"/><rect x="342" y="262" width="10" height="16" rx="5"/><rect x="722" y="254" width="10" height="18" rx="5"/><rect x="750" y="254" width="10" height="18" rx="5"/></g>
    <path d="M0 400 Q 260 350 520 380 T 1200 370 L1200 520 L0 520Z" fill="#1c1530"/>
    ${[90, 140, 860, 910, 1010, 1080].map((x, i) => cypress(x, 400 - (i % 2) * 8, 110 + (i % 3) * 18, '#0f2a22')).join('')}
    ${lights(70, 3, 410, 500)}
  `, { x: 930, y: 300, r: 380, color: '#ffb36b', o: 0.45 }),

  sevilla: svg('se', ['#2a1a3a', '#f0a05a'], `
    ${stars(25, 11, 160)}
    <circle cx="300" cy="250" r="70" fill="#ffd08a" opacity=".85"/>
    <path d="M0 360 L1200 360 L1200 520 L0 520Z" fill="#2c3e63"/>
    <g fill="#d48a4e">
      <rect x="700" y="150" width="70" height="230"/>
      <rect x="708" y="110" width="54" height="44"/>
      <rect x="716" y="80" width="38" height="32"/>
      <path d="M720 80 L735 40 L750 80Z"/>
      <rect x="733" y="26" width="4" height="16"/>
    </g>
    <g fill="#a9622f"><rect x="716" y="120" width="10" height="22" rx="5"/><rect x="744" y="120" width="10" height="22" rx="5"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="712" y="${170 + i * 38}" width="46" height="4"/>`).join('')}</g>
    <path d="M0 340 L620 340 L620 300 L660 300 L660 340 L820 340 L820 310 L900 280 L980 310 L980 340 L1200 340 L1200 380 L0 380Z" fill="#7a4a3a"/>
    <path d="M60 380 Q 140 320 220 380 Q 300 320 380 380 Q 460 320 540 380" fill="none" stroke="#e8c39a" stroke-width="10"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 90 + 20}" y="${410 + (i % 3) * 22}" width="${40 + (i % 4) * 14}" height="3" fill="#ffd08a" opacity=".5"/>`).join('')}
    ${palm(1080, 360, 150, '#203a2c')}${palm(1000, 362, 120, '#203a2c')}
  `, { x: 300, y: 250, r: 420, color: '#ffcf8a', o: 0.5 }),

  malaga: svg('ma', ['#0e3a5a', '#5fc2c9'], `
    <circle cx="950" cy="150" r="64" fill="#fff3c4" opacity=".9"/>
    <path d="M0 330 Q 300 310 600 330 T 1200 320 L1200 520 L0 520Z" fill="#0d5b7a"/>
    ${Array.from({ length: 18 }, (_, i) => `<path d="M${i * 70} ${360 + (i % 4) * 30} q 20 -8 40 0" stroke="#bfeaf0" stroke-width="3" fill="none" opacity=".5"/>`).join('')}
    <path d="M0 330 L0 220 Q 120 160 260 200 Q 380 230 460 300 L480 330Z" fill="#3e6b4a"/>
    <g fill="#d9b48a"><rect x="110" y="168" width="180" height="40"/>${crenels(110, 168, 180, 10, 14, '#d9b48a')}<rect x="150" y="136" width="40" height="40"/>${crenels(150, 136, 40, 8, 10, '#d9b48a')}</g>
    <path d="M760 360 l60 0 l-10 16 l-40 0z" fill="#f4f1ea"/><path d="M790 360 l0 -50 l26 44z" fill="#f4f1ea"/>
    <path d="M560 400 l50 0 l-8 12 l-34 0z" fill="#f4f1ea"/><path d="M585 400 l0 -40 l20 36z" fill="#f4f1ea"/>
    ${palm(380, 330, 140, '#14352a')}${palm(450, 332, 110, '#14352a')}
  `, { x: 950, y: 150, r: 360, color: '#fff3c4', o: 0.4 }),

  cordoba: svg('co', ['#2b1420', '#a3473a'], `
    ${stars(30, 5, 140)}
    <rect x="0" y="150" width="${W}" height="370" fill="#3a1d1f"/>
    ${Array.from({ length: 9 }, (_, i) => {
      const x = 40 + i * 132;
      const stripes = Array.from({ length: 9 }, (_, k) => `<path d="M${x + 60} 270 L${x + Math.cos(Math.PI + (k * Math.PI) / 8) * 58 + 60} ${270 + Math.sin(Math.PI + (k * Math.PI) / 8) * 58} L${x + Math.cos(Math.PI + ((k + 1) * Math.PI) / 8) * 58 + 60} ${270 + Math.sin(Math.PI + ((k + 1) * Math.PI) / 8) * 58}Z" fill="${k % 2 ? '#e9d8b6' : '#b3402f'}"/>`).join('');
      return `${stripes}<rect x="${x}" y="270" width="12" height="250" fill="#d7b98c"/><rect x="${x + 108}" y="270" width="12" height="250" fill="#d7b98c"/><path d="M${x + 14} 270 a46 46 0 0 1 92 0 L${x + 106} 520 L${x + 14} 520Z" fill="#24110f"/>`;
    }).join('')}
  `, { x: 600, y: 300, r: 520, color: '#ffb070', o: 0.25 }),

  cadiz: svg('ca', ['#123b5e', '#f0b46e'], `
    <circle cx="260" cy="190" r="56" fill="#fff0c2" opacity=".85"/>
    <path d="M0 360 L1200 360 L1200 520 L0 520Z" fill="#1d5f86"/>
    ${Array.from({ length: 16 }, (_, i) => `<path d="M${i * 80 + 10} ${390 + (i % 3) * 34} q 22 -9 44 0" stroke="#cfe9f5" stroke-width="3" fill="none" opacity=".45"/>`).join('')}
    <g fill="#f3efe6">
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${430 + i * 70}" y="${300 - (i % 3) * 22}" width="66" height="${60 + (i % 3) * 22}"/>`).join('')}
    </g>
    <rect x="640" y="230" width="120" height="70" fill="#efe6d4"/>
    <path d="M640 232 a60 60 0 0 1 120 0Z" fill="#e2b33d"/>
    <rect x="696" y="160" width="8" height="20" fill="#e2b33d"/>
    <rect x="660" y="190" width="26" height="60" fill="#efe6d4"/><rect x="714" y="190" width="26" height="60" fill="#efe6d4"/>
    ${lights(30, 9, 300, 355, '#e2b33d')}
  `, { x: 260, y: 190, r: 380, color: '#fff0c2', o: 0.45 }),

  andaluzia: svg('an', ['#20324a', '#d98f5a'], `
    ${stars(20, 13, 150)}
    <path d="M0 300 Q 200 230 420 280 T 820 260 T 1200 280 L1200 520 L0 520Z" fill="#5c6b3a"/>
    <path d="M0 370 Q 300 320 600 360 T 1200 350 L1200 520 L0 520Z" fill="#3f4d29"/>
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i % 10) * 125 + 40 + (Math.floor(i / 10) % 2) * 60}" cy="${390 + Math.floor(i / 10) * 30}" r="${11 - Math.floor(i / 10)}" fill="#26331a"/>`).join('')}
    <g fill="#f4efe4">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${640 + i * 46}" y="${250 - (i % 2) * 14}" width="42" height="${40 + (i % 2) * 14}"/>`).join('')}</g>
    <g fill="#b9643a">${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${638 + i * 46} ${250 - (i % 2) * 14} l23 -12 l23 12z"/>`).join('')}</g>
    <rect x="760" y="196" width="18" height="50" fill="#f4efe4"/>
  `, { x: 900, y: 200, r: 400, color: '#ffc98a', o: 0.35 }),
};

// ---------- Rodadas ----------

const books = (x0, y0, seed) => { const r = rand(seed); const colors = ['#ff8a5c', '#5ec5b9', '#f2c14e', '#8b7cf6', '#e8615f', '#58a6ff']; let x = x0; return Array.from({ length: 22 }, () => { const w = 18 + r() * 22; const hgt = 90 + r() * 40; const s = `<rect x="${x.toFixed(0)}" y="${(y0 - hgt).toFixed(0)}" width="${w.toFixed(0)}" height="${hgt.toFixed(0)}" rx="3" fill="${colors[Math.floor(r() * colors.length)]}" opacity=".9"/><rect x="${(x + 4).toFixed(0)}" y="${(y0 - hgt + 14).toFixed(0)}" width="${(w - 8).toFixed(0)}" height="4" fill="#000" opacity=".2"/>`; x += w + 4; return s; }).join(''); };

const rounds = {
  academico: svg('r1', ['#14213d', '#1f4068'], `
    <rect x="80" y="70" width="620" height="420" rx="14" fill="#0f1a30"/>
    ${[200, 330, 460].map((y, i) => `${books(110, y, 21 + i)}<rect x="96" y="${y}" width="588" height="12" fill="#2a3c5f"/>`).join('')}
    <circle cx="930" cy="250" r="150" fill="none" stroke="#5ec5b9" stroke-width="10" opacity=".9"/>
    <circle cx="930" cy="250" r="118" fill="none" stroke="#5ec5b9" stroke-width="2" opacity=".5"/>
    <path d="M1010 170 L955 275 L850 330 L905 225Z" fill="#f2c14e"/><path d="M1010 170 L955 275 L905 225Z" fill="#ff8a5c"/>
    <circle cx="930" cy="250" r="10" fill="#0f1a30"/>
  `, { x: 930, y: 250, r: 360, color: '#5ec5b9', o: 0.25 }),

  documentos: svg('r2', ['#1d1b2f', '#3b2f5c'], `
    ${[0, 1, 2].map((i) => `<g transform="rotate(${-8 + i * 7} ${520 + i * 60} 270)"><rect x="${380 + i * 70}" y="${90 + i * 18}" width="300" height="380" rx="12" fill="${['#e8e4f5', '#f4f1fb', '#ffffff'][i]}"/>${Array.from({ length: 9 }, (_, k) => `<rect x="${410 + i * 70}" y="${150 + i * 18 + k * 32}" width="${k % 3 === 2 ? 160 : 240}" height="8" rx="4" fill="#b9b2d6"/>`).join('')}</g>`).join('')}
    <circle cx="780" cy="390" r="52" fill="none" stroke="#e8615f" stroke-width="8" opacity=".85"/><path d="M752 392 l20 18 l34 -38" stroke="#e8615f" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M640 96 v-40 a18 18 0 0 1 36 0 v70 a28 28 0 0 1 -56 0 v-54" stroke="#9aa3b5" stroke-width="7" fill="none"/>
  `, { x: 600, y: 260, r: 420, color: '#8b7cf6', o: 0.35 }),

  candidatura: svg('r3', ['#0f2027', '#2c5364'], `
    <path d="M300 200 L600 90 L900 200Z" fill="#e6e1d3"/>
    <rect x="300" y="200" width="600" height="26" fill="#d4cdb9"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${330 + i * 100}" y="226" width="40" height="210" fill="#efeadb"/><rect x="${324 + i * 100}" y="226" width="52" height="14" fill="#d4cdb9"/>`).join('')}
    <rect x="280" y="436" width="640" height="30" fill="#d4cdb9"/><rect x="250" y="466" width="700" height="26" fill="#bdb59e"/>
    <rect x="596" y="20" width="6" height="80" fill="#e6e1d3"/><path d="M602 22 h70 l-16 18 l16 18 h-70z" fill="#f2c14e"/>
    <g transform="translate(980 120)"><circle r="70" fill="#5ec5b9" opacity=".2"/><path d="M-34 6 L36 -30 L18 40 L4 12Z" fill="#5ec5b9"/><path d="M4 12 L36 -30" stroke="#0f2027" stroke-width="4"/></g>
  `, { x: 600, y: 160, r: 420, color: '#f2c14e', o: 0.25 }),

  matricula: svg('r4', ['#1a1a2e', '#16537e'], `
    <path d="M600 110 L860 220 L600 330 L340 220Z" fill="#1c2541"/><path d="M600 110 L860 220 L600 330 L340 220Z" fill="none" stroke="#5bc0be" stroke-width="4"/>
    <path d="M450 268 v90 c80 60 220 60 300 0 v-90 L600 330Z" fill="#0b132b"/>
    <path d="M860 220 v110" stroke="#f2c14e" stroke-width="6"/><circle cx="860" cy="340" r="14" fill="#f2c14e"/>
    <g transform="translate(150 330) rotate(-12)"><rect width="220" height="110" rx="12" fill="#f4efe1"/><rect x="24" y="30" width="150" height="8" rx="4" fill="#b8ad8f"/><rect x="24" y="52" width="110" height="8" rx="4" fill="#b8ad8f"/><circle cx="180" cy="80" r="16" fill="#e8615f"/></g>
  `, { x: 600, y: 220, r: 420, color: '#5bc0be', o: 0.3 }),

  visto: svg('r5', ['#10162f', '#3a1c71'], `
    <g transform="rotate(-6 520 270)">
      <rect x="380" y="80" width="300" height="400" rx="22" fill="#7a1f3d"/><rect x="380" y="80" width="300" height="400" rx="22" fill="none" stroke="#c9a14a" stroke-width="3" opacity=".6"/>
      <circle cx="530" cy="240" r="62" fill="none" stroke="#c9a14a" stroke-width="6"/><circle cx="530" cy="240" r="28" fill="#c9a14a" opacity=".85"/>
      <rect x="450" y="350" width="160" height="10" rx="5" fill="#c9a14a"/><rect x="480" y="376" width="100" height="8" rx="4" fill="#c9a14a" opacity=".7"/>
    </g>
    <g opacity=".85"><ellipse cx="840" cy="190" rx="90" ry="56" fill="none" stroke="#5ec5b9" stroke-width="6" transform="rotate(14 840 190)"/><rect x="780" y="182" width="120" height="8" rx="4" fill="#5ec5b9" transform="rotate(14 840 190)"/>
    <rect x="760" y="300" width="160" height="96" rx="14" fill="none" stroke="#f2c14e" stroke-width="6" transform="rotate(-10 840 348)"/><path d="M790 350 l24 20 l40 -44" stroke="#f2c14e" stroke-width="8" fill="none" transform="rotate(-10 840 348)"/></g>
  `, { x: 560, y: 260, r: 440, color: '#c9a14a', o: 0.25 }),

  mudanca: svg('r6', ['#0b2545', '#13315c'], `
    ${stars(30, 17, 220)}
    <path d="M80 420 C 400 120, 800 60, 1120 120" stroke="#8da9c4" stroke-width="4" stroke-dasharray="14 14" fill="none" opacity=".7"/>
    <g transform="translate(1040 110) rotate(12)"><path d="M-60 0 L60 -8 L80 0 L60 8Z" fill="#eef4ed"/><path d="M-6 -4 L-30 -50 L-12 -50 L22 -4Z M-6 4 L-30 50 L-12 50 L22 4Z" fill="#eef4ed"/><path d="M-52 -2 L-70 -24 L-60 -24 L-40 -2Z" fill="#eef4ed"/></g>
    <rect x="320" y="220" width="300" height="240" rx="26" fill="#e8615f"/><rect x="420" y="180" width="100" height="46" rx="14" fill="none" stroke="#c44a48" stroke-width="12"/>
    <rect x="380" y="220" width="18" height="240" fill="#c44a48"/><rect x="542" y="220" width="18" height="240" fill="#c44a48"/>
    <circle cx="470" cy="320" r="34" fill="#f2c14e"/><rect x="420" y="380" width="90" height="40" rx="8" fill="#5ec5b9" transform="rotate(-8 465 400)"/>
    <circle cx="360" cy="470" r="12" fill="#1b1b2f"/><circle cx="580" cy="470" r="12" fill="#1b1b2f"/>
  `, { x: 470, y: 320, r: 420, color: '#e8615f', o: 0.25 }),

  chegada: cities.granada.replace(/id="gr-/g, 'id="r7-').replace(/url\(#gr-/g, 'url(#r7-').replace('</svg>', `
    <g transform="translate(600 150)"><path d="M0 70 C -40 20 -40 -34 0 -34 C 40 -34 40 20 0 70Z" fill="#5ec5b9"/><circle cy="-8" r="14" fill="#10302c"/></g></svg>`),

  financiamento: svg('r9', ['#0b1f1c', '#123b33'], `
    ${stars(18, 23, 160)}
    ${[0, 1, 2, 3, 4].map((i) => `<g transform="translate(${300 + i * 34} ${420 - i * 10})">${Array.from({ length: 4 + i }, (_, k) => `<ellipse cx="0" cy="${-k * 22}" rx="58" ry="16" fill="${k % 2 ? '#e8b931' : '#f5cf4f'}" stroke="#b8860b" stroke-width="3"/>`).join('')}</g>`).join('')}
    <g transform="translate(770 280)">
      <ellipse rx="170" ry="120" fill="#f472b6"/><ellipse cx="-40" cy="-40" rx="60" ry="30" fill="#f9a8d4" opacity=".55"/>
      <circle cx="150" cy="-10" r="34" fill="#ec4899"/><circle cx="142" cy="-16" r="5" fill="#831843"/><circle cx="160" cy="-4" r="5" fill="#831843"/>
      <circle cx="80" cy="-50" r="9" fill="#1f2937"/>
      <path d="M-60 -122 h70" stroke="#831843" stroke-width="10" stroke-linecap="round"/>
      <rect x="-120" y="90" width="30" height="50" rx="10" fill="#ec4899"/><rect x="70" y="90" width="30" height="50" rx="10" fill="#ec4899"/>
    </g>
    <g transform="translate(980 120)"><circle r="44" fill="#2dd4bf"/><text y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#042f2a">€</text></g>
  `, { x: 770, y: 280, r: 420, color: '#f5cf4f', o: 0.25 }),

  regularizacao: svg('r8', ['#0d1b2a', '#1b263b'], `
    <rect x="300" y="130" width="440" height="270" rx="26" fill="#e0e1dd"/>
    <rect x="300" y="130" width="440" height="60" rx="26" fill="#415a77"/><rect x="300" y="166" width="440" height="24" fill="#415a77"/>
    <rect x="336" y="222" width="110" height="140" rx="12" fill="#778da9"/><circle cx="391" cy="268" r="26" fill="#e0e1dd"/><path d="M350 352 q41 -52 82 0z" fill="#e0e1dd"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="476" y="${236 + i * 32}" width="${i === 3 ? 120 : 220}" height="12" rx="6" fill="#9aa5b1"/>`).join('')}
    <g transform="translate(860 300)"><path d="M0 -120 L90 -86 V-10 C 90 56 0 100 0 100 C 0 100 -90 56 -90 -10 V-86Z" fill="#5ec5b9"/><path d="M-36 -6 l26 26 l50 -56" stroke="#0d1b2a" stroke-width="14" fill="none" stroke-linecap="round"/></g>
  `, { x: 860, y: 300, r: 380, color: '#5ec5b9', o: 0.3 }),
};

for (const [dir, set] of [['cities', cities], ['rounds', rounds]]) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const [name, content] of Object.entries(set)) fs.writeFileSync(path.join(root, dir, `${name}.svg`), content.replace(/\n\s+/g, '\n'));
}
console.log(`Arte gerada em ${root}`);
