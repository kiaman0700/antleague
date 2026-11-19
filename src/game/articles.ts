/**
 * (v20) 뉴스를 기사처럼 (design/community-news-v20.md): 가상 언론사·기자·입력 시각·첫 문단·본문
 * - 검증된 사람 인터뷰(대표·임원·애널리스트의 따옴표 말)는 기사의 진위가 정해진 '뒤에' 진위에 따라 다른 확률로 붙임
 *   (진짜 45% · 가짜 12%) → 인터뷰가 있는 기사는 진짜일 확률이 더 높지만 100%는 아님
 * - 소문 기사(n.rumor)는 커뮤니티·SNS 글을 인용하는 기사로 (진위는 소문과 같음)
 * - 서버에서만 만듦(진위를 알아야 하므로). 화면에는 만들어진 글만 — 진위·확률은 안 보냄
 * 난수는 가격과 다른 전용 흐름(방 비밀값 + ':art20:') → 가격·진위는 그대로
 */
import { seeded } from '../lib/rng.js';
import type { NewsEvent } from './market.js';
import { clockOf, gameTime, PLATFORMS, type Platform } from './community.js';
import { SECTOR_MAP, STOCK_MAP } from './stocks.js';

export interface Article {
  press: string;
  reporter: string;
  /** 입력 시각 (장 시간 표시, 아침 뉴스는 장 전) */
  time: string;
  lead: string;
  body: string[];
  /** 검증된 사람 인터뷰 */
  quote?: { who: string; text: string };
  /** 인용한 커뮤니티·SNS */
  cite?: { platform: Platform; name: string };
}

const PRESS = ['개미경제', '증권일보', '마켓투데이', '머니와이어', '한빛뉴스', '글로벌마켓'];
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오'];
const GIVEN = ['하늘', '민준', '서연', '도윤', '지우', '현우', '수아', '예준', '지민', '태윤', '나래', '시우'];
const FIRMS = ['개미증권', '한빛투자증권', '마켓리서치', '여의도증권'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const jo = (w: string, a: string, b: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? w + a : w + b;
};

/** 거시 뉴스 제목 → 쉬운 설명 (제목 글자만 봄, 난수 없음) */
function macroWhy(t: string): { lead: string; body: string } | null {
  if (/유가/.test(t)) {
    const up = /급등|상승/.test(t);
    return up
      ? { lead: '기름값이 오르면 원료·연료를 많이 쓰는 업종의 비용이 늘어난다.', body: '항공·운송·화학처럼 기름을 많이 쓰는 회사는 부담이 커지고, 정유 회사는 오히려 이득을 볼 수 있다는 분석이 나온다.' }
      : { lead: '기름값이 내리면 원료·연료를 많이 쓰는 업종의 비용이 줄어든다.', body: '항공·운송·화학처럼 기름을 많이 쓰는 회사에는 숨통이 트이지만, 정유 회사는 부담이 커질 수 있다는 분석이 나온다.' };
  }
  if (/환율|원화|달러/.test(t)) {
    const weakWon = /급등|상승|약세|달러 강세/.test(t);
    return weakWon
      ? { lead: '원화 가치가 떨어지면 해외에 물건을 파는 기업의 벌이가 늘어난다.', body: '수출 비중이 큰 기업에는 유리하지만, 원료를 수입하는 기업과 외국인 투자자에게는 부담이 될 수 있다는 관측이 나온다.' }
      : { lead: '원화 가치가 오르면 원료를 수입하는 기업의 비용이 줄어든다.', body: '수입 원료를 쓰는 기업과 여행·항공 업종엔 도움이 되지만, 수출 기업은 벌이가 줄 수 있다는 관측이 나온다.' };
  }
  if (/금리|연준|금통위/.test(t)) {
    const us = /연준|미국/.test(t);
    const who = us ? '미국' : '국내';
    if (/동결/.test(t)) return { lead: `${who} 금리가 그대로 유지되면서 시장은 일단 숨을 고르는 분위기다.`, body: '시장 예상과 크게 다르지 않아 큰 충격은 없을 것이라는 의견이 많다. 다음 결정 때까지는 경기 지표에 관심이 쏠릴 전망이다.' };
    if (/인하/.test(t)) return { lead: `${who} 금리가 내리면 돈을 빌리는 비용이 줄어 주식 시장에 힘이 될 수 있다.`, body: '빌린 돈이 많은 건설·성장 기업에는 부담이 줄어들지만, 이자로 버는 은행은 수익이 줄 수 있다는 분석이 나온다.' };
    if (/인상/.test(t)) return { lead: `${who} 금리가 오르면 돈을 빌리는 비용이 늘어 주식 시장에는 부담이 될 수 있다.`, body: '빌린 돈이 많은 건설·성장 기업은 부담이 커지지만, 이자로 버는 은행은 수익이 늘 수 있다는 분석이 나온다.' };
  }
  return null;
}

export function articleOf(n: NewsEvent, key: string, fake: boolean, daySec?: number): Article {
  const rng = seeded(`${key}:art20:${n.day}:${hash(n.headline)}`);
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const person = () => pick(SUR) + pick(GIVEN);
  const good = n.tone === 'good';
  const title = n.headline.replace(/^\[[^\]]+\]\s*/, '');
  // 제목에 이미 따옴표가 있으면 바깥 작은따옴표를 붙이지 않음 (''증권가 "…"'' 처럼 겹치지 않게)
  const qt = /["'“”‘’]/.test(title) ? title : `'${title}'`;
  const co = n.symbol && STOCK_MAP[n.symbol] ? STOCK_MAP[n.symbol].name : null;
  const sec = n.sector ? SECTOR_MAP[n.sector]?.name ?? null : co && n.symbol ? SECTOR_MAP[STOCK_MAP[n.symbol].sector]?.name ?? null : null;
  const subject = co ?? (sec ? `${sec} 업종` : '국내 증시');
  const dayTxt = `${n.day + 1}일차`;
  // (v22) 하루 길이를 알면 게임 시간으로 ('3일차 42초') — 아침 기사의 난수 두 번은 그대로 뽑음 (기사 내용이 안 바뀌게)
  const oldTime = n.at != null ? clockOf(n.at) : `0${7 + Math.floor(rng() * 2)}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`;
  const gt = daySec;
  const time = gt ? (n.at != null ? gameTime(n.at, gt) : '장 시작 전') : oldTime;
  const when = n.at != null ? `${dayTxt} ${time}` : `${dayTxt} 장 시작 전`;
  const others = n.related.filter((s) => s !== n.symbol && STOCK_MAP[s]).slice(0, 2).map((s) => STOCK_MAP[s].name);

  let lead: string;
  const body: string[] = [];
  let cite: Article['cite'];
  if (n.rumor) {
    // 커뮤니티·SNS 인용 기사
    // 제목에 플랫폼 이름이 있으면 그 플랫폼 (뽑기는 그대로 해서 난수 횟수 유지)
    const picked = pick(Object.keys(PLATFORMS) as Platform[]);
    const named = (Object.keys(PLATFORMS) as Platform[]).find((k) => title.includes(`'${PLATFORMS[k].name}'`));
    const pf = named ?? picked;
    cite = { platform: pf, name: PLATFORMS[pf].name };
    const said = (/"([^"]+)"/.exec(title) ?? [])[1] ?? title;
    // (v21) 장중 소문 기사는 제목이 이미 기사 문장이라 따옴표로 옮기지 않음
    lead = named
      ? `${when}, 온라인 ${PLATFORMS[pf].kind} '${PLATFORMS[pf].name}'에 ${subject} ${good ? '호재설' : '악재설'} 글이 올라와 투자자들 사이에서 빠르게 퍼지고 있다.`
      : `${when}, 온라인 ${PLATFORMS[pf].kind} '${PLATFORMS[pf].name}'에 ${jo(subject, '과', '와')} 관련해 "${said}"${jo(said, '이라는', '라는').slice(said.length)} 글이 올라와 투자자들 사이에서 빠르게 퍼지고 있다.`;
    body.push(`글이 올라온 뒤 비슷한 내용의 글이 잇따르면서 ${jo(subject, '을', '를')} 찾는 사람이 크게 늘었다. ${named ? '회사 측은 "확인해 줄 수 없다"는 입장만 내놓았다.' : '다만 회사 측은 아직 공식 입장을 내지 않았다.'}`);
    body.push(`시장에서는 "확인되지 않은 소문만 믿고 사고팔면 손해를 볼 수 있다"며 신중하라는 목소리가 나온다.`);
  } else if (n.label === '시황' && n.at != null) {
    // (v21) 장중 시황: 이미 지나간 움직임 정리 — 인터뷰 없음
    lead = `${title.replace(/^\d{2}:\d{2} 기준 /, '')} — ${time} 기준 거래소 집계다.`;
    body.push(`${subject}에는 장중 내내 매수·매도 주문이 몰렸다. 시장에서는 "${good ? '단기 과열을 조심해야 한다' : '저가 매수 기회를 노리는 움직임도 있다'}"는 말이 나온다.`);
    body.push(`장 마감까지 흐름이 바뀔 수 있어 끝까지 지켜봐야 한다는 분석이다.`);
  } else if (/배당락/.test(title)) {
    // (v21) 배당락: 어제 배당 기준일이 지나 배당만큼 낮게 출발 — 회사에 나쁜 일이 생긴 게 아님
    lead = `${when}, ${jo(subject, '이', '가')} 배당락으로 어제보다 낮은 가격에서 거래를 시작한다.`;
    body.push(`어제 배당 기준일까지 주식을 가진 사람은 배당을 받는다. 그만큼 회사에서 돈이 빠져나가기 때문에 다음 날 주가가 배당만큼 낮게 출발하는 것이 일반적이다.`);
    body.push(`회사에 나쁜 일이 생긴 것은 아니어서, 배당락 뒤 흐름은 그날 나오는 다른 소식에 달려 있다는 분석이다.`);
  } else if (n.label === '특징주' && n.revealDay != null) {
    // (v15) 사건 반전 기사: 앞서 나온 기대와 반대되는 소식 — 진위는 발표 다음 날에야 밝혀짐
    lead = `${when}, ${qt} 소식이 전해지면서 ${co ? jo(co, '을', '를') : jo(subject, '을', '를')} 둘러싼 기대에 물음표가 붙었다.`;
    body.push(`앞서 나온 기대와 반대되는 내용이라 투자자들 사이에서 의견이 엇갈리고 있다. 회사 측은 아직 공식 입장을 내지 않았다.`);
    body.push(`결과가 발표되기 전까지는 사실인지 확인하기 어렵다는 지적이 나온다.`);
  } else if (n.label === '시황' || n.label === '특징주') {
    // 지난 움직임을 정리한 기사 (아침에 나오는 전날 정리 등)
    lead = `${when}, ${qt} 소식이 전해졌다.`;
    body.push(`${subject}에는 전날 ${good ? '매수세가 몰리며 강한 흐름' : '매도세가 이어지며 약한 흐름'}이 나타났다. ${others.length ? `${others.join('·')} 등 관련 종목도 함께 주목받았다.` : ''}`.trim());
    body.push(`이 흐름이 이어질지는 오늘 나오는 소식에 달려 있다는 분석이다.`);
  } else if (/발표 예정|앞둬|예고/.test(title)) {
    // 사건 예고 기사: 결과는 아직 모름
    const due = (/(\d+)일차 발표 예정/.exec(title) ?? [])[1];
    lead = `${when}, ${qt} 소식이 전해지면서 ${jo(co ?? subject, '이', '가')} 시장의 관심을 모으고 있다.`;
    body.push(`${due ? `발표가 예정된 ${due}일차까지` : '발표 전까지'} 기대와 걱정이 엇갈릴 것으로 보인다. 결과에 따라 주가가 크게 움직일 수 있다.`);
    body.push(`발표 전에는 확인되지 않은 소문이 많이 돌 수 있어 주의가 필요하다는 지적도 나온다.`);
  } else if (n.kind === 'macro') {
    // 제목에 맞는 설명 (난수를 더 쓰지 않음 — 진행 중인 판의 기사 그대로)
    const why = macroWhy(title);
    lead = `${when}, ${qt} 소식이 전해졌다. ${why ? why.lead : '시장 전체에 영향을 줄 수 있는 소식이다.'}`;
    body.push(why ? why.body : `시장 전문가들은 "${good ? '투자 심리가 살아날 수 있는 신호' : '당분간 변동성이 커질 수 있는 신호'}"라고 풀이했다.`);
    body.push(`${pick(['외국인', '기관', '개인'])} 투자자의 움직임에 따라 하루 흐름이 크게 달라질 수 있다는 분석도 나왔다.`);
  } else {
    lead = `${when}, ${qt} 소식이 전해지면서 ${jo(co ?? subject, '이', '가')} 시장의 관심을 모으고 있다.`;
    body.push(
      good
        ? `업계에서는 이번 소식이 ${subject}의 실적과 성장에 보탬이 될 것으로 본다. ${others.length ? `${others.join('·')} 등 관련 종목에도 관심이 이어지고 있다.` : '관련 업종 전반으로 기대감이 번지는 모습이다.'}`
        : `업계에서는 이번 소식이 ${subject}에 당분간 부담이 될 것으로 본다. ${others.length ? `${others.join('·')} 등 관련 종목에도 영향이 갈 수 있다는 관측이 나온다.` : '관련 업종 전반으로 걱정이 번지는 모습이다.'}`,
    );
    body.push(n.at != null ? `이 소식은 장중에 전해져 발표 직후 거래가 크게 늘었다.` : `이 소식은 장 시작 전에 전해져 시가에 상당 부분 반영될 것으로 보인다.`);
  }
  // 검증된 사람 인터뷰: 진위가 정해진 뒤 진위에 따라 (진짜 45% · 가짜 12%)
  let quote: Article['quote'];
  const qRoll = rng();
  if (!n.rumor && n.kind !== 'macro' && n.label !== '시황' && qRoll < (fake ? 0.12 : 0.45)) {
    const insider = co && rng() < 0.5;
    // ETF 는 회사가 아니라 대표·임원이 없음 → 운용역 (난수 쓰는 횟수는 그대로)
    const isEtf = !!(n.symbol && STOCK_MAP[n.symbol]?.etf);
    const rank = insider ? pick(['대표', '전무', 'IR 담당 상무']) : '';
    const who = insider ? `${co} ${isEtf ? '운용역' : rank} ${person()}` : `${pick(FIRMS)} 애널리스트 ${person()}`;
    // 회사 사람과 애널리스트는 하는 말이 다름
    const said = insider
      ? good
        ? pick(['숫자로 증명해 보이겠다', '앞으로도 좋은 소식을 계속 전하겠다', '이번 성과는 시작에 불과하다'])
        : pick(['대응 방안을 마련 중이다', '빠르게 정상화하겠다', '주주 여러분께 송구하다'])
      : good
        ? pick(['이번 결과는 시장 기대를 웃도는 수준이라고 본다', '하반기까지 좋은 흐름이 이어질 것으로 예상한다', '목표 주가를 올릴 만한 내용이다'])
        : pick(['당분간 부담이 이어질 수밖에 없다', '시장 기대에는 못 미치는 결과로 판단한다', '보수적으로 볼 필요가 있다']);
    // ETF 운용역은 회사 사람 말투 대신 담은 종목 얘기 (뽑기는 위에서 이미 했으니 횟수 그대로)
    const text = insider && isEtf ? (good ? '담고 있는 종목들의 흐름이 좋아 기대가 크다' : '담고 있는 종목들이 약해 당분간 조심스럽다') : said;
    quote = { who, text };
    body.splice(1, 0, `${jo(who, '은', '는')} "${text}"고 말했다.`);
  }
  return { press: pick(PRESS), reporter: `${person()} 기자`, time, lead, body, quote, cite };
}
