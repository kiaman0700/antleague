import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markActiveGame } from '../lib/activeTab';
import { Loading } from '../components/ui';
import { useAccount } from '../net/account';
import { ask } from '../components/ConfirmHost';
import { setDrawScope } from '../components/ProChart';
import { Icon, type IconName } from '../components/Icon';
import { PrefsPanel, Sheet } from '../components/PrefsPanel';
import { applyMoneyUnit, effective, isCustom, moved, resetLayout, setLayout, setPrefs, usePrefs, type MHeaderRow, type MTab } from '../prefs';
import { bandText, loadPins, MarketGridPinnable, MarketTicker, EndStatus, RankList, rankRows, RankStrip, PlayerPic, savePins, ScheduleStrip, TargetPicker } from '../components/Board';
import { AssetSummary, CardTray, Drawer, Timeline } from '../components/Desk';
import { BottomSheet, Calendar, OrdersAndDividends, useIsMobile, useMobileLayout } from '../components/Extras';
import { AssetsPanel, CardsPanel, DayCloseOverlay, FakeNewsModal, MatchIntro, NewsPanel, Tutorial, unreadToday } from '../components/Panels';
import { ReactionBubbles, ReactionButton } from '../components/Reactions';
import { StockBrowser, type BrowserFilter } from '../components/StockBrowser';
import { StockDetail, TradePanel } from '../components/StockDetail';
import { Term } from '../components/Term';
import { isLeveraged, josa, LEVERAGE_CAP, preSeconds, PREMARKET_VERSION, type View } from '../engine/engine';
import { loadSolo, saveSolo, makeDemo, makeTutorial, soloAct, soloSync, soloView, type SoloSave } from '../engine/local';
import { TutorialGuide, TUTORIAL_STEPS } from '../components/TutorialGuide';
import { CardGuide } from '../components/CardGuide';
import { EditSlot } from '../components/EditSlot';
import { DockBoard } from '../components/Dock';
import { ToastSpot, type ToastMsg } from '../components/ToastSpot';
import { TradeJump } from '../components/TradeJump';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { FIND_AGAIN } from '../components/MatchFinder';
import { withLive } from '../game/live';
import { BONUS_AMOUNT, FEE_BOMB_RATE, ITEM_MAP, spendsFromRows, type ItemKind, type ItemRow } from '../game/items';
import { barNow, KR_INDEX_BASE, pricesAt, US_INDEX_BASE, type Market } from '../game/market';
import { buyCost, computePortfolio, equityWith, FEE_RATE, startCashFor } from '../game/portfolio';
import { quote } from '../game/quote';
import { SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { num, pct, tone, wonShort } from '../lib/format';
import { isMuted, play, setMuted } from '../lib/sound';
import { api, useLiveView, useReactions, type Reaction } from '../net/api';
import { loadWatch, markTutorialSeen, saveUi, saveWatch, tutorialSeen, type Session, type UiMode } from '../session';
import { ResultScreen } from './ResultScreen';
import { setFlash } from '../lib/flash';

interface Props {
  session: Session;
  onExit: () => void;
  /** 한 판 더: 새 방 대기실로 */
  onWaiting?: (roomId: string, playerId: string, nickname: string, code: string) => void;
  /** (연습) 같은 설정으로 한 판 더 */
  onReplay?: (days: number, daySec: number, bots: number[]) => void;
}

type Tab = 'list' | 'detail' | 'news' | 'assets' | 'cards';
const TABS: Tab[] = ['list', 'detail', 'news', 'assets', 'cards'];
const TAB_LABEL: Record<Tab, string> = { list: '종목', detail: '차트', news: '소식', assets: '내 재산', cards: '카드' };
const TAB_ICON: Record<Tab, IconName> = { list: 'list', detail: 'chart', news: 'news', assets: 'wallet', cards: 'cards' };
const HEADER_LABEL: Record<MHeaderRow, string> = { ticker: '시장 지표', schedule: '일정', assets: '내 재산 요약' };

/** 연습을 '그만두기'로 나갔는지 (나간 뒤 1초 타이머가 다시 저장하지 않게) */
const soloQuit = { current: false };

/** 둘이서: 서버(/api/game) · 혼자: 브라우저 안의 같은 엔진 */
function useGameSource(session: Session) {
  const multi = session.mode === 'multi';
  const live = useLiveView(multi ? session.roomId : null);
  const [solo, setSolo] = useState<SoloSave | null>(() => ((soloQuit.current = false), multi ? null : session.tutorial ? makeTutorial(session.nickname) : session.demo ? makeDemo(session.nickname) : loadSolo()));
  const [soloNow, setSoloNow] = useState(() => solo?.frozenAt ?? Date.now());
  useEffect(() => {
    // 화면 편집용 가상 게임은 멈춘 장면 (시간·가격·날짜 고정)
    if (multi || session.demo) return;
    const id = setInterval(() => {
      // 연습을 그만둔 뒤에는 다시 저장하지 않게
      if (soloQuit.current) return;
      const t = Date.now();
      setSoloNow(t);
      setSolo((s) => (s ? soloSync(s, t) : s));
    }, 1000);
    return () => clearInterval(id);
  }, [multi]);
  const soloV = useMemo(() => (solo ? soloView(solo, soloNow) : null), [solo, soloNow]);
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (session.demo) throw new Error('화면 편집 중에는 거래·카드를 쓸 수 없어요');
      setBusy(true);
      try {
        if (multi) {
          await api(action, { roomId: session.roomId, ...payload });
          await live.refresh();
        } else if (solo) {
          setSolo(soloAct(solo, action, payload));
        }
      } finally {
        setBusy(false);
      }
    },
    [multi, session.roomId, session.demo, live, solo],
  );

  if (multi) return { view: live.view, market: live.market, offset: live.offset, error: live.error, act, busy, tutorialInfo: null };
  return { view: soloV, market: soloV?.market ?? null, offset: 0, error: solo ? null : '연습 게임을 찾을 수 없어요.', act, busy, tutorialInfo: solo?.tutorial ?? null };
}

/** 모바일: 탭 = 페이지. 주소(#news 등)와 연결해서 뒤로 가기로 이전 탭으로 */
function useMobileTab(mobile: boolean, start: Tab = 'news') {
  const fromHash = (): Tab => {
    const h = location.hash.slice(1) as Tab;
    return TABS.includes(h) ? h : start;
  };
  const [tab, setTabState] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTabState(fromHash());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      if (!mobile) return;
      if (location.hash.slice(1) !== t) history.pushState(history.state, '', `${location.pathname}${location.search}#${t}`);
      window.scrollTo(0, 0);
    },
    [mobile],
  );
  return [tab, setTab] as const;
}

export function GameController({ session, onExit, onWaiting, onReplay }: Props) {
  // 튜토리얼은 브라우저 엔진이지만 봇과 대결하는 화면으로 보여 줌
  const solo = session.mode === 'solo' && !session.tutorial;
  const me = session.playerId;
  const mobile = useMobileLayout();
  // 세로 태블릿(넓은 휴대폰 배치): 종목 목록과 차트·주문을 나란히
  // 가로로 눕힌 휴대폰(높이가 낮음)은 제외
  const wide = useIsMobile('(min-width: 700px) and (min-height: 600px)');
  const tablet = mobile && wide;
  const { view, market: rawMarket, offset, error, act, busy, tutorialInfo } = useGameSource(session);
  // 다른 창의 로비가 '연결이 끊겼어요' 팝업을 띄우지 않게 (이 창에서 하는 중이라고 적어 둠)
  const activeRoom = session.mode === 'multi' ? session.roomId : null;
  useEffect(() => (activeRoom ? markActiveGame(activeRoom) : undefined), [activeRoom]);
  const [tutStep, setTutStep] = useState(0);
  const [cardGuide, setCardGuide] = useState(false);
  // 서버가 보낸 '지금 칸까지의 장중 가격'을 오늘 막대에 합침 → 현재가·차트가 5초마다 움직임
  const market = useMemo(() => (rawMarket ? withLive(rawMarket, view?.live) : null), [rawMarket, view?.live]);

  const [viewDay, setViewDay] = useState<number | null>(null);
  const [closing, setClosing] = useState<number | null>(null);
  // 대결 첫날 처음 들어왔을 때만 잠깐 'VS' 화면 (다시 들어오면 안 보임)
  const [intro, setIntro] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [ui, setUiState] = useState<UiMode>(session.ui);
  const prefs = usePrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  // 화면 편집 모드: 실제 게임 화면에서 배치를 바꿈 (가상 게임이면 처음부터 편집 중)
  const [editing, setEditing] = useState(!!session.demo);
  // 화면 편집 주소(/customize)로 바로 들어와도 편집한 배치가 적용되게 커스텀 모드를 켬 (편집 버튼으로 올 때와 같게)
  useEffect(() => {
    if (session.demo) setPrefs({ enabled: true });
  }, [session.demo]);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  // 휴대폰: 위 고정 막대 높이를 재서 그 바로 아래에 시장·일정·재산 줄을 붙여 둠
  const [mTopH, setMTopH] = useState(0);
  const mTopRo = useRef<ResizeObserver | null>(null);
  const mTopRef = useCallback((el: HTMLElement | null) => {
    mTopRo.current?.disconnect();
    mTopRo.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      setMTopH(h);
      // 알림(화면 맨 위 층)도 이 막대 아래에 뜨게 문서 전체에 알려 줌
      document.documentElement.style.setProperty('--m-top-h', h + 'px');
    });
    ro.observe(el);
    mTopRo.current = ro;
  }, []);
  // 그 아래 줄 높이도 재서, 태블릿 왼쪽 목록처럼 붙어 있는 요소가 그 밑으로 숨지 않게
  const [mFlowH, setMFlowH] = useState(0);
  const mFlowRo = useRef<ResizeObserver | null>(null);
  const mFlowRef = useCallback((el: HTMLElement | null) => {
    mFlowRo.current?.disconnect();
    mFlowRo.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMFlowH(getComputedStyle(el).position === 'sticky' ? Math.round(el.getBoundingClientRect().height) : 0));
    ro.observe(el);
    mFlowRo.current = ro;
  }, []);
  const layout = effective(prefs).layout;
  const startEdit = () => {
    setPrefs({ enabled: true });
    setEditing(true);
  };
  // 모든 금액 표시 단위 (초보 만원 · 일반 원 · 내 설정)
  applyMoneyUnit(prefs, ui);
  // 튜토리얼은 '뉴스에서 종목 찾기'를 직접 해 보도록 처음 선택을 튜토리얼 종목이 아닌 것으로
  const [selected, setSelected] = useState(() => STOCKS.find((x) => x.symbol !== tutorialInfo?.symbol)!.symbol);
  const [tab, setTab] = useMobileTab(mobile, effective(prefs).layout.mStart);
  // 튜토리얼: 단계에 맞는 탭을 모바일에서 열어 줌 (훅은 항상 같은 순서로 — 화면 준비 전 return 보다 위)
  const tutTab = session.tutorial ? TUTORIAL_STEPS[tutStep]?.tab : undefined;
  useEffect(() => {
    if (mobile && tutTab) setTab(tutTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutStep, mobile]);
  const [filter, setFilter] = useState<BrowserFilter>({ region: 'all', sub: null });
  const [watch, setWatch] = useState<string[]>(loadWatch);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [exitAsk, setExitAsk] = useState(false);
  // PC: 뉴스 크게 보기 (넓은 창)
  const [newsBig, setNewsBig] = useState(false);
  const memberAcc = useAccount().status === 'member';
  // 결과 화면: 파티로 한 판 했으면 파티 상태를 살짝 봄(peek — 아직 '돌아옴'으로 치지 않음) → '파티로 돌아가기'·파티장이 다시 찾는 중 알림
  const [partyAfter, setPartyAfter] = useState<{ isLeader: boolean; searching: boolean } | null>(null);
  // 파티는 매칭 판에서만 → 그 판의 결과 화면에서만 확인
  const resultShown = showResult && session.mode === 'multi' && memberAcc && view?.room.kind === 'match';
  useEffect(() => {
    if (!resultShown) return;
    let alive = true;
    const peek = () =>
      api<{ party: { isLeader: boolean; searching: boolean; members: unknown[] } | null }>('party', { peek: true })
        .then((r) => {
          if (!alive) return;
          const inParty = !!r.party && r.party.members.length > 1;
          setPartyAfter(inParty ? { isLeader: r.party!.isLeader, searching: r.party!.searching } : null);
          // 파티가 아니면 더 물어볼 필요 없음 (결과 화면에 오래 있어도 요청이 쌓이지 않게)
          if (!inParty) clearInterval(id);
        })
        .catch(() => {});
    const id = setInterval(() => peek(), 4000);
    peek();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [resultShown]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  // 첫 판 안내: 대결 중에는 제한 시간이 흐르므로 자동으로 띄우지 않음 (도움말 버튼으로는 언제든)
  const [tutorial, setTutorial] = useState(() => !session.demo && !session.tutorial && session.mode !== 'multi' && session.ui === 'easy' && !tutorialSeen());
  const [fakeModal, setFakeModal] = useState(false);
  const [sheet, setSheet] = useState<null | 'buy' | 'sell'>(null);
  const [menu, setMenu] = useState(false);
  const [rankSheet, setRankSheet] = useState(false);
  const [marketSheet, setMarketSheet] = useState(false);
  const [schedSheet, setSchedSheet] = useState(false);
  const [pins, setPins] = useState<string[]>(loadPins);
  const togglePin = (k: string) =>
    setPins((p) => {
      const next = p.includes(k) ? p.filter((x) => x !== k) : [...p, k].slice(0, 3);
      savePins(next);
      return next;
    });
  const [targetPick, setTargetPick] = useState<ItemKind | null>(null);
  const [fakeTarget, setFakeTarget] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | 'assets' | 'cards'>(null);
  const [bubbles, setBubbles] = useState<(Reaction & { mine?: boolean })[]>([]);
  const [muted, setMutedState] = useState(isMuted());
  const [now, setNow] = useState(Date.now());
  const toastTimer = useRef<number>();
  /** 장중 속보는 보통 알림과 따로 (자리도 따로) */
  const [newsToast, setNewsToast] = useState<ToastMsg | null>(null);
  const newsTimer = useRef<number>();
  const searchRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((text: string, kind: 'ok' | 'err' | 'warn' = 'ok') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    // 긴 안내는 읽을 시간만큼 더 오래
    toastTimer.current = window.setTimeout(() => setToast(null), Math.max(2600, text.length * 90));
  }, []);
  /** 장중 속보: 크게, 더 오래(6초+), 누르면 그 종목으로 */
  const showNews = useCallback((msg: Omit<ToastMsg, 'kind'>) => {
    setNewsToast({ ...msg, kind: 'news' });
    window.clearTimeout(newsTimer.current);
    newsTimer.current = window.setTimeout(() => setNewsToast(null), Math.max(6000, msg.text.length * 110));
  }, []);

  useEffect(() => {
    if (session.demo) return; // 멈춘 장면
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const room = view?.room;
  const total = room?.totalDays ?? 1;
  const serverDay = room ? room.day : null;
  const finished = room?.status === 'finished';

  // ---------- 날짜 진행 / 하루 결산 ----------
  useEffect(() => {
    if (serverDay === null || !market) return;
    if (viewDay === null) {
      if (finished) {
        setViewDay(total - 1);
        setShowResult(true);
      } else setViewDay(serverDay);
      return;
    }
    if (closing === null && !showResult && serverDay > viewDay) {
      setClosing(viewDay);
      // 날이 바뀌면 열려 있던 창(주문·대상 고르기·가짜 뉴스·메뉴 등)은 닫음 — 지난 날 창으로 새 날에 카드가 쓰이지 않게
      setSheet(null);
      setTargetPick(null);
      setFakeModal(false);
      setMenu(false);
      setRankSheet(false);
      setSchedSheet(false);
      setExitAsk(false);
      play('close');
    }
  }, [serverDay, viewDay, closing, showResult, market, finished, total]);

  const day = viewDay ?? 0;
  const displayDay = closing ?? day;
  const displayClosed = closing !== null;
  const prices = useMemo(() => (market ? pricesAt(market, displayDay, displayClosed) : {}), [market, displayDay, displayClosed]);
  // 차트 선은 판마다 따로 (대결은 방 번호, 연습은 판마다 다른 첫 가격으로 구분)
  const drawScope = session.tutorial ? 'tut' : session.roomId ? session.roomId.slice(0, 12) : market ? 's' + Math.round(market.bars.CORE?.[0]?.open ?? 0) : null;
  useMemo(() => drawScope && setDrawScope(drawScope), [drawScope]);

  // ---------- 내 상태 ----------
  const myItemRows: ItemRow[] = view?.myItemRows ?? [];
  const spends = useMemo(() => spendsFromRows(myItemRows), [myItemRows]);
  const paidDivs = useMemo(() => (market?.dividends ?? []).filter((d) => d.perShare > 0), [market]);
  // 시작 돈: 방 규칙 버전마다 (v6 부터 100만원)
  const START_CASH = startCashFor(view?.room.rulesVersion);
  const portfolio = useMemo(() => computePortfolio(view?.myTrades ?? [], spends, Infinity, paidDivs, START_CASH), [view?.myTrades, spends, paidDivs, START_CASH]);
  const equity = market ? equityWith(portfolio, prices) : START_CASH;
  const myRet = equity / START_CASH - 1;
  const myOrders = view?.myOrders ?? [];
  const fxNow = market ? (market.macro[displayDay] ?? market.macro0).fx : 1;
  const reservedCash = myOrders
    .filter((o) => o.status === 'open' && o.day === day && o.side === 'buy')
    .reduce((a, o) => a + buyCost(o.qty, STOCK_MAP[o.symbol].currency === 'USD' ? Math.round(o.limit_price * fxNow) : o.limit_price, o.fee), 0);

  const players = view?.players ?? [];
  useEffect(() => {
    if (session.mode !== 'multi' || !room || room.status !== 'playing' || room.day !== 0 || players.length < 2) return;
    const k = 'stockduel.vs.' + room.id;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch {
      return;
    }
    setIntro(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.status, players.length]);
  const opponent = players.find((p) => p.id !== me) ?? null;
  // 봇전(브라우저에서 도는 판 + 봇): 연습처럼 돌지만 화면은 대결처럼 순위·상대를 보여 줌, 방해 카드도 봇에게
  const vsBots = solo && players.some((p) => p.bot);
  // 오늘의 도전처럼 서버 판이라도 혼자면 상대 칸 대신 '오늘의 도전' 표시
  const rivals = (!solo || vsBots) && players.length >= 2;
  const meRow = players.find((p) => p.id === me);
  // 봇전(브라우저)도 봇이 마감할 때까지 '마감함' 상태로 기다림 (취소는 대결에서만)
  const endedToday = (!solo || players.some((p) => p.bot)) && (meRow?.endedDay ?? -1) >= day;
  const effects = view?.effectsToday ?? [];
  const frozen = effects.includes('freeze');
  const feeRate = effects.includes('fee') ? FEE_BOMB_RATE : FEE_RATE;
  const canAct = !!view && room?.status === 'playing' && closing === null && viewDay === serverDay && !endedToday && !showResult;
  const deadline = room?.deadline ?? null;
  // 마감 시각엔 장이 열리기 전 몇 초(장 시작 준비)가 들어 있어서, 그대로 보이면 '1분' 하루에 '1:03 남음'처럼 하루 길이보다 길게 보임 → 하루 길이까지만
  const daySecs = room?.turnSeconds ?? 0;
  const rawRemaining = deadline !== null ? Math.max(0, Math.ceil((deadline - (now + offset)) / 1000)) : null;
  const remaining = rawRemaining !== null && daySecs > 0 ? Math.min(rawRemaining, daySecs) : rawRemaining;
  // (v7) 장 전 시간: 어제 정리·찌라시·예약 주문. 지금 가격 거래와 장 마감은 장이 열린 뒤에
  const preUntil = !solo ? (room?.preUntil ?? null) : null;
  const preLeft = preUntil !== null ? Math.max(0, Math.ceil((preUntil - (now + offset)) / 1000)) : 0;
  const inPre = preUntil !== null && preLeft > 0 && closing === null;
  const preReadyMe = !!meRow?.preReady;
  // 카드를 지금 못 쓰는 이유 (버튼이 회색인 까닭을 그대로 알려 줌)
  const cardBlock =
    closing !== null ? '하루 결산 중이에요. 다음 날에 쓸 수 있어요'
    : endedToday ? '장 마감을 눌렀어요. 마감을 취소하면 다시 쓸 수 있어요'
    : remaining === 0 ? '시간이 다 됐어요. 곧 다음 날로 넘어가요'
    : room?.status !== 'playing' ? '지금은 게임 중이 아니에요'
    : null;
  const cardCanAct = canAct && remaining !== 0;

  const tradeState = {
    // v4: 레버리지·인버스 ETF 비중 제한 — 서버 규칙(leveragedCap)과 같은 계산을 화면에서 미리
    capFor: (sym: string) => {
      if ((room?.rulesVersion ?? 1) < 4 || !isLeveraged(sym)) return null;
      const priceOf = (s: string) => quote(m, s, displayDay, displayClosed).krw;
      let held = 0;
      for (const [s, h] of Object.entries(portfolio.holdings)) if (isLeveraged(s)) held += h.qty * priceOf(s);
      return Math.max(0, Math.floor((LEVERAGE_CAP * equity - held) / (priceOf(sym) * 1.0015)));
    },
    allowed: canAct && !frozen && remaining !== 0,
    reason: frozen
      ? '상대의 거래 정지 카드! 오늘은 사고팔 수 없어요'
      : closing !== null
        ? '장이 마감됐어요'
        : endedToday
          ? '장 마감을 눌렀어요. 더 거래하려면 마감을 취소하세요'
          : remaining === 0
            ? '시간이 다 됐어요. 곧 장이 마감돼요'
            : null,
    fee: feeRate,
    busy,
    limitOnly: inPre,
  };

  const news = market?.news ?? [];
  const newsSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const n of news.filter((x) => x.day === day)) n.related.forEach((s) => set.add(s));
    return set;
  }, [news, day]);
  const change = useCallback((sym: string) => (market ? quote(market, sym, displayDay, displayClosed).ch : 0), [market, displayDay, displayClosed]);

  // ---------- 알림 ----------
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!view) return;
    if (seen.current === null) {
      seen.current = new Set(view.notices.map((n) => n.key));
      return;
    }
    for (const n of view.notices) {
      if (seen.current.has(n.key)) continue;
      seen.current.add(n.key);
      showToast(n.text, n.kind === 'ok' ? 'ok' : 'warn');
      play(n.text.includes('방패') ? 'blocked' : 'attack');
    }
  }, [view, showToast]);

  // 새로 들어온 기사: 1분 동안 뉴스 창에서 강조 (처음 화면을 열 때 있던 건 제외)
  const knownNews = useRef<Set<string> | null>(null);
  const [freshNews, setFreshNews] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!market) return;
    const keys = market.news.map((n) => n.day + ':' + n.headline);
    if (knownNews.current === null) {
      knownNews.current = new Set(keys);
      return;
    }
    const added = keys.filter((k) => !knownNews.current!.has(k));
    if (!added.length) return;
    added.forEach((k) => knownNews.current!.add(k));
    setFreshNews((m) => {
      const next = new Map(m);
      added.forEach((k) => next.set(k, Date.now()));
      return next;
    });
  }, [market]);
  const freshSet = useMemo(() => new Set([...freshNews].filter(([, t]) => now - t < 60_000).map(([k]) => k)), [freshNews, now]);

  // 장중 속보 알림 — 처음 화면을 열 때 이미 떠 있던 건 알리지 않음
  const seenBreaking = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!market) return;
    const breaking = market.news.filter((n) => n.at != null);
    const key = (n: { day: number; headline: string }) => n.day + ':' + n.headline;
    if (seenBreaking.current === null) {
      seenBreaking.current = new Set(breaking.map(key));
      return;
    }
    for (const n of breaking) {
      if (seenBreaking.current.has(key(n))) continue;
      seenBreaking.current.add(key(n));
      const sym = n.symbol ?? n.related?.[0];
      showNews({ text: n.headline.replace('[루머] ', '').replace(/^\[속보\]\s*/, ''), tone: n.tone, symbol: sym ?? undefined, sub: sym && STOCK_MAP[sym] ? `${STOCK_MAP[sym].name} · 눌러서 차트 보기` : undefined });
      play('news');
    }
  }, [market, showNews]);

  // 예약 주문 체결 알림
  const seenOrders = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!view) return;
    const cur = new Map(view.myOrders.map((o) => [o.id!, o.status]));
    if (seenOrders.current) {
      for (const o of view.myOrders) {
        const before = seenOrders.current.get(o.id!);
        if (before === 'open' && o.status === 'filled') showToast(`예약 체결! ${STOCK_MAP[o.symbol].name} ${num(o.qty)}주 ${o.side === 'buy' ? '샀어요' : '팔았어요'}`);
      }
    }
    seenOrders.current = cur;
  }, [view, showToast]);

  // ---------- 행동 ----------
  // (v6) 용돈 봉투 결과: 서버가 정한 금액이 내 카드 기록에 들어오면 알림 (처음 불러올 때 있던 건 알리지 않음)
  const bonusSeen = useRef<number | null>(null);
  useEffect(() => {
    const rows = (view?.myItemRows ?? []).filter((r) => r.action === 'use' && r.kind === 'bonus');
    if (bonusSeen.current === null) {
      if (view) bonusSeen.current = rows.length;
      return;
    }
    if (rows.length > bonusSeen.current) {
      const a = rows[rows.length - 1].payload?.amount;
      bonusSeen.current = rows.length;
      if (typeof a === 'number') {
        play(a >= 0 ? 'win' : 'error');
        showToast(a >= 0 ? `용돈 봉투! 현금 +${wonShort(a)}` : `앗, 봉투에서 ${wonShort(-a)}이 빠져나갔어요`, a >= 0 ? 'ok' : 'warn');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.myItemRows]);
  const run = async (action: string, payload: Record<string, unknown>, ok: () => void) => {
    try {
      await act(action, payload);
      ok();
    } catch (e) {
      play('error');
      showToast(e instanceof Error ? e.message : '실패했어요', 'err');
    }
  };

  const trade = (symbol: string, side: 'buy' | 'sell', qty: number) =>
    run('trade', { symbol, side, qty }, () => {
      play(side);
      setSheet(null);
      showToast(`${STOCK_MAP[symbol].name} ${qty.toLocaleString()}주 ${ui === 'easy' ? (side === 'buy' ? '샀어요' : '팔았어요') : side === 'buy' ? '매수 체결' : '매도 체결'}`);
    });
  const placeOrder = (symbol: string, side: 'buy' | 'sell', qty: number, limit: number) =>
    run('placeOrder', { symbol, side, qty, limit }, () => {
      play('tap');
      setSheet(null);
      showToast(`예약 완료 · 장중에 가격이 닿으면 체결돼요`);
    });
  const cancelOrder = (orderId: string) => run('cancelOrder', { orderId }, () => showToast('예약 주문을 취소했어요'));

  const buyItem = (kind: ItemKind) =>
    run('buyItem', { kind }, () => {
      play('item');
      showToast(`${ITEM_MAP[kind].name} 카드를 샀어요`);
    });
  const useCard = (kind: ItemKind, given?: ItemRow['payload']) => {
    let payload: NonNullable<ItemRow['payload']> = { ...(given ?? {}) };
    const needsTarget = rivals && (ITEM_MAP[kind].type === 'attack' || kind === 'spy');
    if (needsTarget && !payload.target) {
      const others = players.filter((p) => p.id !== me && p.status !== 'left');
      if (others.length === 0) return showToast('카드를 쓸 상대가 없어요. 모두 나갔어요.', 'warn');
      if (others.length === 1) payload = { ...payload, target: others[0].id };
      else return setTargetPick(kind);
    }
    // 차트 분석은 지금 보고 있는 종목
    if (kind === 'scout' && !payload.symbol) payload = { ...payload, symbol: selected };
    if (kind === 'fake' && !payload.symbol) {
      setFakeTarget(payload.target ?? null);
      return setFakeModal(true);
    }
    run('useItem', { kind, payload }, () => {
      play('item');
      const d = ITEM_MAP[kind];
      showToast(
        kind === 'bonus'
          ? (view?.room.rulesVersion ?? 1) >= 6
            ? '용돈 봉투를 열었어요…'
            : `용돈 봉투! 현금 ${wonShort(BONUS_AMOUNT)}이 들어왔어요`
          : d.type === 'info'
            ? `${d.name} 결과가 뉴스에 나왔어요`
            : `${d.name} 발동! 내일 상대에게 적용돼요`,
      );
      if (d.type === 'info') {
        setTab('news');
        setDrawer(null);
        // 결과 상자가 찌라시 아래에 숨지 않게 그 자리로 내려 보여 줌 (화면이 다시 그려진 뒤)
        const cls = ({ paper: 'paper', analyst: 'analyst', scout: 'scout', spy: 'spy' } as Record<string, string>)[kind];
        if (cls)
          window.setTimeout(() => {
            const el = document.querySelector(`.reveal.${cls}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            el?.classList.add('flash');
            window.setTimeout(() => el?.classList.remove('flash'), 1600);
          }, 250);
      }
    });
  };
  const endTurn = () => {
    if (!canAct) return;
    // 튜토리얼: 안내가 '장 마감' 단계에 오기 전에는 하루를 넘기지 않음 (설명 순서가 꼬이지 않게)
    if (session.tutorial && tutStep < TUTORIAL_STEPS.findIndex((x) => x.title === '장 마감')) {
      showToast('안내를 따라오면 곧 장 마감을 눌러 볼 거예요', 'warn');
      return;
    }
    play('tap');
    run('endTurn', {}, () => {});
    // 매칭(랭킹전·일반전)에서 아직 거래가 0회면 마감할 때마다 알림 — 끝까지 0회면 순위 맨 뒤 (서버 finalResults)
    if (view?.room.kind === 'match' && view.myTrades.length === 0)
      showToast('아직 거래가 0회예요. 매칭에서는 끝까지 한 번도 거래하지 않으면 꼴찌가 돼요', 'warn');
  };
  // 장 마감 취소: 다음 날로 넘어가기 전(시간이 남아 있을 때)이면 언제든
  const preReady = () => {
    if (!inPre || preReadyMe) return;
    play('tap');
    act('preReady', {})
      .then(() => showToast('준비 완료! 모두 누르면 장이 바로 열려요'))
      // 시간이 막 끝난 순간이면(장이 이미 열림) 조용히 넘어감
      .catch((e) => !/장 전 시간이 아니에요/.test(e instanceof Error ? e.message : '') && showToast(e instanceof Error ? e.message : '실패했어요', 'err'));
  };
  // 처음 맞는 장 전 시간이면 한 번만 무엇을 하는 시간인지 알려 줌 (이 기기에서 한 번)
  useEffect(() => {
    if (!inPre) return;
    try {
      if (localStorage.getItem('stockduel.preSeen') === '1') return;
      localStorage.setItem('stockduel.preSeen', '1');
    } catch {
      return;
    }
    showToast("장 전 시간이에요. 찌라시(소문)를 보고 예약 주문을 걸어 두세요. 다 했으면 '준비 완료'!", 'warn');
  }, [inPre, showToast]);
  const canCancelEnd = !solo && endedToday && room?.status === 'playing' && closing === null && viewDay === serverDay && remaining !== 0 && !showResult;
  const cancelEnd = () => {
    if (!canCancelEnd) return;
    play('tap');
    run('cancelEnd', {}, () => showToast('장 마감을 취소했어요. 다시 거래할 수 있어요'));
  };
  const nextDay = () => {
    if (serverDay === null) return;
    setClosing(null);
    if (finished || serverDay >= total) {
      setShowResult(true);
      return;
    }
    setViewDay(serverDay);
    play('news');
    // 새 날: 휴대폰은 아침 뉴스(대결은 장 전 찌라시도)가 있는 뉴스 탭으로 — 연습도 같게 (튜토리얼은 단계가 탭을 정함)
    if (mobile && !session.tutorial && (solo || (room?.rulesVersion ?? 1) >= 7)) setTab('news');
    // 혼자 연습: 다음 날 장은 이 버튼을 눌러야 열림 (결산 보는 동안 시간이 흐르지 않게)
    if (solo) act('startDay', {}).catch(() => {});
  };

  const pushBubble = (r: Reaction & { mine?: boolean }) => {
    setBubbles((b) => [...b.slice(-3), r]);
    setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== r.id)), 3500);
  };
  const sendReaction = useReactions(solo ? null : session.roomId, me, (r) => {
    // 이 방 참가자가 보낸 것만 (방 ID 만 아는 외부인·다른 사람 사칭 무시)
    if (!view?.players.some((p) => p.id === r.from)) return;
    play('react');
    pushBubble(r);
  });

  const toggleWatch = (sym: string) =>
    setWatch((w) => {
      const next = w.includes(sym) ? w.filter((x) => x !== sym) : [...w, sym];
      saveWatch(next);
      return next;
    });
  const selectStock = (sym: string) => {
    setSelected(sym);
    if (tablet) setTab(tab === 'list' || tab === 'detail' ? tab : 'list');
    else if (mobile) setTab('detail');
    else document.querySelector('.p-detail')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const selectSector = (sec: string) => {
    const region = SECTOR_MAP[sec]?.region ?? 'all';
    setFilter({ region: region === 'ETF' ? 'ETF' : region, sub: sec });
    if (mobile) setTab('list');
  };
  const setUi = (m: UiMode) => {
    setUiState(m);
    saveUi(m);
    if (session.mode === 'multi') api('mode', { roomId: session.roomId, mode: m }).catch(() => {});
  };

  // ---------- PC 단축키 ----------
  useEffect(() => {
    if (mobile) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
      if (typing) return;
      // 화면 편집 중 Esc = '완료' (열린 창이 있으면 그 창만 닫힘)
      if (e.key === 'Escape' && editingRef.current && !session.demo && !document.querySelector('.modal-bg, .sheet-bg, .drawer-bg.open')) {
        setEditing(false);
        return;
      }
      if (e.key === 'Enter' && !editingRef.current && !(e.target as HTMLElement)?.closest('button, a, [role=button], [tabindex], .modal-bg, .sheet-bg')) {
        e.preventDefault();
        setSheet('buy');
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const rows = [...document.querySelectorAll<HTMLElement>('.stock-list .srow')];
        const i = rows.findIndex((r) => r.classList.contains('sel'));
        const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) {
          e.preventDefault();
          next.click();
          next.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile]);

  // ---------- 화면 ----------
  // 방이 사라졌거나 로그인이 바뀌었으면 — 다시 연결을 기다리지 않고 안내
  const seatGone = session.mode === 'multi' && !!error && /참가하지 않았어요|찾을 수 없어요|잘못된 방/.test(error);
  if (seatGone) {
    return (
      <div className="center-msg">
        <Icon name="door" size={28} />
        <p>이 기기에서는 더 이상 이 대결을 할 수 없어요</p>
        <p className="muted small">방이 사라졌거나 다른 계정으로 로그인했어요.</p>
        <button className="btn primary" onClick={onExit}>
          홈으로
        </button>
      </div>
    );
  }
  if (!view || !market || viewDay === null) {
    return (
      <div className="center-msg">
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="btn" onClick={onExit}>
              홈으로
            </button>
          </>
        ) : (
          <>
            <Loading label="게임 불러오는 중…" />
          </>
        )}
      </div>
    );
  }
  if (showResult) {
    if (!view.final)
      return (
        <div className="center-msg">
          <Loading label="결과 집계 중…" />
          <ResultWaitExit onExit={onExit} />
        </div>
      );
    return (
      <ResultScreen
        session={session}
        market={market}
        final={view.final}
        onExit={onExit}
        onReplay={solo && !session.tutorial && !session.demo && onReplay ? () => onReplay(view.room.totalDays, view.room.turnSeconds, view.players.filter((p) => p.bot).map((p) => p.bot!)) : undefined}
        nextCode={view.room.nextCode ?? null}
        matchKind={view.room.kind}
        dayInfo={{ days: view.room.totalDays, daySec: view.room.turnSeconds }}
        party={view.room.kind === 'match' ? partyAfter : null}
        onBackToParty={() => {
          try {
            localStorage.setItem('stockduel.tab', 'casual');
          } catch {
            /* 무시 */
          }
          onExit();
        }}
        ranked={!!view.room.ranked}
        onFindAgain={() => {
          try {
            // 같은 종류(랭킹전/일반전) 메뉴로 돌아가서 바로 다시 찾기
            const kind = view.room.ranked ? 'ranked' : 'casual';
            localStorage.setItem(FIND_AGAIN, kind);
            localStorage.setItem('stockduel.tab', kind);
          } catch {
            /* 무시 */
          }
          onExit();
        }}
        onRematch={
          session.mode === 'multi' && onWaiting && view.room.kind !== 'daily'
            ? async () => {
                // 봇전: 같은 봇·같은 설정으로 새 판 (바로 시작)
                const r =
                  view.room.kind === 'bot'
                    ? await api<{ roomId: string; playerId: string; code: string }>('botMatch', { levels: view.players.filter((p) => p.bot).map((p) => p.bot), totalDays: view.room.totalDays, turnSeconds: view.room.turnSeconds, nickname: session.nickname, mode: session.ui })
                    : await api<{ roomId: string; playerId: string; code: string }>('rematch', { roomId: session.roomId });
                onWaiting(r.roomId, r.playerId, session.nickname, r.code);
              }
            : undefined
        }
      />
    );
  }

  const m: Market = market;
  const macro = m.macro[displayDay] ?? m.macro0;
  const prevMacro = displayDay > 0 ? m.macro[displayDay - 1] : m.macro0;
  const idx = m.index[displayDay];
  const idxNow = barNow(m, idx, displayDay, displayClosed);
  const idxPrev = displayDay === 0 ? KR_INDEX_BASE : m.index[displayDay - 1].close;
  const us = m.usIndex[displayDay];
  const usNow = barNow(m, us, displayDay, displayClosed);
  const usPrev = displayDay === 0 ? US_INDEX_BASE : m.usIndex[displayDay - 1].close;
  const oppRet = opponent ? opponent.equity / START_CASH - 1 : 0;
  const share = opponent ? equity / (equity + opponent.equity) : 0.5;
  const oppEnded = opponent ? opponent.endedDay >= day : false;
  const easy = ui === 'easy';
  const usedToday = new Set(myItemRows.filter((r) => r.action === 'use' && r.day === day).map((r) => r.kind));
  const effectsOnMe = effects.map((k) => (k === 'freeze' ? '누군가의 거래 정지 카드 때문에 오늘은 거래할 수 없어요' : k === 'fee' ? '수수료 폭탄! 오늘은 수수료가 1%예요' : k === 'blackout' ? '정보 차단 카드 때문에 오늘 아침 뉴스를 볼 수 없어요' : '')).filter(Boolean);
  const mmss2 = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const timerText = inPre ? `장 전 ${mmss2(preLeft)}` : remaining !== null && closing === null ? mmss2(remaining) : null;
  const endLabel = inPre ? (preReadyMe ? '준비 완료함' : '준비 완료') : endedToday ? '마감 취소' : day + 1 >= total ? '마지막 장 마감' : '장 마감';
  // 서버와 같은 기준: 접속 중(자리 비움·기권 제외)인 사람만 셈
  const preReadyCount = players.filter((p) => p.status === 'on' && p.preReady).length;
  const preStaying = players.filter((p) => p.status === 'on').length;

  const macroChip = (label: string, k: 'rate' | 'usRate' | 'fx' | 'oil', fmt: (v: number) => string, term = label) => {
    const d = macro[k] - prevMacro[k];
    return (
      <span className="mchip" key={k}>
        <Term k={term}>{label}</Term>
        <b>{fmt(macro[k])}</b>
        {Math.abs(d) > 1e-9 && <i className={tone(d)}>{d > 0 ? '▲' : '▼'}</i>}
      </span>
    );
  };
  const macroChips = (
    <>
      <span className="mchip idx">
        <Term k="지수">국내</Term>
        <b>{idxNow.toFixed(2)}</b>
        <i className={tone(idxNow / idxPrev - 1)}>{pct(idxNow / idxPrev - 1)}</i>
      </span>
      <span className="mchip idx">
        미국500
        <b>{usNow.toFixed(2)}</b>
        <i className={tone(usNow / usPrev - 1)}>{pct(usNow / usPrev - 1)}</i>
      </span>
      {macroChip('금리', 'rate', (v) => v.toFixed(2) + '%')}
      {macroChip('미 금리', 'usRate', (v) => v.toFixed(2) + '%', '금리')}
      {macroChip('환율', 'fx', (v) => v.toLocaleString() + '원')}
      {macroChip('유가', 'oil', (v) => '$' + v.toFixed(1))}
    </>
  );

  // 공통 조각
  const browser = (
    <div ref={searchRef} className="browser-wrap">
      <StockBrowser
        editing={editing}
        market={m}
        day={displayDay}
        closed={displayClosed}
        portfolio={portfolio}
        watch={watch}
        onToggleWatch={toggleWatch}
        selected={selected}
        onSelect={selectStock}
        newsSymbols={newsSymbols}
        filter={filter}
        onFilter={setFilter}
      />
    </div>
  );
  const detail = (
    <StockDetail
      ui={ui}
      market={m}
      symbol={selected}
      day={displayDay}
      closed={displayClosed}
      cash={portfolio.cash}
      holding={portfolio.holdings[selected]}
      news={news}
      watched={watch.includes(selected)}
      onToggleWatch={() => toggleWatch(selected)}
      onSelect={selectStock}
      onSelectSector={selectSector}
      trade={tradeState}
      onTrade={trade}
      orders={myOrders}
      reservedCash={reservedCash}
      onOrder={placeOrder}
      onCancel={cancelOrder}
      inlineTrade={false}
    />
  );
  const newsPanel = (
    <NewsPanel
      rumors={view.rumors}
      pre={inPre}
      fresh={freshSet}
      ui={ui}
      day={day}
      news={news}
      tomorrow={view.reveals.tomorrow}
      rumorCheck={view.reveals.rumorCheck}
      bestSector={view.reveals.bestSector}
      spy={view.reveals.spy}
      scout={view.reveals.scout}
      blackout={view.reveals.blackout}
      prices={prices}
      change={change}
      onSelect={selectStock}
      onSelectSector={selectSector}
      totalDays={total}
    />
  );
  const assets = (
    <>
      <AssetsPanel ui={ui} portfolio={portfolio} prices={prices} equity={equity} start={START_CASH} onSelect={selectStock} />
      <OrdersAndDividends orders={myOrders} day={day} portfolio={portfolio} canAct={canAct} onCancel={cancelOrder} onSelect={selectStock} />
    </>
  );
  const cards = (
    <CardsPanel
      version={view.room.rulesVersion ?? 1}
      solo={!rivals}
      players={players.length}
      day={day}
      totalDays={total}
      mine={view.myItems}
      cash={portfolio.cash}
      usedToday={usedToday}
      canAct={cardCanAct}
      blockReason={cardBlock}
      onBuy={buyItem}
      onUse={(k) => useCard(k)}
      effectsOnMe={effectsOnMe}
      busy={busy}
    />
  );
  // ---------- 튜토리얼 ----------
  const tutCtx = {
    mobile,
    selected,
    symbol: tutorialInfo?.symbol ?? '',
    symbolName: tutorialInfo ? STOCK_MAP[tutorialInfo.symbol]?.name ?? '' : '',
    headline: tutorialInfo?.headline ?? '',
    myTrades: view?.myTrades.length ?? 0,
    detectorUsed: (view?.myItems.used.detector ?? 0) > 0,
    serverDay: serverDay ?? 0,
    closing: closing !== null,
    viewDay: viewDay ?? 0,
    botNotice: view?.notices.find((n) => n.text.includes('방패가'))?.text ?? '',
  };
  const overlays = (
    <>
      {/* 연결이 끊기면 바로 알림 (가격이 멈춘 걸 모르고 기다리지 않게) */}
      {session.mode === 'multi' && (!online || error) && (
        <div className="net-banner" role="alert">
          <Icon name="warn" size={14} /> {online ? '연결이 불안정해요. 다시 연결하는 중…' : '인터넷이 끊겼어요. 연결되면 자동으로 이어져요'}
        </div>
      )}
      {newsBig && !mobile && (
        <Sheet title={<><Icon name="news" size={18} /> 오늘의 소식</>} onClose={() => setNewsBig(false)} wide>
          {/* 관련 종목·업종을 누르면 그 차트로 가면서 창을 닫음 */}
          <div className="news-big" onClickCapture={(e) => (e.target as Element).closest(".rel-chip, .rb-sec, .linkish-soft") && setTimeout(() => setNewsBig(false), 0)}>{newsPanel}</div>
        </Sheet>
      )}
      {exitAsk && (
        <Sheet title="대결에서 나갈까요?" onClose={() => setExitAsk(false)}>
          <div className="exit-ask">
            <p className="muted small">대결 중에 나가면 <b>기권</b>이에요. 실수로 창이 닫히거나 인터넷이 끊긴 경우에는 다시 들어오면 '재입장'을 물어봐요.</p>
            <button className="btn full primary" onClick={() => setExitAsk(false)}>
              <Icon name="play" size={16} /> 계속하기
            </button>
            <button
              className="btn full danger"
              onClick={() => {
                // 이 창이 이미 확인 단계 — 한 번 더 묻지 않음 (결과는 버튼 아래 글로 안내)
                setExitAsk(false);
                api('leave', { roomId: session.roomId })
                  .then(() => {
                    setFlash('기권했어요. 이번 대결은 끝났어요');
                    onExit();
                  })
                  // 기권 요청이 실패하면 나가지 않고 알려 줌 (기권한 줄 알았는데 대결이 남아 막히지 않게)
                  .catch((e) => showToast(e instanceof Error ? `기권하지 못했어요: ${e.message}` : '기권하지 못했어요. 다시 눌러 주세요', 'err'));
              }}
            >
              <Icon name="door" size={16} /> 기권하고 나가기
              <small>
                {players.filter((p) => p.status !== 'left' && !p.bot).length <= 1 && players.some((p) => p.bot)
                  ? '봇만 남으니 이 판은 바로 끝나요. 다시 들어올 수 없어요'
                  : players.filter((p) => p.status !== 'left').length <= 2
                    ? `상대가 바로 이기고, 다시 들어올 수 없어요${room?.ranked ? '. 랭킹전이라 꼴찌로 계산돼요' : ''}`
                    : `나는 꼴찌로 계산되고, 남은 사람들끼리 계속해요. 다시 들어올 수 없어요`}
              </small>
            </button>
          </div>
        </Sheet>
      )}
      {/* 장중 속보 자리 (편집기에서 따로 옮김) */}
      <ToastSpot
        slot="news"
        toast={newsToast}
        editing={editing}
        pos={layout.toastPos}
        xy={mobile ? layout.mToastXY : layout.toastXY}
        onMove={(xy) => setLayout(mobile ? { mToastXY: xy } : { toastXY: xy })}
        onPick={(sym) => {
          setNewsToast(null);
          selectStock(sym);
        }}
      />
      {/* 보통 알림 자리 (샀어요·오류 등) — 처음엔 아래쪽 */}
      <ToastSpot slot="alert" toast={toast} editing={editing} pos="bottom" xy={mobile ? layout.mAlertXY : layout.alertXY} onMove={(xy) => setLayout(mobile ? { mAlertXY: xy } : { alertXY: xy })} />
      {(
        <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={`${STOCK_MAP[selected].name} ${sheet === 'sell' ? (easy ? '팔기' : '매도') : easy ? '사기' : '매수'}`}>
          {sheet && (
            <TradePanel
              key={selected + sheet}
              ui={ui}
              symbol={selected}
              price={quote(m, selected, displayDay, displayClosed).krw}
              usd={quote(m, selected, displayDay, displayClosed).usd}
              fx={fxNow}
              cash={portfolio.cash}
              held={portfolio.holdings[selected]?.qty ?? 0}
              avgCost={portfolio.holdings[selected]?.avgCost ?? 0}
              trade={tradeState}
              onTrade={trade}
              orders={myOrders.filter((o) => o.symbol === selected && o.day === day)}
              reservedCash={reservedCash}
              onOrder={placeOrder}
              onCancel={cancelOrder}
              initialSide={sheet}
              startCash={START_CASH}
            />
          )}
        </BottomSheet>
      )}
      {intro && room && (
        <MatchIntro
          title={room.ranked ? '랭킹전' : room.kind === 'match' ? '일반전' : room.kind === 'bot' ? '봇전' : '대결 시작'}
          sub={`${room.totalDays}일 · 하루 ${room.turnSeconds % 60 === 0 ? room.turnSeconds / 60 + '분' : room.turnSeconds + '초'} · 장이 열렸어요`}
          players={players.filter((p) => p.status !== 'left')}
          meId={me}
          onClose={() => setIntro(false)}
        />
      )}
      {closing !== null && (
        <DayCloseOverlay
          market={m}
          day={closing}
          myEquity={equity}
          myDelta={equity - (closing === 0 ? START_CASH : equityWith(computePortfolio(view.myTrades, spends, closing - 1, paidDivs, START_CASH), pricesAt(m, closing - 1, true)))}
          dividendToday={portfolio.dividendLog.filter((d) => d.day === closing).reduce((a, d) => a + d.amount, 0)}
          filledToday={myOrders.filter((o) => o.day === closing && o.status === 'filled').length}
          last={closing + 1 >= total}
          onNext={nextDay}
          // 장 전 시간이 진행 중이면 3초만 (찌라시·예약 주문 볼 시간을 덜 잡아먹게), 아니면 6초
          // 자동으로 넘어가는 시간은 판 설정에 비례 (사용자 요청 2026-11-17): 장 전 시간이 있으면 그 20%, 없으면 하루 시간의 8% (3~8초).
          // 마지막 날은 1분 뒤 결과 화면으로 (예전엔 버튼을 눌러야 해서 결산 팝업에 멈춰 있었음)
          autoSec={session.mode === 'multi' ? (closing + 1 >= total ? 60 : closeAutoSec(room?.turnSeconds ?? 60, room?.rulesVersion ?? 1)) : undefined}
          pre={session.mode === 'multi' && closing + 1 < total && !!room?.preUntil && room.preUntil > now + offset}
        />
      )}
      {targetPick && (
        <TargetPicker
          kind={targetPick}
          rows={rankRows(players, me, equity, day, START_CASH)}
          onCancel={() => setTargetPick(null)}
          onPick={(id) => {
            const k = targetPick;
            setTargetPick(null);
            useCard(k, { target: id });
          }}
        />
      )}
      {fakeModal && (
        <FakeNewsModal
          onCancel={() => setFakeModal(false)}
          onSubmit={(symbol, t) => {
            setFakeModal(false);
            useCard('fake', { symbol, tone: t, target: fakeTarget ?? undefined });
          }}
        />
      )}
      {tutorial && (
        <Tutorial
          onDone={() => {
            markTutorialSeen();
            setTutorial(false);
          }}
        />
      )}
      {!solo && (
        <>
          <ReactionButton
            onSend={(r) => {
              sendReaction(r);
              pushBubble({ ...r, id: Date.now(), from: me, mine: true });
            }}
          />
          <ReactionBubbles items={bubbles.map((b) => ({ ...b, nickname: players.find((p) => p.id === b.from)?.nickname ?? '' }))} />
        </>
      )}
    {session.tutorial && tutStep < TUTORIAL_STEPS.length && (
        <TutorialGuide step={tutStep} ctx={tutCtx} onNext={() => setTutStep((x) => x + 1)} onExit={onExit} onOpenCards={() => setCardGuide(true)} />
      )}
      {cardGuide && <CardGuide onClose={() => setCardGuide(false)} />}
      {feedbackOpen && (
        <FeedbackSheet
          onClose={() => setFeedbackOpen(false)}
          context={`${session.mode === 'multi' ? `대결 ${view?.players.length ?? 0}명` : session.tutorial ? '튜토리얼' : '연습'} · ${(view?.room.day ?? 0) + 1}일차 · ${mobile ? '모바일' : 'PC'} 화면`}
        />
      )}
    </>
  );
  // 나가면 게임이 끝나는 경우(진행 중인 대결 = 기권, 연습 = 그만두기)는 '나가기', 아니면 '홈으로'
  const exitLabel =
    (session.mode === 'multi' && room?.status === 'playing') || (session.mode === 'solo' && !session.demo && !session.tutorial && room?.status !== 'finished') ? '나가기' : '홈으로';
  const settings = (
    <>
      <div className="mode-toggle" role="group" aria-label="화면 모드">
        <button className={!prefs.enabled && easy ? 'on' : ''} onClick={() => (setPrefs({ enabled: false }), setUi('easy'))}>
          초보
        </button>
        <button className={!prefs.enabled && !easy ? 'on' : ''} onClick={() => (setPrefs({ enabled: false }), setUi('pro'))}>
          일반
        </button>
        <button className={prefs.enabled ? 'on' : ''} onClick={() => setPrefs({ enabled: true })} title="내가 설정한 화면 (오른쪽 조절 버튼으로 편집)">
          커스텀
        </button>
      </div>
      <button className="icon-btn" onClick={() => (setMenu(false), setTutorial(true))} aria-label="도움말" title="도움말">
        <Icon name="help" size={18} />
        <span className="ib-label">도움말</span>
      </button>
      <button className={'icon-btn' + (isCustom(prefs) ? ' on' : '')} onClick={startEdit} aria-label="화면 편집" title="화면 편집 (커스텀 모드)">
        <Icon name="sliders" size={18} />
        <span className="ib-label">화면 편집</span>
      </button>
      <button
        className="icon-btn"
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
        aria-label={muted ? '소리 켜기' : '소리 끄기'}
        aria-pressed={!muted}
        title={muted ? '소리 켜기' : '소리 끄기'}
      >
        <Icon name={muted ? 'mute' : 'sound'} size={18} />
        <span className="ib-label">{muted ? '소리 켜기' : '소리 끄기'}</span>
      </button>
      {!session.demo && (
        <button className="icon-btn" onClick={() => (setMenu(false), setFeedbackOpen(true))} aria-label="의견·버그 보내기" title="의견·버그 보내기">
          <Icon name="news" size={18} />
          <span className="ib-label">의견 보내기</span>
        </button>
      )}
      <button className="icon-btn" onClick={() => {
          setMenu(false);
          if (session.mode === 'multi' && room?.status === 'playing') setExitAsk(true);
          else if (session.mode === 'solo' && !session.demo && !session.tutorial && room?.status !== 'finished') {
            // 연습은 나가면 그 게임은 끝 (창이 닫히거나 끊긴 경우에만 로비에서 '이어하기'를 물어봄)
            void ask('연습을 그만둘까요? 지금 하던 연습 게임은 사라져요.', { ok: '그만두기', danger: true }).then((yes) => {
              if (!yes) return;
              soloQuit.current = true;
              saveSolo(null);
              setFlash('연습을 그만뒀어요');
              onExit();
            });
          } else onExit();
        }} aria-label={exitLabel} title={exitLabel}>
        <Icon name="exit" size={18} />
        <span className="ib-label">{exitLabel}</span>
      </button>
    </>
  );

  const prevCloseEquity =
    displayDay === 0 ? START_CASH : equityWith(computePortfolio(view.myTrades, spends, displayDay - 1, paidDivs, START_CASH), pricesAt(m, displayDay - 1, true));
  const todayPnl = equity - prevCloseEquity;
  const rows = rankRows(players, me, equity, day, START_CASH);
  // 순위는 서버가 정한 값 (재산이 같으면 같은 순위)
  const myRank = rows.find((r) => r.me)?.rank ?? rows.findIndex((r) => r.me) + 1;
  const tiedFirst = myRank === 1 && rows.filter((r) => (r.rank ?? 0) === 1).length > 1;
  const openOrderCount = myOrders.filter((o) => o.status === 'open' && o.day === day).length;


  const editBar = editing ? (
    <div className="edit-bar" role="region" aria-label="화면 편집">
      <div className="eb-text">
        <b>
          <Icon name="sliders" size={16} /> 화면 편집 중
        </b>
        {!mobile && <small>손잡이를 잡고 끌면 바뀔 배치가 바로 보여요. 막대로 크기를 바꾸고, 견본 알림은 끌어서 놓아요.</small>}
      </div>
      <div className="eb-actions">
        {mobile && (
          <label className="eb-start">
            처음 탭
            <select value={layout.mStart} onChange={(e) => setLayout({ mStart: e.target.value as MTab })}>
              {layout.mTabs.map((t) => (
                <option key={t} value={t}>
                  {TAB_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn sm ghost" onClick={() => setPrefsOpen(true)}>
          <Icon name="settings" size={14} /> 옵션
        </button>
        <button className="btn sm ghost" onClick={resetLayout} title="배치 처음으로" aria-label="배치 처음으로">
          {mobile ? <Icon name="refresh" size={14} /> : '배치 처음으로'}
        </button>
        <button className="btn sm primary" onClick={() => (session.demo ? onExit() : setEditing(false))}>
          <Icon name="check" size={14} /> 완료
        </button>
      </div>
    </div>
  ) : null;

  /* ================= 모바일 ================= */
  if (mobile) {
    const q = quote(m, selected, displayDay, displayClosed);
    const held = portfolio.holdings[selected]?.qty ?? 0;

    // 위쪽 줄들 (화면 편집으로 순서·보이기를 바꿈)
    const headerRows: Record<MHeaderRow, React.ReactNode> = {
      ticker: (
        <>
          <div className="m-row">
            <MarketTicker market={m} day={displayDay} closed={displayClosed} pins={pins} onOpen={() => setMarketSheet(true)} />
          </div>
        </>
      ),
      schedule: (
        <>
          <ScheduleStrip market={m} day={day} onOpen={() => setSchedSheet(true)} />
        </>
      ),
      assets: (
        <>
          <button className="m-asum" onClick={() => setTab('assets')} aria-label="내 재산 보기">
            <span>
              <small>현금</small>
              <b>{wonShort(portfolio.cash)}</b>
            </span>
            <span>
              <small>주식</small>
              <b>{wonShort(equity - portfolio.cash)}</b>
            </span>
            <span>
              <small>오늘</small>
              <b className={tone(todayPnl)}>
                {todayPnl >= 0 ? '+' : ''}
                {wonShort(todayPnl)}
              </b>
            </span>
            {portfolio.dividendIncome > 0 && (
              <span>
                <small>배당</small>
                <b className="up">+{wonShort(portfolio.dividendIncome)}</b>
              </span>
            )}
            {openOrderCount > 0 && (
              <span>
                <small>예약</small>
                <b>{openOrderCount}건</b>
              </span>
            )}
            <i>›</i>
          </button>
        </>
      ),
    };
    return (
      <div className={'m-game ui-' + ui + (editing ? ' editing' : '')} style={{ ['--m-top-h' as string]: mTopH + 'px', ['--m-stick-h' as string]: mTopH + mFlowH + 'px' }}>
        {editBar}
        {/* 차트 탭은 화면을 차트에 양보하려고 위쪽 시장·일정·재산 줄을 접어 둠 (편집 중에는 펼쳐 둠) */}
        <header className="m-top" ref={mTopRef}>
          {/* ② 내 재산 · 비교 · 장 마감 (+ 아래 얇은 진행 막대) */}
          <div className="m-hero">
            <div className="mh-left">
              <b className="mh-eq">
                {wonShort(equity)} <em className={tone(myRet)}>{pct(myRet, 1)}</em>
              </b>
              {!rivals ? (
                <span className={'mh-cmp ' + tone(myRet - (idxNow / KR_INDEX_BASE - 1))}>
                  시장보다 {pct(myRet - (idxNow / KR_INDEX_BASE - 1), 1)}
                </span>
              ) : players.length > 2 ? (
                <button className="mh-cmp btnlike" onClick={() => setRankSheet(true)}>
                  <strong>
                    {myRank}위
                  </strong>
                  <span className="muted">/ {rows.length}명</span>
                  <span className={myRank === 1 ? 'up' : 'down'}>
                    · {tiedFirst ? '공동 선두' : myRank === 1 ? '선두!' : `1위 수익률 ${rows[0].band ? bandText(rows[0].band) : pct(rows[0].ret)}`}
                  </span>
                  <i>›</i>
                </button>
              ) : opponent ? (
                <button className="mh-cmp btnlike" onClick={() => setRankSheet(true)}>
                  <span className={tiedFirst ? 'muted' : myRank === 1 ? 'up' : 'down'}>
                    {tiedFirst ? `${josa(opponent.nickname, "과", "와")} 비기는 중` : myRank === 1 ? `${opponent.nickname}보다 앞서는 중` : `${opponent.nickname}보다 뒤지는 중`}
                  </span>
                  <span className={'mh-st' + (oppEnded ? ' ok' : '')}>{oppEnded ? <><Icon name="check" size={12} /> 마감</> : '고민 중'}</span>
                </button>
              ) : (
                <span className="mh-cmp muted">상대를 기다리는 중</span>
              )}
            </div>
            {/* 설정은 늘 위에 고정 (스크롤해도 같은 자리) */}
            <button className="m-gear" onClick={() => setMenu(true)} aria-label="설정" title="설정">
              <Icon name="settings" size={18} />
            </button>
            <button
              className={'m-end2' + (inPre ? ' pre' + (preReadyMe ? ' waiting' : '') : endedToday ? ' waiting' : '') + (!inPre && remaining !== null && remaining <= 10 && !endedToday ? ' hurry' : '')}
              disabled={inPre ? preReadyMe || busy : endedToday ? !canCancelEnd || busy : !canAct || busy}
              onClick={inPre ? preReady : endedToday ? cancelEnd : endTurn}
            >
              <b>{inPre ? endLabel : endedToday ? '마감 취소' : day + 1 >= total ? '마지막 마감' : '장 마감'}</b>
              <small>
                {inPre
                  ? `장 시작까지 ${mmss2(preLeft)}${preReadyMe ? ` · ${preReadyCount}/${preStaying}` : ''}`
                  : endedToday
                    ? `마감 ${rows.filter((r) => r.ended).length}/${rows.length}${timerText ? ' · ' + timerText : ''}`
                    : timerText
                      ? `${timerText} 남음`
                      : `${day + 1}일차`}
              </small>
            </button>
          </div>
          {rivals && room?.status === 'playing' && closing === null && <EndStatus rows={rows} countdown={!!room.countdown} turnSeconds={room.turnSeconds} leftSec={preLeft > 0 ? room.turnSeconds : remaining} compact />}
          <div className="m-progress-row" aria-label={`${total}일 중 ${day + 1}일차`}>
            <span className="mp-now">
              <b>{day + 1}일차</b>
              <small> / {total}일</small>
            </span>
            <div className="m-progress">
              <i style={{ width: `${((day + (displayClosed ? 1 : 0.5)) / total) * 100}%` }} />
            </div>
            <span className="mp-left">{total - day - 1 > 0 ? `${total - day - 1}일 남음` : '마지막 날'}</span>
          </div>
        </header>
        {/* 시장·일정·재산 줄: 위 막대 바로 아래에 고정 (접혔다 펴지는 움직임 없음). 가로로 눕힌 휴대폰은 높이가 낮아 내용과 함께 스크롤 */}
          <div ref={mFlowRef} className={'m-top-more m-top-flow' + (!editing && tab === 'detail' && !tablet ? ' hidden-row' : '')}>
          {layout.mHeader.map((row, i) => (
            <EditSlot
              key={row.id}
              editing={editing}
              label={HEADER_LABEL[row.id]}
              hidden={!row.on}
              onPrev={i > 0 ? () => setLayout({ mHeader: moved(layout.mHeader, i, -1) }) : undefined}
              onNext={i < layout.mHeader.length - 1 ? () => setLayout({ mHeader: moved(layout.mHeader, i, 1) }) : undefined}
              onToggle={() => setLayout({ mHeader: layout.mHeader.map((x) => (x.id === row.id ? { ...x, on: !x.on } : x)) })}
            >
              {headerRows[row.id]}
            </EditSlot>
          ))}
          {/* 시장 줄을 숨겨도 설정 버튼은 남김 */}
          </div>

        <main className={'m-page p-' + tab + (tablet && (tab === 'list' || tab === 'detail') ? ' split' : '')}>
          {tablet && (tab === 'list' || tab === 'detail') ? (
            <div className="tab-split">
              <section className="ts-list">{browser}</section>
              <section className="ts-detail">{detail}</section>
            </div>
          ) : (
            <>
              {tab === 'list' && browser}
              {tab === 'detail' && detail}
            </>
          )}
          {tab === 'news' && (
            <>
              {effectsOnMe.map((t, i) => (
                <div key={i} className="effect-banner">
                  {t}
                </div>
              ))}
              {newsPanel}
              <CardTray version={view.room.rulesVersion ?? 1} blockReason={cardBlock} mine={view.myItems} day={day} totalDays={total} usedToday={usedToday} canAct={cardCanAct} busy={busy} onUse={(k) => useCard(k)} onOpen={() => setTab('cards')} />
            </>
          )}
          {tab === 'assets' && (
            <>
              {assets}
            </>
          )}
          {tab === 'cards' && cards}
        </main>

        {(tab === 'detail' || (tablet && tab === 'list')) && (
          <div className="m-tradebar">
            <div className="mt-price">
              <b className={tone(q.ch)}>{q.usd !== null ? '$' + q.usd.toFixed(2) : num(q.krw) + '원'}</b>
              <small className={tone(q.ch)}>{pct(q.ch)}</small>
            </div>
            {!tradeState.allowed && tradeState.reason && <small className="mt-why">{tradeState.reason}</small>}
            <button className="btn sell" disabled={!tradeState.allowed || held === 0} title={held === 0 ? '아직 갖고 있는 주식이 없어요' : undefined} onClick={() => setSheet('sell')}>
              {easy ? '팔기' : '매도'}
            </button>
            <button className="btn buy" disabled={!tradeState.allowed} onClick={() => setSheet('buy')}>
              {easy ? '사기' : '매수'}
            </button>
          </div>
        )}

        <nav className="bottom-nav five">
          {layout.mTabs.map((t, i) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              <span>
                <Icon name={TAB_ICON[t]} size={22} />
              </span>
              {t === 'assets' ? (easy ? '내 재산' : '자산') : TAB_LABEL[t]}
              {t === 'news' && tab !== 'news' && unreadToday(news, day) > 0 && <i className="nav-count hot">{unreadToday(news, day)}</i>}
              {t === 'cards' && view.myItems.total > 0 && <i className="nav-count">{view.myItems.total}</i>}
              {t === 'assets' && myOrders.some((o) => o.status === 'open' && o.day === day) && <i className="nav-dot gold" />}
              {editing && (
                <span className="nav-move" onClick={(e) => e.stopPropagation()}>
                  <i role="button" aria-label={`${TAB_LABEL[t]} 왼쪽으로`} className={i === 0 ? 'dis' : ''} onClick={() => i > 0 && setLayout({ mTabs: moved(layout.mTabs, i, -1) })}>
                    <Icon name="left" size={12} />
                  </i>
                  <i role="button" aria-label={`${TAB_LABEL[t]} 오른쪽으로`} className={i === layout.mTabs.length - 1 ? 'dis' : ''} onClick={() => i < layout.mTabs.length - 1 && setLayout({ mTabs: moved(layout.mTabs, i, 1) })}>
                    <Icon name="right" size={12} />
                  </i>
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* 사기·팔기 창은 PC·모바일 같은 것 (overlays) */}

        <BottomSheet open={marketSheet} onClose={() => setMarketSheet(false)} title="오늘의 시장">
          <MarketGridPinnable market={m} day={displayDay} closed={displayClosed} pins={pins} onTogglePin={togglePin} />
          <p className="muted small sheet-note">핀을 누르면 상단에 계속 고정돼요 (최대 3개). 고정하지 않은 칸은 지수 → 지수, 금리 → 금리처럼 같은 종류끼리 4초마다 바뀌어요.</p>
        </BottomSheet>

        <BottomSheet open={schedSheet} onClose={() => setSchedSheet(false)} title="다가오는 일정">
          <Calendar market={m} day={day} hideTitle onSelect={(sym) => (setSchedSheet(false), selectStock(sym))} />
        </BottomSheet>

        <BottomSheet open={rankSheet} onClose={() => setRankSheet(false)} title="실시간 순위">
          <RankList rows={rows} />
        </BottomSheet>

        <BottomSheet open={menu} onClose={() => setMenu(false)} title="설정">
          <div className="m-settings">
            <div className="row">{settings}</div>
          </div>
        </BottomSheet>

        {overlays}
        {prefsOpen && (
          <Sheet title="커스텀 모드 설정" onClose={() => setPrefsOpen(false)}>
            <PrefsPanel ui={ui} />
            {!prefs.enabled && (
              <button className="btn primary full" onClick={() => (setPrefs({ enabled: true }), setPrefsOpen(false))}>
                커스텀 모드로 쓰기
              </button>
            )}
          </Sheet>
        )}
      </div>
    );
  }

  /* ================= PC ================= */
  return (
    <div className={'game desk ui-' + ui + (editing ? ' editing' : '')}>
      {editBar}
      <header className="hud">
        <div className="hud-left">
          <div className="brand-sm"><img src="/brand/logo-dark.svg" alt="개미리그" height={22} /></div>
          <div className="daypill">
            <b>{day + 1}일차</b>
            <span>/ {total}</span>
          </div>
        </div>
        <div className="hud-macro">{macroChips}</div>
        <div className="hud-right">{settings}</div>
      </header>

      <section className="score desk-score">
        {rivals && players.length > 2 ? (
          <RankStrip rows={rows} />
        ) : (
        <div className="vs-box">
          <PlayerPic r={{ me: true, nickname: session.nickname, avatar: players.find((x) => x.id === session.playerId)?.avatar }} size={40} />
          <div className="score-me">
            <small>{session.nickname} (나)</small>
            <b>{wonShort(equity)}</b>
            <span className={tone(myRet)}>{pct(myRet)}</span>
          </div>
          {rivals ? (
            <>
              <div className="tug-wrap">
                <span className={'tug-lead ' + (opponent?.status === 'left' || tiedFirst ? 'muted' : myRank === 1 ? 'up' : 'down')}>
                  {opponent?.status === 'left' ? '상대가 나갔어요' : tiedFirst ? '비기는 중' : myRank === 1 ? '내가 앞서는 중' : '상대가 앞서는 중'}
                </span>
                <div className="tug" aria-hidden>
                  <div className="tug-me" style={{ width: `${share * 100}%` }} />
                  <div className="tug-mid" />
                </div>
                <span className="tug-ends" aria-hidden>
                  <i>{tiedFirst ? '공동 1위' : myRank === 1 ? '1위' : '2위'}</i>
                  <i>{tiedFirst ? '공동 1위' : myRank === 1 ? '2위' : '1위'}</i>
                </span>
              </div>
              <div className="score-opp">
                <small>
                  {opponent?.nickname ?? '상대'} {opponent && <em className={oppEnded ? 'ok' : ''}>{oppEnded ? <><Icon name="check" size={12} /> 마감</> : '고민 중…'}</em>}
                </small>
                {opponent?.band ? (
                  <>
                    <b className={tone(oppRet)} title="상대의 정확한 재산은 보이지 않아요">{bandText(opponent.band)}</b>
                    <span className="muted">수익률 구간</span>
                  </>
                ) : (
                  <>
                    <b>{opponent ? wonShort(opponent.equity) : '-'}</b>
                    <span className={tone(oppRet)}>{opponent ? pct(oppRet) : ''}</span>
                  </>
                )}
              </div>
              {opponent && <PlayerPic r={{ nickname: opponent.nickname, bot: opponent.bot, avatar: opponent.avatar }} size={40} />}
            </>
          ) : (
            <div className="score-solo muted">{room?.kind === 'daily' ? '오늘의 도전' : '연습 모드'}</div>
          )}
        </div>
        )}
        {rivals && room?.status === 'playing' && closing === null && <EndStatus rows={rows} countdown={!!room.countdown} turnSeconds={room.turnSeconds} leftSec={preLeft > 0 ? room.turnSeconds : remaining} />}
        <AssetSummary
          ui={ui}
          cash={portfolio.cash}
          stock={equity - portfolio.cash}
          todayPnl={todayPnl}
          todayBase={prevCloseEquity}
          dividends={portfolio.dividendIncome}
          openOrders={openOrderCount}
          onOpen={() => setDrawer('assets')}
        />
        <button
          className={'btn end-turn' + (inPre ? ' pre' + (preReadyMe ? ' waiting' : '') : endedToday ? ' waiting' : '') + (!inPre && remaining !== null && remaining <= 10 && !endedToday ? ' hurry' : '')}
          disabled={inPre ? preReadyMe || busy : endedToday ? !canCancelEnd || busy : !canAct || busy}
          onClick={inPre ? preReady : endedToday ? cancelEnd : endTurn}
          title={inPre ? '모두 준비 완료를 누르면 장이 바로 열려요' : endedToday ? '다음 날로 넘어가기 전까지 취소할 수 있어요' : '오늘 거래를 끝내고 마감해요'}
        >
          <span className="et-main">{endLabel}</span>
          <small className="et-sub">
            {inPre
              ? `장 시작까지 ${mmss2(preLeft)}${preReadyMe ? ` · ${preReadyCount}/${preStaying}명` : ''}`
              : endedToday
                ? `마감 ${rows.filter((r) => r.ended).length}/${rows.length}명${timerText ? ' · ' + timerText : ''}`
                : timerText
                  ? `${timerText} 남음`
                  : `${day + 1}일차`}
          </small>
        </button>
      </section>

      {/* 큰 틀(위 줄 + 세 칸)은 고정, 조각은 편집 중에 끌어서 원하는 자리에 */}
      <DockBoard
        zones={layout.pcZones}
        hidden={layout.pcHidden.filter((x) => x !== 'detail')}
        editing={editing}
        sizes={{ colW: layout.pcColW, flex: layout.pcFlex }}
        onChange={(pcZones, sz) => setLayout({ pcZones, pcColW: sz.colW, pcFlex: sz.flex })}
        onResize={(sz) => setLayout({ pcColW: sz.colW, pcFlex: sz.flex })}
        onToggle={(id) => id !== 'detail' && setLayout({ pcHidden: layout.pcHidden.includes(id) ? layout.pcHidden.filter((x) => x !== id) : [...layout.pcHidden, id] })}
        render={(id) =>
          id === 'timeline' ? (
            <Timeline market={m} day={day} onSelect={selectStock} />
          ) : id === 'list' ? (
            <section className="pane p-list">{browser}</section>
          ) : id === 'detail' ? (
            <section className="pane p-detail">
              {detail}
              <TradeJump
                easy={easy}
                canSell={(portfolio.holdings[selected]?.qty ?? 0) > 0}
                price={`${num(quote(m, selected, displayDay, displayClosed).krw)}원`}
                openOrders={myOrders.filter((o) => o.symbol === selected && o.day === day && o.status === 'open').length}
                onBuy={() => setSheet('buy')}
                onSell={() => setSheet('sell')}
              />
            </section>
          ) : id === 'news' ? (
            <section className="pane p-news">
              {/* 뉴스 칸 제목 + 크게 보기 (카드 칸 제목과 같은 모양) */}
              <div className="news-bar">
                <b><Icon name="news" size={15} /> 소식</b>
                <button className="btn sm ghost" onClick={() => setNewsBig(true)}>
                  <Icon name="grid" size={14} /> 크게 보기
                </button>
              </div>
              <div className="news-scroll">
                {effectsOnMe.map((t, k) => (
                  <div key={k} className="effect-banner">
                    {t}
                  </div>
                ))}
                {newsPanel}
              </div>
            </section>
          ) : (
            <section className="pane p-cards">
              <CardTray version={view.room.rulesVersion ?? 1} blockReason={cardBlock} mine={view.myItems} day={day} totalDays={total} usedToday={usedToday} canAct={cardCanAct} busy={busy} onUse={(k) => useCard(k)} onOpen={() => setDrawer('cards')} />
            </section>
          )
        }
      />
      <div className="kbd-hint muted">
        <kbd>/</kbd> 검색 · <kbd>↑</kbd>
        <kbd>↓</kbd> 종목 이동 · <kbd>Enter</kbd> 주문 · <kbd>Esc</kbd> 닫기
      </div>

      {prefsOpen && (
        <Sheet title="커스텀 모드 옵션" onClose={() => setPrefsOpen(false)}>
          <PrefsPanel ui={ui} />
        </Sheet>
      )}
      <Drawer open={drawer === 'assets'} title={easy ? '내 재산' : '자산'} onClose={() => setDrawer(null)}>
        {assets}
      </Drawer>
      <Drawer open={drawer === 'cards'} title="찬스 카드 · 상점" onClose={() => setDrawer(null)}>
        {cards}
      </Drawer>
      {overlays}
    </div>
  );
}

export type { View };

/** 결과를 오래 못 받으면(연결 끊김 등) 5초 뒤 로비로 갈 수 있게 */
function ResultWaitExit({ onExit }: { onExit: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <>
      <p className="muted small">연결이 느려요. 결과는 '업적'과 내 기록에 남아요.</p>
      <button className="btn" onClick={onExit}>
        홈으로
      </button>
    </>
  );
}

/** 하루 마감 결산 팝업이 저절로 넘어가는 시간(초): 장 전 시간의 20% (v7+), 없으면 하루 시간의 8% — 3~8초 */
function closeAutoSec(turnSeconds: number, version: number) {
  const base = version >= PREMARKET_VERSION ? preSeconds(turnSeconds) * 0.2 : turnSeconds * 0.08;
  return Math.max(3, Math.min(8, Math.round(base)));
}
