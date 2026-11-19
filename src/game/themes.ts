/**
 * 오늘의 도전 '오늘의 시장' 테마 (design/v26-batch.md B, 규칙 v26).
 * 테마가 있는 판은 그 사건이 꼭 하나 나옴 — 어느 종목·몇 일차인지는 시장 비밀값으로만 정해짐.
 * 이름·카드 문구·결과 설명은 공개(모두 같은 시장). 로비도 쓰므로 가벼운 파일로 둠.
 * 문구: 사실 한 줄 → 왜 그런지 → 확인·나누기 습관 (금융 교육 자료 말투, 실제 회사 이름 없음)
 */
export const THEME_VERSION = 26;

export type ThemeId = 'pump' | 'war' | 'delist' | 'rate' | 'binary' | 'short' | 'rights';

export interface Theme {
  id: ThemeId;
  name: string;
  /** 시작 전 카드 한 줄 */
  card: string;
  /** 결과 화면 '실제 시장에서는?' */
  lesson: string;
}

export const THEMES: Theme[] = [
  { id: 'pump', name: '테마주 광풍', card: '근거 없는 소문 하나로 며칠째 상한가! 언제 식을지 아무도 몰라요.', lesson: '실제로도 실적과 상관없는 소문만으로 주가가 며칠 연속 크게 오르기도 해요. 너무 빨리 오르면 거래소가 투자경고를 붙이고, 회사가 "사실무근"이라고 밝히면 하루 만에 크게 떨어지기도 해요. 사기 전에 확인할 수 있는 근거가 있는지 먼저 살펴보세요.' },
  { id: 'war', name: '전쟁과 유가', card: '먼 나라의 충돌 소식에 기름값이 출렁여요. 어떤 업종이 웃고 울까요?', lesson: '실제로도 전쟁 소식이 나오면 유가가 뛰고, 연료비가 큰 항공사는 떨어지고 정유사는 오르는 일이 많아요. 다만 첫 충격 뒤 며칠 안에 일부 되돌아가는 경우도 흔해요. 한 사건에 모두 걸기보다 여러 업종에 나눠 담으면 충격이 줄어요.' },
  { id: 'delist', name: '상장 폐지 주의보', card: '어느 회사에 수상한 공시가 떴어요. 거래가 멈추면 팔고 싶어도 못 팔아요.', lesson: '실제로 상장 폐지 심사를 받는 회사는 거래가 멈춰 그동안 팔 수 없어요. 폐지가 정해지면 가격 제한 없는 정리매매를 하는데, 크게 떨어지는 경우가 많아요. 한 종목에 너무 많이 넣지 않는 것이 가장 좋은 대비예요.' },
  { id: 'rate', name: '금리 충격', card: '오늘은 금리 발표가 있는 판! 예상보다 크게 바뀌면 시장 전체가 흔들려요.', lesson: '실제로 한국은행과 미국 연준은 1년에 8번 금리를 정하고, 발표 날짜를 미리 알려 줘요. 보통은 0.25%p씩 움직이지만 한 번에 0.5%p를 바꾸면 시장이 크게 놀라요. 발표 날짜는 일정에서 미리 확인하고, 그날은 무리한 거래를 줄이는 것도 방법이에요.' },
  { id: 'binary', name: '신약 승인 발표', card: '미국에서 신약 승인 결과가 나오는 판! 결과 하나로 하루 만에 크게 움직여요.', lesson: '실제로 미국은 하루 가격 제한이 없어서, 신약 승인 결과에 바이오 회사 주가가 하루에 절반 넘게 오르거나 내리기도 해요. 결과는 발표 전까지 아무도 확실히 알 수 없어요. 결과에 크게 걸린 종목은 조금만 담는 게 기본이에요.' },
  { id: 'short', name: '공매도 보고서', card: '누군가 "이 회사 수상하다"는 보고서를 냈어요. 진짜일까요, 오해일까요?', lesson: '실제로 공매도 투자자가 회사의 문제를 지적하는 보고서를 내면 주가가 하루에 크게 떨어지기도 해요. 하지만 보고서를 낸 쪽은 주가가 떨어져야 돈을 버는 입장이고, 나중에 틀린 것으로 밝혀질 때도 있어요. 보고서 하나만 믿지 말고 회사의 해명과 공시를 함께 보세요.' },
  { id: 'rights', name: '유상증자', card: '한 회사가 새 주식을 찍어 돈을 모으기로 했어요. 내 몫은 어떻게 될까요?', lesson: '실제로 회사가 새 주식을 많이 발행하면 한 주의 몫이 작아지고, 새 주식은 보통 싸게 팔아서 주가가 떨어지는 일이 많아요. 다만 모은 돈을 어디에 쓰는지에 따라 반응이 달라요. 싸졌으니 바닥이라고 서두르기보다 돈을 쓰는 곳을 먼저 확인해 보세요.' },
];
export const THEME_MAP: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && v in THEME_MAP;

const dayNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

/** 7일 묶음마다 7개 테마를 한 번씩 섞어 돌림. keyOf(묶음 번호) = 서버 비밀 키로 만든 16진수 (미래 테마는 서버만 앎) */
function blockOrder(block: number, keyOf: (block: number) => string): ThemeId[] {
  const hex = keyOf(block);
  const ids = THEMES.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = parseInt(hex.slice((i * 4) % (hex.length - 4), ((i * 4) % (hex.length - 4)) + 4), 16) % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** 그날의 테마 (한국 날짜). 묶음 경계에서도 이틀 연속 같은 테마가 나오지 않게 새 묶음의 앞 둘을 바꿈 */
export function themeForDay(day: string, keyOf: (block: number) => string): ThemeId {
  const n = dayNum(day);
  const block = Math.floor(n / 7);
  const order = (b: number) => {
    const o = blockOrder(b, keyOf);
    const prevLast = blockOrder(b - 1, keyOf)[6];
    if (o[0] === prevLast) [o[0], o[1]] = [o[1], o[0]];
    return o;
  };
  return order(block)[((n % 7) + 7) % 7];
}
