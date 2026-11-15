---
name: game-self-check
description: 주식 대결 게임의 변경을 "다 됐다"고 말하기 전에 돌리는 검수 매뉴얼. 단위 테스트·타입체크·빌드·실제 서버 e2e·브라우저(모바일 세로/가로, PC) 확인을 전부 통과할 때까지 고친다. 기능 구현·버그 수정·화면 변경을 마칠 때, 커밋이나 배포 전에 사용.
---

# 검수 (game-self-check)

`verification-before-completion` 의 원칙(증거 없이 "됐다" 금지)을 이 프로젝트에 맞게 구체화한 것. **전부 통과할 때까지** 고치고 다시 돌린다. 실패를 고칠 때는 `systematic-debugging` 을 따른다 (원인 먼저, 추측 수정 금지).

## 1. 코드 검사 (항상)

```bash
npx tsc --noEmit -p .   # 타입 (api/ 포함)
npm test                # 단위 테스트 — 0 failed
npm run build           # 빌드 — "built in" 확인
```

새 기능이면 `src/engine/*.test.ts` 에 다음이 있는지 확인하고 없으면 추가:
- 규칙 테스트 (경계값 포함: 1대1 / 3인 / 6인, 시간 직전·직후)
- **정보가 새지 않는다** 테스트 (`buildView` 결과 JSON 에 숨겨야 할 값이 없음)
- 같은 시드의 가격이 그대로인지 (시장 생성 코드를 건드렸다면)

## 2. 실제 서버 (서버·DB를 건드렸다면)

dev 서버가 켜져 있어야 함 (`preview_start` 의 `dev`).

```bash
npm run e2e
```

- 새 규칙이면 `scripts/e2e/` 에 시나리오를 추가 (`turn-rules.mjs` 참고)
- Supabase 익명 로그인 횟수 제한(`Request rate limit reached`)에 걸리면 코드 문제가 아님 — 잠시 뒤 다시. 그 사이 통과 못 한 사실은 그대로 보고
- DB 상태 확인은 `npm run db -- check` (읽기만)

## 3. 브라우저 (화면을 건드렸다면) — 세 가지 크기 모두

내장 브라우저에서 `resize_window` 로:
- 모바일 세로 `mobile`(375×812)
- 모바일 가로 812×375
- PC 1366×768 (낮은 노트북) — 필요하면 1920×1080 도

각 크기에서 확인:
- `document.documentElement.scrollWidth <= innerWidth` (옆 스크롤 없음)
- PC 게임 화면은 `scrollHeight <= innerHeight` (페이지 전체 스크롤 없음, 패널 안 스크롤만)
- 바뀐 화면을 실제로 눌러 봄 (스크린샷으로 확인)
- `read_console_messages` 에 에러 0
- 끝나면 `resize_window` 를 `desktop` 으로 되돌림

연습 모드로 빨리 들어가려면 `localStorage` 에 `stockduel.nick`, `stockduel.tutorial='1'` 을 넣고 홈 → 혼자 연습.

## 4. 보고

사용자에게 한국어로:
- 통과한 것 — 숫자와 함께 ("단위 테스트 49개 통과", "e2e 3종 통과")
- **확인 못 한 것** — 이유와 함께 (예: 횟수 제한, 실제 휴대폰 미확인)
- 커밋·배포 여부 (사용자가 요청하지 않았으면 하지 않음)
