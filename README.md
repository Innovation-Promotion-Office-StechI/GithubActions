# GithubActions — ブランチ戦略と CI/CD のシミュレーション検証

Git / GitHub / GitHub Actions によるブランチ戦略と CI/CD プロセスを検証するためのテスト用リポジトリです。
アプリは Node.js 標準機能のみ（外部依存なし）の最小構成で、デプロイは Actions 内のシミュレーション（環境別ディレクトリへの配置・マニフェスト生成・Artifact 保存）だけを行います。**外部環境への実デプロイは行いません。**

## 目次

1. [前提条件](#前提条件)
2. [リポジトリ構成](#リポジトリ構成)
3. [ブランチ戦略](#ブランチ戦略)
4. [workflow](#workflow)
5. [各手順](#各手順)
6. [異常系の確認方法](#異常系の確認方法)
7. [Actions ログと Artifact の確認方法](#actions-ログと-artifact-の確認方法)
8. [切り戻し手順](#切り戻し手順)
9. [検証後の整理](#検証後の整理)

## 前提条件

- Git 2.4x 以上、Node.js 22 以上（npm は scripts 実行のみ。インストールする依存パッケージはありません）
- GitHub リポジトリで次が設定済みであること（設定内容は検証レポートを参照）
  - マージ方式は **merge commit のみ**（squash / rebase は無効）
  - 主要ブランチ（`develop` / `staging` / `usertest` / `main`）に Ruleset：PR 必須、Required status checks、force push・削除の禁止、バイパスなし
  - Environments：`develop` / `staging` / `usertest` / `main`

ローカルでの確認：

```bash
npm run lint
npm test
npm run build
```

意図的にテストを失敗させる場合（TC-06 用）：

- `tests/fail-switch.txt` の内容を `fail` にする（CI で使う方法）
- またはローカルで環境変数 `FORCE_FAIL=1` を付けて `npm test`

## リポジトリ構成

| パス | 内容 |
|---|---|
| `frontend/src/` | frontend 相当の最小関数 |
| `backend/src/` | backend 相当の最小関数 |
| `tests/` | `node:test` によるテスト（アプリ・判定スクリプト・意図的失敗スイッチ） |
| `scripts/lint.mjs` | lint 相当（構文検査・行末空白など・VERSION 形式） |
| `scripts/build.mjs` | `dist/` へのビルド相当処理 |
| `scripts/branch-rules.mjs` | 段階1：ブランチ組み合わせ判定 |
| `scripts/deploy-gate.mjs` | 段階2：マージ済み・CI 結果・承認件数・タグ重複の検査 |
| `scripts/github-api.mjs` | GitHub REST API の最小クライアント |
| `scripts/resolve-deploy-target.mjs` | 判定 CLI（`--mode ci` / `--mode deploy`） |
| `scripts/simulate-deploy.mjs` | `deployment/<env>/` への配置とマニフェスト生成 |
| `deployment/` | デプロイ相当処理の配置先（実行時に生成） |
| `.github/workflows/` | `ci.yml` / `deploy.yml` / `release-tag.yml` |
| `VERSION` | バージョン（`X.Y.Z`）。`release/vX.Y.Z` のブランチ名と一致させる |

## ブランチ戦略

| 起点（head） | 宛先（base） | マージ後の処理 |
|---|---|---|
| `feature/*` | `develop` | develop 環境相当デプロイ |
| `hotfix/*` | `develop` | develop 環境相当デプロイ |
| `release/vX.Y.Z` | `staging` | staging 環境相当デプロイ（`VERSION` と一致必須） |
| `staging` | `usertest` | usertest 環境相当デプロイ |
| `staging` | `main` | main 環境相当デプロイ ＋ タグ `vX.Y.Z` 自動付与 |
| 上記以外 | 主要ブランチ | CI（`ci-branch-policy`）で失敗。デプロイしない |

- 主要ブランチへの直接 push は禁止です。必ず PR を経由します。
- PR のマージは **Create a merge commit** を使います。

## workflow

| ファイル | トリガー | ジョブ |
|---|---|---|
| `ci.yml` | `pull_request`（opened / synchronize / reopened） | `ci-lint` / `ci-test` / `ci-build` / `ci-branch-policy`（Required status checks） |
| `deploy.yml` | `pull_request`（closed） | `resolve`（判定）→ `deploy`（デプロイ相当）→ `tag`（main のみ） |
| `release-tag.yml` | `workflow_call`（deploy.yml から） | `create-tag` |

誤デプロイ防止は2段階です。

1. **段階1**：base/head の組み合わせと、`release/vX.Y.Z` と `VERSION` の一致を判定（CI と deploy の両方で実行）
2. **段階2**：マージ後に API から PR を取り直し、マージ済みであること、CI 4ジョブの成功、（main の場合）タグ未作成を検査。承認が 0 件なら警告を出し、件数をマニフェストに記録

> PR の base ブランチを後から変更した場合、CI は再実行されません。PR を一度クローズして再オープンしてください。

## 各手順

GitHub 画面での PR 作成は、リポジトリの **Pull requests** タブ → **New pull request** → `base` と `compare` を選択 → **Create pull request** の順に行います。マージは PR 画面下部の **Merge pull request**（Create a merge commit）を使います。

### feature → develop

```bash
git switch develop
git pull
git switch -c feature/sample-feature
# 変更して commit
git push -u origin feature/sample-feature
```

画面で `base: develop` ← `compare: feature/sample-feature` の PR を作成 → CI 成功を確認 → マージ。

### release → staging

```bash
git switch develop
git pull
git switch -c release/v1.0.0
# VERSION が 1.0.0 であることを確認（違えば修正して commit）
git push -u origin release/v1.0.0
```

画面で `base: staging` ← `compare: release/v1.0.0` の PR を作成 → CI 成功を確認 → マージ。

### staging → usertest

画面で `base: usertest` ← `compare: staging` の PR を作成 → CI 成功を確認 → マージ。

### staging → main（タグ付与）

画面で `base: main` ← `compare: staging` の PR を作成 → CI 成功を確認 → マージ。
`deploy` ジョブが Environment `main` の承認待ちになったら、Actions の run 画面で **Review deployments** → `main` にチェック → **Approve and deploy**。
デプロイ成功後、`tag` ジョブがマージコミットにタグ `v<VERSION>` を自動で付与します。

```bash
git fetch --tags
git show --no-patch v1.0.0
```

### hotfix

```bash
git switch main
git pull
git switch -c hotfix/critical-fix
# 修正して commit
git push -u origin hotfix/critical-fix
```

1. 画面で `base: develop` ← `compare: hotfix/critical-fix` の PR を作成 → マージ。
2. hotfix から release ブランチを作成し、VERSION を上げる。

   ```bash
   git switch hotfix/critical-fix
   git switch -c release/v1.0.1
   # VERSION を 1.0.1 に変更して commit
   git push -u origin release/v1.0.1
   ```

3. `release/v1.0.1` → `staging`、`staging` → `usertest`、`staging` → `main` の順に PR を作成・マージ。

> hotfix で上げた VERSION は develop には反映されません（main → develop の経路がないため）。次のリリース時は develop 側で VERSION を上げてください。

## 異常系の確認方法

| 確認内容 | 方法 | 期待結果 |
|---|---|---|
| 主要ブランチへの直接 push | `git push origin develop` | `remote rejected`（Ruleset 違反）で拒否される |
| 許可されない起点ブランチ | `test-invalid/sample` から `develop` 宛ての PR | `ci-branch-policy` が失敗し、マージできない。クローズ時の deploy は「未マージ」で skip |
| CI 失敗 | `tests/fail-switch.txt` を `fail` にした PR | `ci-test` が失敗し、マージボタンがブロックされる |

## Actions ログと Artifact の確認方法

1. リポジトリの **Actions** タブを開く
2. 左の一覧から workflow（**CI** / **Deploy**）を選び、対象の run をクリック
3. ジョブ（例 `resolve`）をクリックし、ステップを展開してログを確認
   - `選択された環境: ...` と `理由: ...` の行
   - skip 時は `::notice::`、承認 0 件は `::warning::`、違反は `::error::` が注釈として表示される
4. run の **Summary** 画面で、判定結果の表と、下部の **Artifacts** 欄を確認
   - CI：`ci-build-pr<PR番号>-<run_id>`
   - デプロイ：`deploy-<environment>-v<version>-<run_id>`（`manifest.json` と `app/` が入っています）

## 切り戻し手順

主要ブランチの履歴の巻き戻し（`reset` ＋ force push）と、主要ブランチの削除は Ruleset で禁止されています。
切り戻しは、**変更を打ち消すコミット（revert）を PR でマージする**ことで行います。

> PR 画面の **Revert** ボタンは使えません。自動で作られるブランチ名（`revert-<PR番号>-<ブランチ名>`）は許可された起点ではないため、`ci-branch-policy` が失敗してマージできません。

### develop を戻す場合

```bash
git switch develop
git pull
git switch -c hotfix/revert-<内容>
# マージコミットを打ち消す場合は -m 1（取り込んだ側を取り消す）を付ける
git revert -m 1 <打ち消したいマージコミット>
git push -u origin hotfix/revert-<内容>
```

画面で `base: develop` ← `compare: hotfix/revert-<内容>` の PR を作成 → CI 成功を確認 → マージ。

### staging / usertest / main を戻す場合

main のタグ（`vX.Y.Z`）は付け直せないため、**打ち消した内容を新しいバージョンとして出し直します**。

```bash
git switch main
git pull
git switch -c hotfix/revert-<内容>
git revert -m 1 <打ち消したいマージコミット>
git push -u origin hotfix/revert-<内容>

git switch -c release/v<X.Y.Z+1>
# VERSION を X.Y.Z+1 に変更して commit
git push -u origin release/v<X.Y.Z+1>
```

1. `hotfix/revert-<内容>` → `develop` の PR を作成・マージ（develop にも打ち消しを反映し、次のリリースで戻した変更が再び入らないようにする）
2. `release/v<X.Y.Z+1>` → `staging`、`staging` → `usertest`、`staging` → `main` の順に PR を作成・マージ（main はデプロイの承認が必要）
3. main へのマージ後、タグ `v<X.Y.Z+1>` が自動で付与される

> develop 側の PR でコンフリクトや CI 失敗が起きた場合は、`hotfix/revert-<内容>` に develop を取り込まず、develop から別のブランチ（例 `hotfix/revert-<内容>-develop`）を作って調整してください。hotfix ブランチに develop を取り込むと、未リリースの変更が main に入ります。

## 検証後の整理

- 作業ブランチ（`feature/*`、`hotfix/*`、`release/*`、`test-invalid/*` など）の削除：

  ```bash
  git push origin --delete feature/sample-feature
  git branch -d feature/sample-feature
  ```

- 未マージの PR は画面でクローズします。
- タグは Ruleset で削除が禁止されています。削除が必要な場合は、Ruleset を一時的に無効にしてから行ってください。
- 主要ブランチは削除しません。リポジトリが不要になった場合は **Settings → General → Danger Zone** でアーカイブまたは削除します。
