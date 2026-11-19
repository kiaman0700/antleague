/** 오늘의 시장 테마 카드 (v26): 아이콘 + 이름 + 한 줄. 어느 종목·몇 일차인지는 알려 주지 않음 */
import { THEME_MAP, type ThemeId } from '../game/themes';
import { ToonIcon } from './ToonIcon';

export function ThemeCard({ id, lesson }: { id?: string | null; lesson?: boolean }) {
  const t = id ? THEME_MAP[id] : null;
  if (!t) return null;
  return (
    <div className="theme-card">
      <ToonIcon name={t.id as ThemeId} size={42} />
      <span>
        <small>오늘의 시장</small>
        <b>{t.name}</b>
        <span className="theme-text">{lesson ? t.lesson : t.card}</span>
      </span>
    </div>
  );
}
export const themeName = (id?: string | null) => (id ? THEME_MAP[id]?.name ?? null : null);
