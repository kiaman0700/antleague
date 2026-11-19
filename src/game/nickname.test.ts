import { describe, it, expect } from 'vitest';
import { reservedNickname, titleProblem, foldWidth, mixedScript } from './nickname';

describe('운영자 흉내 닉네임', () => {
  it('막는 이름', () => {
    for (const n of ['운영자', '개미리그 운영자', '운 영 자', '관리자123', '개미리그공식', 'ADMIN', 'Adm1n', 'ａｄｍｉｎ', 'GM', 'official_kr', '고객센터', '운영', 'staff!']) expect(reservedNickname(n), n).toBe(true);
  });
  it('보통 이름은 통과', () => {
    for (const n of ['개미왕', '운영왕개미', '관리비', 'gman', 'modern', '시스템트레이더', '주식고수', 'kiaman', '단타의신']) expect(reservedNickname(n), n).toBe(false);
  });
});

describe('방 제목', () => {
  it('막는 제목', () => {
    for (const t of ['개미리그 운영자 이벤트', '관리자방', '무료 리딩방', '오픈채팅 문의', 'open.kakao.com/o/abc', '수익 보장 t.me/abc', 'www.abc.kr', '010-1234-5678', 'discord.gg/xx', 'abc.shop 가입']) expect(titleProblem(t), t).not.toBeNull();
  });
  it('보통 제목은 통과', () => {
    for (const t of ['같이 한 판', '공식대로 투자', '초보만 오세요', '카톡방 친구들', '10일 신속전', '2026 첫 판', '개미 모여라']) expect(titleProblem(t), t).toBeNull();
  });
});

describe('닮은 글자', () => {
  it('전각 영어·숫자는 보통 글자로, 한글 자모는 그대로', () => {
    expect(foldWidth('ｋｉａｍａｎ０７')).toBe('kiaman07');
    expect(foldWidth('ㅋㅋ개미')).toBe('ㅋㅋ개미');
    expect(foldWidth('개미　왕')).toBe('개미 왕');
  });
  it('영어에 러시아·그리스 글자를 섞으면 걸림', () => {
    expect(mixedScript('kiаman')).toBe(true); // 가운데 а 는 러시아 글자
    expect(mixedScript('Αnt')).toBe(true); // 그리스 알파
    expect(mixedScript('kiaman')).toBe(false);
    expect(mixedScript('Иван')).toBe(false);
    expect(mixedScript('개미ant')).toBe(false);
  });
});
