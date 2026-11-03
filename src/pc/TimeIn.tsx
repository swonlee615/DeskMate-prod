/**
 * HH:MM 입력 (v3 timeInput · bindTimeInputs · tinOpen)
 * ★ 숫자만 쳐도 된다 (1005 → 10:05) · 치는 대로 콜론을 넣는다 · ↑↓ 5분씩(⇧ 30분씩)
 * ★ ▾ 를 누르면 5분 단위 목록이 앱 색으로 열린다. 고르면 그 값으로 확정
 * ★ 엔터 · 칸 벗어나기로 확정, Esc 로 되돌리기
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normTime } from '../ui/v3fmt';

const STEP = 5;
const pad = (n: number) => String(n).padStart(2, '0');
const toM = (v: string | null) => { const p = /^(\d{2}):(\d{2})$/.exec(v ?? ''); return p ? +p[1] * 60 + +p[2] : null; };
const toT = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };

export function TimeIn({ value, attrs, onCommit, onLive, id, label }: {
  value: string; attrs?: Record<string, string | number>; id?: string; label?: string;
  onCommit: (v: string, el: HTMLInputElement) => void;
  /** 치는 동안의 값 (상자의 «몇 분» 표시처럼 바로 따라가야 할 때) */
  onLive?: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [pop, setPop] = useState<DOMRect | null>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) { ref.current.value = value; ref.current.dataset.last = value; } }, [value]);
  const put = (v: string) => { const el = ref.current; if (!el) return; el.value = v; onLive?.(v); };
  // 고르면 확정 — 칸에 커서가 있으면 벗어나기(onBlur)가 한 번만 확정하게 둔다
  const pick = (v: string) => { const el = ref.current; setPop(null); if (!el) return; put(v); if (document.activeElement === el) el.blur(); else onCommit(v, el); };
  return (
    <span className="tin-w">
      <input ref={ref} id={id} className="tin tin-i" type="text" inputMode="numeric" maxLength={5} autoComplete="off" placeholder="--:--"
        aria-label={label} defaultValue={value} data-last={value} {...attrs}
        onInput={(e) => {
          const el = e.currentTarget, d = el.value.replace(/\D/g, '').slice(0, 4);
          // 콜론을 직접 찍었으면 그대로 둔다 ('9:5'). 숫자만이면 3자리부터 콜론
          if (!/[:.]/.test(el.value)) el.value = d.length >= 3 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
          onLive?.(el.value);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === 'Enter') { e.preventDefault(); el.blur(); return; }
          if (e.key === 'Escape') { e.stopPropagation(); setPop(null); put(el.dataset.last ?? ''); el.blur(); return; }
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const up = e.key === 'ArrowUp', base = toM(normTime(el.value));
          put(toT(base == null ? (up ? 540 : 1080) : base + (e.shiftKey ? 30 : STEP) * (up ? 1 : -1)));
        }}
        onBlur={(e) => onCommit(e.target.value, e.target)} />
      <button className="tin-c" type="button" tabIndex={-1} title="시각 고르기" aria-label="시각 고르기" aria-expanded={!!pop}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPop(pop ? null : ref.current?.getBoundingClientRect() ?? null)}>
        <svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg></button>
      {pop && <TinPop at={pop} cur={toM(normTime(ref.current?.value ?? ''))} onPick={pick} onClose={() => setPop(null)} />}
    </span>
  );
}

/** 5분 단위 목록 — 칸 밑(모자라면 위)에, 지금 값(없으면 09:00)이 보이게 굴려 둔다 */
function TinPop({ at, cur, onPick, onClose }: { at: DOMRect; cur: number | null; onPick: (v: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current;
    const sel = b?.querySelector<HTMLElement>('.tin-o.on') ?? b?.querySelector<HTMLElement>('[data-t="09:00"]');
    if (b && sel) b.scrollTop = Math.max(0, sel.offsetTop - 88);
    const away = (e: MouseEvent) => { if (!(e.target as Element).closest('.tin-pop, .tin-c')) onClose(); };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', onClose);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('resize', onClose); };
  }, [onClose]);
  const top = at.bottom + 4 + 240 > window.innerHeight ? Math.max(8, at.top - 244) : at.bottom + 4;
  // 상자(모달) 안에서도 잘리지 않게 body 에 띄운다
  return createPortal(
    <div ref={box} className="tin-pop" role="listbox" style={{ left: Math.min(at.left, window.innerWidth - 128), top, minWidth: Math.max(96, at.width) }}>
      {Array.from({ length: 1440 / STEP }, (_, i) => {
        const m = i * STEP, v = toT(m);
        return <button key={v} type="button" role="option" aria-selected={cur === m} className={`tin-o${cur === m ? ' on' : ''}`} data-t={v}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(v)}>{v}</button>;
      })}
    </div>, document.body);
}
