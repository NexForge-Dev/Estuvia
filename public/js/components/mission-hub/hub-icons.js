// Ícones extras da central da missão (mesmo traço 2px/24×24 de icons.js). Os demais vêm de icons.js.
import { icon } from '../../icons.js';

const NS = 'http://www.w3.org/2000/svg';
const EXTRA = {
  calculator: ['M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z', 'M8 6h8', 'M16 14v4', 'M8 10h.01', 'M12 10h.01', 'M16 10h.01', 'M8 14h.01', 'M12 14h.01', 'M8 18h.01', 'M12 18h.01'],
  shieldCheck: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  piggy: ['M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z', 'M2 9v1c0 1.1.9 2 2 2h1', 'M16 11h.01'],
  bulb: ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'],
  bus: ['M8 6v6', 'M15 6v6', 'M2 12h19.6', 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3', 'M7 18h7', 'M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z', 'M18 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  train: ['M8 3h8a4 4 0 0 1 4 4v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a4 4 0 0 1 4-4Z', 'M4 11h16', 'M12 3v8', 'm8 19-2 3', 'm18 22-2-3', 'M8 15h.01', 'M16 15h.01'],
  car: ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 5H6.3a2 2 0 0 0-1.6.8L2 10v6c0 .6.4 1 1 1h2', 'M9 17h6', 'M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z', 'M19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  walk: ['M13 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'm9 20 3-6 3 2v6', 'm9 11 3-4 4 3 3 1', 'M8 13l1-5 3-1'],
  calendarDays: ['M8 2v4', 'M16 2v4', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M3 10h18', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01'],
};

export function hubIcon(name, { size = 20 } = {}) {
  if (!EXTRA[name]) return icon(name, { size });
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon' })) svg.setAttribute(k, v);
  for (const d of EXTRA[name]) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.append(p); }
  return svg;
}
