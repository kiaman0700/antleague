import { describe, it, expect } from 'vitest';
import { reservedNickname, titleProblem, foldWidth, mixedScript, randomGuestName, GUEST_ADJ, nickNotice } from './nickname';

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

describe('손님 무작위 이름', () => {
  it('형용사+개미+4자리, 10자 안, 막는 이름이 아님', () => {
    for (let a = 0; a < GUEST_ADJ.length; a++) {
      const n = randomGuestName((k) => (k === GUEST_ADJ.length ? a : k - 1));
      expect(n).toMatch(/^[가-힣]{2,3}개미\d{4}$/);
      expect([...n].length).toBeLessThanOrEqual(10);
      expect(nickNotice(n)).toBeNull();
    }
  });
});

describe('보이지 않는 글자', () => {
  it('한글 채움·점자 빈칸·결합 부호가 낀 이름은 숨은 글자로 잡힘, 그림 글자(변형 선택자)는 괜찮음', async () => {
    const { hasHiddenChars } = await import('./nickname');
    expect(hasHiddenChars('홍길동ㅤ')).toBe(true);
    expect(hasHiddenChars('ㅤㅤ')).toBe(true);
    expect(hasHiddenChars('운́영자')).toBe(true);
    expect(hasHiddenChars('a⠀b')).toBe(true);
    expect(hasHiddenChars('개미❤️')).toBe(false);
    expect(hasHiddenChars('주식왕개미')).toBe(false);
  });
  it('숨은 글자를 끼워도 운영자 흉내는 걸림', () => {
    expect(reservedNickname('운영ㅤ자')).toBe(true);
    expect(reservedNickname('운︁영자')).toBe(true);
  });
});
