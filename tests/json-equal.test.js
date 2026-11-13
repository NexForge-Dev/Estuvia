import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameJson, stableStringify } from '../server/json-equal.js';

test('mesmos dados em outra ordem de chaves são iguais (como volta do jsonb)', () => {
  assert.ok(sameJson({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 }));
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('ordem de arrays, valores e tipos continuam contando', () => {
  assert.ok(!sameJson([1, 2], [2, 1]));
  assert.ok(!sameJson({ a: 1 }, { a: '1' }));
  assert.ok(!sameJson({ a: 1 }, { a: 1, b: 2 }));
});

test('ausente, undefined e null valem o mesmo, como depois de gravar em JSON', () => {
  assert.ok(sameJson(undefined, null));
  assert.ok(sameJson({ a: 1, b: undefined }, { a: 1 }));
  assert.ok(sameJson([undefined], [null]));
});
