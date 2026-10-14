import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countApprovals, evaluateGate, summarizeChecks } from '../../scripts/deploy-gate.mjs';

const SHA = 'a'.repeat(40);
const expected = { base: 'develop', head: 'feature/a', mergeCommitSha: SHA, environment: 'develop', version: '1.0.0' };
const pr = { merged: true, merge_commit_sha: SHA, base: { ref: 'develop' }, head: { ref: 'feature/a' } };
const greenChecks = ['ci-lint', 'ci-test', 'ci-build', 'ci-branch-policy'].map((name, i) => ({ id: i + 1, name, status: 'completed', conclusion: 'success' }));
const approved = [{ user: { login: 'reviewer' }, state: 'APPROVED' }];

const run = (overrides = {}) => evaluateGate({ expected, pr, reviews: approved, checkRuns: greenChecks, tagExists: false, ...overrides });

test('すべて満たせば OK', () => {
  const result = run();
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.gate.approvals, 1);
  assert.equal(result.gate.ciChecks['ci-test'], 'success');
});

test('未マージなら NG', () => {
  const result = run({ pr: { ...pr, merged: false } });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /マージされていません/);
});

test('マージコミット・ブランチが API と一致しなければ NG', () => {
  assert.equal(run({ pr: { ...pr, merge_commit_sha: 'b'.repeat(40) } }).ok, false);
  assert.equal(run({ pr: { ...pr, head: { ref: 'test-invalid/x' } } }).ok, false);
  assert.equal(run({ pr: { ...pr, base: { ref: 'main' } } }).ok, false);
});

test('CI が失敗・未実行なら NG（二次防御）', () => {
  const failed = greenChecks.map((c) => (c.name === 'ci-test' ? { ...c, conclusion: 'failure' } : c));
  const result = run({ checkRuns: failed });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /ci-test が成功していません（failure）/);

  const missing = run({ checkRuns: greenChecks.filter((c) => c.name !== 'ci-build') });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(), /ci-build が成功していません（未実行）/);
});

test('同名チェックは最新（id 最大）の結果を使う', () => {
  const rerun = [...greenChecks.map((c) => (c.name === 'ci-test' ? { ...c, conclusion: 'failure' } : c)), { id: 99, name: 'ci-test', status: 'completed', conclusion: 'success' }];
  assert.equal(summarizeChecks(rerun)['ci-test'], 'success');
  assert.equal(run({ checkRuns: rerun }).ok, true);
});

test('承認 0 件は警告のみ（Q2-a）', () => {
  const result = run({ reviews: [] });
  assert.equal(result.ok, true);
  assert.equal(result.gate.approvals, 0);
  assert.equal(result.gate.approvalWarning, true);
  assert.match(result.warnings.join(), /0 件/);
});

test('承認件数はレビュアーごとの最新状態で数える', () => {
  const reviews = [
    { user: { login: 'a' }, state: 'APPROVED' },
    { user: { login: 'a' }, state: 'COMMENTED' },
    { user: { login: 'b' }, state: 'APPROVED' },
    { user: { login: 'b' }, state: 'CHANGES_REQUESTED' },
    { user: { login: 'c' }, state: 'DISMISSED' },
  ];
  assert.equal(countApprovals(reviews), 1);
});

test('main 宛てでタグが既に存在すれば NG', () => {
  const mainExpected = { ...expected, base: 'main', head: 'staging', environment: 'main' };
  const mainPr = { ...pr, base: { ref: 'main' }, head: { ref: 'staging' } };
  assert.equal(run({ expected: mainExpected, pr: mainPr, tagExists: false }).ok, true);
  const result = run({ expected: mainExpected, pr: mainPr, tagExists: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /v1\.0\.0 は既に存在します/);
});
