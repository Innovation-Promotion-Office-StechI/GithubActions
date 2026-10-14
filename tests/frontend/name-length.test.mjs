// TC-08（hotfix）：名前の長さ上限のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NAME_LENGTH, farewell, greeting } from '../../frontend/src/greeting.mjs';

test('上限ちょうどの長さは受け付ける', () => {
  const name = 'a'.repeat(MAX_NAME_LENGTH);
  assert.equal(greeting(name), `Hello, ${name}!`);
  assert.equal(farewell(name), `Goodbye, ${name}!`);
});

test('上限を超える長さは RangeError', () => {
  const name = 'a'.repeat(MAX_NAME_LENGTH + 1);
  assert.throws(() => greeting(name), RangeError);
  assert.throws(() => farewell(name), RangeError);
});

test('前後の空白は長さに含めない', () => {
  const name = ` ${'a'.repeat(MAX_NAME_LENGTH)} `;
  assert.equal(greeting(name), `Hello, ${name.trim()}!`);
});
