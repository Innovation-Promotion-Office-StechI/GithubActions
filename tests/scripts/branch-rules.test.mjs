import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidVersion, resolveTarget } from '../../scripts/branch-rules.mjs';

const V = '1.0.0';

test('許可された組み合わせ（正常系）', () => {
  const cases = [
    ['develop', 'feature/sample-feature', 'develop'],
    ['develop', 'hotfix/critical-fix', 'develop'],
    ['staging', 'release/v1.0.0', 'staging'],
    ['usertest', 'staging', 'usertest'],
    ['main', 'staging', 'main'],
  ];
  for (const [base, head, environment] of cases) {
    const result = resolveTarget({ base, head, version: V });
    assert.equal(result.action, 'deploy', `${head} → ${base}`);
    assert.equal(result.environment, environment);
    assert.match(result.reason, new RegExp(`base=${base}, head=${head}`));
  }
});

test('main へのデプロイのみタグが付く', () => {
  assert.equal(resolveTarget({ base: 'main', head: 'staging', version: V }).tag, 'v1.0.0');
  assert.equal(resolveTarget({ base: 'usertest', head: 'staging', version: V }).tag, null);
  assert.equal(resolveTarget({ base: 'develop', head: 'feature/a', version: V }).tag, null);
});

test('主要ブランチ宛ての不正な組み合わせは error', () => {
  const cases = [
    ['develop', 'test-invalid/sample'],
    ['develop', 'chore/ci-bootstrap'],
    ['develop', 'feature/'],
    ['develop', 'release/v1.0.0'],
    ['develop', 'staging'],
    ['develop', 'main'],
    ['staging', 'feature/sample-feature'],
    ['staging', 'hotfix/critical-fix'],
    ['staging', 'develop'],
    ['staging', 'test-invalid/sample'],
    ['usertest', 'release/v1.0.0'],
    ['usertest', 'feature/sample-feature'],
    ['usertest', 'main'],
    ['main', 'release/v1.0.0'],
    ['main', 'hotfix/critical-fix'],
    ['main', 'develop'],
    ['main', 'usertest'],
    ['main', 'test-invalid/sample'],
  ];
  for (const [base, head] of cases) {
    const result = resolveTarget({ base, head, version: V });
    assert.equal(result.action, 'error', `${head} → ${base}`);
    assert.equal(result.environment, null);
  }
});

test('release ブランチ名の形式不正は error', () => {
  for (const head of ['release/v1.0', 'release/1.0.0', 'release/v1.0.0-rc1', 'release/v01.0.0', 'release/']) {
    const result = resolveTarget({ base: 'staging', head, version: V });
    assert.equal(result.action, 'error', head);
    assert.match(result.reason, /release ブランチ名が不正/);
  }
});

test('release ブランチ名と VERSION の不一致は error', () => {
  const result = resolveTarget({ base: 'staging', head: 'release/v1.0.1', version: V });
  assert.equal(result.action, 'error');
  assert.match(result.reason, /一致しません/);
});

test('主要ブランチ以外が宛先なら skip', () => {
  for (const base of ['feature/x', 'release/v1.0.0', 'dev/v3.0.0', 'production']) {
    const result = resolveTarget({ base, head: 'feature/y', version: V });
    assert.equal(result.action, 'skip', base);
  }
});

test('VERSION の形式不正は宛先に関係なく error', () => {
  for (const version of ['', '1.0', 'v1.0.0', '1.0.0\n1', '01.0.0', undefined]) {
    assert.equal(isValidVersion(version), false, String(version));
    assert.equal(resolveTarget({ base: 'develop', head: 'feature/a', version }).action, 'error');
  }
  assert.equal(isValidVersion('10.20.30'), true);
});
