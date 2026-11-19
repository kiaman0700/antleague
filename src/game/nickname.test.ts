import { describe, it, expect } from 'vitest';
import { reservedNickname } from './nickname';

describe('운영자 흉내 닉네임', () => {
  it('막는 이름', () => {
    for (const n of ['운영자', '개미리그 운영자', '운 영 자', '관리자123', '개미리그공식', 'ADMIN', 'Adm1n', 'ａｄｍｉｎ', 'GM', 'official_kr', '고객센터', '운영', 'staff!']) expect(reservedNickname(n), n).toBe(true);
  });
  it('보통 이름은 통과', () => {
    for (const n of ['개미왕', '운영왕개미', '관리비', 'gman', 'modern', '시스템트레이더', '주식고수', 'kiaman', '단타의신']) expect(reservedNickname(n), n).toBe(false);
  });
});
