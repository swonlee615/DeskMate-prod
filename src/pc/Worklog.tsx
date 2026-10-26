/**
 * 근태 화면 (v3 「ONnOFF」) — `#worklog` 의 «전체» 탭
 *
 * ★ 마크업 · 클래스 · id 는 v3 `renderWorklog()` · `calendarHtml()` 이 그리는 것과 같다.
 *   스타일은 v3 styles.css 를 그대로 쓰므로, 여기서 모양을 바꾸지 않는다.
 *   일간 상세는 DayPage.tsx · 주간 탭은 WeekPlanner.tsx. 아직 안 옮긴 것: D-Day/습관 칸 · 비고의 시간 기록 분류 · 줄 우클릭 삭제
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Day, Leave } from '../domain/attendance/types';
import { dayGoalMin, dayParts, openBreak, sessions } from '../domain/attendance/rules';
import {
  addDays, dateOf, fmtClock, fmtDur, hhmm, keyOf, leaveOf, LEAVES, mmss, rowDate, weekLabel, weekStart, weekTag,
} from '../ui/v3fmt';

import { WEEKS_SHOWN } from '../app/useWorkspace';

interface Props {
  days: Record<string, Day>;
  today: string;
  now: number;
  goalHours: number;
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  onLeave: (date: string, leave: Leave) => void;
  unavailable: boolean;
  /** 줄 · 캘린더 날짜를 누르면 그 날 상세 (focusOff — 퇴근 칸에 커서) */
  onOpenDay: (date: string, focusOff?: boolean) => void;
  /** 일간 상세를 «전체 페이지» 로 열었을 때는 목록을 숨긴다 */
  hidden?: boolean;
  /** 자정을 넘긴 미완결 기록 배너 (첫 날 것) */
  banner?: React.ReactNode;
  /** 이번 주에 적힌 할 일의 달성 (v3 todosOfRange) */
  todo?: { n: number; done: number };
  /** 할 일 · 메모만 적힌 날도 표에 선다 (v3 isEmpty — 내용이 하나라도 있으면) */
  noteDates?: Set<string>;
  /** 「주간」 탭 내용 (v3 weekPlannerHtml — 탭 아래 머리줄 · 본문) */
  week?: React.ReactNode;
}

/** v3 WL.workMinutes 와 같이 «분 단위 소수» 로 — 반올림은 표기(fmtDur)가 한다 */
export const workMinutes = (d: Day, now: number) => dayParts(d, now).workMs / 60000;

const hasRecord = (d: Day | undefined) => !!d && (d.onAt != null || !!d.leave);

/** 출근 점 (v3 attDotCls) — 목표 이상 hit · 0분 zero · 아직 안 끝났으면 live */
export function attDotCls(d: Day, now: number, goalHours: number) {
  const w = workMinutes(d, now);
  const g = dayGoalMin(goalHours, d);
  return [w > 0 && w >= g ? 'hit' : '', w <= 0 ? 'zero' : '', d.offAt ? '' : 'live'].filter(Boolean).join(' ');
}

/** 주 접힘 — v3 는 설정(cfg.wkOpen)에 남긴다. 웹에서는 기기별 편의라 브라우저 저장소에 */
const WK_KEY = 'dm.wkOpen';
function loadWk(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(WK_KEY) || '{}'); } catch { return {}; }
}

export function Worklog({ days, today, now, goalHours, calMonth, setCalMonth, onLeave, unavailable, onOpenDay, hidden, banner, todo, noteDates, week }: Props) {
  // 전체/주간 — v3 는 설정(cfg.wlView)에 남긴다. 기기별 편의라 브라우저 저장소에
  const [view, setView0] = useState<'all' | 'week'>(() => { try { return localStorage.getItem('dm.wlView') === 'week' ? 'week' : 'all'; } catch { return 'all'; } });
  const setView = (v: 'all' | 'week') => { setView0(v); try { localStorage.setItem('dm.wlView', v); } catch { /* 이번 화면만 */ } };
  const [wkOpen, setWkOpen] = useState<Record<string, boolean>>(loadWk);
  const nowD = new Date(now);
  const todayD = dateOf(today);

  // ── 이번 주 요약 (v3 weekSummary)
  const ws0 = weekStart(todayD);
  let total = 0, nDays = 0, onSum = 0;
  for (let i = 0; i < 7; i++) {
    const d = days[keyOf(addDays(ws0, i))];
    if (d?.onAt != null) {
      nDays++;
      total += workMinutes(d, now);
      const o = new Date(d.onAt);
      onSum += o.getHours() * 60 + o.getMinutes();
    }
  }
  const tag = weekTag(todayD);

  // ── 주 묶음 (v3 WL.weeks) — 기록 있는 날만, 오늘은 기록이 없어도 늘 세운다
  const groups: { start: Date; rows: string[] }[] = [];
  for (let w = 0; w < WEEKS_SHOWN; w++) {
    const start = addDays(ws0, -7 * w);
    const rows: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = keyOf(addDays(start, i));
      if (k > today) continue;
      if (k === today || hasRecord(days[k]) || noteDates?.has(k)) rows.push(k);
    }
    if (rows.length || w === 0) groups.push({ start, rows });
  }

  const toggleWk = (k: string, open: boolean) => {
    const next = { ...wkOpen, [k]: !open };
    setWkOpen(next);
    try { localStorage.setItem(WK_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 이번 화면에서는 따른다 */ }
  };

  return (
    <div className={`view${hidden ? '' : ' on'}`} id="view-worklog">
      <div className="dash" id="worklog" data-wl={view}
        style={{ '--wl-hh': '178px', '--wl-sumtop': '45px', '--wl-tabh': '44px', '--noteW': '200px' } as React.CSSProperties}>
        {banner}
        {view === 'week' && <><SegTabs value={view} onChange={setView} />{week}</>}
        {view === 'all' && <>
        <i id="wlSent" aria-hidden="true" style={{ display: 'block', height: 1, margin: 0, padding: 0 }} />
        <div className="wl-cols">
          <div>
            <div className="wl-stick" id="wlStick">
              <SegTabs value={view} onChange={setView} />
              {view === 'all' && (
                <div className="wl-sum">
                  <div className="wk-t wl-sum-t">{tag.month}월 {tag.no}주 요약</div>
                  <div className="wl-sum-grid">
                    <div><b>{fmtDur(total)}</b><span>총 근무</span></div>
                    <div><b>{nDays}일</b><span>출근</span></div>
                    <div><b>{fmtDur(nDays ? total / nDays : 0)}</b><span>일 평균</span></div>
                    <div><b>{nDays ? fmtClock(onSum / nDays) : '–'}</b><span>평균 출근</span></div>
                    <div><b>{todo && todo.n ? `${Math.round((todo.done / todo.n) * 100)}%` : '–'}</b><span>할 일 달성</span></div>
                  </div>
                </div>
              )}
            </div>

            {view === 'all' && unavailable && (
              <p className="hint" style={{ padding: '0 4px 12px' }}>
                오프라인이라 이 기기에서 열어 본 적 없는 날은 불러올 수 없어요. 연결되면 채워져요.
              </p>
            )}

            {view === 'all' && groups.map((g) => {
              const wkKey = keyOf(g.start);
              const thisMonth = g.start.getFullYear() === nowD.getFullYear() && g.start.getMonth() === nowD.getMonth();
              const openByDefault = thisMonth || g.rows.includes(today);
              const open = wkKey in wkOpen ? !!wkOpen[wkKey] : openByDefault;
              let wsum = 0;
              for (const k of g.rows) { const d = days[k]; if (d) wsum += workMinutes(d, now); }
              return (
                <div key={wkKey} className={`wk${open ? '' : ' closed'}`}>
                  <button className="wk-t" data-wk={wkKey} onClick={() => toggleWk(wkKey, open)}>
                    <i className="wk-arrow">{open ? '▾' : '▸'}</i> {weekLabel(g.start)} <em>· {fmtDur(wsum)}{open ? '' : ` · ${g.rows.length}일`}</em>
                  </button>
                  <div className="tbl" hidden={!open}>
                    <div className="tr th">
                      <div className="dt">날짜</div><div className="wide">출근</div><div className="wide">퇴근</div>
                      <div className="num">근무</div><div className="wide note">비고</div><div className="lv">근태</div>
                    </div>
                    {g.rows.map((k) => (
                      <Row key={k} k={k} d={days[k]} isToday={k === today} now={now} nowD={nowD}
                        goalHours={goalHours} onLeave={onLeave} onOpen={() => onOpenDay(k)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="wl-cal">
            <Calendar month={calMonth} setMonth={setCalMonth} today={today} days={days} onOpen={onOpenDay} />
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}

function Row({ k, d, isToday, now, nowD, goalHours, onLeave, onOpen }: {
  k: string; d: Day | undefined; isToday: boolean; now: number; nowD: Date; goalHours: number;
  onLeave: (date: string, leave: Leave) => void; onOpen: () => void;
}) {
  const ses = d ? sessions(d) : [];
  const brk = d && isToday ? openBreak(d) : null;
  const note: React.ReactNode[] = [];
  if (d?.pending) note.push(<em key="pend" className="pendtag">확인 필요</em>);
  if (d?.carriedFrom) note.push('이어짐');
  if (ses.length > 1) note.push(`출근 ${ses.length}회`);
  if (brk) note.push(<span key="rest" className="rest-live" title="지금 쉬는 중이에요">{mmss((now - brk.s) / 1000)}</span>);
  const rd = rowDate(k, nowD);
  const work = d ? workMinutes(d, now) : 0;

  return (
    <div className={`tr${isToday ? ' today' : ''}${ses.length > 1 ? ' multi' : ''}`} data-day={k}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('.lv-sel')) onOpen(); }}>
      <div className="dt"><b>{rd.b}</b><span>{rd.span}</span></div>
      <div className="tm wide sess">{ses.length
        ? ses.map((x, i) => <i key={i}>{hhmm(x.on)}</i>)
        : <i className="none">–</i>}</div>
      <div className="tm wide sess">{ses.length
        ? ses.map((x, i) => {
          // 확인 대기인 지난 날은 23:59 로 보여 준다 (v3 effectiveOff)
          const off = x.off ?? (d?.pending ? d.pending.guessOff : null);
          return <i key={i} className={off == null ? 'live' : undefined}>{off != null ? hhmm(off) : '근무 중'}</i>;
        })
        : <i className="none">–</i>}</div>
      <div className="num" title={d?.onAt != null ? `${(work / 60).toFixed(2)}시간` : undefined}>
        {d?.onAt != null
          ? <span className="att-w">{d.offAt != null
            ? fmtDur(work)
            : <em className="none" title={`아직 근무 중이라 합계를 내지 않아요 (지금까지 ${fmtDur(work)})`}>–</em>}
            <i className={`att-dot ${attDotCls(d, now, goalHours)}`} aria-hidden="true" /></span>
          : <em className="none" title="출근 기록이 없어요">–</em>}
      </div>
      <div className="wide note">
        {note.map((n, i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="nsp">·</span>}{n}</span>)}
      </div>
      <div className="lv"><LeaveSelect k={k} v={d?.leave ?? ''} onLeave={onLeave} /></div>
    </div>
  );
}

/** 점 + 이름 칩. 실제 요소는 `<select>` 그대로 (v3 leaveSelectHtml) */
function LeaveSelect({ k, v, onLeave }: { k: string; v: string; onLeave: (date: string, leave: Leave) => void }) {
  const cur = leaveOf(v);
  return (
    <span className={`lv-cell${v ? ' on' : ''}`} style={cur[2] ? { '--lv': cur[2] } as React.CSSProperties : undefined}>
      <span className="lv-chip2"><i className="lv-dot" /><b>{cur[1]}</b></span>
      <select className="lv-sel" data-leave={k} aria-label="근태" value={v}
        onChange={(e) => onLeave(k, e.target.value as Leave)}>
        {LEAVES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </select>
    </span>
  );
}

/** 전체/주간 분절 탭 — 고른 칸 바탕은 «알약» 하나가 맡는다 (v3 segSlide) */
function SegTabs({ value, onChange }: { value: 'all' | 'week'; onChange: (v: 'all' | 'week') => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const on = box.current?.querySelector<HTMLButtonElement>('button.on');
    if (on) setPill({ x: on.offsetLeft, w: on.offsetWidth });
  }, [value]);
  return (
    <div className="wp-tabs has-pill" role="tablist" ref={box}>
      <i className="seg-pill" aria-hidden="true"
        style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : { opacity: 0 }} />
      {(['all', 'week'] as const).map((v) => (
        <button key={v} className={`wp-tab${value === v ? ' on' : ''}`} data-wlv={v} role="tab"
          aria-selected={value === v} onClick={() => onChange(v)}>{v === 'all' ? '전체' : '주간'}</button>
      ))}
    </div>
  );
}

export const CHEV = (dir: -1 | 1) => (
  <svg className="chev" viewBox="0 0 20 20" aria-hidden="true">
    <path d={dir < 0 ? 'M12.5 5 7.5 10 12.5 15' : 'M7.5 5 12.5 10 7.5 15'} />
  </svg>
);

/** 캘린더 (v3 calendarHtml) — 늘 6줄(42칸). 근무한 날 초록 점, 근태가 있으면 그 색 점 */
export function Calendar({ month, setMonth, today, days, onOpen }: {
  month: Date; setMonth: (d: Date) => void; today: string; days: Record<string, Day>; onOpen: (k: string) => void;
}) {
  const y = month.getFullYear(), mo = month.getMonth();
  const off = (new Date(y, mo, 1).getDay() + 6) % 7;
  const last = new Date(y, mo + 1, 0).getDate();
  const prevLast = new Date(y, mo, 0).getDate();
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < off; i++) cells.push(<div key={`p${i}`} className="cal-d out">{prevLast - off + i + 1}</div>);
  for (let d = 1; d <= last; d++) {
    const key = keyOf(new Date(y, mo, d));
    const day = days[key];
    const lv = leaveOf(day?.leave);
    const worked = day?.onAt != null;
    const dots: React.ReactNode[] = [];
    if (worked) dots.push(<i key="w" className="cdot" />);
    if (lv[2]) dots.push(<i key="l" className="cdot lvd" style={{ '--lv': lv[2] } as React.CSSProperties} />);
    cells.push(
      <button key={key} className={`cal-d${key === today ? ' today' : ''}${lv[2] ? ' has-lv' : ''}`} data-cal={key}
        title={lv[2] ? `${lv[1]}${worked ? ' · 근무' : ''}` : undefined} onClick={() => onOpen(key)}>
        <span>{d}</span><i className="cdots">{dots.length ? dots : <i style={{ height: 4 }} />}</i>
      </button>,
    );
  }
  for (let i = 1; i <= 42 - off - last; i++) cells.push(<div key={`n${i}`} className="cal-d out">{i}</div>);
  return (
    <>
      <div className="cal-head">
        <button className="cal-nav" data-cal-nav="-1" onClick={() => setMonth(new Date(y, mo - 1, 1))}>{CHEV(-1)}</button>
        <b>{y}년 {mo + 1}월</b>
        <button className="cal-nav" data-cal-nav="1" onClick={() => setMonth(new Date(y, mo + 1, 1))}>{CHEV(1)}</button>
        <span className="cal-sp" />
        <button className="cal-nav" data-cal-nav="0" title="오늘로" onClick={() => setMonth(new Date())}>•</button>
      </div>
      <div className="cal-grid">
        {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => <div key={d} className={`cal-dow${i === 6 ? ' sun' : ''}`}>{d}</div>)}
        {cells}
      </div>
    </>
  );
}
