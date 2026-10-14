// 段階1：base/head ブランチの組み合わせからデプロイ先を判定する（純粋関数）
//
// 戻り値 action:
//   deploy … デプロイ対象（environment に環境名）
//   skip   … 主要ブランチ以外が宛先のためデプロイ対象外（正常）
//   error  … 主要ブランチ宛てだが許可されない組み合わせ／VERSION 不正

export const MAIN_BRANCHES = Object.freeze(['develop', 'staging', 'usertest', 'main']);

const NUM = '(?:0|[1-9]\\d*)';
const VERSION_PATTERN = new RegExp(`^${NUM}\\.${NUM}\\.${NUM}$`);
const RELEASE_PATTERN = new RegExp(`^release/v(${NUM}\\.${NUM}\\.${NUM})$`);
const DEVELOP_SOURCE_PATTERN = /^(?:feature|hotfix)\/.+$/;

export function isValidVersion(version) {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

export function resolveTarget({ base, head, version }) {
  const result = (action, environment, reason) => ({
    action,
    environment,
    tag: action === 'deploy' && environment === 'main' ? `v${version}` : null,
    reason: `base=${base}, head=${head}: ${reason}`,
  });

  if (!isValidVersion(version)) {
    return result('error', null, `VERSION の形式が不正です（${JSON.stringify(version)}、期待: X.Y.Z）`);
  }
  if (!MAIN_BRANCHES.includes(base)) {
    return result('skip', null, '宛先が主要ブランチではないためデプロイ対象外');
  }

  switch (base) {
    case 'develop':
      if (DEVELOP_SOURCE_PATTERN.test(head)) {
        return result('deploy', 'develop', 'feature/* または hotfix/* → develop 環境');
      }
      break;
    case 'staging': {
      const match = RELEASE_PATTERN.exec(head);
      if (match) {
        if (match[1] === version) {
          return result('deploy', 'staging', `release/v${version} → staging 環境（VERSION と一致）`);
        }
        return result('error', null, `ブランチ名のバージョン（${match[1]}）と VERSION（${version}）が一致しません`);
      }
      if (head.startsWith('release/')) {
        return result('error', null, 'release ブランチ名が不正です（期待: release/vX.Y.Z）');
      }
      break;
    }
    case 'usertest':
      if (head === 'staging') {
        return result('deploy', 'usertest', 'staging → usertest 環境');
      }
      break;
    case 'main':
      if (head === 'staging') {
        return result('deploy', 'main', `staging → main 環境（タグ v${version}）`);
      }
      break;
  }
  return result('error', null, `${base} への起点として許可されていないブランチです`);
}
