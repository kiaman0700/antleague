/**
 * 굴러가는 숫자: 값이 바뀌면 바뀐 자리만 세로로 굴러 새 숫자로 (증권 앱 시세처럼 어느 자리가 변했는지 보임).
 * 글자는 그대로 읽히게 접근성 이름은 전체 문자열, 움직임 줄이기면 바로 바뀜. 자리는 오른쪽부터 맞춰 자릿수가 늘어도 흔들리지 않게
 */
const DIGITS = '0123456789';

export function RollNum({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={'roll' + (className ? ' ' + className : '')} aria-label={text} role="text">
      {chars.map((ch, i) => {
        const key = chars.length - i;
        const d = DIGITS.indexOf(ch);
        if (d < 0)
          return (
            <span key={'c' + key} className="roll-c" aria-hidden>
              {ch}
            </span>
          );
        return (
          <span key={'d' + key} className="roll-d" aria-hidden>
            <span className="roll-col" style={{ transform: `translateY(${-d * 10}%)` }}>
              {DIGITS.split('').map((x) => (
                <span key={x}>{x}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
