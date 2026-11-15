/**
 * 화면 편집 모드에서 한 영역을 감싸는 틀: 점선 테두리 + 이름 + 순서 화살표 + 보이기/숨기기.
 * 편집 중이 아니면 그대로(숨긴 영역은 안 그림)
 */
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  editing: boolean;
  label: string;
  hidden?: boolean;
  /** 앞/뒤로 옮기기 (없으면 화살표 안 보임) */
  onPrev?: () => void;
  onNext?: () => void;
  /** 보이기/숨기기 (없으면 버튼 안 보임) */
  onToggle?: () => void;
  /** 화살표 방향: v = 위/아래, h = 왼쪽/오른쪽 */
  dir?: 'v' | 'h';
  className?: string;
  children: ReactNode;
}

export function EditSlot({ editing, label, hidden, onPrev, onNext, onToggle, dir = 'v', className, children }: Props) {
  if (!editing) return hidden ? null : <>{children}</>;
  return (
    <div className={'edit-slot' + (hidden ? ' off' : '') + (className ? ' ' + className : '')}>
      <div className="es-bar" onClick={(e) => e.stopPropagation()}>
        <b>{label}</b>
        {hidden && <span className="es-off">숨김</span>}
        <span className="es-tools">
          {onPrev && (
            <button className="es-btn" onClick={onPrev} aria-label={`${label} ${dir === 'h' ? '왼쪽으로' : '위로'}`}>
              <Icon name={dir === 'h' ? 'left' : 'up'} size={14} />
            </button>
          )}
          {onNext && (
            <button className="es-btn" onClick={onNext} aria-label={`${label} ${dir === 'h' ? '오른쪽으로' : '아래로'}`}>
              <Icon name={dir === 'h' ? 'right' : 'down'} size={14} />
            </button>
          )}
          {onToggle && (
            <button className="es-btn" onClick={onToggle} aria-label={`${label} ${hidden ? '보이기' : '숨기기'}`}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="es-body">{children}</div>
    </div>
  );
}
