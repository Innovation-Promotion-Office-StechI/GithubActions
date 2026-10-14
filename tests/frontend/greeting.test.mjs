import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greeting } from '../../frontend/src/greeting.mjs';

test('名前から挨拶文を作る', () => {
  assert.equal(greeting('GitHub'), 'Hello, GitHub!');
  assert.equal(greeting('  Actions  '), 'Hello, Actions!');
});

test('空文字・文字列以外は TypeError', () => {
  assert.throws(() => greeting(''), TypeError);
  assert.throws(() => greeting(1), TypeError);
});
