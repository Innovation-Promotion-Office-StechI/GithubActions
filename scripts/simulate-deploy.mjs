// デプロイ相当処理：dist/ を deployment/<env>/app に配置し、manifest.json を生成する
//
// 入力は環境変数（deploy.yml から渡す）:
//   DEPLOY_ENVIRONMENT, DEPLOY_VERSION, DEPLOY_REASON, DEPLOY_GATE(JSON),
//   BASE_BRANCH, HEAD_BRANCH, PR_NUMBER, PR_URL, COMMIT_SHA, HEAD_SHA,
//   GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_SERVER_URL, GITHUB_REPOSITORY

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAIN_BRANCHES, isValidVersion } from './branch-rules.mjs';

const REQUIRED_FIELDS = ['environment', 'version', 'baseBranch', 'headBranch', 'commitSha', 'runId', 'runUrl', 'reason'];

export const toUtcIso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

export function buildManifest(input) {
  for (const field of REQUIRED_FIELDS) {
    if (!input[field]) throw new Error(`マニフェストの必須項目 ${field} がありません`);
  }
  if (!MAIN_BRANCHES.includes(input.environment)) {
    throw new Error(`環境名が不正です: ${input.environment}`);
  }
  if (!isValidVersion(input.version)) {
    throw new Error(`バージョンが不正です: ${input.version}`);
  }
  return {
    schemaVersion: 1,
    environment: input.environment,
    version: input.version,
    tag: input.environment === 'main' ? `v${input.version}` : null,
    baseBranch: input.baseBranch,
    headBranch: input.headBranch,
    pullRequest: { number: input.prNumber ?? null, url: input.prUrl ?? null },
    commitSha: input.commitSha,
    headSha: input.headSha ?? null,
    runId: String(input.runId),
    runAttempt: Number(input.runAttempt ?? 1),
    runUrl: input.runUrl,
    deployedAt: input.deployedAt ?? toUtcIso(new Date()),
    reason: input.reason,
    gate: input.gate ?? null,
  };
}

export function simulateDeploy({ distDir, outRoot, manifest }) {
  if (!existsSync(distDir)) {
    throw new Error(`ビルド成果物がありません: ${distDir}（先に npm run build を実行）`);
  }
  const envDir = join(outRoot, manifest.environment);
  rmSync(envDir, { recursive: true, force: true });
  mkdirSync(envDir, { recursive: true });
  cpSync(distDir, join(envDir, 'app'), { recursive: true });
  writeFileSync(join(envDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return envDir;
}

function main() {
  const env = process.env;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = buildManifest({
    environment: env.DEPLOY_ENVIRONMENT,
    version: env.DEPLOY_VERSION,
    baseBranch: env.BASE_BRANCH,
    headBranch: env.HEAD_BRANCH,
    prNumber: env.PR_NUMBER ? Number(env.PR_NUMBER) : null,
    prUrl: env.PR_URL,
    commitSha: env.COMMIT_SHA,
    headSha: env.HEAD_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    reason: env.DEPLOY_REASON,
    gate: env.DEPLOY_GATE ? JSON.parse(env.DEPLOY_GATE) : null,
  });
  const envDir = simulateDeploy({ distDir: join(root, 'dist'), outRoot: join(root, 'deployment'), manifest });
  console.log(`配置先: ${envDir}`);
  console.log(`選択された環境: ${manifest.environment}`);
  console.log(`理由: ${manifest.reason}`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
