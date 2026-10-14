// frontend 相当の最小関数：表示用の挨拶文を作る

// TC-08（hotfix）で追加：極端に長い名前を受け付けない
export const MAX_NAME_LENGTH = 100;

function normalizeName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('name は空でない文字列で指定してください');
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new RangeError(`name は ${MAX_NAME_LENGTH} 文字以内で指定してください`);
  }
  return trimmed;
}

export function greeting(name) {
  return `Hello, ${normalizeName(name)}!`;
}

// TC-01（feature → develop）で追加：お別れの挨拶文を作る
export function farewell(name) {
  return `Goodbye, ${normalizeName(name)}!`;
}
