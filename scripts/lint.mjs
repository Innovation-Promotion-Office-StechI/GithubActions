// lint 相当処理（外部依存なし）
//   - 全 .mjs/.js を node --check で構文検査
//   - 行末空白・タブインデント・末尾改行なしを検出
//   - VERSION の形式を検査

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidVersion } from './branch-rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_DIRS = ['frontend', 'backend', 'scripts', 'tests'];

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collect(path);
    return /\.(?:mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

const problems = [];
const files = TARGET_DIRS.flatMap((dir) => collect(join(root, dir)));

for (const file of files) {
  const name = relative(root, file).replace(/\\/g, '/');
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    problems.push(`${name}: 構文エラー\n${check.stderr.trim()}`);
  }
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, index) => {
    if (/[ \t]+\r?$/.test(line)) problems.push(`${name}:${index + 1}: 行末に空白があります`);
    if (/^\t/.test(line)) problems.push(`${name}:${index + 1}: タブでインデントされています`);
  });
  if (text.length > 0 && !text.endsWith('\n')) problems.push(`${name}: 末尾に改行がありません`);
}

const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (!isValidVersion(version)) problems.push(`VERSION: 形式が不正です（${JSON.stringify(version)}、期待: X.Y.Z）`);

if (problems.length > 0) {
  for (const problem of problems) console.log(`::error::${problem.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  console.log(`lint: ${problems.length} 件の問題があります`);
  process.exitCode = 1;
} else {
  console.log(`lint: OK（${files.length} ファイル、VERSION=${version}）`);
}
