import { THEMES } from '../game/themes';
import { currentChapter, finishChapter, nextChapter, stopTour, useChapter } from '../lib/onboarding';
import { RollNum } from '../components/RollNum';
import { CoachTour } from '../components/CoachTour';
import { GAME_TIME_VERSION, PLATFORMS } from '../game/community';
import { RESULT_STEPS } from '../components/Tours';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markActiveGame } from '../lib/activeTab';
import { hasOpenLayer, Loading, onLayerEntry } from '../components/ui';
import { useAccount } from '../net/account';
import { ask } from '../components/ConfirmHost';
import { setDrawScope } from '../components/ProChart';
import { CardIcon, Icon, type IconName } from '../components/Icon';
import { PrefsPanel, Sheet } from '../components/PrefsPanel';
import { applyMoneyUnit, effective, isCustom, moved, resetLayout, setLayout, setPrefs, usePrefs, type MHeaderRow, type MTab } from '../prefs';
import { bandText, loadPins, MarketGridPinnable, MarketTicker, EndStatus, RankList, rankRows, RankStrip, PlayerPic, savePins, ScheduleStrip, TargetPicker } from '../components/Board';
import { AssetSummary, CardTray, Drawer, Timeline } from '../components/Desk';
import { BottomSheet, Calendar, OrdersAndDividends, useIsMobile, useMobileLayout } from '../components/Extras';
import { AugPanel, AugPick, AugPill, AugSlots, AugStrip } from '../components/Augments';
import { augFeeRate, augLevCap, augOrderRange } from '../engine/augEffects';
import { AUG_MAP } from '../game/augments';
import { AssetsPanel, CardsPanel, DayCloseOverlay, FakeNewsModal, MatchIntro, NewsPanel, Tutorial, unreadToday } from '../components/Panels';
import { ReactionBubbles, ReactionButton, loadReactMute, saveReactMute } from '../components/Reactions';
import { StockBrowser, type BrowserFilter } from '../components/StockBrowser';
import { StockDetail, TradePanel } from '../components/StockDetail';
import { Term } from '../components/Term';
import { isLeveraged, josa, LEVERAGE_CAP, preSeconds, PREMARKET_VERSION, type View } from '../engine/engine';
import { loadSolo, saveSolo, makeDemo, makeTutorial, soloAct, soloSync, soloView, type SoloSave } from '../engine/local';
import { TutorialGuide, TUTORIAL_STEPS } from '../components/TutorialGuide';
import { CardGuide } from '../components/CardGuide';
import { EditSlot } from '../components/EditSlot';
import { DockBoard } from '../components/Dock';
import { ToastAnnouncer, ToastSpot, type ToastMsg } from '../components/ToastSpot';
import { TradeJump } from '../components/TradeJump';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { FIND_AGAIN } from '../components/MatchFinder';
import { withLive } from '../game/live';
import { withStoryEvents } from '../game/storyDates';
import { BONUS_AMOUNT, FEE_BOMB_RATE, ITEM_MAP, spendsFromRows, type ItemKind, type ItemRow, infoLimitReason } from '../game/items';
import { barNow, KR_INDEX_BASE, pricesAt, US_INDEX_BASE, type Market } from '../game/market';
import { buyCost, computePortfolio, equityWith, FEE_RATE, startCashFor } from '../game/portfolio';
import { quote } from '../game/quote';
import { SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { num, pct, tone, wonShort } from '../lib/format';
import { isMuted, play, setMuted } from '../lib/sound';
import { musicOn, setMusicOn, setScene, type Scene } from '../lib/music';
import { AntPhone, phoneUnread } from '../components/AntPhone';
import { api, ApiError, useLiveView, useReactions, type Reaction } from '../net/api';
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
const TAB_LABEL: Record<Tab, string> = { list: '종목', detail: '차트', news: '개미폰', assets: '내 재산', cards: '증강' };
const TAB_ICON: Record<Tab, IconName> = { list: 'list', detail: 'chart', news: 'phone', assets: 'wallet', cards: 'cards' };
const HEADER_LABEL: Record<MHeaderRow, string> = { ticker: '시장 지표', schedule: '일정', assets: '내 재산 요약' };

/** 연습을 '그만두기'로 나갔는지 (나간 뒤 1초 타이머가 다시 저장하지 않게) */
const soloQuit = { current: false };

/** 둘이서: 서버(/api/game) · 혼자: 브라우저 안의 같은 엔진 */
/** 두 번 처리되면 안 되는 행동 (돈·카드·예약) */
const ONCE_ACTIONS = new Set(['trade', 'buyItem', 'useItem', 'placeOrder', 'pickAug', 'rerollAug', 'useAug']);
function newReqId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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
      if (session.demo) throw new Error('화면 편집 중에는 거래·증강을 쓸 수 없어요');
      setBusy(true);
      try {
        if (multi) {
          // 버튼 한 번 = 요청 번호 하나. 응답만 끊겨 다시 보내도 서버가 한 번만 처리함
          const body = { roomId: session.roomId, ...payload, ...(ONCE_ACTIONS.has(action) ? { reqId: newReqId() } : {}) };
          try {
            await api(action, body);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 0 && action !== 'endTurn')) throw e;
            // 같은 번호로 한 번 더 — 이미 처리됐으면 서버가 처음 결과를 돌려줌
            if (!('reqId' in body)) {
              live.refresh().catch(() => {});
              throw new ApiError('연결이 끊겨 처리됐는지 모르겠어요. 내 재산에서 확인한 뒤 다시 해 주세요', 0, 'unsure');
            }
            await new Promise((r) => setTimeout(r, 1500));
            try {
              await api(action, body);
            } catch (e2) {
              if (e2 instanceof ApiError && e2.status === 0) {
                live.refresh().catch(() => {});
                throw new ApiError('연결이 끊겨 처리됐는지 모르겠어요. 내 재산에서 확인한 뒤 다시 해 주세요', 0, 'unsure');
              }
              throw e2;
            }
          }
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

  // 튜토리얼: 남은 날을 한 번에 넘겨 결과 화면으로 (③ 결과 보기 단계)
  const finishTutorial = useCallback(() => {
    setSolo((cur) => {
      let x = cur;
      // 그날 고를 증강이 남아 있으면 장 마감이 거절되므로 먼저 첫 보기를 고름. 상태 갱신 안에서 오류가 나면 화면 전체가 멈추니 잡아 둠
      try {
        for (let i = 0; x && x.tutorial && x.data.room.status === 'playing' && i < 40; i++) {
          const offer = soloView(x, Date.now()).aug?.offer;
          x = offer?.ids?.length ? soloAct(x, 'pickAug', { aug: offer.ids[0] }) : soloAct(x, 'endTurn', {});
        }
      } catch {
        /* 넘기다 막히면 거기까지 */
      }
      return x;
    });
  }, []);
  if (multi) return { view: live.view, market: live.market, offset: live.offset, error: live.error, act, busy, tutorialInfo: null, finishTutorial };
  return { view: soloV, market: soloV?.market ?? null, offset: 0, error: solo ? null : '연습 게임을 찾을 수 없어요.', act, busy, tutorialInfo: solo?.tutorial ?? null, finishTutorial };
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
      if (location.hash.slice(1) !== t) {
        const url = `${location.pathname}${location.search}#${t}`;
        // 창 안에서 탭을 바꾸면(일정 창에서 종목 누르기 등) 그 창 기록 자리를 바꿈 — 창 표시는 지워서 창이 닫힐 때 되돌리지 않게
        if (onLayerEntry()) {
          const { __layer: _l, ...rest } = (history.state ?? {}) as Record<string, unknown>;
          history.replaceState(rest, '', url);
        } else history.pushState(history.state, '', url);
      }
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
  const { view, market: rawMarket, offset, error, act, busy, tutorialInfo, finishTutorial } = useGameSource(session);
  // 단계별 튜토리얼 (design/onboarding.md): ② 게임 기초 → ③ 결과 보기
  const chapter = useChapter();
  const toResult = useRef(false);
  const showTutorialResult = useCallback(() => {
    toResult.current = true;
    finishTutorial();
  }, [finishTutorial]);
  // 다른 창의 로비가 '연결이 끊겼어요' 팝업을 띄우지 않게 (이 창에서 하는 중이라고 적어 둠)
  const activeRoom = session.mode === 'multi' ? session.roomId : null;
  useEffect(() => (activeRoom ? markActiveGame(activeRoom) : undefined), [activeRoom]);
  const [tutStep, setTutStep] = useState(0);
  // 튜토리얼 어느 단계에서 그만두는지 숫자만 남김 (단계 번호·사건만, 실패해도 게임엔 영향 없음)
  const tutTrack = (ev: 'show' | 'quit' | 'done', step = tutStep) => {
    // 개발 서버(이 컴퓨터에서 점검·시험)로 연 화면은 세지 않음 — 같은 DB 라 점검 도구가 열 때마다 1단계 숫자가 쌓였음
    if (session.tutorial && !import.meta.env.DEV) void api('tutorialStep', { step, ev }).catch(() => {});
  };
  useEffect(() => {
    if (session.tutorial && tutStep < TUTORIAL_STEPS.length) tutTrack('show');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutStep]);
  const [cardGuide, setCardGuide] = useState(false);
  // 서버가 보낸 '지금 칸까지의 장중 가격'을 오늘 막대에 합침 → 현재가·차트가 5초마다 움직임
  // (v15) 예고 기사에 적힌 발표 날짜도 일정에 (보이는 기사 제목만 읽음)
  const market = useMemo(() => (rawMarket ? withStoryEvents(withLive(rawMarket, view?.live), view?.room.day ?? 0) : null), [rawMarket, view?.live, view?.room.day]);

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
  // 아래 메뉴 높이 — 올린 개미폰이 그 위까지만 덮게
  const [mNavH, setMNavH] = useState(64);
  const mNavRo = useRef<ResizeObserver | null>(null);
  const mNavRef = useCallback((el: HTMLElement | null) => {
    mNavRo.current?.disconnect();
    mNavRo.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMNavH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    mNavRo.current = ro;
  }, []);
  // 아래 메뉴를 위로 쓸어 올리면 개미폰 (그 손짓 뒤의 누름은 탭 바꾸기로 치지 않음)
  const navSwipe = useRef<{ y: number; done: boolean } | null>(null);
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
  // 개미폰을 내리면 올리기 전 탭으로
  const lastTab = useRef<Tab>('list');
  useEffect(() => {
    if (tab !== 'news') lastTab.current = tab;
  }, [tab]);
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
  // (v14) 루머 감별기: 확인할 소식 하나 고르기
  const [detectorPick, setDetectorPick] = useState(false);
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
  /** 접어 둔 증강 고르기 (몇 번째 고르기를 접었는지) */
  const [augHidden, setAugHidden] = useState<number | null>(null);
  const [bubbles, setBubbles] = useState<(Reaction & { mine?: boolean })[]>([]);
  // 게임 안 소리 버튼은 효과음·배경 음악을 한꺼번에 켜고 끔
  const [muted, setMutedState] = useState(() => isMuted() && !musicOn());
  const [now, setNow] = useState(Date.now());
  const toastTimer = useRef<number>();
  /** 장중 속보는 보통 알림과 따로 (자리도 따로) */
  const [newsToast, setNewsToast] = useState<ToastMsg | null>(null);
  const newsTimer = useRef<number>();
  const searchRef = useRef<HTMLDivElement>(null);

  // 알림은 한 번에 하나씩, 나머지는 줄을 섬 — 같은 순간에 온 알림이 서로 덮어써 사라지지 않게
  const toastQ = useRef<{ text: string; kind: 'ok' | 'err' | 'warn' }[]>([]);
  const toastOn = useRef<string | null>(null);
  const nextToast = useCallback(() => {
    const t = toastQ.current.shift();
    if (!t) {
      toastOn.current = null;
      setToast(null);
      return;
    }
    toastOn.current = t.text;
    setToast(t);
    // 확인은 3초, 주의·오류는 5초부터, 긴 글은 읽을 만큼 더 (최대 10초). 창이 뒤에 있으면 돌아올 때까지 기다림
    const ms = Math.min(10_000, Math.max(t.kind === 'ok' ? 3000 : 5000, t.text.length * 60));
    const done = () => {
      if (document.visibilityState === 'hidden') toastTimer.current = window.setTimeout(done, 1000);
      else nextToast();
    };
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(done, ms);
  }, []);
  const showToast = useCallback(
    (text: string, kind: 'ok' | 'err' | 'warn' = 'ok') => {
      if (toastOn.current === text || toastQ.current.some((t) => t.text === text)) return;
      // 기다리는 줄은 3개까지 — 넘치면 가장 오래된 확인 알림부터 버림 (오류·주의는 남김)
      if (toastQ.current.length >= 3) {
        const i = toastQ.current.findIndex((t) => t.kind === 'ok');
        toastQ.current.splice(i >= 0 ? i : 0, 1);
      }
      // 오류는 줄 맨 앞으로
      if (kind === 'err') toastQ.current.unshift({ text, kind });
      else toastQ.current.push({ text, kind });
      if (!toastOn.current) nextToast();
    },
    [nextToast],
  );
  /** 장중 속보: 크게, 더 오래(6초+), 누르면 그 종목으로. 여러 개면 하나씩 */
  const newsQ = useRef<Omit<ToastMsg, 'kind'>[]>([]);
  const newsOn = useRef(false);
  const nextNews = useCallback(() => {
    const m = newsQ.current.shift();
    if (!m) {
      newsOn.current = false;
      setNewsToast(null);
      return;
    }
    newsOn.current = true;
    setNewsToast({ ...m, kind: 'news' });
    window.clearTimeout(newsTimer.current);
    newsTimer.current = window.setTimeout(nextNews, Math.min(10_000, Math.max(6000, m.text.length * 110)));
  }, []);
  const showNews = useCallback(
    (msg: Omit<ToastMsg, 'kind'>) => {
      if (newsQ.current.length >= 3) newsQ.current.shift();
      newsQ.current.push(msg);
      if (!newsOn.current) nextNews();
    },
    [nextNews],
  );

  useEffect(() => {
    if (session.demo) return; // 멈춘 장면
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const room = view?.room;
  const total = room?.totalDays ?? 1;
  const serverDay = room ? room.day : null;
  const finished = room?.status === 'finished';

  useEffect(() => {
    if (session.tutorial && chapter === 'result' && view && !showResult && !toResult.current) showTutorialResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.tutorial, chapter, !!view]);

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
    if (toResult.current && finished) {
      toResult.current = false;
      setClosing(null);
      setViewDay(total - 1);
      setShowResult(true);
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
  const augIncome = view?.aug?.income;
  // (v27) 증강으로 받은 돈은 서버가 계산해 보내 줌 — 카드 구매와 같은 자리(현금 변화)로 더함
  const spends = useMemo(() => spendsFromRows(myItemRows).concat((augIncome ?? []).map((x) => ({ day: x.day, cost: -x.amount, aug: true }))), [myItemRows, augIncome]);
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
  // 연습 무제한: 거래 마감이 아주 멀리 있음 → 남은 시간 대신 '시간 무제한'
  const unlimitedDay = solo && rawRemaining !== null && rawRemaining > 86_400;
  const remaining = unlimitedDay ? null : rawRemaining !== null && daySecs > 0 ? Math.min(rawRemaining, daySecs) : rawRemaining;
  // (v7) 장 전 시간: 어제 정리·찌라시·예약 주문. 지금 가격 거래와 장 마감은 장이 열린 뒤에
  const preUntil = !solo ? (room?.preUntil ?? null) : null;
  const preLeft = preUntil !== null ? Math.max(0, Math.ceil((preUntil - (now + offset)) / 1000)) : 0;
  // 연습(혼자·봇전): 장 전 시간은 무제한 — '장 시작'을 눌러야 그날 장이 열림
  const soloPre = solo && !session.tutorial && !session.demo && room?.status === 'playing' && room?.deadline == null && closing === null && !showResult;
  const inPre = (preUntil !== null && preLeft > 0 && closing === null) || soloPre;
  // 봇전·오늘의 도전(서버의 혼자 하는 판)도 장 전은 사실상 무제한 → '장 시작'으로 보여 줌
  const freePre = soloPre || (inPre && preLeft > 3600);
  const preReadyMe = !!meRow?.preReady;
  // 카드를 지금 못 쓰는 이유 (버튼이 회색인 까닭을 그대로 알려 줌)
  const cardBlock =
    closing !== null ? '오늘 장을 정리하고 있어요. 다음 날 쓸 수 있어요'
    : endedToday ? '장 마감을 눌렀어요. 마감을 취소하면 다시 쓸 수 있어요'
    : remaining === 0 ? '시간이 다 됐어요. 곧 다음 날로 넘어가요'
    : room?.status !== 'playing' ? '게임이 진행 중일 때만 할 수 있어요'
    : null;
  const cardCanAct = canAct && remaining !== 0;
  // 배경 음악: 장 전·결산은 고요하게, 장중은 박자, 카운트다운은 조금 더 빠르게, 결과 화면은 끔(결과 효과음만)
  const musicScene: Scene = showResult || finished ? 'off' : closing !== null || inPre ? 'pre' : room?.countdown ? 'tense' : room?.status === 'playing' ? 'market' : 'pre';
  useEffect(() => {
    setScene(musicScene);
  }, [musicScene]);
  // 장이 열리는 순간 종소리 (장 전 → 장중으로 바뀔 때만)
  // 장이 닫히기 5초 전부터 1초마다 작은 똑딱 소리 (마지막 정리를 놓치지 않게) — 장중·결산 전에만
  const tickSec = !inPre && closing === null && room?.status === 'playing' && remaining !== null ? Math.ceil(remaining) : null;
  useEffect(() => {
    if (tickSec !== null && tickSec >= 1 && tickSec <= 5) play('tick');
  }, [tickSec]);
  const wasPre = useRef(inPre);
  useEffect(() => {
    if (wasPre.current && !inPre && room?.status === 'playing' && closing === null) play('open');
    wasPre.current = inPre;
  }, [inPre, room?.status, closing]);

  const tradeState = {
    // v4: 레버리지·인버스 ETF 비중 제한 — 서버 규칙(leveragedCap)과 같은 계산을 화면에서 미리
    capFor: (sym: string) => {
      if ((room?.rulesVersion ?? 1) < 4 || !isLeveraged(sym)) return null;
      const priceOf = (s: string) => quote(m, s, displayDay, displayClosed).krw;
      let held = 0;
      for (const [s, h] of Object.entries(portfolio.holdings)) if (isLeveraged(s)) held += h.qty * priceOf(s);
      const capRate = view?.aug ? augLevCap(view.aug.mine.map((x) => x.id), LEVERAGE_CAP) : LEVERAGE_CAP;
      return Math.max(0, Math.floor((capRate * equity - held) / (priceOf(sym) * 1.0015)));
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
    feeFor: view?.aug?.mine.length
      ? (sym: string, side: 'buy' | 'sell', qty: number) => {
          const boughtToday = (view.myTrades ?? []).filter((t) => t.day === day && t.symbol === sym).reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0);
          // 서버와 같은 계산 (가장 큰 종목 = 어제 종가 기준, 업종 장악은 화면에서 빼고 넉넉히) — 실제 체결 수수료는 서버가 정함
          const px = (s: string) => quote(m, s, day > 0 ? day - 1 : 0, day > 0).krw;
          const biggest = Object.entries(portfolio.holdings).sort((a, b) => b[1].qty * px(b[0]) - a[1].qty * px(a[0]))[0]?.[0] ?? null;
          return augFeeRate(view.aug!.mine.map((x) => x.id), { symbol: sym, side, qty, held: portfolio.holdings[sym]?.qty ?? 0, boughtToday, biggest, ruleSector: null }, feeRate);
        }
      : undefined,
    busy,
    limitOnly: inPre,
    orderRange: augOrderRange((view?.aug?.mine ?? []).map((x) => x.id)),
    levCapRate: view?.aug ? augLevCap(view.aug.mine.map((x) => x.id), LEVERAGE_CAP) : LEVERAGE_CAP,
    haltOf: (sym: string) => m.halts?.find((h) => h.symbol === sym && h.day === day)?.kind ?? null,
  };

  const news = market?.news ?? [];
  const newsSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const n of news.filter((x) => x.day === day)) n.related.forEach((s) => set.add(s));
    return set;
  }, [news, day]);
  const change = useCallback((sym: string) => (market ? quote(market, sym, displayDay, displayClosed).ch : 0), [market, displayDay, displayClosed]);

  // (v27) 시간 안에 못 골라 증강이 자동으로 정해졌으면 한 번 알림 (창만 사라져 왜 정해졌는지 모르지 않게)
  const autoSeen = useRef<Set<number> | null>(null);
  useEffect(() => {
    const mine = view?.aug?.mine;
    if (!mine) return;
    const autos = mine.filter((x) => x.auto);
    if (autoSeen.current === null) {
      autoSeen.current = new Set(autos.map((x) => x.n));
      return;
    }
    for (const x of autos) {
      if (autoSeen.current.has(x.n)) continue;
      autoSeen.current.add(x.n);
      showToast(`시간이 지나 증강이 자동으로 정해졌어요: ${AUG_MAP[x.id]?.name ?? ''}`, 'warn');
    }
  }, [view?.aug?.mine]);

  // (v27) 증강으로 돈이 들어온 날 한 번 알림 (처음 화면을 열 때 이미 있던 것은 조용히)
  const augSeen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const inc = view?.aug?.income;
    if (!inc) return;
    const keys = inc.map((x) => `${x.aug}:${x.day}:${x.amount}`);
    if (augSeen.current === null) {
      augSeen.current = new Set(keys);
      return;
    }
    const fresh = inc.filter((x, i) => !augSeen.current!.has(keys[i]));
    keys.forEach((k) => augSeen.current!.add(k));
    if (!fresh.length) return;
    const sum = fresh.reduce((a, x) => a + x.amount, 0);
    const names = [...new Set(fresh.map((x) => AUG_MAP[x.aug]?.name ?? x.aug))].join('·');
    showToast(`증강 ${names} ${sum >= 0 ? '+' : ''}${wonShort(sum)}`, sum >= 0 ? 'ok' : 'warn');
    if (sum > 0) play('item');
  }, [view?.aug?.income]);

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
    // (v21) 장중 시황·소문 기사는 큰 속보 알림 없이 소식 칸에만
    const breaking = market.news.filter((n) => n.at != null && n.label !== '시황' && !n.rumor);
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
      const filled = view.myOrders.filter((o) => seenOrders.current!.get(o.id!) === 'open' && o.status === 'filled');
      // 한꺼번에 체결되면 한 줄로 모음
      if (filled.length === 1) {
        const o = filled[0];
        showToast(`예약한 ${STOCK_MAP[o.symbol].name} ${num(o.qty)}주를 ${o.side === 'buy' ? '샀어요' : '팔았어요'}`);
      } else if (filled.length > 1) showToast(`예약 주문 ${filled.length}건이 체결됐어요`);
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
        play(a >= 0 ? 'win' : 'lose');
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
      if (e instanceof ApiError && e.code === 'unsure') {
        showToast(e.message, 'warn');
        return;
      }
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
      showToast(`${STOCK_MAP[symbol].name} ${num(qty)}주 예약했어요. 그 가격이 되면 ${side === 'buy' ? '살게요' : '팔게요'}`);
    });
  const cancelOrder = (orderId: string) => run('cancelOrder', { orderId }, () => showToast('예약 주문을 취소했어요'));

  const buyItem = (kind: ItemKind) =>
    run('buyItem', { kind }, () => {
      play('item');
      showToast(`${ITEM_MAP[kind].name} 카드를 샀어요`);
    });
  const useAug = (kind: string, given?: Record<string, string>) => {
    let payload: Record<string, string> = { ...(given ?? {}) };
    if (kind === 'scout' && !payload.symbol) payload = { ...payload, symbol: selected };
    // 고르기 창은 서랍(내 증강)보다 아래 층이라 서랍을 먼저 닫음 (PC 에서 창 오른쪽이 서랍에 가려 누를 수 없었음)
    if (kind === 'detector' && !payload.pick) return setDrawer(null), setDetectorPick(true);
    run('useAug', { kind, payload }, () => {
      play('item');
      if (kind === 'undo') return showToast('그 거래를 없던 일로 했어요. 수수료도 돌려받아요');
      if (kind === 'timing') return showToast('오늘 장이 끝나면 그날 최저가로 다시 계산해 차액을 받아요');
      showToast(session.tutorial ? '결과가 소식 칸에 나왔어요' : '결과가 개미폰 개미경제 앱에 나왔어요');
      setTab('news');
      setDrawer(null);
      const cls = ({ paper: 'paper', analyst: 'analyst', scout: 'scout' } as Record<string, string>)[kind];
      if (cls)
        window.setTimeout(() => {
          const el = document.querySelector(`.reveal.${cls}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el?.classList.add('flash');
          window.setTimeout(() => el?.classList.remove('flash'), 1600);
        }, 250);
    });
  };
  const pickAug = (aug: string) =>
    run('pickAug', { aug }, () => {
      play('item');
      setAugHidden(null);
      showToast('증강을 골랐어요. 내 증강 칸에서 다시 볼 수 있어요');
    });
  const rerollAug = (slot: number) => run('rerollAug', { slot }, () => play('tap'));
  const useCard = (kind: ItemKind, given?: ItemRow['payload']) => {
    if (view?.aug) return useAug(kind, (given ?? undefined) as Record<string, string> | undefined);
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
    // (v14) 오늘 이미 다른 정보 카드를 썼으면 고르기 창을 열지 않고 바로 알림
    const limit = infoLimitReason(view?.room.rulesVersion ?? 1, kind, usedToday);
    if (limit) return showToast(limit, 'warn');
    if (kind === 'detector' && (view?.room.rulesVersion ?? 1) >= 14 && !payload.pick) return setDrawer(null), setDetectorPick(true);
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
            : `${d.name} 카드를 썼어요. 내일 상대에게 효과가 나타나요`,
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
    if (view?.aug?.offer) {
      setAugHidden(null);
      return showToast('오늘 증강을 먼저 골라 주세요', 'warn');
    }
    // 튜토리얼: 안내가 '장 마감' 단계에 오기 전에는 하루를 넘기지 않음 (설명 순서가 꼬이지 않게)
    if (session.tutorial && tutStep < TUTORIAL_STEPS.findIndex((x) => x.title === '장 마감')) {
      showToast('안내를 따라오면 곧 장 마감을 눌러 볼 거예요', 'warn');
      return;
    }
    play('tap');
    run('endTurn', {}, () => {});
    // 매칭(랭킹전·일반전)에서 아직 거래가 0회면 마감할 때마다 알림 — 끝까지 0회면 순위 맨 뒤 (서버 finalResults)
    if (view?.room.kind === 'match' && view.myTrades.length === 0)
      showToast('아직 한 번도 사고팔지 않았어요. 랭킹전·일반전에서는 끝까지 거래가 없으면 꼴찌가 돼요', 'warn');
  };
  // 장 마감 취소: 다음 날로 넘어가기 전(시간이 남아 있을 때)이면 언제든
  const preReady = () => {
    if (soloPre) {
      play('tap');
      act('startDay', {})
        .then(() => showToast('장이 열렸어요'))
        .catch((e) => showToast(e instanceof Error ? e.message : '실패했어요', 'err'));
      return;
    }
    if (!inPre || preReadyMe) return;
    play('tap');
    act('preReady', {})
      .then(() => showToast(freePre ? '장이 열려요' : '준비 완료! 모두 누르면 장이 바로 열려요'))
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
    // 버튼 이름과 같게: 혼자 하는 판(시간 제한 없음)은 '장 시작', 대결은 '준비 완료'
    showToast(`장 전 시간이에요. 커뮤니티 글을 보고 예약 주문을 걸어 두세요. 다 했으면 ${freePre ? "'장 시작'을" : "'준비 완료'를"} 눌러 주세요`, 'warn');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만 (freePre 가 바뀌어도 다시 띄우지 않음)
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
    if (solo && session.tutorial) act('startDay', {}).catch(() => {});
  };

  const pushBubble = (r: Reaction & { mine?: boolean }) => {
    setBubbles((b) => [...b.slice(-3), r]);
    setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== r.id)), 3500);
  };
  // 반응 채널은 서버 판(대결·봇전 등)에서만 — 튜토리얼·연습은 이 기기에서만 도는 판이라 열지 않음
  const [reactMute, setReactMute] = useState(loadReactMute);
  const muteRef = useRef(reactMute);
  muteRef.current = reactMute;
  const sendReaction = useReactions(session.mode === 'multi' ? session.roomId : null, me, (r) => {
    // 이 방 참가자가 보낸 것만 (방 ID 만 아는 외부인·다른 사람 사칭 무시)
    if (!view?.players.some((p) => p.id === r.from)) return;
    if (muteRef.current) return; // 다른 사람 반응 끔
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
      // 창(사기 창·서랍·크게 보기 차트·확인 창 등)이 떠 있으면 단축키는 그 뒤 화면에 쓰지 않음
      // (크게 보기 차트에서 Enter 면 사기 창이 차트 뒤에 열려 안 보이고, 방향키는 뒤에서 종목을 바꾸므로)
      const layered = hasOpenLayer() || !!document.querySelector('.modal-bg, .sheet-bg, .drawer-bg.open, .chart-full');
      if (layered && e.key !== 'Escape') return;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
      if (typing) return;
      // 화면 편집 중 Esc = '완료' (열린 창이 있으면 그 창만 닫힘)
      if (e.key === 'Escape' && editingRef.current && !session.demo && !e.defaultPrevented && !hasOpenLayer() && !document.querySelector('.modal-bg, .sheet-bg, .drawer-bg.open')) {
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
        <p>이 기기에서는 더 이상 이 판을 할 수 없어요</p>
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
            <Loading label="게임 불러오는 중…" tips />
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
      <>
      {/* ③ 결과 보기 안내 (튜토리얼 판의 결과 화면) */}
      {session.tutorial && chapter === 'result' && (
        <CoachTour
          steps={RESULT_STEPS}
          chapterTitle="결과 보기"
          mobile={mobile}
          doneLabel={nextChapter() ? '홈에서 이어 보기' : '끝내기'}
          onDone={() => {
            finishChapter('result', 'done');
            onExit();
          }}
          onSkip={() => {
            finishChapter('result', 'skip');
            if (currentChapter()) onExit();
          }}
          onStopAll={() => stopTour()}
        />
      )}
      <ResultScreen
        theme={view.room.theme}
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
      </>
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
  const effectsOnMe = effects.map((k) => (k === 'freeze' ? '누군가의 거래 정지 카드 때문에 오늘은 거래할 수 없어요' : k === 'fee' ? '수수료 폭탄! 오늘은 수수료가 1%예요' : k === 'blackout' ? '정보 차단 카드 때문에 오늘 뉴스·커뮤니티 글을 볼 수 없어요' : '')).filter(Boolean);
  const mmss2 = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const timerText = inPre ? (freePre ? '장 전 · 시간 제한 없음' : `장 전 ${mmss2(preLeft)}`) : remaining !== null && closing === null ? mmss2(remaining) : null;
  const endLabel = inPre ? (freePre ? '장 시작' : preReadyMe ? '준비 완료함' : '준비 완료') : endedToday ? '마감 취소' : day + 1 >= total ? '마지막 장 마감' : '장 마감';
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
  const newsPanelFor = (only?: 'news' | 'rumor') => (
    <NewsPanel
      only={only}
      daySec={(view.room.rulesVersion ?? 1) >= GAME_TIME_VERSION ? (view.room.turnSeconds > 0 ? view.room.turnSeconds : 180) : undefined}
      posts={view.community}
      pastPosts={market?.community}
      marketOpen={!!view.live}
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
  const newsPanel = newsPanelFor();
  const phoneDaySec = (view.room.rulesVersion ?? 1) >= GAME_TIME_VERSION ? (view.room.turnSeconds > 0 ? view.room.turnSeconds : 180) : undefined;
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;
  const phoneClock = inPre ? '장 전' : closing !== null ? `${day + 1}일차 정리` : remaining !== null && daySecs > 0 ? `${day + 1}일차 ${mmss(Math.max(0, daySecs - remaining))}` : `${day + 1}일차`;
  const assets = (
    <>
      <AssetsPanel ui={ui} portfolio={portfolio} prices={prices} equity={equity} start={START_CASH} onSelect={selectStock} />
      <OrdersAndDividends orders={myOrders} day={day} portfolio={portfolio} canAct={canAct} onCancel={cancelOrder} onSelect={selectStock} />
    </>
  );
  const augMode = !!view.aug;
  const todayTrades = (view.myTrades ?? []).filter((t) => t.day === day && t.id);
  const cardTray = (onOpen: () => void) =>
    view.aug ? <AugStrip aug={view.aug} onOpen={onOpen} /> : <CardTray version={view.room.rulesVersion ?? 1} blockReason={cardBlock} mine={view.myItems} day={day} totalDays={total} usedToday={usedToday} canAct={cardCanAct} busy={busy} onUse={(k) => useCard(k)} onOpen={onOpen} />;
  const cards = view.aug ? (
    <AugPanel aug={view.aug} day={day} totalDays={total} selected={selected} todayTrades={todayTrades} canAct={cardCanAct} busy={busy} onUse={useAug} />
  ) : (
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
  // 개미폰 (design/news-phone.md) — 뉴스·피드·내 주식·증강 앱. 튜토리얼은 뉴스 앱을 열어 둔 채 예전 소식 칸(뉴스·커뮤니티) 그대로 — 단계가 그 칸을 비춤
  const phoneWallet = {
    equity,
    ret: myRet,
    cash: portfolio.cash,
    top: Object.entries(portfolio.holdings)
      .filter(([, h]) => h.qty > 0)
      .map(([sym, h]) => ({ sym, name: STOCK_MAP[sym]?.name ?? sym, value: h.qty * (prices[sym] ?? 0), ch: change(sym) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3),
  };
  // 튜토리얼은 예전 소식 칸 기준(뉴스 읽음)
  const phoneBadge = session.tutorial ? unreadToday(news, day) : phoneUnread(view.room.id, news, view.community ?? [], view.rumors ?? [], day);
  const phoneFor = (mode: 'framed' | 'full' | 'inline', onLower?: () => void) => (
    <AntPhone
      roomKey={view.room.id}
      day={day}
      daySec={phoneDaySec}
      clock={phoneClock}
      pre={inPre}
      live={!!view.live && !inPre && closing === null}
      news={news}
      posts={view.community ?? []}
      pastPosts={market?.community ?? []}
      rumors={view.rumors ?? []}
      newsApp={session.tutorial ? newsPanel : newsPanelFor('news')}
      stockApp={assets}
      augApp={cards}
      augName={augMode ? '증강' : '찬스 카드'}
      augWidget={view.aug ? <AugSlots aug={view.aug} size={22} /> : <span className="ap-w-sub">카드 {view.myItems.total}장</span>}
      augAlert={!!view.aug?.offer}
      wallet={phoneWallet}
      alerts={mode === 'full' ? effectsOnMe : undefined}
      onSelect={selectStock}
      onSelectSector={selectSector}
      onExpand={mode === 'framed' ? () => setNewsBig(true) : undefined}
      mode={mode}
      onLower={onLower}
      lockApp={session.tutorial ? 'news' : undefined}
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
    detectorUsed: (view?.myItems.used.detector ?? 0) > 0 || (!!view?.aug?.mine.some((x) => x.id === 'verdict1') && view.aug.left.detector === 0),
    // 다른 정보 카드를 먼저 써서 오늘은 감별기를 못 씀 (정보 카드 하루 1장) — 튜토리얼이 막히지 않게
    otherInfoUsed: (view?.myItems.used.detector ?? 0) === 0 && [...usedToday].some((k) => ITEM_MAP[k]?.type === 'info'),
    serverDay: serverDay ?? 0,
    closing: closing !== null,
    viewDay: viewDay ?? 0,
    botNotice: view?.notices.find((n) => n.text.includes('방패가'))?.text ?? '',
    augPicked: (view?.aug?.mine.length ?? 0) > 0,
    augId: view?.aug?.mine[0]?.id ?? '',
  };
  const augOffer = view.aug?.offer ?? null;
  const augEnds = remaining !== null && remaining > 0 ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : null;
  // 튜토리얼은 '증강 고르기' 단계가 되어야 창을 띄움 (앞 단계 설명을 가리지 않게)
  const tutAugAt = TUTORIAL_STEPS.findIndex((x) => x.title === '증강 고르기');
  const showAugPick = !!augOffer && room?.status === 'playing' && closing === null && !showResult && viewDay === serverDay && !(session.tutorial && tutStep < tutAugAt);
  const overlays = (
    <>
      {showAugPick && augHidden !== augOffer.n && <AugPick key={augOffer.n} offer={augOffer} recommend={session.tutorial && augOffer.n === 0 ? 'verdict1' : undefined} busy={busy} endsIn={augEnds} onPick={pickAug} onReroll={rerollAug} onHide={() => setAugHidden(augOffer.n)} />}
      {showAugPick && augHidden === augOffer.n && <AugPill tier={augOffer.tier} endsIn={augEnds} onOpen={() => setAugHidden(null)} />}
      {/* 연결이 끊기면 바로 알림 (가격이 멈춘 걸 모르고 기다리지 않게) */}
      {session.mode === 'multi' && (!online || error) && (
        <div className="net-banner" role="alert">
          <Icon name="warn" size={14} /> {online ? '연결이 불안정해요. 다시 연결하는 중…' : '인터넷이 끊겼어요. 연결되면 자동으로 이어져요'}
        </div>
      )}
      {newsBig && !mobile && (
        <Sheet title={<>오늘의 소식</>} onClose={() => setNewsBig(false)} wide>
          {/* 관련 종목·업종을 누르면 그 차트로 가면서 창을 닫음 */}
          <div className="news-big" onClickCapture={(e) => (e.target as Element).closest(".rel-chip, .rb-sec, .linkish-soft") && setTimeout(() => setNewsBig(false), 0)}>
            {/* 넓은 화면은 뉴스와 커뮤니티를 나란히 (크게 보기인데 한쪽씩 바꿔 보면 오른쪽 칸과 다를 게 없었음), 좁으면 예전처럼 하나 */}
            <div className="nb-two">{newsPanelFor('news')}{newsPanelFor('rumor')}</div>
            <div className="nb-one">{newsPanel}</div>
          </div>
        </Sheet>
      )}
      {exitAsk && (
        // 오늘의 도전은 혼자 하는 판 — '대결·기권·상대가 이겨요'는 틀린 안내라 따로
        <Sheet title={view?.room.kind === 'daily' ? '오늘의 도전을 그만둘까요?' : view?.room.kind === 'bot' ? '봇전을 그만둘까요?' : '대결에서 나갈까요?'} onClose={() => setExitAsk(false)}>
          <div className="exit-ask">
            {view?.room.kind === 'daily' ? (
              <p className="muted small">지금 그만두면 <b>오늘 도전은 여기까지</b>예요. 오늘은 다시 할 수 없어요. 실수로 창이 닫히거나 인터넷이 끊긴 경우에는 다시 들어왔을 때 이어서 할지 물어봐요.</p>
            ) : view?.room.kind === 'bot' ? (
              <p className="muted small">지금 그만두면 <b>이 판은 여기서 끝나요</b>. 실수로 창이 닫히거나 인터넷이 끊긴 경우에는 다시 들어왔을 때 이어서 할지 물어봐요.</p>
            ) : (
              <p className="muted small">대결 중에 나가면 <b>기권</b>이에요. 실수로 창이 닫히거나 인터넷이 끊긴 경우에는 다시 들어왔을 때 이어서 할지 물어봐요.</p>
            )}
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
                    setFlash(view?.room.kind === 'daily' ? '오늘의 도전을 그만뒀어요' : view?.room.kind === 'bot' ? '봇전을 그만뒀어요' : '기권했어요. 이번 대결은 끝났어요');
                    onExit();
                  })
                  // 기권 요청이 실패하면 나가지 않고 알려 줌 (기권한 줄 알았는데 대결이 남아 막히지 않게)
                  .catch((e) => showToast(e instanceof Error ? `기권하지 못했어요: ${e.message}` : '기권하지 못했어요. 다시 눌러 주세요', 'err'));
              }}
            >
              <Icon name="door" size={16} /> {view?.room.kind === 'daily' || view?.room.kind === 'bot' ? '그만두고 나가기' : '기권하고 나가기'}
              <small>
                {view?.room.kind === 'daily'
                  ? '그때까지의 수익률로 오늘 기록이 남아요'
                  : players.filter((p) => p.status !== 'left' && !p.bot).length <= 1 && players.some((p) => p.bot)
                  ? '봇만 남으니 이 판은 바로 끝나요. 다시 들어올 수 없어요'
                  : players.filter((p) => p.status !== 'left').length <= 2
                    ? `상대가 바로 이기고, 다시 들어올 수 없어요${room?.ranked ? '. 랭킹전이라 꼴찌로 계산돼요' : ''}`
                    : `나는 꼴찌로 계산되고, 남은 사람들끼리 계속해요. 다시 들어올 수 없어요`}
              </small>
            </button>
          </div>
        </Sheet>
      )}
      {/* 화면 읽기 도구가 알림·속보를 읽어 주는 숨은 칸 (늘 있음) */}
      <ToastAnnouncer news={newsToast} alert={toast} />
      {/* 장중 속보 자리 (편집기에서 따로 옮김) */}
      <ToastSpot
        slot="news"
        toast={newsToast}
        editing={editing}
        pos={layout.toastPos}
        xy={mobile ? layout.mToastXY : layout.toastXY}
        onMove={(xy) => setLayout(mobile ? { mToastXY: xy } : { toastXY: xy })}
        onPick={(sym) => {
          nextNews();
          selectStock(sym);
        }}
      />
      {/* 보통 알림 자리 (샀어요·오류 등) — 처음엔 아래쪽 */}
      <ToastSpot slot="alert" toast={toast} editing={editing} pos="bottom" xy={mobile ? layout.mAlertXY : layout.alertXY} onMove={(xy) => setLayout(mobile ? { mAlertXY: xy } : { alertXY: xy })} onDismiss={nextToast} />
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
          sub={`${room.totalDays}일 · 하루 ${room.turnSeconds % 60 === 0 ? room.turnSeconds / 60 + '분' : room.turnSeconds + '초'} · ${room.preUntil && room.preUntil > now + offset ? '장 열리기 전이에요 · 커뮤니티 글을 보고 준비해요' : '장이 열렸어요'}`}
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
          // 자동으로 넘어가는 시간은 판 설정에 비례: 장 전 시간이 있으면 그 20%, 없으면 하루 시간의 8% (3~8초).
          // 마지막 날은 1분 뒤 결과 화면으로 (결산 팝업에 멈춰 있지 않게)
          autoSec={session.mode === 'multi' ? (closing + 1 >= total ? 60 : closeAutoSec(room?.turnSeconds ?? 60, room?.rulesVersion ?? 1)) : undefined}
          pre={session.mode === 'multi' && closing + 1 < total && !!room?.preUntil && room.preUntil > now + offset}
          held={Object.keys(portfolio.holdings).filter((k) => portfolio.holdings[k].qty > 0)}
          augToday={(augIncome ?? []).filter((x) => x.day >= closing).reduce((a, x) => a + x.amount, 0)}
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
      {detectorPick && view && (
        <Sheet title={<><CardIcon kind="detector" size={18} /> 어떤 소식을 확인할까요?</>} onClose={() => setDetectorPick(false)}>
          <p className="muted small">하나만 골라요. 고른 소식이 진짜인지 가짜인지 알려줘요.</p>
          <ul className="det-pick">
            {/* (v20) 오늘 올라온 커뮤니티·SNS 글 (새 글이 위). 이미 나온 소식에 대한 반응 글(re)은 늘 진짜라 확인할 필요가 없어 뺌 — 카드를 헛되이 쓰지 않게 */}
            {(view.community ?? []).filter((p) => !p.re).sort((a, b) => b.at - a.at).map((p) => (
              <li key={'p' + p.id}>
                <button onClick={() => (setDetectorPick(false), useCard('detector', { pick: p.text }))}>
                  <span className="det-kind">{PLATFORMS[p.platform].name}{p.verified ? ' · 인증' : ''}</span>
                  <span>{p.text}</span>
                </button>
              </li>
            ))}
            {(view.rumors ?? []).map((r) => (
              <li key={'r' + r.text}>
                <button onClick={() => (setDetectorPick(false), useCard('detector', { pick: r.text }))}>
                  <span className="det-kind">장 전 커뮤니티</span>
                  <span>{r.text}</span>
                </button>
              </li>
            ))}
            {/* 화면이 가진 시장 데이터(market)에서 — view.market 은 바뀐 때만 오므로 대결에서는 대개 비어 있음.
                확인할 만한 기사(소문·특징주·단독)를 먼저, 머리말을 함께 보여 줌 */}
            {(market?.news ?? [])
              .filter((n) => n.day === view.room.day)
              .sort((x, y) => Number(!!(y.rumor || y.label === '특징주' || y.label === '단독')) - Number(!!(x.rumor || x.label === '특징주' || x.label === '단독')))
              .map((n) => (
                <li key={'n' + n.headline}>
                  <button onClick={() => (setDetectorPick(false), useCard('detector', { pick: n.headline }))}>
                    <span className="det-kind">{n.rumor ? '소문 기사' : n.label ?? '뉴스'}</span>
                    {/* 머리말은 왼쪽 칸에 이미 있어서 제목 앞 같은 머리말은 뺌 */}
                    <span>{n.label && n.headline.startsWith(`[${n.label}] `) ? n.headline.slice(n.label.length + 3) : n.headline.replace('[루머] ', '')}</span>
                  </button>
                </li>
              ))}
          </ul>
          {!(view.rumors ?? []).length && !(view.community ?? []).some((p) => !p.re) && !(market?.news ?? []).some((n) => n.day === view.room.day) && <p className="muted small">오늘은 확인할 소식이 없어요.</p>}
        </Sheet>
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
      {/* 이모지 반응은 볼 사람(다른 사람)이 있을 때만 — 봇전·혼자 판엔 숨김 */}
      {session.mode === 'multi' && players.some((p) => p.id !== me && !p.bot) && (
        <>
          <ReactionButton
            muted={reactMute}
            onMute={(on) => {
              saveReactMute(on);
              setReactMute(on);
              if (on) setBubbles([]);
            }}
            onSend={(r) => {
              if (reactMute) return; // 끈 동안은 보내기도 못 함
              sendReaction(r);
              pushBubble({ ...r, id: Date.now(), from: me, mine: true });
            }}
          />
          <ReactionBubbles items={bubbles.map((b) => ({ ...b, nickname: players.find((p) => p.id === b.from)?.nickname ?? '' }))} />
        </>
      )}
    {session.tutorial && tutStep < TUTORIAL_STEPS.length && (
        <TutorialGuide
          step={tutStep}
          ctx={tutCtx}
          onNext={() => setTutStep((x) => x + 1)}
          // X(그만하기) = 남은 튜토리얼 단계도 그만
          onExit={() => {
            tutTrack(tutStep >= TUTORIAL_STEPS.length - 1 ? 'done' : 'quit');
            if (currentChapter()) stopTour();
            onExit();
          }}
          onFinish={
            chapter === 'game' && nextChapter() === 'result'
              ? () => {
                  tutTrack('done');
                  markTutorialSeen();
                  finishChapter('game', 'done');
                  showTutorialResult();
                }
              : chapter === 'game'
                ? () => {
                    tutTrack('done');
                    markTutorialSeen();
                    finishChapter('game', 'done');
                    onExit();
                  }
                : undefined
          }
          onOpenCards={() => setCardGuide(true)}
        />
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
          setMusicOn(muted);
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
      <div className={'m-game ui-' + ui + (editing ? ' editing' : '')} style={{ ['--m-top-h' as string]: mTopH + 'px', ['--m-stick-h' as string]: mTopH + mFlowH + 'px', ['--m-nav-h' as string]: mNavH + 'px' }}>
        {editBar}
        {/* 차트 탭은 화면을 차트에 양보하려고 위쪽 시장·일정·재산 줄을 접어 둠 (편집 중에는 펼쳐 둠) */}
        <header className="m-top" ref={mTopRef}>
          {/* ② 내 재산 · 비교 · 장 마감 (+ 아래 얇은 진행 막대) */}
          <div className="m-hero">
            <div className="mh-left">
              <b className="mh-eq">
                <RollNum text={wonShort(equity)} /> <em className={tone(myRet)}>{pct(myRet, 1)}</em>
              </b>
              {!rivals ? (
                // 첫날 아무것도 사기 전엔 '시장보다 -1%' 처럼 이미 진 것처럼 보이지 않게 안내만
                day === 0 && myRet === 0 ? (
                  <span className="mh-cmp">사면 시장(지수)과 비교돼요</span>
                ) : (
                  <span className={'mh-cmp ' + tone(myRet - (idxNow / KR_INDEX_BASE - 1))}>
                    시장보다 {pct(myRet - (idxNow / KR_INDEX_BASE - 1), 1)}
                  </span>
                )
              ) : players.length > 2 ? (
                <button className="mh-cmp btnlike" onClick={() => setRankSheet(true)}>
                  <strong>
                    {myRank}위
                  </strong>
                  <span className="muted">/ {rows.length}명</span>
                  <span className={myRank === 1 ? 'up' : 'down'}>
                    · {tiedFirst ? '공동 선두' : myRank === 1 ? '선두!' : `1위 ${rows[0].band ? bandText(rows[0].band) : pct(rows[0].ret)}`}
                  </span>
                  <i>›</i>
                </button>
              ) : opponent ? (
                <button className="mh-cmp btnlike" onClick={() => setRankSheet(true)}>
                  <span className={tiedFirst ? 'muted' : myRank === 1 ? 'up' : 'down'}>
                    {tiedFirst ? `${josa(opponent.nickname, "과", "와")} 동점이에요` : myRank === 1 ? `${opponent.nickname}보다 앞서요` : `${opponent.nickname}보다 뒤져요`}
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
              <b>{inPre ? endLabel : endedToday ? '마감 취소' : day + 1 >= total ? '마지막 장 마감' : '장 마감'}</b>
              <small>
                {inPre
                  ? freePre ? '준비되면 눌러요' : `장 시작까지 ${mmss2(preLeft)}${preReadyMe ? ` · ${preReadyCount}/${preStaying}` : ''}`
                  : endedToday
                    ? `마감 ${rows.filter((r) => r.ended).length}/${rows.length}${timerText ? ' · ' + timerText : ''}`
                    : timerText
                      ? `${timerText} 남음`
                      : `${day + 1}일차${unlimitedDay ? ' · 시간 무제한' : ''}`}
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
          {/* 오늘의 도전은 연습 판과 똑같아 보여 어떤 판인지 몰랐음 (PC 는 재산 옆에 표시) → 판 이름과 오늘의 시장 */}
          {room?.kind === 'daily' && (
            <div className="m-kind-tag">
              <Icon name="daily" size={13} /> 오늘의 도전{room.theme && THEMES.find((t) => t.id === room.theme) ? ` · ${THEMES.find((t) => t.id === room.theme)!.name}` : ''}
            </div>
          )}
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

        {/* 태블릿: '종목'은 목록+차트 나란히, '차트'는 차트를 넓게 (두 탭이 같은 화면이 되지 않게) */}
        <main className={'m-page p-' + tab + (tablet && tab === 'list' ? ' split' : '')}>
          {tablet && tab === 'list' ? (
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
          {tab === 'news' &&
            (session.tutorial ? (
              <>
                {effectsOnMe.map((t, i) => (
                  <div key={i} className="effect-banner">
                    {t}
                  </div>
                ))}
                {phoneFor('inline')}
                {cardTray(() => setTab('cards'))}
              </>
            ) : (
              <div className="ap-layer">{phoneFor('full', () => setTab(lastTab.current))}</div>
            ))}
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
            {/* 가진 주식이 없을 때: 꺼 두기만 하면 휴대폰에서는 눌러도 반응이 없어 까닭을 몰랐음 → 흐리게 두고 누르면 짧게 알림 */}
            <button
              className={'btn sell' + (tradeState.allowed && held === 0 ? ' is-off' : '')}
              disabled={!tradeState.allowed}
              aria-disabled={held === 0 || undefined}
              onClick={() => (held === 0 ? showToast('아직 갖고 있는 주식이 없어요. 먼저 사야 팔 수 있어요', 'warn') : setSheet('sell'))}
            >
              {easy ? '팔기' : '매도'}
            </button>
            <button className="btn buy" disabled={!tradeState.allowed} onClick={() => setSheet('buy')}>
              {easy ? '사기' : '매수'}
            </button>
          </div>
        )}

        <nav
          className="bottom-nav five"
          ref={mNavRef}
          onPointerDown={(e) => {
            if (editing) return;
            const sw = { y: e.clientY, done: false };
            navSwipe.current = sw;
            // 손가락·마우스가 메뉴 밖으로 올라가도 따라가게 창 전체에서 봄
            const move = (ev: PointerEvent) => {
              if (!sw.done && sw.y - ev.clientY > 36) {
                sw.done = true;
                setTab('news');
              }
            };
            const end = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', end);
              window.removeEventListener('pointercancel', end);
              // 메뉴 밖에서 손을 떼면 누름이 안 생김 — 다음 누름을 막지 않게 비움
              setTimeout(() => navSwipe.current === sw && (navSwipe.current = null), 0);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end);
            window.addEventListener('pointercancel', end);
          }}
          onClickCapture={(e) => {
            if (navSwipe.current?.done) {
              e.stopPropagation();
              e.preventDefault();
            }
            navSwipe.current = null;
          }}
        >
          {layout.mTabs.map((t, i) => (
            <button key={t} data-tab={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              <span>
                <Icon name={TAB_ICON[t]} size={22} />
              </span>
              {t === 'assets' ? (easy ? '내 재산' : '자산') : t === 'cards' && augMode ? '증강' : TAB_LABEL[t]}
              {t === 'news' && tab !== 'news' && phoneBadge > 0 && <i className="nav-count hot">{phoneBadge > 99 ? '99+' : phoneBadge}</i>}
              {t === 'cards' && !augMode && view.myItems.total > 0 && <i className="nav-count">{view.myItems.total}</i>}
              {t === 'cards' && augMode && view.aug?.offer && <i className="nav-dot gold" />}
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
          <p className="muted small sheet-note">핀을 누르면 위에 계속 보여요 (최대 3개). 고정하지 않은 칸은 지수 → 지수, 금리 → 금리처럼 같은 종류끼리 4초마다 바뀌어요.</p>
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
        {/* 오늘 장 남은 시간 막대 (한눈에 보이는 위 가장자리) — 마지막 20%는 호박색, 깜빡임 없이 */}
        {remaining !== null && daySecs > 0 && !inPre && closing === null && (
          <div className={'hud-time' + (remaining <= daySecs * 0.2 ? ' low' : '')} role="progressbar" aria-label="오늘 장 남은 시간" aria-valuemin={0} aria-valuemax={daySecs} aria-valuenow={Math.round(remaining)}>
            <i style={{ width: `${Math.max(0, Math.min(1, remaining / daySecs)) * 100}%` }} />
          </div>
        )}
      </header>

      <section className="score desk-score">
        {rivals && players.length > 2 ? (
          <RankStrip rows={rows} />
        ) : (
        <div className="vs-box">
          <PlayerPic r={{ me: true, nickname: session.nickname, avatar: players.find((x) => x.id === session.playerId)?.avatar }} size={40} />
          <div className="score-me">
            <small>{session.nickname} (나)</small>
            <b>
              <RollNum text={wonShort(equity)} />
            </b>
            <span className={tone(myRet)}>{pct(myRet)}</span>
          </div>
          {rivals ? (
            <>
              <div className="tug-wrap">
                <span className={'tug-lead ' + (opponent?.status === 'left' || tiedFirst ? 'muted' : myRank === 1 ? 'up' : 'down')}>
                  {opponent?.status === 'left' ? '상대가 기권했어요' : tiedFirst ? '동점이에요' : myRank === 1 ? '내가 앞서요' : '상대가 앞서요'}
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
            <div className="score-solo muted">{room?.kind === 'daily' ? `오늘의 도전${room.theme && THEMES.find((t) => t.id === room.theme) ? ' · ' + THEMES.find((t) => t.id === room.theme)!.name : ''}` : '연습 모드'}</div>
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
          title={inPre ? (freePre ? '누르면 오늘 장이 열려요' : '모두 준비 완료를 누르면 장이 바로 열려요') : endedToday ? '다음 날로 넘어가기 전까지 취소할 수 있어요' : '오늘 거래를 끝내고 마감해요'}
        >
          <span className="et-main">{endLabel}</span>
          <small className="et-sub">
            {inPre
              ? freePre ? '시간 제한 없음 · 준비되면 눌러요' : `장 시작까지 ${mmss2(preLeft)}${preReadyMe ? ` · ${preReadyCount}/${preStaying}명` : ''}`
              : endedToday
                ? `마감 ${rows.filter((r) => r.ended).length}/${rows.length}명${timerText ? ' · ' + timerText : ''}`
                : timerText
                  ? `${timerText} 남음`
                  : `${day + 1}일차${unlimitedDay ? ' · 시간 무제한' : ''}`}
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
                onCantSell={() => showToast('아직 갖고 있는 주식이 없어요. 먼저 사야 팔 수 있어요', 'warn')}
              />
            </section>
          ) : id === 'news' ? (
            <section className="pane p-news p-phone">
              {effectsOnMe.map((t, k) => (
                <div key={k} className="effect-banner">
                  {t}
                </div>
              ))}
              {phoneFor('framed')}
            </section>
          ) : (
            <section className="pane p-cards">
              {cardTray(() => setDrawer('cards'))}
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
      <Drawer open={drawer === 'cards'} title={augMode ? '내 증강' : '찬스 카드 · 상점'} onClose={() => setDrawer(null)}>
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
      <p className="muted small">연결이 느려요. 결과는 '업적' 화면에 남아요.</p>
      <button className="btn" onClick={onExit}>
        홈으로
      </button>
    </>
  );
}

/** 하루 마감 결산 팝업이 저절로 넘어가는 시간(초): 장 전 시간의 20% (v7+), 없으면 하루 시간의 8% — 3~8초 */
function closeAutoSec(turnSeconds: number, version: number) {
  const base = version >= PREMARKET_VERSION ? preSeconds(turnSeconds) * 0.2 : turnSeconds * 0.08;
  // 손익·지수·많이 오른·내린 종목을 읽을 시간 (5초 넘으면 '잠깐 더 보기'로 멈출 수 있음)
  return Math.max(5, Math.min(8, Math.round(base)));
}
