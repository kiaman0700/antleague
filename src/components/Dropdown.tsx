/** 사이트 디자인에 맞춘 고르기 목록 (기본 select 대신). 키보드: ↑↓ 이동, Enter 고르기, Esc 닫기 */
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface DropOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function Dropdown<T extends string>({ value, options, onChange, label }: { value: T; options: DropOption<T>[]; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, options, value]);

  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      pick(options[hi].value);
    }
  };

  return (
    <div className={'dropdown' + (open ? ' open' : '')} ref={box} onKeyDown={onKey}>
      <button className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur.label}`} onClick={() => setOpen((o) => !o)}>
        {cur.icon && <Icon name={cur.icon} size={14} />}
        <span>{cur.label}</span>
        <Icon name="down" size={14} className="dd-caret" />
      </button>
      {open && (
        <ul className="dd-list" role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={(o.value === value ? 'on' : '') + (i === hi ? ' hi' : '')}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o.value)}
            >
              {o.icon && <Icon name={o.icon} size={14} />}
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={14} className="dd-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
