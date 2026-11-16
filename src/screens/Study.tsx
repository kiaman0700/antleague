/**
 * 기업 공부: 투자 기초(이 게임 규칙에 맞춘 짧은 설명) + 퀴즈(게임 데이터로 문제를 만들어 풀어 보기)
 * 설명의 업종 예시는 실제 게임 데이터(업종 민감도)에서 뽑음 — 게임과 다른 말을 하지 않게
 */
import { useMemo, useState } from 'react';
import { STOCK_SECTORS, STOCKS, SECTOR_MAP } from '../game/stocks';
import { Icon } from '../components/Icon';

type IconName = Parameters<typeof Icon>[0]['name'];

const names = (list: string[], n = 3) => list.slice(0, n).join('·') || '없음';
/** 업종 민감도에서 '오르면 유리/불리' 업종 고르기 */
function sensitive(key: 'rate' | 'fx' | 'oil') {
  const th = key === 'rate' ? 0.08 : 0.3;
  const krs = STOCK_SECTORS.filter((s) => s.region === 'KR');
  return {
    up: krs.filter((s) => s[key] >= th).map((s) => s.name),
    down: krs.filter((s) => s[key] <= -th).map((s) => s.name),
  };
}

export function StudyBasics() {
  const rate = sensitive('rate');
  const fx = sensitive('fx');
  const oil = sensitive('oil');
  const lessons: { icon: IconName; title: string; body: string; tip: string }[] = [
    {
      icon: 'news',
      title: '주가는 왜 움직일까?',
      body: '회사에 좋은 소식이 나오면 사려는 사람이 늘어 가격이 오르고, 나쁜 소식이면 내려요. 시장 전체 분위기(지수)와 금리·환율·유가도 함께 영향을 줘요.',
      tip: '게임에서는 아침 뉴스와 장중 속보가 가장 큰 힌트예요.',
    },
    {
      icon: 'clock',
      title: '아침 뉴스와 시가',
      body: '밤사이 나온 좋은 뉴스는 장이 열리자마자(시가) 이미 많이 반영돼서, 시작부터 올라 있는 경우가 많아요. 뉴스와 상관없이 크게 뛰어 시작한 종목은 장중에 일부 되돌아오기도 해요.',
      tip: '뉴스를 보고 "얼마나 더 오를까"를 생각해야 해요. 이미 오른 걸 쫓아 사면 손해 볼 수 있어요.',
    },
    {
      icon: 'bank',
      title: '금리',
      body: `돈을 빌리는 값이에요. 금리가 오르면 빚이 많거나 미래 성장에 기대는 회사는 불리하고, 이자로 돈을 버는 쪽은 유리해요. 게임에서 금리가 오를 때 유리한 업종: ${names(rate.up)} / 불리한 업종: ${names(rate.down)}.`,
      tip: '연준·금통위 이벤트 데이에 금리가 크게 바뀔 수 있어요.',
    },
    {
      icon: 'dollar',
      title: '환율 (원/달러)',
      body: `환율이 오르면(원화 약세) 해외에 파는 수출 기업이 유리해요. 미국 주식은 원화로 바꾼 가치가 올라가요. 게임에서 환율이 오를 때 유리한 업종: ${names(fx.up)} / 불리한 업종: ${names(fx.down)}.`,
      tip: '미국 주식을 갖고 있으면 환율도 내 재산에 영향을 줘요.',
    },
    {
      icon: 'fuel',
      title: '유가',
      body: `기름값이 오르면 정유처럼 기름을 파는 쪽은 유리하고, 기름을 많이 쓰는 쪽은 불리해요. 게임에서 유가가 오를 때 유리한 업종: ${names(oil.up)} / 불리한 업종: ${names(oil.down)}.`,
      tip: '유가 뉴스가 나오면 정유와 항공을 반대로 생각해 보세요.',
    },
    {
      icon: 'activity',
      title: '같이 움직이는 업종 · 공급망',
      body: '한 업종에 큰 뉴스가 나면 부품을 대는 회사나 고객사도 같이 움직여요. 예를 들어 반도체 호재는 장비·소재 회사에도 좋은 영향을 줘요.',
      tip: '뉴스 카드의 "관련 종목" 칩을 눌러 함께 살펴보세요.',
    },
    {
      icon: 'cards',
      title: 'ETF · 레버리지 · 인버스',
      body: 'ETF 는 여러 종목을 묶은 상품이에요. 레버리지는 하루 움직임의 2배, 인버스는 반대로 움직여요. 크게 벌 수도 있지만 크게 잃을 수도 있어요.',
      tip: '이 게임에서 레버리지·인버스는 합쳐서 총재산의 30%까지만 살 수 있어요.',
    },
    {
      icon: 'target',
      title: '위험도와 나눠 담기',
      body: '안정형은 덜 흔들리고, 공격형은 크게 오르내려요. 한 종목에 몰빵하면 한 번의 나쁜 뉴스로 크게 잃을 수 있어요.',
      tip: '여러 업종에 나눠 담으면 갑작스러운 뉴스에도 덜 흔들려요.',
    },
    {
      icon: 'coins',
      title: '배당',
      body: '회사가 번 돈을 주주에게 나눠 주는 거예요. 배당 기준일 장 마감 때까지 주식을 들고 있어야 받아요.',
      tip: '일정의 "배당" 이벤트 데이를 확인하세요.',
    },
    {
      icon: 'eye',
      title: '루머와 가짜 뉴스',
      body: '모든 뉴스가 사실은 아니에요. 표시 없는 가짜 기사는 가격에 영향을 주지 않아요. 지난 뉴스에는 가짜·루머 표시가 붙어요.',
      tip: '찬스 카드 "루머 감별기"를 쓰면 오늘 뉴스의 진실을 볼 수 있어요.',
    },
  ];
  return (
    <div className="study-basics">
      {lessons.map((l, i) => (
        <section key={l.title} className="panel pad study-card">
          <div className="sc-head">
            <span className="sc-num">{String(i + 1).padStart(2, '0')}</span>
            <Icon name={l.icon} size={18} />
            <h3>{l.title}</h3>
          </div>
          <p>{l.body}</p>
          <p className="sc-tip">
            <Icon name="sparkles" size={14} /> {l.tip}
          </p>
        </section>
      ))}
    </div>
  );
}

/* ---------- 퀴즈 ---------- */
interface Q {
  text: string;
  options: string[];
  answer: number;
  why: string;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);

function makeQuiz(): Q[] {
  const qs: Q[] = [];
  const krs = STOCK_SECTORS.filter((s) => s.region === 'KR');
  // 1) 거시 변수 문제 2개
  const macro: ['rate' | 'fx' | 'oil', string][] = [
    ['rate', '금리가 오르면'],
    ['fx', '환율(원/달러)이 오르면'],
    ['oil', '유가가 오르면'],
  ];
  for (const [key, label] of shuffle(macro).slice(0, 2)) {
    const th = key === 'rate' ? 0.08 : 0.3;
    const cand = krs.filter((s) => Math.abs(s[key]) >= th);
    if (!cand.length) continue;
    const s = pick(cand);
    const good = s[key] > 0;
    qs.push({
      text: `${label} '${s.name}' 업종은?`,
      options: ['유리해요 (오르기 쉬워요)', '불리해요 (내리기 쉬워요)', '거의 상관없어요'],
      answer: good ? 0 : 1,
      why: `이 게임에서 ${s.name} 업종은 ${label} ${good ? '유리' : '불리'}해요.`,
    });
  }
  // 2) 회사 → 업종 문제 2개
  const cos = shuffle(STOCKS.filter((s) => !s.etf)).slice(0, 2);
  for (const c of cos) {
    const right = SECTOR_MAP[c.sector].name;
    const wrong = shuffle(STOCK_SECTORS.filter((s) => s.id !== c.sector && s.region === SECTOR_MAP[c.sector].region).map((s) => s.name)).slice(0, 2);
    const options = shuffle([right, ...wrong]);
    qs.push({ text: `'${c.name}'은(는) 어떤 업종일까요?`, options, answer: options.indexOf(right), why: `${c.name}: ${c.desc}` });
  }
  // 3) 레버리지·인버스 문제 1개
  const levs = STOCKS.filter((s) => s.etf && s.etf.lev !== 1);
  if (levs.length) {
    const e = pick(levs);
    const lev = e.etf!.lev;
    const options = ['따라가는 것을 그대로 따라가요', '하루 움직임의 2배로 움직여요', '따라가는 것과 반대로 움직여요'];
    qs.push({
      text: `'${e.name}'은(는) 어떻게 움직일까요?`,
      options,
      answer: lev > 1 ? 1 : lev < 0 ? 2 : 0,
      why: `${lev > 1 ? `${lev}배 레버리지` : '인버스'} 상품이에요. 이 게임에서는 레버리지·인버스를 합쳐 총재산의 30%까지만 살 수 있어요.`,
    });
  }
  return shuffle(qs);
}

export function StudyQuiz() {
  const [round, setRound] = useState(0);
  const qs = useMemo(() => makeQuiz(), [round]);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const done = i >= qs.length;
  const q = qs[i];
  const restart = () => {
    setRound((r) => r + 1);
    setI(0);
    setChosen(null);
    setScore(0);
  };
  if (done)
    return (
      <section className="panel pad quiz-done">
        <Icon name="trophy" size={32} />
        <h3>
          {qs.length}문제 중 {score}개 맞혔어요!
        </h3>
        <p className="muted">{score === qs.length ? '완벽해요! 이제 실전에서 뉴스를 읽어 보세요.' : '틀린 문제는 투자 기초와 기업 살펴보기에서 다시 확인해 보세요.'}</p>
        <button className="btn primary" onClick={restart}>
          새 문제로 다시 풀기
        </button>
      </section>
    );
  return (
    <section className="panel pad quiz">
      <div className="qz-top">
        <small className="muted">
          문제 {i + 1} / {qs.length}
        </small>
        <small className="muted">맞힌 수 {score}</small>
      </div>
      <h3>{q.text}</h3>
      <div className="qz-options">
        {q.options.map((o, k) => {
          const state = chosen === null ? '' : k === q.answer ? ' right' : k === chosen ? ' wrong' : ' dim';
          return (
            <button
              key={k}
              className={'qz-opt' + state}
              disabled={chosen !== null}
              onClick={() => {
                setChosen(k);
                if (k === q.answer) setScore((s) => s + 1);
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div className={'qz-why ' + (chosen === q.answer ? 'right' : 'wrong')}>
          <b>{chosen === q.answer ? '정답!' : '아쉬워요'}</b> {q.why}
          <button className="btn sm primary" onClick={() => (setI(i + 1), setChosen(null))}>
            {i + 1 < qs.length ? '다음 문제' : '결과 보기'}
          </button>
        </div>
      )}
    </section>
  );
}
