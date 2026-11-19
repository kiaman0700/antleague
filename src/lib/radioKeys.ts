/**
 * '여럿 중 하나 고르기'(role="radiogroup") 버튼 묶음을 방향키로: ←↑ 앞, →↓ 뒤로 옮기며 바로 고름 (Home·End 처음·끝).
 * 화면 읽기 프로그램은 '라디오 단추'라고 읽어 주므로 사용자는 방향키를 기대함 — 묶음마다 따로 달지 않고 사이트 전체에서 한 번.
 */
export function startRadioKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    const cur = (e.target as HTMLElement | null)?.closest?.('[role="radio"]') as HTMLElement | null;
    const group = cur?.closest('[role="radiogroup"]');
    if (!cur || !group) return;
    const items = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].filter((x) => !(x as HTMLButtonElement).disabled && x.closest('[role="radiogroup"]') === group);
    const i = items.indexOf(cur);
    if (i < 0 || items.length < 2) return;
    const next = key === 'Home' ? 0 : key === 'End' ? items.length - 1 : (i + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    e.preventDefault();
    // 게임 화면의 방향키(종목 이동) 같은 다른 단축키로 번지지 않게
    e.stopPropagation();
    items[next].focus();
    items[next].click();
  }, true);
}
