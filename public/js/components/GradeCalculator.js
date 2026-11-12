// "Minha nota no DUA": converte a média da graduação para a escala espanhola (5 a 10) pela fórmula oficial
// do Distrito Único Andaluz e salva no perfil. Usado no Meu perfil e na Missão 2.3.
import { h, mount, toast } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setMe } from '../app.js';
import { Select } from './Select.js';
import { ESCALAS, NOTA_SEM_ESCALA, duaGrade, fmtNota } from '../data/grade.js';

const toNum = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

export function GradeCalculator({ onSaved } = {}) {
  const p = state.me.user.profile || {};
  const known = ESCALAS.find((e) => e.max === p.notaMaxima);
  let escala = p.notaMaxima == null ? '0-10' : known?.id || 'outra';

  const numInput = (name, value, attrs) => h('input', { name, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: value ?? '', ...attrs });
  const media = numInput('notaMedia', p.notaMedia, { placeholder: 'Ex.: 8,2', 'aria-describedby': 'gc-result' });
  const minima = numInput('notaMinima', p.notaMinima, { placeholder: 'Ex.: 6' });
  const maxima = numInput('notaMaxima', known ? '' : p.notaMaxima, { placeholder: 'Ex.: 4' });
  const maxField = h('div', { class: 'field-slot' });
  const quick = h('div', { class: 'row wrap gc-quick' });
  const result = h('div', { class: 'gc-result', id: 'gc-result', 'aria-live': 'polite' });

  const maxValue = () => (escala === 'outra' ? toNum(maxima.value) : ESCALAS.find((e) => e.id === escala).max);

  const paintScale = () => {
    mount(maxField, escala === 'outra' ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nota máxima da escala'), maxima) : null);
    const e = ESCALAS.find((x) => x.id === escala);
    mount(quick, ...(e ? [h('span', { class: 'small muted' }, 'Comuns:'), ...e.minimos.map((v) => h('button', {
      type: 'button', class: 'chip', onClick: () => { minima.value = fmtNota(v); paint(); },
    }, fmtNota(v)))] : []));
  };

  const paint = () => {
    const entrada = { nota: toNum(media.value), max: maxValue(), min: toNum(minima.value) };
    if ([entrada.nota, entrada.min].every((v) => v == null)) {
      mount(result, h('p', { class: 'muted small' }, 'Preencha a média e a mínima para aprovação para ver o resultado.'));
      return null;
    }
    const r = duaGrade(entrada);
    if (!r.ok) { mount(result, h('p', { class: 'gc-error' }, icon('alert', { size: 14 }), ' ', r.erro)); return null; }
    mount(result,
      h('div', { class: 'gc-value' }, h('strong', {}, fmtNota(r.valor, 2)), h('span', {}, 'sua média na escala espanhola (5 a 10)')),
      h('p', { class: 'small' }, `Conta oficial: 5 + 5 × (${fmtNota(entrada.nota)} − ${fmtNota(entrada.min)}) ÷ (${fmtNota(entrada.max)} − ${fmtNota(entrada.min)}) = ${fmtNota(r.valor, 3)}.`));
    return { ...entrada, valor: r.valor };
  };

  const scaleSel = Select({
    value: escala, searchable: false, ariaLabel: 'Escala de notas do histórico',
    options: [...ESCALAS.map((e) => [e.id, e.rotulo]), ['outra', 'Outra escala']],
    onChange: (v) => { escala = v; paintScale(); paint(); },
  });
  for (const el of [media, minima, maxima]) el.addEventListener('input', paint);

  const save = async () => {
    const r = paint();
    if (!r) { toast('Confira os valores antes de salvar.', 'err'); return; }
    try {
      setMe(await api.put('/me/profile', { notaMedia: r.nota, notaMaxima: r.max, notaMinima: r.min }));
      toast('Nota salva. Ela aparece na elegibilidade e nas fichas dos másteres.', 'ok');
      onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  };
  const clear = async () => {
    try {
      setMe(await api.put('/me/profile', { notaMedia: null, notaMaxima: null, notaMinima: null }));
      media.value = ''; minima.value = ''; maxima.value = '';
      paint(); toast('Nota apagada do perfil.', 'ok'); onSaved?.();
    } catch (e) { toast(e.message, 'err'); }
  };

  paintScale();
  paint();
  return h('div', { class: 'stack gc' },
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Escala do seu histórico'), scaleSel),
      maxField,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Média final da graduação'), media,
        h('small', { class: 'hint' }, 'A média final que consta no histórico oficial (ou o CR/coeficiente de rendimento).')),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'gc-min' }, 'Nota mínima para aprovação'), Object.assign(minima, { id: 'gc-min' }), quick,
        h('small', { class: 'hint' }, 'Muda de uma universidade para outra: confira no regulamento ou na declaração da escala de notas.'))),
    result,
    h('p', { class: 'notice' }, `Para o DUA usar esta conta, anexe o histórico com a média final e o certificado da escala (nota mínima e máxima). Sem um dos dois, a sua média vira ${fmtNota(NOTA_SEM_ESCALA, 2)}, a mínima da escala espanhola.`),
    h('details', { class: 'md-expand' }, h('summary', {}, h('span', {}, 'Meu histórico usa conceitos (A, B, C…) ou tenho a declaração do Ministério'), icon('chevron', { size: 16, cls: 'chev' })),
      h('ul', { class: 'md-expand-body' },
        h('li', {}, 'Conceitos em letra não entram direto na fórmula: peça à sua universidade a média final em número e a escala correspondente.'),
        h('li', {}, 'A convocatória também aceita, no lugar desta conta, a "Declaración de equivalencia de notas medias" feita no site do Ministério espanhol. Ela usa outra metodologia e pode dar outro valor.'))),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn btn-cta', type: 'button', onClick: save }, icon('check', { size: 16 }), 'Salvar no meu perfil'),
      p.notaMedia != null ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: clear }, 'Apagar') : null),
    h('p', { class: 'hint' }, 'Fonte: procedimento oficial do Distrito Único Andaluz para título estrangeiro (art. 4 e 7). A nota é uma estimativa sua: quem calcula a nota oficial é a universidade.'),
  );
}
