// backend 相当の最小関数：数値配列の合計を返す
export function sum(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('values は配列で指定してください');
  }
  return values.reduce((total, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`数値以外が含まれています: ${String(value)}`);
    }
    return total + value;
  }, 0);
}
