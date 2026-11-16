import { useEffect, useRef, useState, type ReactNode } from 'react';

export const GLOSSARY: Record<string, string> = {
  평단가: '내가 산 가격의 평균이에요. 여러 번 나눠 샀다면 평균을 내요. 지금 가격이 평단가보다 높으면 이익이에요.',
  수익률: '처음 넣은 돈에 비해 몇 % 벌었는지(잃었는지)예요.',
  수수료: '사고팔 때마다 거래 금액의 0.1%를 떼어 가요. 너무 자주 사고팔면 손해예요.',
  시가: '그날 아침 장이 열릴 때의 가격이에요. 턴 동안에는 이 가격으로 사고팔아요.',
  종가: '그날 장이 끝날 때의 가격이에요. 장 마감을 누르면 하루가 흘러 종가가 정해져요.',
  전일대비: '어제 종가와 비교해 오늘 얼마나 올랐는지(내렸는지)예요.',
  지수: '시장 전체 종목의 평균 흐름이에요. 지수가 오르면 대체로 시장 분위기가 좋아요.',
  금리: '돈을 빌리는 이자율이에요. 금리가 내리면 보통 성장주(IT·바이오·건설)에 좋고, 은행에는 불리해요.',
  환율: '1달러가 몇 원인지예요. 환율이 오르면 수출 기업(반도체·자동차)이 유리하고 항공·여행은 불리해요.',
  유가: '기름 1배럴 값이에요. 유가가 오르면 정유사는 좋고 항공사는 비용이 늘어요.',
  루머: '확인되지 않은 소문이에요. 사실이 아닐 수도 있어서 반대로 움직이기도 해요.',
  상한가: '하루에 오를 수 있는 최대치(+30%)예요. 하한가는 반대로 -30%예요.',
  평가금액: '지금 가격으로 팔면 받을 수 있는 금액이에요.',
  위험도: '얼마나 크게 오르내리는지예요. 고위험은 크게 벌 수도, 크게 잃을 수도 있어요.',
  업종: '비슷한 사업을 하는 회사 묶음이에요. 같은 업종은 뉴스에 함께 움직이는 경우가 많아요.',
  찌라시: '장이 열리기 전에 도는 소문이에요. 일부는 그날 장중 속보의 힌트이고, 나머지는 헛소문이에요. 루머 감별기를 쓰면 가려 줘요.',
  '장 전': '하루와 하루 사이, 장이 열리기 전의 짧은 시간이에요. 지금 가격으로는 못 사고팔고, 예약 주문만 걸 수 있어요.',
  '예약 주문': '원하는 가격을 정해 두면, 장중에 가격이 거기에 닿을 때 자동으로 사고팔아요. 끝까지 안 닿으면 장 마감 때 취소돼요.',
  장중속보: '장이 열려 있는 동안 갑자기 뜨는 뉴스예요. 뜨는 순간 가격이 크게 움직여요.',
  레버리지: '지수가 1% 오르면 2% 오르는 식으로 움직임을 키운 ETF예요. 크게 벌 수도, 크게 잃을 수도 있어요.',
};

/** 점선 밑줄 용어 — 누르면 설명 */
export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const text = GLOSSARY[k];
  if (!text) return <>{children ?? k}</>;
  return (
    <span className="term" ref={ref}>
      <button type="button" className="term-btn" onClick={() => setOpen((o) => !o)}>
        {children ?? k}
      </button>
      {open && (
        <span className="term-pop" role="tooltip">
          <b>{k}</b>
          {text}
        </span>
      )}
    </span>
  );
}
