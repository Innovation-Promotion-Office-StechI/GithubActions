// デプロイ先の判定 CLI
//
//   --mode ci      … CI（ci-branch-policy）用。段階1のみ。error ならジョブ失敗
//   --mode deploy  … deploy.yml（resolve）用。段階1＋段階2。GITHUB_OUTPUT に結果を出力
//
// ローカル確認例:
//   node scripts/resolve-deploy-target.mjs --mode ci --base staging --head release/v1.0.0

import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveTarget } from './branch-rules.mjs';
import { evaluateGate } from './deploy-gate.mjs';
import { createGitHubClient } from './github-api.mjs';

// ワークフローコマンド（::notice:: 等）用のエスケープ
const escapeCommand = (text) => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const annotate = (level, text) => `::${level}::${escapeCommand(text)}`;
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

function summaryTable(rows) {
  return ['| 項目 | 値 |', '|---|---|', ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`)].join('\n');
}

export function runCi({ base, head, version }) {
  const target = resolveTarget({ base, head, version });
  const log = [`[段階1] 判定: ${target.action}`, `選択された環境: ${target.environment ?? '（なし）'}`, `理由: ${target.reason}`];
  if (target.action === 'error') log.push(annotate('error', `ブランチポリシー違反: ${target.reason}`));
  if (target.action === 'skip') log.push(annotate('notice', target.reason));
  const summary = `### ブランチポリシー判定\n\n${summaryTable([
    ['判定', target.action],
    ['マージ後の環境', target.environment ?? '（なし）'],
    ['理由', target.reason],
  ])}\n`;
  return { exitCode: target.action === 'error' ? 1 : 0, log, outputs: {}, summary, target };
}

export async function runDeploy({ event, version, client }) {
  const pr = event.pull_request;
  const base = pr.base.ref;
  const head = pr.head.ref;
  const target = resolveTarget({ base, head, version });
  const outputs = { deploy: 'false', environment: '', version, tag: '', reason: '', gate: '' };
  const log = [`[段階1] 判定: ${target.action}（${target.reason}）`];
  let exitCode = 0;

  const finish = (rows) => ({
    exitCode,
    log,
    outputs,
    target,
    summary: `### デプロイ判定\n\n${summaryTable([
      ['PR', `#${pr.number}（${base} ← ${head}）`],
      ['マージ', pr.merged ? 'あり' : 'なし'],
      ['デプロイ', outputs.deploy === 'true' ? '実行' : 'しない'],
      ['選択された環境', outputs.environment || '（なし）'],
      ['理由', outputs.reason],
      ...rows,
    ])}\n`,
  });

  if (!pr.merged) {
    outputs.reason = `未マージのためデプロイしません（参考：段階1の判定 = ${target.action}: ${target.reason}）`;
    log.push(annotate('notice', outputs.reason));
    return finish([]);
  }
  if (target.action === 'skip') {
    outputs.reason = target.reason;
    log.push(annotate('notice', `デプロイ対象外: ${target.reason}`));
    return finish([]);
  }
  if (target.action === 'error') {
    outputs.reason = target.reason;
    log.push(annotate('error', `許可されない組み合わせがマージされました。デプロイしません: ${target.reason}`));
    exitCode = 1;
    return finish([]);
  }

  const [apiPr, reviews, checkRuns, tagExists] = await Promise.all([
    client.getPull(pr.number),
    client.listReviews(pr.number),
    client.listCheckRuns(pr.head.sha),
    target.environment === 'main' ? client.tagExists(target.tag) : Promise.resolve(false),
  ]);
  const result = evaluateGate({
    expected: { base, head, mergeCommitSha: pr.merge_commit_sha, environment: target.environment, version },
    pr: apiPr,
    reviews,
    checkRuns,
    tagExists,
  });

  log.push(`[段階2] マージ: ${result.gate.merged} / 承認: ${result.gate.approvals} 件 / CI: ${JSON.stringify(result.gate.ciChecks)}`);
  for (const warning of result.warnings) log.push(annotate('warning', warning));
  const gateRows = [
    ['承認件数', result.gate.approvals],
    ...Object.entries(result.gate.ciChecks).map(([name, conclusion]) => [`CI: ${name}`, conclusion ?? '未実行']),
  ];

  if (!result.ok) {
    for (const error of result.errors) log.push(annotate('error', `ゲート検査 NG: ${error}`));
    outputs.reason = `ゲート検査 NG: ${result.errors.join(' / ')}`;
    exitCode = 1;
    return finish(gateRows);
  }

  Object.assign(outputs, {
    deploy: 'true',
    environment: target.environment,
    tag: target.tag ?? '',
    reason: target.reason,
    gate: JSON.stringify(result.gate),
  });
  log.push(`選択された環境: ${target.environment}`, `理由: ${target.reason}`);
  return finish(gateRows);
}

function writeOutputs(file, outputs) {
  if (!file) return;
  for (const [key, value] of Object.entries(outputs)) {
    const delimiter = `EOF_${randomUUID()}`;
    appendFileSync(file, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
      'version-file': { type: 'string', default: 'VERSION' },
    },
  });
  const env = process.env;
  let version = '';
  try {
    version = readFileSync(resolve(values['version-file']), 'utf8').trim();
  } catch {
    // VERSION が無い場合は空文字として判定させ、形式エラーにする
  }
  console.log(`実行コンテキスト: GITHUB_EVENT_NAME=${env.GITHUB_EVENT_NAME ?? '-'} GITHUB_REF=${env.GITHUB_REF ?? '-'} GITHUB_SHA=${env.GITHUB_SHA ?? '-'}`);

  let result;
  if (values.mode === 'ci') {
    result = runCi({ base: values.base ?? env.GITHUB_BASE_REF, head: values.head ?? env.GITHUB_HEAD_REF, version });
  } else if (values.mode === 'deploy') {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const client = createGitHubClient({ token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY, apiUrl: env.GITHUB_API_URL });
    result = await runDeploy({ event, version, client });
  } else {
    console.error('--mode には ci または deploy を指定してください');
    process.exitCode = 2;
    return;
  }

  for (const line of result.log) console.log(line);
  writeOutputs(env.GITHUB_OUTPUT, result.outputs);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, result.summary);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.log(annotate('error', `判定処理でエラーが発生しました: ${error.message}`));
    process.exitCode = 1;
  });
}
