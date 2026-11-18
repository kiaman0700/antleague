/** (v24) 거래 상태 표시: 거래정지 · 정리매매 · 상장폐지 (그날 아침 공시로 알려진 것만 — 화면 데이터에 그날까지만 옴) */
const LABEL = { halt: '거래정지', clear: '정리매매', delisted: '상장폐지' } as const;
const NOTE = {
  halt: '감사의견 거절 등으로 오늘은 사고팔 수 없어요. 들고 있으면 기다릴 수밖에 없어요.',
  clear: '상장폐지가 정해져 마지막으로 팔 수 있는 기간이에요. 가격 제한이 없어 크게 움직이고, 끝나면 남은 주식은 거의 0원이 돼요.',
  delisted: '상장폐지됐어요. 더는 사고팔 수 없고, 남은 주식은 사실상 0원이에요.',
} as const;

export function HaltTag({ kind }: { kind: keyof typeof LABEL }) {
  return <span className={'halt-tag h-' + kind}>{LABEL[kind]}</span>;
}

export function HaltNote({ kind }: { kind: keyof typeof LABEL }) {
  return (
    <p className={'halt-note h-' + kind} role="note">
      <b>{LABEL[kind]}</b> {NOTE[kind]}
    </p>
  );
}
