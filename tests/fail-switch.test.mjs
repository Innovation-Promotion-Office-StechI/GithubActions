// 意図的にテストを失敗させるスイッチ（TC-06 で使用）
//   - tests/fail-switch.txt の内容を "fail" にする（CI で使う）
//   - または環境変数 FORCE_FAIL=1（ローカル確認用）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('意図的失敗スイッチが OFF であること', () => {
  const value = readFileSync(new URL('./fail-switch.txt', import.meta.url), 'utf8').trim();
  const forced = process.env.FORCE_FAIL === '1';
  assert.ok(!forced && value !== 'fail', `意図的な失敗です（FORCE_FAIL=${process.env.FORCE_FAIL ?? ''}、fail-switch.txt=${value}）`);
});
