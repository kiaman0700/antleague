import { describe, expect, it } from 'vitest';
import { communityPosts, gameTime } from '../game/community';
import { liveNews } from '../game/liveNews';
import { generateMarket } from '../game/market';

describe('v22 게임 시간으로 말하기', () => {
  it('gameTime: 1분 하루는 초만, 5분 하루는 분·초', () => {
    expect(gameTime(0.5, 60)).toBe('30초');
    expect(gameTime(0.502, 300)).toBe('2분 31초');
    expect(gameTime(0, 300)).toBe('장 시작');
  });

  it('v22 글에는 시계 말(오전·오후·시쯤)이 없고, 1분 하루엔 분도 없음', () => {
    for (let s = 1; s <= 5; s++) {
      const m = generateMarket(s * 31, 10, 22, 'k' + s);
      for (let d = 0; d < 10; d++) {
        for (const p of communityPosts(m, d, 'k' + s, 60)) {
          expect(p.text).not.toMatch(/오전|오후|낮 \d|시쯤|시간 안에|\d분/);
        }
        for (const p of communityPosts(m, d, 'k' + s, 300)) expect(p.text).not.toMatch(/오전|오후|시쯤|시간 안에/);
        for (const n of liveNews(m, d, 'k' + s, 60, 60)) expect(n.headline).not.toMatch(/\d\d:\d\d/);
      }
    }
  });

  it('글의 시각·진위·들썩임과 가격은 하루 길이·버전(v21↔v22)과 상관없음', () => {
    const a = generateMarket(77, 10, 21, 'salt');
    const b = generateMarket(77, 10, 22, 'salt');
    expect(JSON.stringify(b.bars)).toBe(JSON.stringify(a.bars));
    for (let d = 0; d < 10; d++) {
      const x = communityPosts(a, d, 'salt').map((p) => [p.at, p.real, p.hype, p.symbol, p.tone]);
      const y = communityPosts(b, d, 'salt', 60).map((p) => [p.at, p.real, p.hype, p.symbol, p.tone]);
      expect(y).toEqual(x);
    }
  });

  it('v21 판은 하루 길이를 줘도 예전 글 그대로', () => {
    const a = generateMarket(77, 10, 21, 'salt');
    for (let d = 0; d < 10; d++) expect(communityPosts(a, d, 'salt', 60).map((p) => p.text)).toEqual(communityPosts(a, d, 'salt').map((p) => p.text));
  });
});
