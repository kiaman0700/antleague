# 개미리그 (예전 이름 '주식 대결') — 작업 인수인계

여럿(2~6명)이 같은 가상 주식시장에서 겨루는 턴제 웹 게임. 한국어 UI.
배포: https://antleague.vercel.app · 저장소: github.com/kiaman0700/antleague

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
npm run e2e      # 실제 서버를 익명 계정 여러 개로 테스트 (dev 서버 켜져 있어야 함). 하나가 실패해도 끝까지 돌고 요약. 일부만: npm run e2e -- social cards
BASE=https://antleague.vercel.app npm run e2e   # 배포본 테스트
npm run db -- check                         # Supabase 연결·마이그레이션 상태 (읽기만)
npm run db -- balance                       # 실제로 끝난 대결의 승률·수익률 (1대1/3인+, 카드·레버리지 쓴 사람별, 읽기만, 시험용 판 제외)
npm run db -- apply supabase/00X_이름.sql     # SQL 적용 (한 트랜잭션). 적용 전 사용자에게 내용 보여주고 확인받기
npm run vercel -- status | logs | env | runtime   # Vercel 배포 상태·빌드 로그·환경변수 이름·서버 오류
npm run vercel -- setpublic VITE_이름 값       # 공개돼도 되는 화면용 환경변수만 설정 (비밀 키 금지), 다음 배포부터 적용
```
- DB 는 `.env.local` 의 `SUPABASE_DB_URL`(Session pooler 주소 — 직접 주소는 IPv6 라 이 네트워크에서 안 됨)
- 서버 위치: Supabase 는 서울(ap-northeast-2, 2026-11-16 뭄바이에서 이전 — `scripts/move-region.mjs schema|compare|copy`), Vercel 함수도 `vercel.json` `regions: ["icn1"]`(DB 옆에 두어야 함 — 미국에 있을 땐 요청 1.4초, 옆에 두니 0.26초)
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
`007_presence_privacy.sql`(players.left_game/last_seen, rooms.rev 방 변경 신호·players 읽기 권한/Realtime 회수, 비밀번호 방 기준 실패 횟수, 닉네임 유니크) · `008_rejoin_rematch.sql`(players.rejoin_hash, rooms.next_code) · `009_forget_keep_games.sql`(계정 삭제 시 자리는 남김, user_id on delete set null) · `010_room_ops.sql`(kick_player·host_leave DB 함수, 서버만) · `011_market_salt.sql`(room_secrets.salt, v4 시장 비밀값) · `012_guest_log.sql`(손님 계정 생성 기록, IP 해시) · `013_feedback.sql`(의견 보내기) · `014`~`016`(의견 읽음·회원·매칭) · `017_match_safety.sql`(대기표 claimed_at·matched_at, `apply_rating` 원자적 점수 함수) · `018`~`024`(친구·초대·파티·안전장치·티어·사진·배치 채우기) · `025_premarket.sql`(players.pre_day 장 전 준비 완료) · `026_rules_version_range.sql`(규칙 버전 칸 제한 1~99 — 예전 1~9 제한 때문에 v10 방이 몰래 v1 로 저장되던 문제. 서버는 이제 칸이 없을 때만 내려서 저장) · `027_cleanup.sql`(`cleanup_stale()` 서버 전용 — 만료 초대·이틀 지난 guest_log·응답 없는 대기표·하루 지난 대기실·마감 7일 지난 진행 중 방 삭제, pg_cron `stockduel-cleanup` 매시 17분) · `028_revoke_sessions.sql`(`revoke_user_sessions` 서버 전용 — 비밀번호 바꾸기·찾기 뒤 모든 기기 로그인 끊음) · `029_private_reactions.sql`(이모지 반응은 비공개 Realtime 채널, `react_member` 로 그 방(기권 안 한) 사람만 듣고 보냄 — e2e `reactions.mjs`) · `030_party_lobby.sql`(party_members.lobby_at — 파티로 돌아왔는지) · `032_no_rejoin.sql`(이어하기 코드 해시 지움) · `033_bots.sql` · `034_daily.sql` · `035_missions.sql`(profiles.xp·mission_progress·mission_rooms·add_xp) · `036_server_errors.sql`(예상 못 한 서버 오류 기록 — 행동·문구만, 7일, `npm run db -- errors`) · `037_pw_attempts.sql`(비밀방 비밀번호 사람·방마다 10분 5번을 DB 로 — 예전엔 서버 메모리라 여러 대일 때 안 쌓였음, `pw_attempt_fail`) · `031_consent_test.sql`(profiles.terms_version 가입 때 동의한 약관 판, profiles.is_test 자동 시험 회원 — 공개 랭킹에서 뺌, 아이디가 e2e… 로 시작하면 서버가 표시) — 적용 완료.
새 마이그레이션은 파일을 만들고(여러 번 실행해도 안전하게) **승인 없이** `npm run db -- apply` 로 직접 적용한 뒤 보고 (사용자 지시, 2026-11-16). 배포(main 푸시)도 검수 통과 후 직접.
서버는 마이그레이션 전에도 죽지 않게(없는 테이블이면 빈 목록 등) 방어적으로 작성.

## 배포
Vercel 프로젝트 `antleague`(2026-11-16 새로 만듦, 주소 https://antleague.vercel.app, 함수 서울 icn1). GitHub `kiaman0700/antleague` main 푸시 → 자동 배포. **무료 요금제는 하루 배포 100번** — 넘으면 푸시해도 24시간 배포 안 됨(2026-11-17 한 번 걸림). **커밋·배포는 큰 단위로만 — 로컬에서 충분히 시험(game-self-check)한 뒤 모아서 배포** (사용자 지시 2026-11-17, 작은 수정마다 커밋·배포 금지). 배포됐는지 `npm run vercel -- status` 맨 위 줄로 확인
Vercel 방화벽 규칙 "게임 서버 요청 제한"(2026-11-17): `/api/game` 에 IP 당 1분 600번 넘으면 차단 (서버 메모리 제한보다 앞에서 막음). 대시보드 Firewall 에서 확인.
Vercel 환경변수는 4개만 필요: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `VITE_OPERATOR_CONTACT`. (Supabase 연동이 만드는 POSTGRES_*·SUPABASE_SERVICE_ROLE_KEY 등은 안 씀. VERCEL_TOKEN·DB 주소는 절대 Vercel 에 넣지 않기)
`.env.local` 의 `VERCEL_TOKEN` 은 팀 범위 토큰(90일) — `/v2/user` 는 안 되고 `?teamId=` 로 프로젝트 API 사용. 만료되면 사용자에게 새로 받아 달라고 할 것

## 지금 게임에 있는 것
턴제(전원 장 마감 or 제한시간 1·3·5·10분, 1대1은 한 명 마감 시 하루의 ⅓(20~90초) / 3인 이상은 ⅔ 마감 시 하루의 ⅙(10~30초) 카운트다운(`graceSecondsFor`, 1분 하루면 20초·10초), 넘어가기 전까지 마감 취소 가능, 마감 현황 표시) · 국내 29 + 미국 8 + ETF 10 종목 · 금리/미금리/환율/유가 · 뉴스 연쇄(연관 업종·종목 칩) · 기사 머리말([속보]·[단독]·[시황]·[특징주]) · 표시 없는 가짜 기사(가격 영향 없음, `decorateNews` 는 가격과 다른 난수 사용) · 루머 감별기는 오늘 뉴스 전부 판정 · 상·하한가 · 지정가 주문 · 배당 · 이벤트 데이(연준·금통위·실적·옵션만기·배당) · 찬스 카드 12종(정보·방해·방어·보너스, 대상 선택) · 최대 6인 · 방 목록·비밀방 · 순위표 · 하이라이트 리플레이 · 업적/칭호 · 초보/일반 모드 · 인터랙티브 차트(라인/캔들/바, 확대·이동, 이평·볼린저, 선 긋기) · 이모지 반응 · 효과음 · 화면별 URL(뒤로가기) · 튜토리얼(/tutorial, 연습봇) · 카드 도감 · 기업 도감(/companies) · PC 배치 편집(끌면 실시간 미리보기·크기 조절·속보 알림 자유 위치) · 게임 중 기권/잠깐 나가기 · 한 판 더(같은 사람들과) · 대기실 내보내기·방장 넘기기 · 연결 끊김 안내 · 화면 오류 안전장치(ErrorBoundary)

## 밸런스·규칙 버전
- `room_secrets.rules_version`: 1(예전) · 2(공급망·시총 가중) · 3(밸런스) · 4(v3 + 방마다 128비트 비밀값 salt 로 모든 난수 sfc32, 레버리지 30% 제한) · 5(v4 + 뉴스와 상관없는 갭은 장중 절반 되돌림) · 6(시작 돈 100만원 `startCashFor`, 카드 값·업적 금액 1/10 `itemCost(kind,n,version)`, 용돈 봉투는 공개 확률 `BONUS_TABLE` — 서버가 `seeded(salt:bonus:플레이어:n번째)` 로 뽑아 items.payload.amount 에 저장, 잃는 돈은 현금까지만) · 7(v6 + 장 전 시간(둘째 날부터 하루 사이 신속 20초·일반 30초·그 밖 ⅓(15~45초) `preSeconds`, 장 전엔 지금 가격 거래·장 마감 불가·예약 주문·카드 가능, 모두 '준비 완료'(`preReady`, players.pre_day)면 바로 열림, 장 전 찌라시 `src/game/rumors.ts` 3~5개 중 약 40%는 그날 장중 속보의 업종·방향 단서·나머지는 헛소문(진위는 감별기 쓴 사람만), 화면 `room.preUntil`·`view.rumors`) · 8(v7 + 카드 값 다시 매김 `PRICE_V8`) · 9(카드 값 `PRICE_V9`) · 10(카드 5장까지 `holdLimit`) · 11(1초 가격(`tickMsFor`: 하루 3분까지 1초 칸, 더 길면 2~4초로 하루 180칸 이하, 장이 열려 있으면 화면이 1초마다 새로 받음, 봉 간격 5초·15초·30초·1분) · 12 = 현실 같은 시장(`src/game/stories.ts`: 판마다 시작 가격 절반~두 배, 업종별 뉴스 반응 크기 `SECTOR_NEWS_MULT`(바이오·코인 크게), 한 판 2~4개 사건 흐름 — 임상·허가·신작·수주·입찰·상장·신제품·인수합병: 시작 뉴스(기대감) → 중간 찌라시(70% 실제 쪽, 감별기로 판별) → 발표 날 장중 속보로 급등·급락 → 다음 날 되돌림. 확인용 `node sim/build.mjs sim/peek.ts && node sim/.out/peek.mjs`) · **13(현재)** = v12 + 장중 속보 전엔 가격이 거의 안 움직임(`warp` quiet — 예전엔 속보 전 움직임으로 방향이 보였음), 사건 찌라시 쪽 가격 흐름은 결과가 아니라 소문 방향을 따름. (버전 무관) 사건 찌라시는 결과 발표 다음 날(`revealDay`, 서버 전용)까지 진위 비공개, 장 전 찌라시 단서는 75%만 방향이 맞고 60%는 같은 업종 반대 소문이 함께 돎(`leak13.test.ts`). 장중 가격은 화면이 가진 칸 뒤부터만 보냄(`liveDay`/`liveFrom` → `live.from`, `src/net/api.ts` 가 이어 붙임)(내일 신문 4.5만, 거래 정지·수수료 2만, 정보 차단·가짜 뉴스 1.5만 — 시뮬 4인 정보 42%·방해 33%·뉴스 30%, `SIM_PRICES='{"paper":45000}'` 로 값 실험)(시뮬에서 카드가 값보다 이득이 작았음: 내일 신문·애널·반사 3만, 수수료·방패 1.5만, 나머지 1만, 1대1 방해 1.5배). 시뮬은 `SIM_V=5` 처럼 버전을 골라 비교. 카드 가치는 `sim/cards2.ts`(상대 유형 섞어 비김 없이) — v8 기준 카드로 승률 ±5%p 이내, 뉴스 잘 읽는 쪽이 1대1 75%·4인 42% (`sim/run.ts cards` 의 승률은 똑같은 봇끼리 비김이 많아 금액 칸으로 볼 것) 32비트 시드는 첫날 공개 정보(금리·환율·뉴스)로 역산 가능했음 → salt 는 room_secrets 에만, 화면 데이터(sliceMarket·View)에 절대 넣지 않음. 튜토리얼은 정해진 장면이 필요해 v3. 진행 중인 방은 만든 버전 그대로 — 버전별 분기는 전용 난수(rng2/rng3)만 써서 예전 버전 가격이 절대 안 바뀌게
- v3: 시가·장중 잡음 분리(갭 방향 ≠ 그날 방향), 아침 뉴스는 시가에 80~95% 반영, 장중 속보 종목은 가격 생성 전에 정해 속보 전엔 거의 안 움직이고 속보 순간 크게 뜀(`intraday` warp jump), 무료 카드 모두 동일·거울 제외, 같은 날 한 사람에게 두 번째 방해는 무효(crowded)
- 시뮬레이터: `sim/` (`node sim/build.mjs sim/run.ts && node sim/.out/run.mjs news duel multi cards --n=0.3`). 규칙·가격 바꾸면 다시 돌려 확인
- 시장 키(marketKey)는 서버 비밀값 HMAC(keySalt)으로만 섞음 — 시드 등 비밀은 화면에 보이는 어떤 해시에도 넣지 않기
- 기권(left_game)한 사람은 거래·마감 취소 불가. 자리 비움은 바로 건너뛰지 않고 카운트다운 기준에서만 빠짐
- 익명 로그인이 IP 당 제한(429)에 걸리면 서버 손님 계정(`action:'guest'`, 관리자 API로 가짜 이메일 계정 → 비밀번호 로그인)으로 대체. 같은 IP 시간당 60·전체 3000 (guest_log)
- v4 규칙: 레버리지·인버스 ETF(lev≠1)는 합쳐서 총재산의 30%까지만 살 수 있음(`LEVERAGE_CAP`, `leveragedCap`) — 다인전에서 몰빵 한 방이 이기던 문제 (시뮬 4인 41%→29%)
- 운영자·개인정보 보호 책임자: Vercel 환경변수 `VITE_OPERATOR_CONTACT` = "이준엽 · kiaman0700@naver.com" (사용자가 공개 동의, 2026-11-16) → 개인정보 안내에 표시
- 보안 제보 안내: `public/.well-known/security.txt` (운영자 연락처, Expires 2027-11-17 — 그 전에 날짜 늘리기)
- 운영자: 운영자 계정 = 회원 아이디 kiaman0700 (사용자 요청, 2026-11-16). 운영자는 일반 회원 로그인 후 위 메뉴(모바일은 위 머리줄)에 고정된 '의견함' 버튼 + 안 읽은 수(`adminUnread`, 30초마다). **화면·API 로 운영자를 만들거나 지정하는 방법은 없음**(adminSignup·ADMIN_SETUP_CODE·ADMIN_EMAILS 모두 제거, Vercel 설정도 삭제). 지정/해제는 이 컴퓨터에서만 `npm run db -- set-admin|unset-admin <아이디>`, 목록 `npm run db -- admins` — 사용자가 따로 말하지 않으면 쓰지 말 것
- 방해 카드: 한 사람에게 하루 한 번 (막힘·반사 포함, 반사로 맞은 사람도). 두 번째는 서버가 거절하고 카드는 그대로. 모든 방해 알림은 익명(쓴 사람·상대 방어 카드 종류 숨김)
- 점수판(2026-11-17 사용자 결정으로 바꿈): 상대 재산·수익률도 원 단위·지금 가격으로 보임(`band` 는 늘 null). 무엇을 샀는지(보유·거래·카드·주문)와 오늘 거래 횟수는 여전히 안 보냄. 사용자에게 '긴 기록으로 보유 종목을 짐작할 여지'를 설명했고 원 단위를 골랐음
- 회원(015): 아이디·비밀번호·닉네임(이메일 X, 만 14세 이상). 가입 = 지금 게스트 계정을 정식 계정으로 전환(같은 user id → 기록 유지, 가입·비번 변경 후엔 다시 로그인 필요). 로그인 주소는 아이디와 무관한 무작위 `u_<hex>@u.stockduel.invalid`(예전 가입자는 `아이디@…`) — 화면은 로그인 전에 서버 `loginEmail`(인증 없음, 없는 아이디도 HMAC 가짜 주소)로 주소를 받아 로그인 → 아이디 선점·존재 확인 불가. 가입은 프로필을 먼저 넣어 아이디·닉네임 예약 후 계정 전환(실패 시 되돌림). 비밀번호 바꾸기·복구 코드 새로 받기는 지금 비밀번호 필요(`verifyPassword`, 확인용 세션은 바로 끝냄). 복구 코드로 비밀번호 찾기. 게스트로 하다 기존 계정 로그인 → 게스트 기록 가져오기/버리기 선택(`guestSummary`·`mergeGuest`, 안 가져온 진행·대기 자리는 `leaveSeat` 로 기권·퇴장). `api/_lib/accounts.ts`. 화면: /login, /me(마이프로필, 홈에서만), /ranking. 회원은 게임 닉네임을 서버가 프로필 닉네임으로 강제, 이름 옆 회원 표시(`verified`)
- 티어 그림(`TierEmblem`): 색은 티어 색, 단계 g=티어×3+단계(III0·II1·I2, 마스터 17)가 오를수록 장식 추가 — 안쪽 테두리·모서리·굵은 테두리·위 장식·날개(골드~)·보석(플래티넘~)·빛줄기(다이아~)·왕관(마스터). 장식 자리 때문에 그림 칸은 size×1.3. 티어표 `TierLadder`(랭킹전 비회원·/ranking, 내 티어·단계 표시)
- 랭크 티어(022, `src/game/tier.ts`, 화면 `TierBadge`): 랭킹전 2판은 배치 — 점수 숨김(화면에 '배치 n/2'), 점수 변화 ×2.5(`PLACEMENT_MULT`), 랭킹 목록·순위에 안 나옴(`ranked_games >= 2` 만). 배치 뒤 티어: 브론즈(~999)·실버(1000)·골드(1150)·플래티넘(1300)·다이아몬드(1450) 각 III·II·I(50점씩), 1600+ 마스터. 친구·파티 목록도 티어로 표시. 점수 반영은 `apply_rating2`(ranked_games +1)
- 랭킹: Elo(시작 1000, K=32/(회원 수−1)), 회원끼리만 점수 변화 — `recordMatch`(match_players 기본키로 한 번만, 점수는 `apply_rating` RPC). 랭킹전에서 기권한 사람은 꼴찌. 같은 상대와 여러 번 만나도 점수는 매번 똑같이(같은 상대 제한 규칙은 사용자 요청으로 없앰, 2026-11-16). 매칭 방은 '한 판 더' 불가(다시 찾기)
- 매칭(016): 홈 '대결 찾기' = 랭킹전(회원만)/일반전 × 1대1/다인전(4명 바로, 3명은 40초 대기 후) × 신속(10일×60초≈10분)/일반(20일×90초≈20~30분). 실력 범위 ±100에서 10초마다 +50. 대기표 match_tickets, 1.5초마다 queueStatus 때 서버가 묶어 방을 만들고 바로 시작(`src/engine/matching.ts` pickGroup — 다인전은 고른 사람끼리 모두 서로 범위 안, 랭킹전 범위 최대 ±400). 무리 중 가장 먼저 온 사람의 확인 때만 방을 만듦(동시 잡기 방지), 10초 응답 없으면 대기표 삭제(창 닫으면 pagehide keepalive 로 queueLeave), 15초 넘게 잡힌 채면 풀어 줌, 실패하면 반쯤 만든 방 삭제, 매칭 결과는 2분간 다시 받을 수 있음. 대기실·진행 중 자리가 있으면 매칭 불가 랭킹 점수는 매칭 랭킹전(rooms.ranked)에서만. 친구 '방 만들기'는 커스텀(점수 없음)
- 이용자 의견: `npm run db -- feedback` 으로 읽기
- 배포 후 보안 점검(2026-11-16, 새 주소): 숨김 파일·보안 헤더·소스맵·화면 코드 속 비밀·다른 사이트 요청(Origin)·큰 요청·http→https·화면 끼워 넣기·Supabase 직접 접근(표·함수·저장소·GraphQL·REST 목록)·실시간 엿듣기(`realtime-privacy.mjs`)·npm audit — 모두 이상 없음. 남은 위험(낮음): Supabase 이메일 직접 가입이 열려 있음(메일 확인 필요, 가입해도 아이디 없는 손님과 같음). 공통 화면 부품은 `src/components/ui.tsx`(Loading·EmptyState·ErrorState·IconList·SectionTitle) + `styles-kit.css` — 새 화면은 이것부터 쓸 것
- e2e 계정은 `scripts/e2e/.accounts.json` 에 저장해 재사용 (익명 계정 생성이 IP 당 시간 제한, 손님 계정도 서버 메모리 10분 20개·DB 시간당 60개). `injection.mjs` = 모든 입력에 스크립트·SQL·필터·제어문자·이상한 JSON·CSRF·가짜 토큰 주입 점검
- 상대 오늘 거래 횟수는 숨김. 자리 비움 = 90초 응답 없음(AWAY_MS), 나감(기권) = left_game. 남은 사람 기준으로 마감·카운트다운

## 알아둘 것
- 보안 점검(2026-11-16) 뒤 고친 것: 예약 주문도 레버리지 30% 제한(걸 때 + 체결 때) · 장 전 찌라시 짝(반대 소문)은 헛소문 업종에도 같은 비율 · 정보 차단 맞은 날은 marketKey 에 속보 수 안 넣음 · (v13) 용돈 봉투는 현금 10만원 이상일 때만 · 내일 신문에서 속보 시각(at) 뺌 · (v13) 속보 종목도 속보 전 흔들림이 다른 종목과 비슷(`noise13.test.ts`) · 복구 코드 확인은 아이디 없어도 같은 시간 · 아이디 중복 확인 1분 20번
- 화면 요청: 창이 뒤에 있으면 10초마다, 429 를 받으면 10초 동안 5초마다(오류 문구 없이). 처음 온 사람(튜토리얼 안 함)은 일반전·랭킹전 위에 튜토리얼 권하기 카드, 처음 장 전 시간엔 한 번 안내. OG 태그·robots.txt·manifest 는 `index.html`·`public/`
- 익명 계정은 화면을 여는 것만으로 만들지 않음(2026-11-17): `src/net/api.ts` `PEEK_EMPTY` — 세션이 없으면 profile·resume·queueCounts·invites·party·me·history 는 서버에 안 묻고 빈 값. 방 목록(`rooms`)·랭킹(`ranking`)은 토큰 없이도 서버가 답함(공개 정보, IP 당 1분 30·20번, 내 순위·joined 없음). 그 밖은 401 (`injection.mjs` 7번)
- 매칭 대기는 앱 전체 하나(`src/net/matchStore.ts`, useSyncExternalStore): 매칭 결과는 App 이 받아 어디서든 게임으로, 대기 중엔 `okWhileMatching` 으로 방·연습·1대1·파티 막음, 다른 탭이면 제목 깜빡임. 같은 상대 점수 감소 규칙(pairWeight)은 없앰
- 하루 마감 결산 팝업: 대결은 6초 뒤 자동으로 다음 날(장은 서버 시계대로 흐름), 연습은 버튼을 눌러야 다음 날 장이 열림. 대결 첫날 처음 들어오면 3초 'VS' 화면(`MatchIntro`, sessionStorage 로 한 번만)
- 로비 글은 줄이기(사용자: '너무 AI 같다'): 설명 글머리표 상자 대신 큰 숫자(`mf-spec`), 규칙은 접어 둠(`rk-help`)
- 글꼴: 한글 자간 −0.01em, 굵기 700/800, 시간 숫자는 mono 대신 tabular-nums
- 실시간 장: `src/game/intraday.ts` (5초 칸, 일별 가격과 다른 난수) · 엔진 `dayClock`(장 시작 = day_deadline − 제한 시간) · 화면 데이터 `View.live` 는 지금 칸까지만 · 화면은 `src/game/live.ts` 의 `withLive` 로 오늘 막대에 합침 · 장중 속보 `NewsEvent.at` 는 공개 칸 전엔 화면 데이터에 없음 · 예약 주문은 상태 요청 때마다 지금 칸까지 체결(`resolveOrders(d, day, 칸, final)`)
- 화면 모드: 초보/일반/커스텀. 커스텀 설정은 `src/prefs.ts`(이 기기 localStorage, `effective()` 로 적용값). 화면 편집 = `/customize`(저장 안 되는 가상 게임 `makeDemo`) 또는 게임 중 조절 버튼 → `EditSlot` 으로 순서·보이기
- 금액 표시는 `won()`(=`wonShort`) 하나로: 초보 만원(끝자리까지) · 일반 원, 커스텀에서 변경
- 아이콘은 이모지 대신 `src/components/Icon.tsx`(Lucide). 업종 `SectorIcon`, 카드 `CardIcon`, 업적 `BadgeIcon`
- 로비 = 게임 클라이언트식 틀(PC 우선, 사용자 요청 '롤 같은 느낌' — 다른 게임 그림·로고는 쓰지 않고 구성만 참고): 861px 이상 위 메뉴바(`ClientChrome.tsx` TopBar: 로고·플레이 버튼·메뉴·계정) + 오른쪽 소셜 패널(SocialPanel: 파티 칸·친구 게임중/접속중/오프라인·1대1/파티 바로가기, 1280px 이상 늘 보임, 그 아래는 친구 버튼으로 여닫음). 860px 이하 위 머리줄 + 아래 탭바 5칸(`LobbyNav.tsx`). 스타일 `styles-client.css`(금색 깎은 버튼·모드 카드·차트 무늬). 주소: `/ranked` `/casual` `/custom` `/learn`(연습 메뉴 — `/practice` 는 혼자 연습 게임) `/more`(설정·더보기) `/ranking` `/records` `/companies` `/rooms` `/create` `/login` `/signup` `/me`. `/` 는 마지막에 고른 대결 메뉴(`stockduel.tab`, 처음엔 일반전). 스타일 `styles-nav.css`(맨 마지막)
- 닉네임 칸은 로비에 없음: 회원=프로필 닉네임, 게스트는 온라인 기능을 처음 누를 때 `useGuestGate` 안내(게스트/회원 비교 → 게스트로 시작 때만 닉네임). 게스트 닉네임은 회원 닉네임과 같을 수 없음(서버 `nickFor`, 대소문자 무시). 설계서 `design/lobby-nav-friends.md` (②~④ 모두 완료)
- 친구(018, `api/_lib/social.ts`, 화면 `src/screens/Friends.tsx`, 주소 `/friends`): 회원만, 정확한 닉네임으로 신청(대소문자 무시·와일드카드 무력화), 수락·거절·끊기·차단(상대는 모름 — 차단당한 사람 신청은 겉으로 '대기 중')·차단 풀기, 친구에게만 접속 상태(profiles.last_seen 2분, 게임 중). 화면 id 는 관계 줄 id(user id 아님). 메뉴 배지 = 받은 신청 수(30초마다). 테스트 `scripts/e2e/social.mjs`(테스트 회원은 `.members.json` 에 두고 재사용)
- 친구·파티 안전장치(021): 거절한 친구 신청은 'declined' 로 숨김(보낸 사람에겐 7일 '대기 중'), 파티 들어가기는 `join_party` DB 함수(잠금, 2명), 친구 끊기·차단 시 서로 초대 취소·같은 파티 해산(`cutTies`), 초대 수락 때 친구인지 다시 확인·매칭 대기 정리, 파티로 찾기 전 파티원 75초 안 접속 확인, 방 만드는 중(claim)인 파티 표는 지우지 않음, 기권한 1대1 로 다시 끌려가지 않음(3분·left_game·sessionStorage), 비밀방 초대는 방장만. 읽기만 하는 확인 요청(state·queueStatus·party·invites 등)은 90/20초 따로
- 한 사람은 한 방에만(`ensureFree`): 새 방 만들기·입장·초대 수락·이어하기 때 다른 대기실은 자동으로 나오고, 진행 중 대결(기권 안 함)이 있으면 막음. e2e `lib.mjs user()` 는 시작할 때 남은 방에서 나옴
- 모바일 게임 상단: 내 재산·장 마감·진행 막대(`m-top`) + 그 바로 아래 시장·일정·재산 줄(`m-top-flow`, `--m-top-h` 로 위치)을 모두 위에 고정 — 어느 탭에서 스크롤해도 늘 보임(사용자 요청, 2026-11-17, 접혔다 펴지는 움직임 없음). 가로로 눕힌 휴대폰(높이 500 이하)만 그 줄이 내용과 함께 스크롤. 차트 탭에서는 그 줄 숨김. 태블릿 왼쪽 목록은 `--m-stick-h` 아래에 붙음
- 메뉴 이름: '업적'(예전 기록·업적, 주소 /records — 최근 전적은 내 기준: 판 수·1위·승률, 판마다 내 순위·수익률), '공부'(/companies, 탭 3개: 투자 기초 12가지(`Study.tsx`)·기업 살펴보기·찬스 카드(`CardGuideBody` + 카드 꿀팁). 퀴즈는 없앰)
- 장중 차트도 ProChart(라인·캔들·바·지표·선 긋기·크게 보기): 5초 가격을 5초/30초/1분 봉으로 묶음(`intradayBars`, `unit` prop), 기본 간격은 봉 10개 이상 나오는 가장 넓은 것
- 방 만들기 제한: 1시간에 '내가 만든' 커스텀 방 10개(`roomsMadeSince`, 매칭 자리는 안 셈) + 서버 메모리 15개. 초대·파티 부르기·1대1 신청은 거절당해도 다시 보낼 수 있음(화면 5초 '보냄' 뒤 '다시 초대')
- 친구 초대(019 invites, server.ts `inviteAct`): 대기실 '친구 초대'(대기 중인 커스텀 방, 5분, 비밀방도 비번 없이, 한 번만) · 친구 목록 '1대1'(신속, 메뉴에서 일반) → 90초 안에 수락하면 둘이 바로 시작하는 `kind='friend'` 방(점수 없음, 끝나면 한 판 더 가능). 받은 초대·내 신청 결과는 로비 `InviteCenter` 가 6초마다 확인해 팝업. 차단 관계면 겉으로만 성공. 응답엔 닉네임·방 제목만
- 파티로 돌아가기(롤 방식, 030): 결과 화면은 파티 판이면 '파티로 돌아가기'(결과 화면은 `party` 를 `peek:true` 로만 봄 → 돌아옴으로 안 침). 로비가 3초마다 `party` 를 부르면 lobby_at 갱신, 70초(`PARTY_BACK_MS`, 창이 뒤에 있어도 10초마다 확인) 안이면 `back`. 파티원이 모두 back 이어야 파티장 찾기(화면 버튼 꺼짐 + 서버 queueJoin 거절). 응답엔 참/거짓만
- 뉴스 강조: 휴대폰 아래 탭 기본 순서 뉴스 맨 앞(커스텀은 내 순서), 새 날엔 뉴스 탭(연습도), 뉴스 탭에 오늘 안 읽은 수(`unreadToday`), 장중 속보(`at` 있는 뉴스)는 그날 맨 위 '장중 속보' 카드, 제목 17px(PC 16px)·호재/악재 띠, PC 뉴스 칸 기본 380px(27vw)·제목 줄·'크게 보기' 창. 결과 화면 한 판 더 버튼은 모드 이름 + 판 설정 두 줄
- 일반전 파티(020, server.ts `partyAct`, 화면 `PartyPanel`): 회원 2명까지, 친구를 '파티에 부르기'(2분 초대) → 파티장만 '일반전 찾기'(다인전만) → 파티원 모두 대기표가 같은 party_id 로 생기고 파티원 화면도 자동으로 찾는 중. 매칭은 파티를 한 덩어리로(`pickGroup` units): 파티가 낀 판은 4명(2+2/2+1+1)이 기본, 1분 30초(`PARTY_WAIT_FOR_3`) 넘게 못 모이면 3명(2+1)도. 혼자끼리 3명 판은 40초. 파티원 표가 하나라도 끊기면 파티 대기 전체 취소. 랭킹전·1대1 은 파티 불가. 랭킹전에서도 친구·같은 상대끼리 얼마든지 만남(사용자 요청 — 사람이 적을 때 대기 줄이기). 같은 상대 점수 제한 없음, 기권 꼴찌. 같은 IP 분리는 안 함
- 재입장(배그식): 로비에 '이어하기' 카드 없음. 직접 나가면(대결=기권, 연습=그만두기·저장 삭제) 끝. 창 닫힘·끊김·뒤로가기로 빠졌으면 로비에 들어올 때 `Reconnect` 팝업(다시 입장/기권, 대기실로/나가기, 연습 이어하기/그만두기). 게임 안 나가기 시트 = 계속하기 / 기권. '다른 기기로 옮기기(이어하기 코드)'는 없앰(2026-11-17, 사용자 결정 — 회원은 같은 아이디로 로그인하면 이어짐, 서버 `rejoinCode`·`rejoin` 없음, DB 032 로 남은 해시 지움)
- 화면을 옮기며 보여 줄 확인 한 줄은 `src/lib/flash.ts`(setFlash → 로비 `FlashNote` 가 3.5초 표시): 기권·연습 그만두기·대기실 나가기/방 닫기
- 매칭 대기: `queueCounts`(대기열별 인원·예상 대기·접속 수, 숫자만) · 예상 대기 `estimateWaitSec`(같은 대기열 범위 안/밖 인원, 최근 1시간 매칭 인원, 접속 수) · 25초 넘게 기다리면 사람이 기다리는 다른 대기열로 바꾸기 제안, 다인전 45초면 1대1 제안 · 랭킹전 범위는 처음 2분 ±400, 그 뒤 풀림(`rankedMax`)
- 뉴스의 `fake`/진실은 서버에만. 화면 데이터는 `publicNews` 를 거쳐 오늘 뉴스는 감별기 쓴 사람에게만 `verdict`, 지난 뉴스는 가짜·루머에 `verdict`
- 반응(이모지) broadcast 채널은 방 ID 를 알면 들어올 수 있음 → 받는 쪽에서 정해진 목록만 표시
- 요청 제한은 서버 인스턴스 메모리 기준(완벽한 전역 제한은 아님). 보안상 꼭 지켜야 하는 횟수(비밀번호 시도·방 만들기·손님 계정)는 DB 로 셈
- 서버 → Supabase 읽기 요청은 연결 실패·502~504 때 2번 다시(`retryingFetch`, 쓰기는 안 다시). 로그인 확인이 잠깐 막히면 401 이 아니라 503 — 401 이면 화면이 손님 계정을 새로 만들거나 회원을 로그아웃시키므로 절대 잘못 401 을 주지 말 것
- Windows 는 국기 이모지를 글자(KR/US)로 표시함 → 화면엔 💵·🏛️ 같은 일반 아이콘 선호

## 2026-11-17 정한 것
- 가입 동의: [필수] 만 14세·이용약관·개인정보 수집·이용 + 모두 동의 (서버 `agreeTerms` 확인, `TERMS_VERSION`). [선택] 받는 정보 없음 → [선택] 칸·문구 만들지 않기
- 이용약관·개인정보처리방침: `src/components/Legal.tsx` (`LEGAL_VERSION` 과 서버 `TERMS_VERSION` 같게). 모든 로비 화면 아래 안내 줄(휴대폰 포함) + 운영자 정보(개인 운영, 사업자 정보 없음)
- 데이터: DB 하나로 둠(시험 회원은 is_test 로 랭킹 제외, 삭제 없음). 백업은 정식 출시 전이라 안 함
- 디자인: AI·템플릿 같은 장식 빼기 — 제목 그라데이션·빛 번짐·꾸밈 무늬·각진 모양 없앰, 둥근 모서리·단색·자간 -0.01em·굵기 400~800·small 12px. 겹치기 규칙은 `styles-kit.css` 맨 아래
- 색: 푸른 기 없는 일반 다크 모드 회색 (사용자 요청) — `--bg #111` · `--bg-2 #161616` · `--surface #1c1c1c` · `-2 #242424` · `-3 #2e2e2e`, 글자 `#f2f2f2`/`#c8c8c8`/`#9a9a9a`. 푸르스름한 어두운 색(#0b0d12·rgba(16,19,26) 등)을 새로 쓰지 말 것
- 버튼 역할(2026-11-17): 주 버튼(화면당 하나) 보라 `#6B58EE`+흰 글자 · 보조 회색 `#2E2E2E`+테두리 · 텍스트 버튼 · 사기 `#D9364B`/팔기 `#2563EB`(이 두 버튼만) · 시간이 걸린 상태(장 전 준비 완료·카운트다운) 호박 `#F5B83D`+진한 글자 · 위험(기권·탈퇴)은 빨간 글자+테두리(꽉 찬 빨강은 '사기'와 헷갈림). 장 전 찌라시 = 메신저 '받은 글' 말풍선·감별 도장, 장중 속보 알림 = 큰 카드(빨강/파랑 '속보' 표시, 누르면 그 종목), 티어표 = 오르는 계단(`TierLadder`). 오류 화면엔 '배치 초기화' 없음(같은 오류 2번이면 자동으로 배치 되돌림)
- 버튼: 흐림(backdrop-filter)·그라데이션·보라 빛 번짐 그림자 금지. 흰 글자 버튼 배경은 대비 4.5:1 이상 — 기본 `#6b58ee`(hover `#7765f2`), 사기 `#d9364b`, 팔기 `#2563eb` (#8b7bff 위 흰 글자는 3.3:1 이라 안 됨). 장 마감 버튼엔 아이콘 없음
- 개발 서버가 python 등으로 바꾼 CSS 를 가끔 못 알아챔 → 바꾼 뒤 `touch src/styles*.css`
- 커밋·배포는 큰 단위로만, 로컬 검수 뒤 (작은 수정마다 배포 금지 — Vercel 하루 제한)
- 대화 글은 무조건 쉬운 한국어. 사이트 안은 필요하면 영어 가능

## 봇·업적 (2026-11-17, 설계서 `design/bots-daily.md`)
- 봇 엔진 `src/engine/bots.ts`(서버·브라우저 공용): 봇은 자기 `buildView` 만 보고 `validate*` 로 움직임(미래·진실·상대 거래 모름). 난이도 1 새내기봇(악재 종목 사고 자주 갈아탐, 평균 -8%) · 2 개미봇(뉴스·소문 그대로, +7%) · 3 고수봇(하루 10번 보기·시황 안 속음·수수료 조심·사건 찌라시 들고 가기, +15%). 사용자 기준: 쉬움=초보도 거의 다 이김, 보통=몇 판 해 본 사람이면 이김, 어려움=상위 랭커 아니면 어려움. 확인 `node sim/build.mjs sim/levels.ts && node sim/.out/levels.mjs` (SIM_HARD=1 후보 비교, SIM_BASE=1 초보 기준)
- 봇 규칙(2026-11-17 바꿈): `PlayerRow.bot_level`(1~3)·`bot_step`(마지막으로 움직인 칸, 마감하면 day*100+99). 봇도 사람처럼 **스스로 장 마감**(`BOT_END_AT` 쉬움 하루 30~55%·보통 85~93%·어려움 93~97%)하고 마감 인원·카운트다운에 들어감. 누가 먼저 마감해 카운트다운이 시작되면 봇이 반응(쉬움 바로 마감, 보통 마지막 정리 후 마감, 어려움 남은 시간 절반까지 버팀). 지나간 칸만 움직임(앞 가격 안 씀). 장 전 준비는 사람만 확인. 사람이 모두 나가면 판 끝. 화면 데이터 `players[].bot`. 서버 `moveBots` 는 봇이 마감하면 같은 줄에서 ended_day, 사람이 남았으면 카운트다운. 봇전(브라우저)도 내가 마감하면 카운트다운
- 봇전 = 연습 메뉴 '봇전'(브라우저, `newSolo(…, bots)`), 점수판은 대결처럼(`vsBots`), 방해 카드 대상은 봇
- 커스텀 방 봇(DB 033 `players.bot_level`·`bot_step`, user_id 없음): 대기실 빈자리 '봇 추가'(방장·대기 중·커스텀만, 서버 `addBot`, 봇 5명까지), 빼기는 `kick`. 서버 `moveBots` 가 state·endTurn·기권 때 봇을 움직임 — `bot_step` 비교 후 갱신(차지한 요청만 거래·카드 넣음)으로 동시 요청에도 한 번. 방장은 봇에게 안 넘어감(033 `host_leave`). 마감 현황·카운트다운 안내는 사람만 셈. e2e `bots.mjs`
- 오늘의 도전(DB 034 `daily_runs` 날짜·계정 기본키, 서버만): 연습 메뉴 '오늘의 도전' 칸(온라인), 서버 `dailyInfo`(내 기록·회원 점수표 상위 50, 시험 회원 제외, 계정 id 안 보냄)·`dailyStart`(기록 줄 먼저 넣어 하루 한 번, 실패하면 되돌림). 방 kind 'daily'·혼자·10일×60초·status playing 으로 바로 시작(max_players 는 DB 제한 때문에 2, 이미 진행 중이라 못 들어옴). 시드·salt = 서버 비밀 키 HMAC('daily-seed:/daily-salt:'+한국 날짜) → room_secrets 에만(v4+ 시장은 salt 로만 만듦). 끝나면 `maybeAdvance` 가, 중간에 나가면 `leaveSeat` 가 점수 기록. 한 판 더 불가. 결과 화면 `DailyResult`. e2e `daily.mjs`(시험 계정은 하루 한 번이라 같은 날 두 번째 실행부터는 시장 비교 등 일부를 건너뜀)
- 봇전은 서버 판(2026-11-17, `botMatch`, kind 'bot', 비밀방·혼자+봇 1~5, 시간당 20번): 기록·업적·미션에 남음. 인터넷 설정이 없을 때만 브라우저 판. 봇전 '한 판 더'는 botMatch 로 새로
- 미션(DB 035, 설계서 `design/missions.md`): 오늘 3개(쉬움 2+보통 1, 한국 0시)·이번 주 1개(어려움, 월요일 0시), 계정마다 `HMAC(비밀 키, 'mission:'+계정+기간)` 로 고름(`api/_lib/missions.ts`, 규칙·판정은 `src/game/missions.ts`). 판정은 판이 끝날 때 `maybeAdvance` → `evaluateMissions` 가 서버 데이터로만(회원·기권 안 함·거래 1번 이상), `mission_rooms`(계정, 판)로 한 번만, 하루 경험치 300 상한, `add_xp` RPC. 화면 `missions` 액션(읽기만) → `MissionsPanel`(일반전·랭킹전·연습 메뉴, 대결 결과 화면). 레벨 = 100+20×(레벨−1), 레벨 5·10·15·20 업적(lv5~lv20, `earnedBadges` 가 profiles.xp 로 줌) → 사진·칭호. 완료를 화면이 보내는 요청은 없음. e2e `missions.mjs`
- 업적 41개(레벨 4개 포함, `src/game/achievements.ts`, 목록 순서 = 귀한 순서, 칭호는 가장 앞), 새 업적 8개에 프로필 사진(`avatars.ts`). 업적 화면 제목에 모은 개수

