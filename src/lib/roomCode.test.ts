import { describe, it, expect } from 'vitest';
import { parseRoomCode, hasConfusable } from './roomCode';

describe('방 코드 입력', () => {
  it('그냥 친 코드는 대문자·글자만', () => {
    expect(parseRoomCode('ab c-12')).toBe('ABC12');
    expect(parseRoomCode('abcdefgh')).toBe('ABCDEF');
  });
  it('초대 링크를 붙여 넣으면 코드만', () => {
    expect(parseRoomCode('https://antleague.vercel.app/room/k7mq2x')).toBe('K7MQ2X');
    expect(parseRoomCode('같이 하자! https://antleague.vercel.app/room/K7MQ2X 들어와')).toBe('K7MQ2X');
    expect(parseRoomCode('https://antleague.vercel.app/?room=K7MQ2X&x=1')).toBe('K7MQ2X');
    expect(parseRoomCode('localhost:5173/game/ABCDEF')).toBe('ABCDEF');
  });
  it('링크 모양이어도 6자가 아니면 링크로 보지 않음', () => {
    expect(parseRoomCode('/room/ABCDEFG')).toBe('ROOMAB');
  });
  it('I·O·0·1 은 코드에 없는 글자', () => {
    expect(hasConfusable('ABC0EF')).toBe(true);
    expect(hasConfusable('ABC2EF')).toBe(false);
  });
});
