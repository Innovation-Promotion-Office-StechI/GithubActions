// 段階2：GitHub API から取り直した情報でデプロイ可否を検査する（純粋関数）

export const REQUIRED_CHECKS = Object.freeze(['ci-lint', 'ci-test', 'ci-build', 'ci-branch-policy']);

// レビュアーごとの最新状態（COMMENTED は状態を変えない）が APPROVED の件数
export function countApprovals(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    if (review.state === 'COMMENTED' || !review.user) continue;
    latest.set(review.user.login, review.state);
  }
  return [...latest.values()].filter((state) => state === 'APPROVED').length;
}

// 必須チェックごとに最新（id 最大）の check run の結論を返す。存在しなければ null
export function summarizeChecks(checkRuns, required = REQUIRED_CHECKS) {
  const summary = {};
  for (const name of required) {
    const runs = checkRuns.filter((run) => run.name === name);
    const latest = runs.reduce((a, b) => (a === null || b.id > a.id ? b : a), null);
    summary[name] = latest ? latest.conclusion ?? latest.status : null;
  }
  return summary;
}

export function evaluateGate({ expected, pr, reviews, checkRuns, tagExists }) {
  const errors = [];
  const warnings = [];

  if (pr.merged !== true) {
    errors.push('PR がマージされていません');
  }
  if (pr.merge_commit_sha !== expected.mergeCommitSha) {
    errors.push(`マージコミットが一致しません（API: ${pr.merge_commit_sha}、イベント: ${expected.mergeCommitSha}）`);
  }
  if (pr.base?.ref !== expected.base || pr.head?.ref !== expected.head) {
    errors.push(`ブランチが一致しません（API: ${pr.base?.ref} ← ${pr.head?.ref}、イベント: ${expected.base} ← ${expected.head}）`);
  }

  const ciChecks = summarizeChecks(checkRuns);
  for (const [name, conclusion] of Object.entries(ciChecks)) {
    if (conclusion !== 'success') {
      errors.push(`CI ジョブ ${name} が成功していません（${conclusion ?? '未実行'}）`);
    }
  }

  if (expected.environment === 'main' && tagExists) {
    errors.push(`タグ v${expected.version} は既に存在します（VERSION を上げてください）`);
  }

  const approvals = countApprovals(reviews);
  if (approvals === 0) {
    warnings.push('承認（Approve）が 0 件のままマージされています');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    gate: { merged: pr.merged === true, approvals, approvalWarning: approvals === 0, ciChecks },
  };
}
