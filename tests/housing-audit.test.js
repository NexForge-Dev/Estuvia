// Auditoria do Meu novo lar: comparação nunca subtrai euro de real; a moeda acompanha os custos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { housingCosts, compareHousing } = await import('../server/housing-engine.js');

test('custos trazem a moeda informada no anúncio', () => {
  assert.equal(housingCosts({ aluguel: 2000, moeda: 'BRL' }).moeda, 'BRL');
  assert.equal(housingCosts({ aluguel: 300 }).moeda, 'EUR');
});

test('comparação com moedas diferentes não inventa diferença', () => {
  const list = [
    { id: 'a', nome: 'Quarto A', aluguel: 300, contasIncluidas: true, moeda: 'EUR' },
    { id: 'b', nome: 'Quarto B', aluguel: 1900, contasIncluidas: true, moeda: 'BRL' },
    { id: 'c', nome: 'Quarto C', aluguel: 350, contasIncluidas: true, moeda: 'EUR' },
  ];
  const cmp = compareHousing(list, 10);
  const txt = cmp.diferencas.join(' | ');
  assert.match(txt, /Quarto A custa € 50 a menos por mês que Quarto C/);
  assert.doesNotMatch(txt, /a menos por mês que Quarto B/);
  assert.doesNotMatch(txt, /Quarto B custa/);
  assert.match(txt, /Quarto B: valores em reais, não comparamos/);
});

test('comparação só em reais usa R$', () => {
  const cmp = compareHousing([
    { id: 'a', nome: 'A', aluguel: 1800, contasIncluidas: true, moeda: 'BRL' },
    { id: 'b', nome: 'B', aluguel: 2000, contasIncluidas: true, moeda: 'BRL' },
  ], 12);
  assert.match(cmp.diferencas[0], /A custa R\$ 200 a menos por mês que B/);
});
