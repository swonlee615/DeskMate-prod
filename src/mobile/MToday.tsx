/**
 * 모바일 근태 › 전체 — 지금 상태 · 근태 버튼 · 집중 타이머 · 습관 · 주별 근태 표 · D-Day/습관 상자
 * ★ PC 근태 «전체» 뷰(주별 표) + 우측 패널(집중 타이머)을 한 줄로 세운 것. 타이머는 PC 와 같은 하나다 (SYNC §9)
 * ★ 타이머는 PC 다이얼(부채꼴)을 그대로 쓰고 둘레만 폰에 맞춘 MTimer
 */
import { Since } from '../ui/Live';
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS, WEEKS_SHOWN } from '../app/useWorkspace';
import type { Day, Leave } from '../domain/attendance/types';
import { dayGoalMin, dayParts, openBreak, sessions, workMinutes } from '../domain/attendance/rules';
import { catVar, nextColor, timeline } from '../domain/attendance/logs';
import { addDays, dateOf, fmtClock, fmtDur, hhmm, keyOf, leaveOf, LEAVES, rowDate, weekLabel, weekStart, weekTag } from '../ui/v3fmt';
import { MTimer } from './MTimer';
import { attDotCls } from '../pc/Worklog';
import { HabitChips, Pend } from './parts';
import { PlansBox } from './MPlans';

export const STATE_LABEL = { none: '출근 전', work: '근무 중', break: '휴식 중', off: '퇴근' } as const;

export function MToday({ ws, goDay }: { ws: Workspace; goDay: (date: string, edit?: boolean) => void }) {
  const { day, now, state } = ws;
  const parts = dayParts(day, now);
  const work = parts.workMs / 60000;
  const goal = dayGoalMin(GOAL_HOURS, day);
  const pct = goal > 0 ? Math.min(100, (work / goal) * 100) : (work > 0 ? 100 : 0);
  const brk = openBreak(day);
  const ses = sessions(day);

  return (
    <>
      {ws.unavailable && <p className="m-note">오프라인이라 이 기기에서 열어 본 적 없는 날은 불러올 수 없어요.</p>}
      {ws.pendingDays.length > 0 && <Pend ws={ws} date={ws.pendingDays[0]} onEdit={() => goDay(ws.pendingDays[0], true)} />}

      <section className={`m-hero ${state}`} aria-label="오늘 근태">
        <div className="m-state">
          <i className={`m-dot ${state}`} aria-hidden="true" />
          <b>{STATE_LABEL[state]}</b>
          {brk && <span>· <Since at={brk.s} />째</span>}
          {day.onAt != null && <span className="m-sp-r">{hhmm(day.onAt)} 출근{ses.length > 1 ? ` · ${ses.length}차` : ''}</span>}
        </div>
        <div className="m-big">
          <Dur min={work} />
          <span>/ {+(goal / 60).toFixed(1)}시간 · {Math.round(pct)}%</span>
        </div>
        <Ribbon ws={ws} onOpen={() => goDay(ws.today)} />
        <div className="m-meta"><span>휴게 <b>{fmtDur(parts.breakMs / 60000)}</b></span><span>뽀모도로 <b>{day.pomos ?? 0}회</b></span></div>

        <div className="m-actions">
          {state === 'none' && <button className="m-btn go" onClick={ws.onOn}>출근</button>}
          {state === 'off' && <button className="m-btn go" onClick={ws.onOn}>업무 재개</button>}
          {state === 'work' && <>
            <button className="m-btn rest" onClick={ws.onRest}>☕️ 휴식</button>
            <button className="m-btn off" onClick={ws.onOff}>퇴근</button>
          </>}
          {state === 'break' && <>
            <button className="m-btn go" onClick={ws.onRest}>업무 재개</button>
            <button className="m-btn off" onClick={ws.onOff}>퇴근</button>
          </>}
        </div>
        <Desks ws={ws} />
      </section>

      <MTimer ws={ws} />
      <HabitChips ws={ws} date={ws.today} />
      <Weeks ws={ws} onDay={goDay} />
      <PlansBox ws={ws} />
    </>
  );
}

/** «3시간 42분» — 숫자는 굵게 크게, 단위는 작게 (fmtDur 글자 그대로 — v3 표기를 바꾸지 않는다) */
export function Dur({ min, className }: { min: number; className?: string }) {
  return (
    <b className={`m-dur${className ? ` ${className}` : ''}`} aria-label={fmtDur(min)}>
      {fmtDur(min).split(/(\d+)/).filter(Boolean).map((x, i) => (/\d/.test(x) ? <span key={i}>{x}</span> : <small key={i}>{x.trim()}</small>))}
    </b>
  );
}

/**
 * 오늘이 지나온 자리 — 시간표 탭과 같은 timeline() 을 한 줄로. 누르면 시간표로
 * 보이는 폭은 06–22시, 기록이 그 밖에 있으면 그만큼 넓힌다
 */
function Ribbon({ ws, onOpen }: { ws: Workspace; onOpen: () => void }) {
  const tl = timeline(ws.day, ws.logs, ws.now);
  const t = new Date(ws.now);
  const nowM = t.getHours() * 60 + t.getMinutes();
  const lo = Math.min(360, ...tl.map((x) => Math.floor(x.s / 60) * 60), Math.floor(nowM / 60) * 60);
  const hi = Math.max(1320, ...tl.map((x) => Math.ceil(x.e / 60) * 60), Math.ceil((nowM + 1) / 60) * 60);
  const at = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`;
  const w = (x: { s: number; e: number }) => `max(2px, ${((x.e - x.s) / (hi - lo)) * 100}%)`;
  const ticks: number[] = [];
  for (let h = Math.ceil(lo / 180) * 180; h <= hi; h += 180) ticks.push(h);
  return (
    <button className="m-rib" onClick={onOpen} aria-label="오늘 시간표 열기">
      <span className="m-rib-l">
        {tl.map((x, i) => (
          <i key={i} className={`${x.kind}${x.live ? ' live' : ''}`} style={{
            left: at(x.s), width: w(x),
            ...(x.kind === 'slot' ? { '--c': catVar(x.color ?? nextColor(0)) } : {}),
          } as React.CSSProperties} />
        ))}
        <u style={{ left: at(nowM) }} />
      </span>
      <span className="m-rib-t">{ticks.map((h) => <em key={h} style={{ left: at(h) }}>{String(h / 60).padStart(2, '0')}</em>)}</span>
    </button>
  );
}

/** 옆자리 — 지금 일하는 동료 (PC 사이드바와 같은 ws.mates). «혼자 일하지만 출근해 있는 기분» */
function Desks({ ws }: { ws: Workspace }) {
  const on = ws.mates.filter((x) => x.st.presence === 'active' || x.st.presence === 'dnd');
  const away = ws.mates.filter((x) => x.st.presence === 'break').length;
  const show = on.slice(0, 5);
  return (
    <div className="m-desks">
      <span className="m-desks-a" aria-hidden="true">
        {show.map(({ m }) => <i key={m.id} style={{ background: m.color }}>{m.emoji || m.nick.slice(0, 1)}</i>)}
        {on.length > show.length && <i className="more">+{on.length - show.length}</i>}
      </span>
      <span className="m-desks-t">{on.length ? <>지금 <b>{on.length}명</b>이 일하는 중{away ? ` · 자리 비움 ${away}` : ''}</> : '아직 아무도 출근하지 않았어요'}</span>
    </div>
  );
}

/**
 * 주별 근태 표 (PC 전체 뷰 Worklog 와 같은 줄) — 날짜 · 출근–퇴근 · 근무 + 점 · 근태. 누르면 그 날 상세
 * 폰 폭이라 날짜 아래 둘째 줄에 «출근 – 퇴근 · 비고(이어짐 · N회)»
 */
function Weeks({ ws, onDay }: { ws: Workspace; onDay: (k: string) => void }) {
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const nowD = new Date(ws.now);
  const w0 = weekStart(dateOf(ws.today));
  const weeks: { start: Date; rows: string[] }[] = [];
  for (let w = 0; w < WEEKS_SHOWN; w++) {
    const start = addDays(w0, -7 * w);
    const rows: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = keyOf(addDays(start, i));
      const d = ws.days[k];
      if (k === ws.today || (k < ws.today && d && (d.onAt != null || d.leave))) rows.push(k);
    }
    if (rows.length) weeks.push({ start, rows });
  }
  return (
    <>
      {weeks.map((g) => {
        const wk = keyOf(g.start);
        let sum = 0;
        for (const k of g.rows) { const d = ws.days[k]; if (d?.onAt != null) sum += workMinutes(d, ws.now); }
        const open = !shut[wk];
        return (
          <section key={wk} className="m-wkt">
            <button className="m-wkt-h" aria-expanded={open} onClick={() => setShut((x) => ({ ...x, [wk]: open }))}>
              <i className={`m-chev${open ? ' on' : ''}`} aria-hidden="true">›</i><b>{weekLabel(g.start)}</b><em>· {fmtDur(sum)}</em>
            </button>
            {open && (
              <ul className="m-card m-wkt-l">
                {g.rows.map((k) => <WRow key={k} k={k} d={ws.days[k]} isToday={k === ws.today} now={ws.now} nowD={nowD} onLeave={ws.onLeave} onOpen={() => onDay(k)} />)}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function WRow({ k, d, isToday, now, nowD, onLeave, onOpen }: {
  k: string; d: Day | undefined; isToday: boolean; now: number; nowD: Date; onLeave: (k: string, l: Leave) => void; onOpen: () => void;
}) {
  const rd = rowDate(k, nowD);
  const ses = d ? sessions(d) : [];
  const last = ses[ses.length - 1];
  const off = last ? last.off ?? (d?.pending ? d.pending.guessOff : null) : null;
  const note = [d?.pending ? '확인 필요' : '', d?.carriedFrom ? '이어짐' : '', ses.length > 1 ? `출근 ${ses.length}회` : ''].filter(Boolean).join(' · ');
  const lv = leaveOf(d?.leave);
  return (
    <li className={`m-wr${isToday ? ' today' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('.m-lv')) onOpen(); }}>
      <div className="m-wr-d">
        <b>{rd.b}<small>{rd.span}</small></b>
        <span>{ses.length ? `${hhmm(ses[0].on)} – ${off != null ? hhmm(off) : '근무 중'}` : '출근 기록 없음'}{note && <em className={d?.pending ? 'warn' : ''}> · {note}</em>}</span>
      </div>
      <div className="m-wr-w">{d?.onAt != null
        ? <>{d.offAt != null ? fmtDur(workMinutes(d, now)) : <em>–</em>}<i className={`att-dot ${attDotCls(d, now, GOAL_HOURS)}`} aria-hidden="true" /></>
        : <em>–</em>}</div>
      <label className={`m-lv${d?.leave ? ' on' : ''}`} style={lv[2] ? { '--lv': lv[2] } as React.CSSProperties : undefined}>
        <i aria-hidden="true" />{lv[1]}
        <select aria-label={`${rd.b} 근태`} value={d?.leave ?? ''} onChange={(e) => onLeave(k, e.target.value as Leave)}>
          {LEAVES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    </li>
  );
}

/** 이번 주 요약 — 활동 탭 맨 위 (요일 막대 · 총 근무 · 출근 · 일 평균 · 평균 출근) */
export function WeekSummary({ ws, onDay }: { ws: Workspace; onDay: (k: string) => void }) {
  const ws0 = weekStart(dateOf(ws.today));
  const goal = GOAL_HOURS * 60;
  let total = 0, n = 0, onSum = 0;
  const cols = Array.from({ length: 7 }, (_, i) => {
    const k = keyOf(addDays(ws0, i));
    const d = ws.days[k];
    const m = d?.onAt != null ? dayParts(d, ws.now).workMs / 60000 : 0;
    if (d?.onAt != null) { n++; total += m; const o = new Date(d.onAt); onSum += o.getHours() * 60 + o.getMinutes(); }
    return { k, m, leave: d?.leave };
  });
  const tag = weekTag(dateOf(ws.today));
  return (
    <section className="m-card m-sum" aria-label="이번 주">
      <div className="m-sum-t">{tag.month}월 {tag.no}주</div>
      <div className="m-wbars">
        {cols.map((c, i) => (
          <button key={c.k} className={`${c.k === ws.today ? 'today' : ''}${c.m >= goal ? ' hit' : ''}`} onClick={() => onDay(c.k)}
            aria-label={`${'월화수목금토일'[i]} ${fmtDur(c.m)}`}>
            <span className="bar"><i style={{ height: `${Math.min(100, (c.m / goal) * 100)}%` }} /></span>
            <small>{c.leave ? c.leave.slice(0, 2) : '월화수목금토일'[i]}</small>
          </button>
        ))}
      </div>
      <div className="m-sum-g">
        <div><b>{fmtDur(total)}</b><span>총 근무</span></div>
        <div><b>{n}일</b><span>출근</span></div>
        <div><b>{fmtDur(n ? total / n : 0)}</b><span>일 평균</span></div>
        <div><b>{n ? fmtClock(onSum / n) : '–'}</b><span>평균 출근</span></div>
      </div>
    </section>
  );
}
