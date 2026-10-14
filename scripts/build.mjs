// ビルド相当処理：frontend/backend のソースを dist/ にコピーし build-info.json を出力する

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function build({ root, outDir, commitSha = null, now = new Date() }) {
  const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(root, 'frontend', 'src'), join(outDir, 'frontend'), { recursive: true });
  cpSync(join(root, 'backend', 'src'), join(outDir, 'backend'), { recursive: true });
  const info = { version, commitSha, builtAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z') };
  writeFileSync(join(outDir, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const commitSha = process.env.BUILD_COMMIT_SHA || process.env.GITHUB_SHA || null;
  const info = build({ root, outDir: join(root, 'dist'), commitSha });
  console.log(`dist/ を出力しました: ${JSON.stringify(info)}`);
}
