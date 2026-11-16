/**
 * 공통 화면 부품 — 여러 화면에서 같은 모양·같은 말투로 쓰기 위해 한곳에 모음.
 *   Loading      불러오는 중 (작은 글 + 회전 표시)
 *   EmptyState   비어 있을 때 안내 (아이콘·제목·설명·버튼)
 *   ErrorState   불러오기 실패 + '다시 시도'
 *   IconList     아이콘이 붙은 안내 목록 (순서가 있으면 steps 로 세로 선 연결)
 *   SectionTitle 칸 제목 (아이콘 + 글 + 오른쪽 덧붙임)
 * 모양은 styles-kit.css
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** 불러오는 중 — inline 이면 줄 안에 작게, 아니면 칸 가운데 */
export function Loading({ label = '불러오는 중…', inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={'ui-loading' + (inline ? ' inline' : '')} role="status" aria-live="polite">
      <span className="ui-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** 비어 있을 때: 무엇이 없는지 + 어떻게 채우는지 + (있으면) 바로 할 수 있는 버튼 */
export function EmptyState({
  icon,
  title,
  desc,
  action,
  compact = false,
  tone,
}: {
  icon: IconName;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: 'error';
}) {
  return (
    <div className={'ui-empty' + (compact ? ' compact' : '') + (tone ? ' ' + tone : '')}>
      <i aria-hidden>
        <Icon name={icon} size={compact ? 24 : 30} />
      </i>
      <b>{title}</b>
      {desc && <small>{desc}</small>}
      {action && <div className="ui-empty-act">{action}</div>}
    </div>
  );
}

/** 불러오기 실패: 같은 말투 + '다시 시도' 버튼 */
export function ErrorState({ what, onRetry, compact = false }: { what: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <EmptyState
      icon="warn"
      tone="error"
      compact={compact}
      title={`${what}${hasBatchim(what.slice(-1)) ? '을' : '를'} 불러오지 못했어요`}
      desc="인터넷 연결을 확인하고 다시 시도해 주세요."
      action={
        onRetry && (
          <button className="btn sm" onClick={onRetry}>
            <Icon name="refresh" size={14} /> 다시 시도
          </button>
        )
      }
    />
  );
}

/** 마지막 글자에 받침이 있는지 (을/를 고르기) */
function hasBatchim(ch: string) {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

export interface IconListItem {
  icon: IconName;
  title?: ReactNode;
  body: ReactNode;
}
/** 아이콘 안내 목록. steps 면 순서대로 세로 선으로 이어 줌 (진행 순서처럼 정말 순서가 있을 때만) */
export function IconList({ items, steps = false }: { items: IconListItem[]; steps?: boolean }) {
  return (
    <ol className={'ui-iconlist' + (steps ? ' steps' : '')}>
      {items.map((it, i) => (
        <li key={i}>
          <i aria-hidden>
            <Icon name={it.icon} size={17} />
          </i>
          <span>
            {it.title && <b>{it.title}</b>}
            <span className="ui-il-body">{it.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 칸 제목: 아이콘 + 제목 (+ 오른쪽에 개수·링크 등) */
export function SectionTitle({ icon, children, right }: { icon?: IconName; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="ui-title">
      <h3>
        {icon && <Icon name={icon} size={18} />}
        {children}
      </h3>
      {right && <div className="ui-title-right">{right}</div>}
    </div>
  );
}
