// frontend 相当の最小関数：表示用の挨拶文を作る
export function greeting(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('name は空でない文字列で指定してください');
  }
  return `Hello, ${name.trim()}!`;
}

// TC-01（feature → develop）で追加：お別れの挨拶文を作る
export function farewell(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('name は空でない文字列で指定してください');
  }
  return `Goodbye, ${name.trim()}!`;
}
