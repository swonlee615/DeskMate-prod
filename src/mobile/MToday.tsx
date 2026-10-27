/**
 * 모바일 «오늘» — 지금 상태 · 근태 버튼 · 집중 타이머 · 습관 · D-Day · 오늘 할 일 · 메모 · 이번 주
 * ★ PC 전체 탭 + 우측 패널(타이머 · 오늘 패널)을 한 줄로 세운 것. 타이머는 PC 와 같은 하나다 (SYNC §9)
 */
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import { PRESETS } from '../app/usePomodoro';
import { dayGoalMin, dayParts, openBreak, sessions } from '../domain/attendance/rules';
import { ddLabel, ddLive, ddPinned } from '../domain/dday';
import { addDays, dateOf, fmtClock, fmtDur, hhmm, keyOf, mmss, weekStart, weekTag } from '../ui/v3fmt';
import { HabitChips, Pend, Todos } from './parts';

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

      <section className="m-card m-today" aria-label="오늘 근태">
        <div className="m-state">
          <i className={`m-dot ${state}`} aria-hidden="true" />
          <b>{STATE_LABEL[state]}</b>
          {brk && <span>{mmss((now - brk.s) / 1000)}째</span>}
          {day.onAt != null && <span className="m-sp-r">출근 {hhmm(day.onAt)}{ses.length > 1 ? ` · ${ses.length}차` : ''}</span>}
        </div>
        <div className="m-big"><b>{fmtDur(work)}</b><span>/ {+(goal / 60).toFixed(1)}시간</span></div>
        <div className={`m-bar${work > 0 && work >= goal ? ' hit' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <div className="m-meta"><span>휴게 <b>{fmtDur(parts.breakMs / 60000)}</b> · 뽀모도로 <b>{day.pomos ?? 0}회</b></span><span>{Math.round(pct)}%</span></div>

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
        <button className="m-link m-today-go" onClick={() => goDay(ws.today)}>오늘 시간표 · 고치기 ›</button>
      </section>

      <Timer ws={ws} />
      <HabitChips ws={ws} date={ws.today} />
      <DDays ws={ws} />
      <Todos ws={ws} date={ws.today} area="today" />
      <Todos ws={ws} date={ws.today} area="memo" />
      <WeekSummary ws={ws} onDay={goDay} />
    </>
  );
}

const R = 54, C = 2 * Math.PI * R;

/** 집중 타이머 — PC 다이얼과 같은 하나 (어느 기기에서 누르든 같이 돈다) */
function Timer({ ws }: { ws: Workspace }) {
  const t = ws.timer;
  const rest = t.mode !== 'focus';
  return (
    <section className="m-card m-timer" aria-label="집중 타이머">
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

function DDays({ ws }: { ws: Workspace }) {
  // 고정한 것 — 없으면 PC 오른쪽 상자처럼 다가오는 것부터
  const pin = ddPinned(ws.ddays);
  const list = pin.length ? pin : ddLive(ws.ddays, ws.today).filter((x) => x.date >= ws.today).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="m-dd" aria-label="D-Day">
      {list.map((x) => (
        <div key={x.id} className="m-dd-i"><b>{ddLabel(x.date, ws.today)}</b><span>{x.emoji} {x.title}</span></div>
      ))}
    </div>
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
