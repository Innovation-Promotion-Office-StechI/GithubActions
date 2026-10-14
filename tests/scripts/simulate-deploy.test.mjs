import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.mjs';
import { buildManifest, simulateDeploy } from '../../scripts/simulate-deploy.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const input = {
  environment: 'main',
  version: '1.0.0',
  baseBranch: 'main',
  headBranch: 'staging',
  prNumber: 12,
  prUrl: 'https://github.com/o/r/pull/12',
  commitSha: 'c'.repeat(40),
  headSha: 'h'.repeat(40),
  runId: 123,
  runAttempt: '1',
  runUrl: 'https://github.com/o/r/actions/runs/123',
  deployedAt: '2026-10-14T00:00:00Z',
  reason: 'base=main, head=staging: staging → main 環境（タグ v1.0.0）',
  gate: { merged: true, approvals: 0 },
};

test('マニフェストに必要な項目がすべて入る', () => {
  const manifest = buildManifest(input);
  assert.deepEqual(Object.keys(manifest), [
    'schemaVersion', 'environment', 'version', 'tag', 'baseBranch', 'headBranch', 'pullRequest',
    'commitSha', 'headSha', 'runId', 'runAttempt', 'runUrl', 'deployedAt', 'reason', 'gate',
  ]);
  assert.equal(manifest.tag, 'v1.0.0');
  assert.equal(manifest.runId, '123');
  assert.equal(manifest.runAttempt, 1);
  assert.equal(buildManifest({ ...input, environment: 'develop' }).tag, null);
});

test('deployedAt 省略時は UTC（ミリ秒なし）', () => {
  const { deployedAt } = buildManifest({ ...input, deployedAt: undefined });
  assert.match(deployedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('必須項目欠落・不正な環境名・不正なバージョンは例外', () => {
  assert.throws(() => buildManifest({ ...input, commitSha: '' }), /commitSha/);
  assert.throws(() => buildManifest({ ...input, environment: '../etc' }), /環境名が不正/);
  assert.throws(() => buildManifest({ ...input, environment: 'production' }), /環境名が不正/);
  assert.throws(() => buildManifest({ ...input, version: '1.0' }), /バージョンが不正/);
});

test('build → simulateDeploy で deployment/<env>/ に app と manifest.json が配置される', () => {
  const work = mkdtempSync(join(tmpdir(), 'deploy-test-'));
  try {
    const distDir = join(work, 'dist');
    const info = build({ root, outDir: distDir, commitSha: input.commitSha, now: new Date('2026-10-14T00:00:00Z') });
    assert.equal(info.builtAt, '2026-10-14T00:00:00Z');

    const envDir = simulateDeploy({ distDir, outRoot: join(work, 'deployment'), manifest: buildManifest(input) });
    assert.equal(envDir, join(work, 'deployment', 'main'));
    assert.ok(existsSync(join(envDir, 'app', 'frontend', 'greeting.mjs')));
    assert.ok(existsSync(join(envDir, 'app', 'backend', 'calc.mjs')));
    const buildInfo = JSON.parse(readFileSync(join(envDir, 'app', 'build-info.json'), 'utf8'));
    assert.equal(buildInfo.commitSha, input.commitSha);
    const manifest = JSON.parse(readFileSync(join(envDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.environment, 'main');
    assert.equal(manifest.version, buildInfo.version);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('dist が無ければ例外', () => {
  assert.throws(() => simulateDeploy({ distDir: join(tmpdir(), 'no-such-dist-xyz'), outRoot: tmpdir(), manifest: buildManifest(input) }), /ビルド成果物がありません/);
});
