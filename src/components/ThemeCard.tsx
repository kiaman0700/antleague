/** 오늘의 시장 테마 카드 (v26): 아이콘 + 이름 + 한 줄. 어느 종목·몇 일차인지는 알려 주지 않음 */
import { THEME_MAP, type ThemeId } from '../game/themes';
import { Icon, type IconName } from './Icon';

const ICON: Record<ThemeId, IconName> = { pump: 'flame', war: 'fuel', delist: 'warn', rate: 'percent', binary: 'activity', short: 'eye', rights: 'coins' };

export function ThemeCard({ id, lesson }: { id?: string | null; lesson?: boolean }) {
  const t = id ? THEME_MAP[id] : null;
  if (!t) return null;
  return (
    <div className="theme-card">
      <i aria-hidden>
        <Icon name={ICON[t.id]} size={20} />
      </i>
      <span>
        <small>오늘의 시장</small>
        <b>{t.name}</b>
        <span className="theme-text">{lesson ? t.lesson : t.card}</span>
      </span>
    </div>
  );
}
export const themeName = (id?: string | null) => (id ? THEME_MAP[id]?.name ?? null : null);
