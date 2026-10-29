/**
 * 폰 편집기 — 키보드 위 도구 줄 (노션 앱처럼). 폰에는 Tab 키가 없어서 들여쓰기를 여기서 한다
 *
 * ★ 동작은 NoteEditor 가 넘겨준 함수 그대로 (PC Tab/⇧Tab · `[] ` · `- ` 와 같은 함수) — 여기서 따로 만들지 않는다
 * ★ 단추를 눌러도 글 칸의 포커스가 안 빠지게 pointerdown 을 막는다 → 키보드가 내려가지 않는다
 * ★ 자리는 키보드 바로 위 — visualViewport 로 키보드 높이를 잰다 (iOS Safari 는 fixed 가 키보드 뒤로 숨는다)
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BlockArea, BlockType } from '../domain/todos/tree';

/** 키보드가 가린 높이 (px) — 키보드가 없으면 0 */
function useKbInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return inset;
}

const I = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const IC_CHECK = I(<><rect x="4.5" y="4.5" width="15" height="15" rx="3.5" /><path d="m8.6 12.2 2.4 2.4 4.6-5" /></>);
const IC_BULLET = I(<><circle cx="6" cy="7" r="1.2" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="6" cy="17" r="1.2" fill="currentColor" stroke="none" /><path d="M10 7h9M10 12h9M10 17h9" /></>);
const IC_OUT = I(<><path d="M4 6h16M11 12h9M4 18h16" /><path d="M8 9.5 5 12l3 2.5" /></>);
const IC_IN = I(<><path d="M4 6h16M11 12h9M4 18h16" /><path d="m5 9.5 3 2.5-3 2.5" /></>);
const IC_DONE = I(<><rect x="3.5" y="4.5" width="17" height="10" rx="2" /><path d="M7 8h.01M10 8h.01M13 8h.01M16 8h.01M8 11.5h8" /><path d="m9.5 18 2.5 2 2.5-2" /></>);

export function KbBar({ area, type, depth, fixed, onShift, onType, onDone }: {
  area: BlockArea; type: BlockType; depth: number; fixed: boolean;
  onShift: (out: boolean) => void; onType: (t: BlockType) => void; onDone: () => void;
}) {
  const inset = useKbInset();
  // 누르는 순간 포커스를 지킨다 — click 은 그 다음에 온다
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();
  const btn = (label: string, icon: React.ReactNode, run: () => void, opt: { on?: boolean; off?: boolean } = {}) => (
    <button type="button" className={`m-kb-b${opt.on ? ' on' : ''}`} aria-label={label} aria-pressed={opt.on} disabled={opt.off}
      onPointerDown={keep} onMouseDown={keep} onClick={run}>{icon}</button>
  );
  return createPortal(
    <div className={`m-kb${inset ? '' : ' flat'}`} role="toolbar" aria-label="줄 편집" style={{ bottom: inset }} onPointerDown={keep} onMouseDown={keep}>
      {area === 'today' && <>
        {btn('할 일', IC_CHECK, () => onType('check'), { on: type === 'check', off: fixed })}
        {btn('글머리', IC_BULLET, () => onType('bullet'), { on: type === 'bullet', off: fixed })}
        <i className="m-kb-sep" aria-hidden="true" />
      </>}
      {btn('내어쓰기', IC_OUT, () => onShift(true), { off: fixed || depth === 0 })}
      {btn('들여쓰기', IC_IN, () => onShift(false), { off: fixed || depth >= 8 })}
      <span className="m-kb-sp" />
      {btn('키보드 내리기', IC_DONE, onDone)}
    </div>,
    document.body,
  );
}
