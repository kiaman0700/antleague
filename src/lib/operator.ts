/** 운영자·개인정보 보호 책임자 (Vercel 환경변수 VITE_OPERATOR_CONTACT, 예: "홍길동 · contact@example.com") — 로비 아래 줄에 늘 보여서 약관 본문과 따로 둠 */
export const OPERATOR = ((import.meta.env.VITE_OPERATOR_CONTACT as string | undefined) ?? '').trim().slice(0, 120);
