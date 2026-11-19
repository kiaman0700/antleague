/**
 * 운영자로 오해할 수 있는 닉네임 막기 — 새로 정하는 닉네임에만 씀(가입·닉네임 바꾸기·게스트 닉네임).
 * 의존성 없는 작은 파일: 서버와 로비 화면이 같이 씀 (로비가 엔진을 불러오지 않게).
 */
export const RESERVED_NICK_MSG = '운영자·공식 계정으로 오해할 수 있는 닉네임은 쓸 수 없어요.';

// 이 말이 들어가면 막음 (띄어쓰기·기호·대소문자·전각 무시)
const CONTAINS = ['운영자', '운영진', '운영팀', '관리자', '관리팀', '개미리그', '고객센터', '공식', '스태프', 'antleague', 'admin', 'official', 'moderator', 'staff'];
// 이 말과 똑같으면 막음 (짧아서 다른 이름 속에 흔히 들어감)
const EXACT = ['운영', '관리', 'gm', 'mod'];
// 숫자로 영어를 흉내 낸 것 (adm1n, 0fficial)
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };

function squash(n: string): string {
  return n
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

export function reservedNickname(n: string, words: string[] = CONTAINS): boolean {
  const s = squash(n);
  if (!s) return false;
  const leet = s.replace(/[013457]/g, (c) => LEET[c] ?? c);
  return words.some((w) => s.includes(w) || leet.includes(w)) || EXACT.includes(s) || EXACT.includes(leet);
}

// 방 제목은 '공식대로 투자' 같은 말이 흔해서 '공식' 은 빼고 봄
const TITLE_WORDS = CONTAINS.filter((w) => w !== '공식');
// 공개 방 목록에 올라가는 홍보·연락처 (주식 리딩방 사기에 흔한 모양)
const PROMO = /(https?:|www\.|\.(?:com|net|org|kr|io|me|ly|gg|xyz|link|site|shop)(?![a-z])|openkakao|오픈채팅|오픈톡|리딩방|텔레그램|telegram|tme\/|t\.me|discord\.gg|01[016789]\d{7,8})/i;

/** 방 제목 문제 (없으면 null) — 서버가 확인, 화면도 같은 말로 미리 보여 줌 */
export function titleProblem(t: string): string | null {
  if (reservedNickname(t, TITLE_WORDS)) return '운영자·공식 방으로 오해할 수 있는 제목은 쓸 수 없어요.';
  const flat = t.normalize('NFKC').toLowerCase().replace(/[\s\-]/g, '');
  if (PROMO.test(flat)) return '방 제목에는 링크·연락처·홍보 문구를 쓸 수 없어요.';
  return null;
}
