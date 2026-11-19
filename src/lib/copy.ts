/**
 * 글자 복사 — 되면 true. 클립보드 기능이 없거나 막힌 곳(일부 앱 안 브라우저·오래된 브라우저)은
 * 숨은 입력 칸을 골라 예전 방식(execCommand)으로 한 번 더 시도.
 */
export async function copyText(t: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    /* 아래 예전 방식으로 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, t.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 휴대폰·태블릿은 공유 창, PC 는 바로 복사 (PC 에서 윈도 공유 창이 뜨지 않게). 'shared'·'copied'·'cancel'·'fail' */
export async function shareOrCopy(data: { title?: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'cancel' | 'fail'> {
  const touch = document.documentElement.dataset.device !== 'pc';
  if (touch && navigator.share) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancel';
      // 앱 안 브라우저 등에서 공유가 막히면 복사로
    }
  }
  return (await copyText(data.url ? `${data.text}\n${data.url}` : data.text)) ? 'copied' : 'fail';
}
