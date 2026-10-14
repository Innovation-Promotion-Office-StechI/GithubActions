import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from '../../backend/src/calc.mjs';

test('数値配列の合計を返す', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([]), 0);
});

test('配列以外・数値以外は TypeError', () => {
  assert.throws(() => sum('1,2'), TypeError);
  assert.throws(() => sum([1, '2']), TypeError);
  assert.throws(() => sum([1, Number.NaN]), TypeError);
});
