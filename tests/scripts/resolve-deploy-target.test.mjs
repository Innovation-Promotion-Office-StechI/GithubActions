import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCi, runDeploy } from '../../scripts/resolve-deploy-target.mjs';

const MERGE_SHA = 'm'.repeat(40);
const HEAD_SHA = 'h'.repeat(40);

function makeEvent({ base, head, merged = true }) {
  return {
    pull_request: {
      number: 7,
      merged,
      merge_commit_sha: merged ? MERGE_SHA : null,
      base: { ref: base },
      head: { ref: head, sha: HEAD_SHA },
    },
  };
}

// API の代わりに、イベントと同じ内容の PR を返す偽クライアント
function clientFor(event, { checksConclusion = 'success', tagExists = false, reviews = [] } = {}) {
  const pr = event.pull_request;
  const calls = [];
  return {
    calls,
    getPull: async (number) => {
      calls.push(['getPull', number]);
      return { merged: pr.merged, merge_commit_sha: pr.merge_commit_sha, base: pr.base, head: pr.head };
    },
    listReviews: async () => reviews,
    listCheckRuns: async (sha) => {
      calls.push(['listCheckRuns', sha]);
      return ['ci-lint', 'ci-test', 'ci-build', 'ci-branch-policy'].map((name, i) => ({ id: i, name, conclusion: checksConclusion }));
    },
    tagExists: async (tag) => {
      calls.push(['tagExists', tag]);
      return tagExists;
    },
  };
}

test('ci: 不正な起点は exitCode 1 と ::error::', () => {
  const result = runCi({ base: 'develop', head: 'test-invalid/sample', version: '1.0.0' });
  assert.equal(result.exitCode, 1);
  assert.ok(result.log.some((line) => line.startsWith('::error::')));
});

test('ci: 許可された組み合わせは exitCode 0、主要ブランチ以外は notice', () => {
  assert.equal(runCi({ base: 'staging', head: 'release/v1.0.0', version: '1.0.0' }).exitCode, 0);
  const skip = runCi({ base: 'feature/x', head: 'feature/y', version: '1.0.0' });
  assert.equal(skip.exitCode, 0);
  assert.ok(skip.log.some((line) => line.startsWith('::notice::')));
});

test('deploy: 未マージは段階2を実行せず skip（理由に段階1の判定を含む）', async () => {
  const event = makeEvent({ base: 'develop', head: 'test-invalid/sample', merged: false });
  const client = clientFor(event);
  const result = await runDeploy({ event, version: '1.0.0', client });
  assert.equal(result.exitCode, 0);
  assert.equal(result.outputs.deploy, 'false');
  assert.match(result.outputs.reason, /未マージ.*error/);
  assert.equal(client.calls.length, 0);
});

test('deploy: 許可されない組み合わせがマージされたら失敗', async () => {
  const event = makeEvent({ base: 'develop', head: 'test-invalid/sample' });
  const result = await runDeploy({ event, version: '1.0.0', client: clientFor(event) });
  assert.equal(result.exitCode, 1);
  assert.equal(result.outputs.deploy, 'false');
});

test('deploy: 正常系は deploy=true と環境・理由・gate を出力', async () => {
  const event = makeEvent({ base: 'develop', head: 'feature/sample-feature' });
  const client = clientFor(event);
  const result = await runDeploy({ event, version: '1.0.0', client });
  assert.equal(result.exitCode, 0);
  assert.equal(result.outputs.deploy, 'true');
  assert.equal(result.outputs.environment, 'develop');
  assert.equal(result.outputs.tag, '');
  assert.equal(JSON.parse(result.outputs.gate).approvals, 0);
  assert.ok(result.log.some((line) => line.startsWith('::warning::')), '承認0件の警告');
  assert.ok(result.log.includes('選択された環境: develop'));
  assert.deepEqual(client.calls.find(([name]) => name === 'listCheckRuns'), ['listCheckRuns', HEAD_SHA]);
  assert.ok(!client.calls.some(([name]) => name === 'tagExists'), 'main 以外ではタグを確認しない');
});

test('deploy: main はタグ重複を確認し、重複なら失敗', async () => {
  const event = makeEvent({ base: 'main', head: 'staging' });
  const ok = await runDeploy({ event, version: '1.0.0', client: clientFor(event) });
  assert.equal(ok.outputs.deploy, 'true');
  assert.equal(ok.outputs.tag, 'v1.0.0');

  const dup = await runDeploy({ event, version: '1.0.0', client: clientFor(event, { tagExists: true }) });
  assert.equal(dup.exitCode, 1);
  assert.equal(dup.outputs.deploy, 'false');
});

test('deploy: CI 失敗のままマージされても失敗（二次防御）', async () => {
  const event = makeEvent({ base: 'develop', head: 'feature/a' });
  const result = await runDeploy({ event, version: '1.0.0', client: clientFor(event, { checksConclusion: 'failure' }) });
  assert.equal(result.exitCode, 1);
  assert.equal(result.outputs.deploy, 'false');
  assert.match(result.outputs.reason, /ゲート検査 NG/);
});
