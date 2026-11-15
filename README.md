# 주식 대결 📈

둘이서 같은 가상 주식시장을 보며 누가 더 많이 버는지 겨루는 웹 게임.

- 가상 종목 8개, 시작 자금 1,000만원
- 매일 아침 뉴스(호재/악재/루머) → 뉴스 직후 주가가 크게 반응
- 상대 총자산은 실시간 표시, 보유 종목은 게임 끝나고 공개
- 결과 화면: 승자, 자산 추이 그래프, 최고/최악의 한 수, 전적

## 1. Supabase 설정 (멀티플레이용, 한 번만)

1. https://supabase.com 에서 새 프로젝트 생성 (무료 플랜 OK)
2. 왼쪽 메뉴 **SQL Editor** → `supabase/schema.sql` 내용 전체 붙여넣기 → **Run**
3. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사
4. 프로젝트 폴더에 `.env.local` 파일 만들기:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 2. 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:5173 접속. Supabase 없이도 "혼자 연습하기"는 됩니다.

## 3. Vercel 배포

```bash
npm i -g vercel
vercel login
vercel --prod
```

배포 후 Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables** 에
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 추가하고 다시 `vercel --prod`.
(또는 GitHub에 올린 뒤 Vercel에서 Import 해도 됩니다. 프레임워크는 Vite로 자동 인식)

## 플레이 방법

1. 한 명이 **방 만들기** → 4자리 코드(또는 초대 링크)를 상대에게 전달
2. 상대가 코드로 **입장** → **준비 완료**
3. 방장이 **게임 시작** → 4초 카운트다운 후 장 개장
4. 폰을 잠갔다가 돌아와도 로비에서 **이어하기** 가능

## 구조

- `src/game/market.ts` — seed로 가격·뉴스를 결정론적으로 생성. 두 기기가 같은 seed + 서버 시작 시각을 쓰므로 서버 없이 같은 시장을 봄
- `src/game/portfolio.ts` — 거래 내역 → 현금/보유/평가액
- `src/net/room.ts` — Supabase 방/플레이어/거래, Realtime 구독(+폴링 백업)
- `supabase/schema.sql` — 테이블, RLS, RPC(`server_time`, `start_room`)

참고: 로그인 없는 개인용 게임이라 RLS가 anon 읽기/쓰기를 허용합니다. 링크가 퍼지면 다른 사람도 방을 만들 수 있다는 점만 알아두세요.
