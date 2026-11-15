# 주식 대결 — 작업 인수인계

여럿(2~6명)이 같은 가상 주식시장에서 겨루는 턴제 웹 게임. 한국어 UI.
배포: https://game-taupe-three-58.vercel.app · 저장소: github.com/kiaman0700/game

## 사용자에 대해
- 한국어로 대화. 주식 초보도 쓸 수 있게 쉬운 말 + 깔끔한(토스 느낌) UI를 원함
- **보안을 매우 중요하게 여김** — 새 기능마다 서버 검증·정보 노출 여부를 먼저 생각할 것
- 모바일과 PC를 각각 그 기기에 맞게 따로 설계 (같은 게임을 함께 플레이)
- 브라우저 화면을 직접 눌러보며 피드백을 줌. 변경 후엔 실제 화면으로 확인할 것

## 명령어
```bash
npm run dev      # http://localhost:5173 (+ /api/game 서버 함수도 같이 뜸)
npm test         # 단위 테스트 (엔진·보안 규칙)
npm run build    # 타입체크 + 빌드
npm run e2e      # 실제 서버를 익명 계정 여러 개로 테스트 (dev 서버 켜져 있어야 함)
BASE=https://game-taupe-three-58.vercel.app npm run e2e   # 배포본 테스트
npm run db -- check                         # Supabase 연결·마이그레이션 상태 (읽기만)
npm run db -- apply supabase/00X_이름.sql     # SQL 적용 (한 트랜잭션). 적용 전 사용자에게 내용 보여주고 확인받기
npm run vercel -- status | logs | env | runtime   # Vercel 배포 상태·빌드 로그·환경변수 이름·서버 오류
```
- DB 는 `.env.local` 의 `SUPABASE_DB_URL`(Session pooler 주소 — 직접 주소는 IPv6 라 이 네트워크에서 안 됨)
- Vercel 은 `.env.local` 의 `VERCEL_TOKEN`(팀 토큰) + `.vercel/project.json`. Vercel CLI 는 한글 컴퓨터 이름·팀 토큰 때문에 안 돼서 API 를 직접 씀. 배포는 main 푸시로 자동
`.env.local` 이 필요 (git 에 안 올라감): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(publishable, 공개돼도 됨), `SUPABASE_SECRET_KEY`(서버 전용, 절대 VITE_ 접두사 금지·공유 금지), `SUPABASE_DB_URL`·`VERCEL_TOKEN`(도구용, 절대 출력·공유 금지).

## 스킬 (`.claude/skills/`)
- 새 기능·규칙·화면 구조 변경 → 먼저 `game-feature-spec` (설계서 → 사용자 승인 → 코드)
- 구현은 `test-driven-development` (엔진 규칙부터 테스트), 버그는 `systematic-debugging` (원인 먼저)
- "됐다"고 말하기 전·커밋 전 → `game-self-check` (테스트·빌드·e2e·브라우저 3가지 크기), 원칙은 `verification-before-completion`
- 라이브러리 사용법이 불확실하면 `library-docs` (Context7)

## 구조
```
브라우저 ──익명 로그인 토큰──▶ api/game.ts (Vercel 함수) ──비밀 키──▶ Supabase
   └─ Realtime(내 방 rooms/players 변경 알림만) ─ 받으면 /api/game state 다시 요청
```
- `src/engine/engine.ts` — **게임 규칙의 단일 진실.** 모든 행동 검증(validate*), 화면 데이터(buildView), 날 넘기기, 지정가 체결, 결과. 서버와 연습 모드가 같은 코드를 씀
- `src/engine/local.ts` — 연습 모드(혼자): 같은 엔진을 브라우저에서 돌리고 localStorage 저장
- `api/_lib/server.ts` — 인증·요청 제한·DB 입출력·액션 라우팅. `api/game.ts` 는 Vercel 진입점
- `src/game/` — 시장 생성(market: 결정적 시드), 종목·업종·ETF(stocks), 뉴스 문구(news), 카드(items), 포트폴리오·배당(portfolio), 업적(achievements)
- `src/screens/GameController.tsx` — 게임 화면. `mobile` 이면 모바일 레이아웃, 아니면 PC(`.desk`)
- `src/components/` — ProChart(인터랙티브 차트), StockBrowser, StockDetail(+TradePanel), Panels(뉴스·자산·카드·결산·튜토리얼), Board(순위·시장 티커·일정 띠), Desk(PC 재산 요약·타임라인·카드 트레이·서랍), Extras(일정·예약주문·바텀시트·useIsMobile)
- 스타일: `styles.css` → `styles-extra` → `styles-v4` → `styles-desk` → `styles-multi` → `styles-chart` 순서로 덧씌움
- 공유 모듈(src/game, src/engine, src/lib/rng)은 서버도 import 하므로 **상대 import 에 `.js` 확장자**를 붙임

## 보안 규칙 (깨면 안 됨)
- 브라우저는 DB에 쓰지 못함(RLS + 권한 회수). 모든 쓰기는 `/api/game` 이 검증 후 수행
- 가격·카드 비용·배당은 **서버가 계산**. 클라이언트가 보낸 값은 무시
- 시드는 `room_secrets` 에만. 화면 데이터에는 오늘 시가까지만, 오늘 종가·장중 흐름·미래·루머 진실·상대 거래/카드/주문은 넣지 않음 (`sliceMarket`, `buildView`)
- 비밀방 비밀번호는 scrypt 해시만 저장, 시도 제한. 방 목록에 코드·비밀번호 노출 금지
- 새 기능을 넣으면 `src/engine/*.test.ts` 에 "정보가 새지 않는다" 테스트를 함께 추가
- 보안 헤더·CSP 는 `vercel.json`. 새 외부 도메인을 쓰면 CSP 도 갱신

## DB (Supabase)
`supabase/schema.sql` = 전체 스키마(초기화용, 데이터 삭제됨). 추가 변경은 번호 붙인 파일로:
`002_orders.sql`(지정가) · `003_rooms.sql`(인원·제목·비밀방) · `004_cards.sql`(새 카드) — 적용 완료.
`005_turn_times.sql`(제한 시간 1·3·5·10분, `day_deadline`) · `006_rules_version.sql`(room_secrets.rules_version, 새 방=2) — 적용 완료.
새 마이그레이션은 파일을 만들고(여러 번 실행해도 안전하게) **승인 없이** `npm run db -- apply` 로 직접 적용한 뒤 보고 (사용자 지시, 2026-11-16). 배포(main 푸시)도 검수 통과 후 직접.
서버는 마이그레이션 전에도 죽지 않게(없는 테이블이면 빈 목록 등) 방어적으로 작성.

## 배포
Vercel (사용자가 GitHub 저장소를 연결해 배포). 환경변수 3개는 Vercel 프로젝트에 등록돼 있음.
main 에 푸시하면 자동 배포되는지는 Vercel 대시보드에서 확인 필요.

## 지금 게임에 있는 것
턴제(전원 장 마감 or 제한시간 1·3·5·10분, 1대1은 한 명 마감 시 90초 / 3인 이상은 ⅔ 마감 시 30초 카운트다운, 넘어가기 전까지 마감 취소 가능, 마감 현황 표시) · 국내 29 + 미국 8 + ETF 10 종목 · 금리/미금리/환율/유가 · 뉴스 연쇄(연관 업종·종목 칩) · 기사 머리말([속보]·[단독]·[시황]·[특징주]) · 표시 없는 가짜 기사(가격 영향 없음, `decorateNews` 는 가격과 다른 난수 사용) · 루머 감별기는 오늘 뉴스 전부 판정 · 상·하한가 · 지정가 주문 · 배당 · 이벤트 데이(연준·금통위·실적·옵션만기·배당) · 찬스 카드 12종(정보·방해·방어·보너스, 대상 선택) · 최대 6인 · 방 목록·비밀방 · 순위표 · 하이라이트 리플레이 · 업적/칭호 · 초보/일반 모드 · 인터랙티브 차트(라인/캔들/바, 확대·이동, 이평·볼린저, 선 긋기) · 이모지 반응 · 효과음 · 화면별 URL(뒤로가기)

## 알아둘 것
- 실시간 장: `src/game/intraday.ts` (5초 칸, 일별 가격과 다른 난수) · 엔진 `dayClock`(장 시작 = day_deadline − 제한 시간) · 화면 데이터 `View.live` 는 지금 칸까지만 · 화면은 `src/game/live.ts` 의 `withLive` 로 오늘 막대에 합침 · 장중 속보 `NewsEvent.at` 는 공개 칸 전엔 화면 데이터에 없음 · 예약 주문은 상태 요청 때마다 지금 칸까지 체결(`resolveOrders(d, day, 칸, final)`)
- 로비 주소: `/`(홈) · `/rooms`(방 찾기) · `/create`(방 만들기) · `/records`(기록·업적)
- 뉴스의 `fake`/진실은 서버에만. 화면 데이터는 `publicNews` 를 거쳐 오늘 뉴스는 감별기 쓴 사람에게만 `verdict`, 지난 뉴스는 가짜·루머에 `verdict`
- 반응(이모지) broadcast 채널은 방 ID 를 알면 들어올 수 있음 → 받는 쪽에서 정해진 목록만 표시
- 요청 제한은 서버 인스턴스 메모리 기준(완벽한 전역 제한은 아님)
- Windows 는 국기 이모지를 글자(KR/US)로 표시함 → 화면엔 💵·🏛️ 같은 일반 아이콘 선호
