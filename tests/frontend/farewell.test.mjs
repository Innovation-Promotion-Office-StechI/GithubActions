import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farewell } from '../../frontend/src/greeting.mjs';

test('名前からお別れの挨拶文を作る', () => {
  assert.equal(farewell('GitHub'), 'Goodbye, GitHub!');
});

test('farewell: 空文字・文字列以外は TypeError', () => {
  assert.throws(() => farewell(' '), TypeError);
  assert.throws(() => farewell(null), TypeError);
});
