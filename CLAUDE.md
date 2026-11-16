# 개미리그 (예전 이름 '주식 대결') — 작업 인수인계

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
npm run vercel -- setpublic VITE_이름 값       # 공개돼도 되는 화면용 환경변수만 설정 (비밀 키 금지), 다음 배포부터 적용
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
`007_presence_privacy.sql`(players.left_game/last_seen, rooms.rev 방 변경 신호·players 읽기 권한/Realtime 회수, 비밀번호 방 기준 실패 횟수, 닉네임 유니크) · `008_rejoin_rematch.sql`(players.rejoin_hash, rooms.next_code) · `009_forget_keep_games.sql`(계정 삭제 시 자리는 남김, user_id on delete set null) · `010_room_ops.sql`(kick_player·host_leave DB 함수, 서버만) · `011_market_salt.sql`(room_secrets.salt, v4 시장 비밀값) · `012_guest_log.sql`(손님 계정 생성 기록, IP 해시) · `013_feedback.sql`(의견 보내기) · `014`~`016`(의견 읽음·회원·매칭) · `017_match_safety.sql`(대기표 claimed_at·matched_at, `apply_rating` 원자적 점수 함수) — 적용 완료.
새 마이그레이션은 파일을 만들고(여러 번 실행해도 안전하게) **승인 없이** `npm run db -- apply` 로 직접 적용한 뒤 보고 (사용자 지시, 2026-11-16). 배포(main 푸시)도 검수 통과 후 직접.
서버는 마이그레이션 전에도 죽지 않게(없는 테이블이면 빈 목록 등) 방어적으로 작성.

## 배포
Vercel (사용자가 GitHub 저장소를 연결해 배포). 환경변수 3개는 Vercel 프로젝트에 등록돼 있음.
main 에 푸시하면 자동 배포되는지는 Vercel 대시보드에서 확인 필요.

## 지금 게임에 있는 것
턴제(전원 장 마감 or 제한시간 1·3·5·10분, 1대1은 한 명 마감 시 90초 / 3인 이상은 ⅔ 마감 시 30초 카운트다운, 넘어가기 전까지 마감 취소 가능, 마감 현황 표시) · 국내 29 + 미국 8 + ETF 10 종목 · 금리/미금리/환율/유가 · 뉴스 연쇄(연관 업종·종목 칩) · 기사 머리말([속보]·[단독]·[시황]·[특징주]) · 표시 없는 가짜 기사(가격 영향 없음, `decorateNews` 는 가격과 다른 난수 사용) · 루머 감별기는 오늘 뉴스 전부 판정 · 상·하한가 · 지정가 주문 · 배당 · 이벤트 데이(연준·금통위·실적·옵션만기·배당) · 찬스 카드 12종(정보·방해·방어·보너스, 대상 선택) · 최대 6인 · 방 목록·비밀방 · 순위표 · 하이라이트 리플레이 · 업적/칭호 · 초보/일반 모드 · 인터랙티브 차트(라인/캔들/바, 확대·이동, 이평·볼린저, 선 긋기) · 이모지 반응 · 효과음 · 화면별 URL(뒤로가기) · 튜토리얼(/tutorial, 연습봇) · 카드 도감 · 기업 도감(/companies) · PC 배치 편집(끌면 실시간 미리보기·크기 조절·속보 알림 자유 위치) · 게임 중 기권/잠깐 나가기 · 다른 기기 이어하기 코드(방코드-10자리) · 한 판 더(같은 사람들과) · 대기실 내보내기·방장 넘기기 · 연결 끊김 안내 · 화면 오류 안전장치(ErrorBoundary)

## 밸런스·규칙 버전
- `room_secrets.rules_version`: 1(예전) · 2(공급망·시총 가중) · 3(밸런스) · 4(v3 + 방마다 128비트 비밀값 salt 로 모든 난수 sfc32, 레버리지 30% 제한) · **5(현재) = v4 + 뉴스와 상관없는 갭은 장중 절반 되돌림(갭 메우기)**. 32비트 시드는 첫날 공개 정보(금리·환율·뉴스)로 역산 가능했음 → salt 는 room_secrets 에만, 화면 데이터(sliceMarket·View)에 절대 넣지 않음. 튜토리얼은 정해진 장면이 필요해 v3. 진행 중인 방은 만든 버전 그대로 — 버전별 분기는 전용 난수(rng2/rng3)만 써서 예전 버전 가격이 절대 안 바뀌게
- v3: 시가·장중 잡음 분리(갭 방향 ≠ 그날 방향), 아침 뉴스는 시가에 80~95% 반영, 장중 속보 종목은 가격 생성 전에 정해 속보 전엔 거의 안 움직이고 속보 순간 크게 뜀(`intraday` warp jump), 무료 카드 모두 동일·거울 제외, 같은 날 한 사람에게 두 번째 방해는 무효(crowded)
- 시뮬레이터: `sim/` (`node sim/build.mjs sim/run.ts && node sim/.out/run.mjs news duel multi cards --n=0.3`). 규칙·가격 바꾸면 다시 돌려 확인
- 시장 키(marketKey)는 서버 비밀값 HMAC(keySalt)으로만 섞음 — 시드 등 비밀은 화면에 보이는 어떤 해시에도 넣지 않기
- 기권(left_game)한 사람은 거래·마감 취소 불가. 자리 비움은 바로 건너뛰지 않고 카운트다운 기준에서만 빠짐
- 익명 로그인이 IP 당 제한(429)에 걸리면 서버 손님 계정(`action:'guest'`, 관리자 API로 가짜 이메일 계정 → 비밀번호 로그인)으로 대체. 같은 IP 시간당 60·전체 3000 (guest_log)
- v4 규칙: 레버리지·인버스 ETF(lev≠1)는 합쳐서 총재산의 30%까지만 살 수 있음(`LEVERAGE_CAP`, `leveragedCap`) — 다인전에서 몰빵 한 방이 이기던 문제 (시뮬 4인 41%→29%)
- 운영자·개인정보 보호 책임자: Vercel 환경변수 `VITE_OPERATOR_CONTACT` = "이준엽 · kiaman0700@naver.com" (사용자가 공개 동의, 2026-11-16) → 개인정보 안내에 표시
- 운영자: 운영자 계정 = 회원 아이디 kiaman0700 (사용자 요청, 2026-11-16). 운영자는 일반 회원 로그인 후 위 메뉴(모바일은 위 머리줄)에 고정된 '의견함' 버튼 + 안 읽은 수(`adminUnread`, 30초마다). **화면·API 로 운영자를 만들거나 지정하는 방법은 없음**(adminSignup·ADMIN_SETUP_CODE·ADMIN_EMAILS 모두 제거, Vercel 설정도 삭제). 지정/해제는 이 컴퓨터에서만 `npm run db -- set-admin|unset-admin <아이디>`, 목록 `npm run db -- admins` — 사용자가 따로 말하지 않으면 쓰지 말 것
- 방해 카드: 한 사람에게 하루 한 번 (막힘·반사 포함, 반사로 맞은 사람도). 두 번째는 서버가 거절하고 카드는 그대로. 모든 방해 알림은 익명(쓴 사람·상대 방어 카드 종류 숨김)
- 점수판: 상대는 순위 + 수익률 구간(2%p, `band`)만. 정확한 재산은 나와 끝난 게임만
- 회원(015): 아이디·비밀번호·닉네임(이메일 X, 만 14세 이상). 가입 = 지금 게스트 계정을 정식 계정으로 전환(같은 user id → 기록 유지, 가입·비번 변경 후엔 다시 로그인 필요). 로그인 주소는 아이디와 무관한 무작위 `u_<hex>@u.stockduel.invalid`(예전 가입자는 `아이디@…`) — 화면은 로그인 전에 서버 `loginEmail`(인증 없음, 없는 아이디도 HMAC 가짜 주소)로 주소를 받아 로그인 → 아이디 선점·존재 확인 불가. 가입은 프로필을 먼저 넣어 아이디·닉네임 예약 후 계정 전환(실패 시 되돌림). 비밀번호 바꾸기·복구 코드 새로 받기는 지금 비밀번호 필요(`verifyPassword`, 확인용 세션은 바로 끝냄). 복구 코드로 비밀번호 찾기. 게스트로 하다 기존 계정 로그인 → 게스트 기록 가져오기/버리기 선택(`guestSummary`·`mergeGuest`, 안 가져온 진행·대기 자리는 `leaveSeat` 로 기권·퇴장). `api/_lib/accounts.ts`. 화면: /login, /me(마이프로필, 홈에서만), /ranking. 회원은 게임 닉네임을 서버가 프로필 닉네임으로 강제, 이름 옆 회원 표시(`verified`)
- 랭크 티어(022, `src/game/tier.ts`, 화면 `TierBadge`): 랭킹전 2판은 배치 — 점수 숨김(화면에 '배치 n/2'), 점수 변화 ×2.5(`PLACEMENT_MULT`), 랭킹 목록·순위에 안 나옴(`ranked_games >= 2` 만). 배치 뒤 티어: 브론즈(~999)·실버(1000)·골드(1150)·플래티넘(1300)·다이아몬드(1450) 각 III·II·I(50점씩), 1600+ 마스터. 친구·파티 목록도 티어로 표시. 점수 반영은 `apply_rating2`(ranked_games +1)
- 랭킹: Elo(시작 1000, K=32/(회원 수−1)), 회원끼리만 점수 변화 — `recordMatch`(match_players 기본키로 한 번만, 점수는 `apply_rating` RPC). 랭킹전에서 기권한 사람은 꼴찌. 같은 상대와 여러 번 만나도 점수는 매번 똑같이(같은 상대 제한 규칙은 사용자 요청으로 없앰, 2026-11-16). 매칭 방은 '한 판 더' 불가(다시 찾기)
- 매칭(016): 홈 '대결 찾기' = 랭킹전(회원만)/일반전 × 1대1/다인전(4명 바로, 3명은 40초 대기 후) × 신속(10일×60초≈10분)/일반(20일×90초≈20~30분). 실력 범위 ±100에서 10초마다 +50. 대기표 match_tickets, 1.5초마다 queueStatus 때 서버가 묶어 방을 만들고 바로 시작(`src/engine/matching.ts` pickGroup — 다인전은 고른 사람끼리 모두 서로 범위 안, 랭킹전 범위 최대 ±400). 무리 중 가장 먼저 온 사람의 확인 때만 방을 만듦(동시 잡기 방지), 10초 응답 없으면 대기표 삭제(창 닫으면 pagehide keepalive 로 queueLeave), 15초 넘게 잡힌 채면 풀어 줌, 실패하면 반쯤 만든 방 삭제, 매칭 결과는 2분간 다시 받을 수 있음. 대기실·진행 중 자리가 있으면 매칭 불가 랭킹 점수는 매칭 랭킹전(rooms.ranked)에서만. 친구 '방 만들기'는 커스텀(점수 없음)
- 이용자 의견: `npm run db -- feedback` 으로 읽기
- e2e 계정은 `scripts/e2e/.accounts.json` 에 저장해 재사용 (익명 계정 생성이 IP 당 시간 제한, 손님 계정도 서버 메모리 10분 20개·DB 시간당 60개). `injection.mjs` = 모든 입력에 스크립트·SQL·필터·제어문자·이상한 JSON·CSRF·가짜 토큰 주입 점검
- 상대 재산은 화면 데이터에서 10만원 단위·오늘 거래 횟수 숨김(보유 역산 방지). 자리 비움 = 90초 응답 없음(AWAY_MS), 나감(기권) = left_game. 남은 사람 기준으로 마감·카운트다운

## 알아둘 것
- 실시간 장: `src/game/intraday.ts` (5초 칸, 일별 가격과 다른 난수) · 엔진 `dayClock`(장 시작 = day_deadline − 제한 시간) · 화면 데이터 `View.live` 는 지금 칸까지만 · 화면은 `src/game/live.ts` 의 `withLive` 로 오늘 막대에 합침 · 장중 속보 `NewsEvent.at` 는 공개 칸 전엔 화면 데이터에 없음 · 예약 주문은 상태 요청 때마다 지금 칸까지 체결(`resolveOrders(d, day, 칸, final)`)
- 화면 모드: 초보/일반/커스텀. 커스텀 설정은 `src/prefs.ts`(이 기기 localStorage, `effective()` 로 적용값). 화면 편집 = `/customize`(저장 안 되는 가상 게임 `makeDemo`) 또는 게임 중 조절 버튼 → `EditSlot` 으로 순서·보이기
- 금액 표시는 `won()`(=`wonShort`) 하나로: 초보 만원(끝자리까지) · 일반 원, 커스텀에서 변경
- 아이콘은 이모지 대신 `src/components/Icon.tsx`(Lucide). 업종 `SectorIcon`, 카드 `CardIcon`, 업적 `BadgeIcon`
- 로비 = 게임 클라이언트식 틀(PC 우선, 사용자 요청 '롤 같은 느낌' — 다른 게임 그림·로고는 쓰지 않고 구성만 참고): 861px 이상 위 메뉴바(`ClientChrome.tsx` TopBar: 로고·플레이 버튼·메뉴·계정) + 오른쪽 소셜 패널(SocialPanel: 파티 칸·친구 게임중/접속중/오프라인·1대1/파티 바로가기, 1280px 이상 늘 보임, 그 아래는 친구 버튼으로 여닫음). 860px 이하 위 머리줄 + 아래 탭바 5칸(`LobbyNav.tsx`). 스타일 `styles-client.css`(금색 깎은 버튼·모드 카드·차트 무늬). 주소: `/ranked` `/casual` `/custom` `/learn`(연습 메뉴 — `/practice` 는 혼자 연습 게임) `/more`(설정·더보기) `/ranking` `/records` `/companies` `/rooms` `/create` `/login` `/signup` `/me`. `/` 는 마지막에 고른 대결 메뉴(`stockduel.tab`, 처음엔 일반전). 스타일 `styles-nav.css`(맨 마지막)
- 닉네임 칸은 로비에 없음: 회원=프로필 닉네임, 게스트는 온라인 기능을 처음 누를 때 `useGuestGate` 안내(게스트/회원 비교 → 게스트로 시작 때만 닉네임). 게스트 닉네임은 회원 닉네임과 같을 수 없음(서버 `nickFor`, 대소문자 무시). 설계서 `design/lobby-nav-friends.md` (②~④ 모두 완료)
- 친구(018, `api/_lib/social.ts`, 화면 `src/screens/Friends.tsx`, 주소 `/friends`): 회원만, 정확한 닉네임으로 신청(대소문자 무시·와일드카드 무력화), 수락·거절·끊기·차단(상대는 모름 — 차단당한 사람 신청은 겉으로 '대기 중')·차단 풀기, 친구에게만 접속 상태(profiles.last_seen 2분, 게임 중). 화면 id 는 관계 줄 id(user id 아님). 메뉴 배지 = 받은 신청 수(30초마다). 테스트 `scripts/e2e/social.mjs`(테스트 회원은 `.members.json` 에 두고 재사용)
- 친구·파티 안전장치(021): 거절한 친구 신청은 'declined' 로 숨김(보낸 사람에겐 7일 '대기 중'), 파티 들어가기는 `join_party` DB 함수(잠금, 2명), 친구 끊기·차단 시 서로 초대 취소·같은 파티 해산(`cutTies`), 초대 수락 때 친구인지 다시 확인·매칭 대기 정리, 파티로 찾기 전 파티원 75초 안 접속 확인, 방 만드는 중(claim)인 파티 표는 지우지 않음, 기권한 1대1 로 다시 끌려가지 않음(3분·left_game·sessionStorage), 비밀방 초대는 방장만. 읽기만 하는 확인 요청(state·queueStatus·party·invites 등)은 90/20초 따로
- 한 사람은 한 방에만(`ensureFree`): 새 방 만들기·입장·초대 수락·이어하기 때 다른 대기실은 자동으로 나오고, 진행 중 대결(기권 안 함)이 있으면 막음. e2e `lib.mjs user()` 는 시작할 때 남은 방에서 나옴
- 모바일 게임 상단: 내 재산·장 마감·진행 막대만 위에 고정, 시장·일정·재산 줄(`m-top-flow`)은 내용과 함께 스크롤(스크롤로 접혔다 펴지는 움직임 없앰 — 사용자 요청). 차트 탭에서는 그 줄 숨김
- 메뉴 이름: '업적'(예전 기록·업적, 주소 /records), '기업 공부'(예전 기업 도감, /companies: 기업 살펴보기·투자 기초 10가지(`Study.tsx`, 업종 예시는 게임 데이터에서)·퀴즈 5문제(게임 데이터로 생성))
- 장중 차트도 ProChart(라인·캔들·바·지표·선 긋기·크게 보기): 5초 가격을 5초/30초/1분 봉으로 묶음(`intradayBars`, `unit` prop), 기본 간격은 봉 10개 이상 나오는 가장 넓은 것
- 방 만들기 제한: 1시간에 '내가 만든' 커스텀 방 10개(`roomsMadeSince`, 매칭 자리는 안 셈) + 서버 메모리 15개. 초대·파티 부르기·1대1 신청은 거절당해도 다시 보낼 수 있음(화면 5초 '보냄' 뒤 '다시 초대')
- 친구 초대(019 invites, server.ts `inviteAct`): 대기실 '친구 초대'(대기 중인 커스텀 방, 5분, 비밀방도 비번 없이, 한 번만) · 친구 목록 '1대1'(신속, 메뉴에서 일반) → 90초 안에 수락하면 둘이 바로 시작하는 `kind='friend'` 방(점수 없음, 끝나면 한 판 더 가능). 받은 초대·내 신청 결과는 로비 `InviteCenter` 가 6초마다 확인해 팝업. 차단 관계면 겉으로만 성공. 응답엔 닉네임·방 제목만
- 일반전 파티(020, server.ts `partyAct`, 화면 `PartyPanel`): 회원 2명까지, 친구를 '파티에 부르기'(2분 초대) → 파티장만 '일반전 찾기'(다인전만) → 파티원 모두 대기표가 같은 party_id 로 생기고 파티원 화면도 자동으로 찾는 중. 매칭은 파티를 한 덩어리로(`pickGroup` units): 파티가 낀 판은 4명(2+2/2+1+1)이 기본, 1분 30초(`PARTY_WAIT_FOR_3`) 넘게 못 모이면 3명(2+1)도. 혼자끼리 3명 판은 40초. 파티원 표가 하나라도 끊기면 파티 대기 전체 취소. 랭킹전·1대1 은 파티 불가. 랭킹전에서도 친구·같은 상대끼리 얼마든지 만남(사용자 요청 — 사람이 적을 때 대기 줄이기). 같은 상대 점수 제한 없음, 기권 꼴찌. 같은 IP 분리는 안 함
- 재입장(배그식): 로비에 '이어하기' 카드 없음. 직접 나가면(대결=기권, 연습=그만두기·저장 삭제) 끝. 창 닫힘·끊김·뒤로가기로 빠졌으면 로비에 들어올 때 `Reconnect` 팝업(다시 입장/기권, 대기실로/나가기, 연습 이어하기/그만두기). 게임 안 나가기 시트 = 계속하기 / 기권 / 다른 기기로 옮기기 코드
- 매칭 대기: `queueCounts`(대기열별 인원·예상 대기·접속 수, 숫자만) · 예상 대기 `estimateWaitSec`(같은 대기열 범위 안/밖 인원, 최근 1시간 매칭 인원, 접속 수) · 25초 넘게 기다리면 사람이 기다리는 다른 대기열로 바꾸기 제안, 다인전 45초면 1대1 제안 · 랭킹전 범위는 처음 2분 ±400, 그 뒤 풀림(`rankedMax`)
- 뉴스의 `fake`/진실은 서버에만. 화면 데이터는 `publicNews` 를 거쳐 오늘 뉴스는 감별기 쓴 사람에게만 `verdict`, 지난 뉴스는 가짜·루머에 `verdict`
- 반응(이모지) broadcast 채널은 방 ID 를 알면 들어올 수 있음 → 받는 쪽에서 정해진 목록만 표시
- 요청 제한은 서버 인스턴스 메모리 기준(완벽한 전역 제한은 아님)
- Windows 는 국기 이모지를 글자(KR/US)로 표시함 → 화면엔 💵·🏛️ 같은 일반 아이콘 선호
