const nf = new Intl.NumberFormat('ko-KR');

export const won = (n: number) => nf.format(Math.round(n)) + '원';
export const num = (n: number) => nf.format(Math.round(n));

/** 1,234만원 / 1.2억원 같은 짧은 표기 */
export function wonShort(n: number) {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}억원`;
  if (a >= 1e4) return `${sign}${nf.format(Math.round(a / 1e4))}만원`;
  return `${sign}${nf.format(Math.round(a))}원`;
}

export function pct(r: number, digits = 2) {
  const v = r * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
