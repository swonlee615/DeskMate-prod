/**
 * 폰 시간표 — 위에서 아래로 흐르는 하루 (PC 5분 격자를 폰 폭에 줄이면 칸이 25×19px 라 누를 수도 읽을 수도 없었다)
 *
 * ★ 그리는 것은 domain `timeline()` 한 벌 — 근무 · 휴게 · 비근무 · 시간 기록 · 근무 밖 휴게 (PC 격자 · 홈 리본과 같은 판정)
 * ★ 기록 이름 · 카테고리는 블록 안에 바로 — 따로 «기록 목록» 을 두지 않아 기록이 쌓여도 길이가 그대로
 * ★ 보이는 시간대는 구간이 있는 앞뒤 1시간 (`tlHours`) · 그 안에서도 볼 것 없는 2시간 이상은 한 줄로 접는다 (`tlLayout`). 누르면 24시간 다 펼침
 * ★ 빈 곳을 누르면 그 시각부터 30분 · 길게 눌러 끌면 그 구간 (PC 끌어 긋기와 같은 5분 단위). 블록을 누르면 그 기록
 */
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import type { Day } from '../domain/attendance/types';
import { catName } from '../domain/attendance/cats';
import { catVar, nextColor, timeline, tlHours, type TLSpan } from '../domain/attendance/logs';
import { fmtDur } from '../ui/v3fmt';
import { openBrk, type OpenSpan } from '../pc/DayPage';
import { busyHours, tlLayout } from './tlLayout';

const H = 52;              // 한 시간 높이(px)
const FOLD = 36;           // 접힌 줄 높이
const STEP = 5;
const HOLD = 280;          // 길게 누름 (ms)
const fm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const LABEL: Record<TLSpan['kind'], string> = { work: '근무', break: '휴게', off: '비근무', slot: '', rest: '휴게' };

export function MTimeline({ ws, d, isToday, onOpen }: { ws: Workspace; d: Day; isToday: boolean; onOpen: (o: OpenSpan) => void }) {
  const tl = timeline(d, ws.logs, ws.now);
  const t = new Date(ws.now);
  const nowM = isToday ? t.getHours() * 60 + t.getMinutes() : null;
  const [full, setFull] = useState(false);
  const [h0, h1] = full ? [0, 24] : tlHours(tl, nowM);
  const L = tlLayout(h0, h1, busyHours(tl, nowM), H, FOLD, full);
  const top = L.y;
  const hgt = (x: { s: number; e: number }) => Math.max(2, L.y(x.e) - L.y(x.s));

  // 길게 눌러 끌기 — 손가락이 움직이기 전에 HOLD 만큼 누르고 있어야 긋기. 그 전에 움직이면 그냥 스크롤
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  /** 그 높이의 시각 (5분 단위). 접힌 줄 위면 null */
  const minAt = (y: number) => {
    const m = L.m(y - box.current!.getBoundingClientRect().top);
    return m == null ? null : Math.max(h0 * 60, Math.min(h1 * 60 - STEP, Math.floor(m / STEP) * STEP));
  };
  const hit = (el: EventTarget | null): OpenSpan | null => {
    const i = (el as HTMLElement | null)?.closest<HTMLElement>('[data-tl]')?.dataset.tl;
    const x = i != null ? tl[+i] : null;
    if (!x?.ref) return null;
    return x.ref.type === 'brk' ? openBrk(d, x.ref.idx, ws.now) : { ref: x.ref, s: x.s, e: x.e, kind: x.kind === 'slot' ? 'slot' : 'break' };
  };
  const draw = (a: number, b: number): OpenSpan => {
    const s = Math.min(a, b), e = Math.max(a, b) + STEP;
    // 근태 휴게 위를 그었으면 휴게로 (PC Grid 와 같은 «절반 이상» 규칙)
    const inBrk = tl.filter((x) => x.kind === 'break').reduce((n, x) => n + Math.max(0, Math.min(e, x.e) - Math.max(s, x.s)), 0);
    return { ref: null, s, e, kind: inBrk * 2 >= e - s ? 'break' : 'slot' };
  };
  const tap = (y: number, el: EventTarget | null) => {
    const o = hit(el);
    if (o) { onOpen(o); return; }
    const s = minAt(y);
    if (s == null) { setFull(true); return; }
    onOpen({ ...draw(s, s), e: Math.min(1440, s + 30) });
  };
  const cur = useRef<{ y: number; a: number; on: boolean; t: number; el: EventTarget | null } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const a = minAt(y);
      const c = { y, a: a ?? 0, on: false, el: e.target, t: 0 };
      if (a != null) c.t = window.setTimeout(() => { c.on = true; setSel([c.a, c.a]); navigator.vibrate?.(8); }, HOLD);
      cur.current = c;
    };
    const move = (e: TouchEvent) => {
      const c = cur.current;
      if (!c) return;
      const y = e.touches[0].clientY;
      if (!c.on) { if (Math.abs(y - c.y) > 8) { clearTimeout(c.t); cur.current = null; } return; }
      e.preventDefault();
      const b = minAt(y);
      if (b != null) setSel([c.a, b]);
    };
    const end = (e: TouchEvent) => {
      const c = cur.current;
      cur.current = null;
      if (!c) return;
      clearTimeout(c.t);
      e.preventDefault(); // 뒤따르는 click 을 막는다 — 블록 · 빈 곳 판정은 여기서 한 번
      if (c.on) {
        setSel((s) => { if (s) onOpen(draw(s[0], s[1])); return null; });
      } else tap(c.y, c.el);
    };
    const cancel = () => { if (cur.current) clearTimeout(cur.current.t); cur.current = null; setSel(null); };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
    };
  });
  // 마우스(PC 브라우저로 ?ui=mobile 을 볼 때) — 누르고 끌면 긋기, 그냥 누르면 탭
  const mouse = useRef<{ a: number; y: number; moved: boolean } | null>(null);

  const bg = tl.filter((x) => x.kind === 'work' || x.kind === 'off');
  const fg = tl.map((x, i) => ({ x, i })).filter(({ x }) => x.kind !== 'work' && x.kind !== 'off');

  return (
    <div className="m-tl">
      {full
        ? <button className="m-tl-more" onClick={() => setFull(false)}>기록 있는 시간만 보기</button>
        : h0 > 0 && <button className="m-tl-more" onClick={() => setFull(true)}>00:00 ~ {fm(h0 * 60)} 펼치기</button>}
      <div ref={box} className={`m-tl-b${sel ? ' drawing' : ''}`} style={{ height: L.height }}
        onMouseDown={(e) => { if (e.button === 0) mouse.current = { a: minAt(e.clientY) ?? -1, y: e.clientY, moved: false }; }}
        onMouseMove={(e) => {
          const m = mouse.current, b = minAt(e.clientY);
          if (!m || m.a < 0 || b == null || (!m.moved && Math.abs(e.clientY - m.y) < 6)) return;
          m.moved = true; setSel([m.a, b]);
        }}
        onMouseUp={(e) => {
          const m = mouse.current;
          mouse.current = null;
          if (!m) return;
          if (m.moved && sel) { setSel(null); onOpen(draw(sel[0], sel[1])); } else tap(e.clientY, e.target);
        }}
        onMouseLeave={() => { mouse.current = null; setSel(null); }}>
        {L.rows.map((r) => r.kind === 'h'
          ? <div key={r.h} className="m-tl-h" style={{ top: r.y }}><em>{String(r.h).padStart(2, '0')}</em></div>
          : <div key={`f${r.from}`} className="m-tl-fold" style={{ top: r.y, height: FOLD }}><em>{String(r.from).padStart(2, '0')}–{String(r.to).padStart(2, '0')}</em><span>기록 없음 · 눌러서 펼치기</span></div>)}
        {bg.map((x, i) => (
          <div key={`b${i}`} className={`m-tl-bg ${x.kind}${x.live ? ' live' : ''}`} style={{ top: top(x.s), height: hgt(x) }}>
            {x.kind === 'off' && hgt(x) >= 18 && <span>비근무 {fmtDur(x.e - x.s)}</span>}
          </div>
        ))}
        {fg.map(({ x, i }) => {
          const h = hgt(x);
          const nm = x.kind === 'slot' ? catName(ws.cats, x.color) : '';
          const title = x.kind === 'slot' ? x.text : x.text || LABEL[x.kind];
          return (
            <div key={i} data-tl={i} className={`m-tl-x ${x.kind}${h < 34 ? ' thin' : ''}${x.live ? ' live' : ''}`}
              style={{ top: top(x.s), height: h, ...(x.kind === 'slot' ? { '--c': catVar(x.color ?? nextColor(0)) } : x.color ? { '--c': catVar(x.color) } : {}) } as React.CSSProperties}>
              {h >= 14 && <>
                <b>{x.kind !== 'slot' && '☕️ '}{title}</b>
                <span>{fm(x.s)}{x.live ? ' ~ 지금' : `–${fm(x.e)}`}{nm && ` · ${nm}`}</span>
              </>}
            </div>
          );
        })}
        {nowM != null && nowM >= h0 * 60 && nowM < h1 * 60 && <div className="m-tl-now" style={{ top: top(nowM) }}><em>{fm(nowM)}</em></div>}
        {sel && (() => { const s = Math.min(...sel), e = Math.max(...sel) + STEP; return (
          <div className="m-tl-sel" style={{ top: top(s), height: top(e) - top(s) }}><span>{fm(s)}–{fm(e)} · {fmtDur(e - s)}</span></div>
        ); })()}
      </div>
      {!full && h1 < 24 && <button className="m-tl-more" onClick={() => setFull(true)}>{fm(h1 * 60)} ~ 24:00 펼치기</button>}
      <p className="m-hint m-tl-hint">빈 곳을 누르면 30분을 적고, 길게 눌러 끌면 끈 만큼 적어요</p>
    </div>
  );
}
