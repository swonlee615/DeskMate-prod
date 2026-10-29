/**
 * 편집기 — `@날짜` 메뉴 · 날짜 칩 달력 (v3 renderMenMenu · openDatePick · v2.9.69 · 82)
 *
 * ★ 마크업 · 클래스는 v3 그대로 (`.men-menu .men-i` · `.dpick .dpk-*`) — 화면 기준(fixed)으로 커서 · 칩 옆에
 * ★ 누르는 순간 글 칸의 포커스를 지킨다 (pointerdown · mousedown 을 막는다) — 폰에서도 키보드가 안 내려간다
 * ★ 날짜 칩은 «이 줄이 말하는 날» 이지 «이 줄이 사는 날» 이 아니다 — 넣어도 줄을 옮기지 않는다 (v3.1.161)
 * 노션 페이지 멘션은 옮기지 않는다 (노션 생략 · 2026-10-29)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DateCand } from '../domain/todos/inline';
import { dateChipLabel } from '../domain/todos/inline';
import { addDays, keyOf } from '../ui/v3fmt';
import { CHEV } from './Worklog';

const keep = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
/** 화면 밖으로 안 나가게 — 아래가 좁으면 위로 */
function usePlace(at: { x: number; top: number; bottom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const below = at.bottom + 6;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, at.x)), top: below + h > window.innerHeight - 8 ? Math.max(8, at.top - h - 6) : below });
  }, [at.x, at.top, at.bottom]);
  return { ref, style: pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 } };
}

export interface MenAt { x: number; top: number; bottom: number }

export function MenMenu({ at, items, idx, onPick }: { at: MenAt; items: DateCand[]; idx: number; onPick: (i: number) => void }) {
  const { ref, style } = usePlace(at);
  return createPortal(
    <div className="men-menu" ref={ref} style={style} role="listbox" aria-label="날짜 넣기">
      {items.length ? items.map((r, i) => (
        <button key={r.ref} type="button" className={`men-i${i === idx ? ' on' : ''}`} role="option" aria-selected={i === idx}
          onPointerDown={keep} onMouseDown={(e) => { keep(e); onPick(i); }}>
          <span className="mi">📅</span><span className="nm">{r.label}</span><span className="sub">날짜</span>
        </button>
      )) : <div className="men-empty">맞는 날짜가 없어요<br /><span className="men-tip">오늘 · 내일 · 금(요일) · 1104 · 11월4일 · 4 처럼 쳐 보세요</span></div>}
    </div>,
    document.body,
  );
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 날짜 칩을 누르면 — 그 자리에서 날을 바꾸거나 지우고, 그 날로 갈 수도 있다 */
export function DatePick({ at, sel, today, onPick, onGo, onClose }: {
  at: MenAt; sel: string; today: string; onPick: (key: string | null) => void; onGo?: () => void; onClose: () => void;
}) {
  const d0 = new Date(`${sel}T12:00:00`);
  const [ym, setYm] = useState({ y: d0.getFullYear(), m: d0.getMonth() });
  const { ref, style } = usePlace(at);
  useEffect(() => {
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); }, 0);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); };
  }, [onClose, ref]);
  const first = new Date(ym.y, ym.m, 1);
  const start = addDays(first, -first.getDay());   // 그 주 일요일부터 6주
  const mv = (n: number) => { const k = ym.m + n; setYm({ y: ym.y + Math.floor(k / 12), m: ((k % 12) + 12) % 12 }); };
  const act = (f: () => void) => ({ onPointerDown: keep, onMouseDown: (e: React.MouseEvent) => { keep(e); f(); } });
  return createPortal(
    <div className="dpick" ref={ref} style={style} role="dialog" aria-label="칩 날짜 바꾸기">
      <div className="dpk-h">
        <button type="button" className="dpk-nav" aria-label="이전 달" {...act(() => mv(-1))}>{CHEV(-1)}</button>
        <b>{ym.y}년 {ym.m + 1}월</b>
        <button type="button" className="dpk-nav" aria-label="다음 달" {...act(() => mv(1))}>{CHEV(1)}</button>
      </div>
      <div className="dpk-w">{DOW.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="dpk-g">
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i), k = keyOf(d);
          return <button key={k} type="button" className={`dpk-d${d.getMonth() === ym.m ? '' : ' out'}${k === sel ? ' on' : ''}${k === today ? ' today' : ''}`}
            {...act(() => onPick(k))}>{d.getDate()}</button>;
        })}
      </div>
      <div className="dpk-q">
        <button type="button" className="dpk-lnk" {...act(() => onPick(today))}>오늘로</button>
        <button type="button" className="dpk-lnk" {...act(() => onPick(null))}>날짜 삭제</button>
      </div>
      {onGo && <button type="button" className="dpk-go" {...act(onGo)}>{dateChipLabel(sel, `${d0.getMonth() + 1}월 ${d0.getDate()}일 (${DOW[d0.getDay()]})`, today)} 페이지로 이동 →</button>}
    </div>,
    document.body,
  );
}
