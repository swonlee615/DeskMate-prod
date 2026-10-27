/**
 * 모바일 근태 › 전체 — 지금 상태 · 근태 버튼 · 집중 타이머 · 습관 · 오늘 할 일 · 메모 · 이번 주 · D-Day/습관 상자
 * ★ PC 근태 «전체» 뷰 + 우측 패널(집중 타이머 · 오늘 패널)을 한 줄로 세운 것. 타이머는 PC 와 같은 하나다 (SYNC §9)
 */
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import { PRESETS } from '../app/usePomodoro';
import { dayGoalMin, dayParts, openBreak, sessions } from '../domain/attendance/rules';
import { catVar, nextColor, timeline } from '../domain/attendance/logs';
import { addDays, dateOf, fmtClock, fmtDur, hhmm, keyOf, mmss, weekStart, weekTag } from '../ui/v3fmt';
import { HabitChips, Pend, Todos } from './parts';
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
          {brk && <span>· {mmss((now - brk.s) / 1000)}째</span>}
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

      <Timer ws={ws} />
      <HabitChips ws={ws} date={ws.today} />
      <Todos ws={ws} date={ws.today} area="today" />
      <Todos ws={ws} date={ws.today} area="memo" />
      <WeekSummary ws={ws} onDay={goDay} />
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

const R = 54, C = 2 * Math.PI * R;

/** 집중 타이머 — PC 다이얼과 같은 하나 (어느 기기에서 누르든 같이 돈다) */
function Timer({ ws }: { ws: Workspace }) {
  const t = ws.timer;
  const rest = t.mode !== 'focus';
  return (
    <section className="m-card m-timer" id="m-timer" aria-label="집중 타이머">
      <div className="m-ring">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r={R} className="bg" />
          <circle cx="64" cy="64" r={R} className={`fg${rest ? ' rest' : ''}`} strokeDasharray={C} strokeDashoffset={C * (1 - t.pct)} />
        </svg>
        <div className="m-ring-c">
          <b>{t.clock}</b>
          <span>{t.label}{t.running ? '' : ' · 대기'}</span>
        </div>
      </div>
      <div className="m-timer-r">
        <div className="m-timer-a">
          <button className={`m-btn${t.running ? '' : ' go'}`} onClick={t.toggle}>{t.running ? '일시정지' : '시작'}</button>
          <button className="m-x" onClick={t.skip} aria-label="다음 세션으로">⏭</button>
          <button className="m-x" onClick={t.reset} aria-label="처음부터">↺</button>
        </div>
        <div className="m-chips">
          {PRESETS.map((n) => (
            <button key={n} className={t.cfg.focusMin === n ? 'on' : ''} onClick={() => t.setFocusMin(n)}>{n}</button>
          ))}
        </div>
        <p className="m-hint">모든 기기에서 같은 타이머예요</p>
      </div>
    </section>
  );
}

function WeekSummary({ ws, onDay }: { ws: Workspace; onDay: (k: string) => void }) {
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
