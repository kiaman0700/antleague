const nf = new Intl.NumberFormat('ko-KR');

/** 금액 단위: won = 50,100원 / man = 5만 100원 (어림하지 않고 끝자리까지) */
export type MoneyUnit = 'won' | 'man';
let unit: MoneyUnit = 'won';
export function setMoneyUnit(u: MoneyUnit) {
  unit = u;
}

/** 만 단위 정확 표기: 1억 2,345만 6,700원 / 5만 100원 / 108만원 / 9,500원 */
export function manExact(n: number) {
  const sign = n < 0 ? '-' : '';
  let a = Math.round(Math.abs(n));
  const eok = Math.floor(a / 1e8);
  a -= eok * 1e8;
  const man = Math.floor(a / 1e4);
  const rest = a - man * 1e4;
  const parts: string[] = [];
  if (eok) parts.push(`${nf.format(eok)}억`);
  if (man) parts.push(`${nf.format(man)}만`);
  if (rest || !parts.length) parts.push(`${nf.format(rest)}`);
  return sign + parts.join(' ') + '원';
}

/** 모든 금액 표시: 설정한 단위로, 끝자리까지 정확하게 */
export const won = (n: number) => (unit === 'man' ? manExact(n) : nf.format(Math.round(n)) + '원');
/** 예전 이름 — 이제 어림하지 않고 won() 과 같다 */
export const wonShort = won;
/** 수량·주가처럼 '원'을 안 붙이는 숫자 */
export const num = (n: number) => nf.format(Math.round(n));

export function pct(r: number, digits = 2) {
  const v = r * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
