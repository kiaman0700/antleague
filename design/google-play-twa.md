# 구글 플레이 출시 순서 (TWA — 지금 웹을 그대로 앱으로)

TWA(Trusted Web Activity)는 크롬이 우리 사이트를 주소창 없이 띄우는 안드로이드 앱이에요. 코드는 지금 웹 그대로 — 업데이트도 웹 배포만 하면 앱에 바로 반영돼요.

## 이미 준비된 것 (2026-11-20)
- 설치형 웹앱 조건: https 주소, 매니페스트(이름·아이콘 192/512·maskable·바로가기·스크린샷·분류), 서비스 워커(인터넷 끊김 안내 화면)
- 개인정보처리방침 바로 열리는 주소: https://antleague.vercel.app/privacy
- 스토어 글·대표 그림·스크린샷: `design/store-listing.md`, `design/store/feature-graphic.png`, `public/brand/screens/*`

## 사용자가 할 일
1. 구글 플레이 개발자 계정 등록 (25달러, 한 번)
2. 이 컴퓨터에서 앱 묶음 만들기 (무료 도구, Node 필요):
   ```
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://antleague.vercel.app/manifest.webmanifest
   bubblewrap build
   ```
   - 패키지 이름 예: `app.antleague.twa`
   - 서명 키(keystore)는 잃어버리면 업데이트를 못 하니 안전한 곳에 백업
3. 만들어진 서명 지문(SHA-256)을 알려 주면 → `public/.well-known/assetlinks.json` 을 만들어 배포 (주소창이 사라지는 조건)
4. 플레이 콘솔에서: 앱 만들기 → 스토어 등록정보(위 글·그림) → 콘텐츠 등급(IARC 설문, 답 초안은 store-listing.md) → 데이터 보안 양식(아래) → 비공개 테스트(12명 이상 14일, 새 개인 계정 조건) → 프로덕션

## 데이터 보안 양식 답 초안
- 수집: 앱 활동(게임 기록), 앱 정보·성능(오류 기록 — 행동 이름·문구만), 기기 ID 아님
- 회원: 아이디·닉네임(개인 식별 이름 아님), 비밀번호는 해시
- 공유: 없음 (Supabase·Vercel 은 처리 위탁)
- 전송 중 암호화: 예 (https)
- 삭제 요청: 앱 안 '탈퇴'로 바로 삭제 가능
