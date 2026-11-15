# 주식 대결 📈

둘이서 같은 가상 주식시장(국내·미국·ETF)을 보며 누가 더 많이 버는지 겨루는 턴제 웹 게임.

## 구조와 보안

```
브라우저 ──(익명 로그인 토큰)──▶ /api/game (Vercel 함수, 비밀 키 보관) ──▶ Supabase DB
   │                                   └ 모든 거래·카드·턴을 서버에서 검증
   └─(읽기 전용, 내 방만)── Supabase Realtime: 변경 알림만 받음
```

- 브라우저는 DB에 **쓸 수 없음** (RLS + 권한 회수). 쓰기는 전부 서버 함수가 검증 후 수행
- 체결 가격·카드 가격은 **서버가 결정** (클라이언트가 보낸 값 무시)
- 시장 시드는 `room_secrets` 에만 있고 클라이언트 권한 없음 → **미래 가격·내일 뉴스 계산 불가**
- 오늘 종가, 오늘 루머의 진실, 상대 보유 종목은 서버가 보내지 않음 (카드로만 공개)
- 익명 로그인(Supabase Auth)으로 플레이어 신원 확인, 방 참가자만 방 정보 조회
- 입력 검증(닉네임·수량·종목·코드), 사용자별 요청 제한, 같은 사람의 동시 요청 충돌 방지(버전 확인)
- 보안 헤더: CSP, X-Frame-Options, HSTS, nosniff, Referrer/Permissions-Policy
- 비밀 키는 `SUPABASE_SECRET_KEY` (VITE_ 접두사 없음) → 브라우저 번들에 포함되지 않음

## 1. Supabase 설정

1. **SQL Editor** → `supabase/schema.sql` 전체 실행
2. **Authentication → Sign In / Providers → Anonymous sign-ins** 켜기
3. **Project Settings → API Keys** 에서 확인
   - Publishable key → `VITE_SUPABASE_ANON_KEY` (공개돼도 되는 키)
   - Secret key → `SUPABASE_SECRET_KEY` (**절대 공유 금지**, 서버 전용)

## 2. 로컬 실행

`.env.local` (git에 올라가지 않음):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

```bash
npm install
npm run dev
```

## 3. Vercel 배포

Vercel 프로젝트 → Settings → Environment Variables 에 위 3개를 등록하고 배포.
`api/game.ts` 가 서버 함수로, 나머지는 정적 사이트로 배포됩니다.

## 테스트

```bash
npm test                 # 단위 테스트
npm run e2e              # 실제 서버 테스트 (npm run dev 실행 중일 때)
BASE=https://배포주소 npm run e2e   # 배포본 테스트
```

시장 생성 결정성, 업종 연동, 포트폴리오 계산, 그리고 보안 규칙(시드·미래가격 비노출, 서버 가격 체결, 잘못된 입력 거절)을 검증합니다.
