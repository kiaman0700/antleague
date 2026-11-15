const GENERIC_GOOD = [
  '{name}, 분기 실적 어닝 서프라이즈',
  '{name}, 대형 공급 계약 체결',
  '외국인, {name} 대량 순매수',
  '{name}, 대규모 자사주 매입 발표',
  '증권가 "{name} 목표가 상향"',
];
const GENERIC_BAD = [
  '{name}, 실적 쇼크… 시장 예상 크게 하회',
  '{name} 경영진 횡령 의혹 제기',
  '{name}, 대규모 유상증자 발표',
  '기관, {name} 연일 대량 매도',
  '증권가 "{name} 목표가 하향"',
];

const SECTOR_GOOD: Record<string, string[]> = {
  IT: ['{name}, 차세대 AI 플랫폼 공개', '{name}, 글로벌 빅테크와 파트너십'],
  바이오: ['{name}, 신약 임상 3상 성공', '{name}, FDA 승인 획득'],
  에너지: ['국제 유가 급등, {name} 수혜 기대', '{name}, 정부 신재생 사업 단독 수주'],
  게임: ['{name} 신작, 앱스토어 매출 1위', '{name}, 해외 퍼블리싱 대박 계약'],
  식품: ['K-푸드 수출 신기록, {name} 주목', '{name} 신제품 품절 대란'],
  반도체: ['{name}, AI 칩 대규모 수주', '반도체 업황 회복 신호, {name} 강세'],
  엔터: ['{name} 소속 그룹 빌보드 1위', '{name}, 월드투어 전석 매진'],
  블록체인: ['비트코인 사상 최고가, {name} 급등', '{name}, 대형 거래소 상장 확정'],
};
const SECTOR_BAD: Record<string, string[]> = {
  IT: ['{name}, 서비스 대규모 장애 발생', '{name}, 개인정보 유출 사고'],
  바이오: ['{name}, 임상 실패 공시', '{name} 신약, 부작용 논란'],
  에너지: ['국제 유가 폭락, {name} 직격탄', '{name} 발전소 가동 중단'],
  게임: ['{name} 신작, 흥행 참패', '{name}, 판호 발급 무산'],
  식품: ['원재료 가격 급등, {name} 마진 압박', '{name} 제품서 이물질 검출'],
  반도체: ['{name}, 수출 규제 직격탄', '반도체 재고 과잉 우려, {name} 약세'],
  엔터: ['{name} 간판 그룹 해체설', '{name} 소속 아티스트 논란'],
  블록체인: ['대형 코인 거래소 해킹, {name} 급락', '{name}, 규제 당국 조사 착수'],
};

export const MARKET_GOOD = ['한국은행, 기준금리 깜짝 인하', '미국 증시 사상 최고치 경신', '외국인 자금 대거 유입'];
export const MARKET_BAD = ['글로벌 경기침체 우려 확산', '환율 급등, 외국인 자금 이탈', '미국 증시 폭락 여파'];

export function stockHeadlines(sector: string, good: boolean): string[] {
  return [...(good ? GENERIC_GOOD : GENERIC_BAD), ...((good ? SECTOR_GOOD : SECTOR_BAD)[sector] ?? [])];
}
