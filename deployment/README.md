# deployment/

デプロイ相当処理（`scripts/simulate-deploy.mjs`）の配置先です。実際の外部環境へのデプロイは行いません。

deploy.yml の `deploy` ジョブが、実行時に次の構成を作成して Artifact として保存します（リポジトリにはコミットしません）。

```
deployment/<environment>/
├─ manifest.json      デプロイ記録（環境・ブランチ・コミット・run・バージョン・判定理由・ゲート結果）
└─ app/               ビルド成果物（dist/ のコピー）
   ├─ frontend/
   ├─ backend/
   └─ build-info.json
```

`<environment>` は `develop` / `staging` / `usertest` / `main` のいずれかです。
Artifact をダウンロードすると、`manifest.json` と `app/` が最上位に入っています。
