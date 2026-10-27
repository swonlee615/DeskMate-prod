/**
 * 우측 패널의 「근태」 · 「오늘 목표」 (v3 index.html `.panel` · renderOnOff · renderPanel)
 *
 * ★ 마크업 · id 는 v3 와 같다. 스타일은 v3 styles.css 가 칠한다.
 *   습관 고리는 Habits.tsx (HabitRings). 아직 안 옮긴 것: 오늘 근무 랭킹 (동료 단계에서)
 */
import type { Day } from '../domain/attendance/types';
import { dayGoalMin, dayParts, openBreak } from '../domain/attendance/rules';
import { fmtDur, hhmm, mmss } from '../ui/v3fmt';

interface Props {
  day: Day;
  now: number;
  goalHours: number;
  onOn: () => void;
  onOff: () => void;
  onRest: () => void;
}

export function TodayPanelBody({ day, now, goalHours, onOn, onOff, onRest }: Props) {
  const working = day.onAt != null && day.offAt == null;
  const open = openBreak(day);
  const parts = dayParts(day, now);
  const work = parts.workMs / 60000;
  const goal = dayGoalMin(goalHours, day);
  const free = goal <= 0;
  const pct = free ? (work > 0 ? 100 : 0) : Math.min(100, (work / goal) * 100);
  const offTitle = working ? '' : 'On 을 먼저 눌러주세요';

  return (
    <>
      <div className="sec-t">근태</div>
      <div className="onoff">
        <div className="onoff-btns">
          <button className={`btn onoff-on${working ? ' active' : ''}`} id="btnOn" disabled={working} onClick={onOn}>
            {day.offAt != null ? '재개' : 'On'}
          </button>
          <button className={`btn onoff-off${day.offAt != null ? ' active' : ''}`} id="btnOff" disabled={!working}
            title={offTitle} onClick={onOff}>Off</button>
        </div>
        <button className={`btn rest${open ? ' on' : ''}`} id="btnRest" disabled={!working} title={offTitle} onClick={onRest}>
          {open ? `☕️ ${mmss((now - open.s) / 1000)} · 종료` : '☕️ 휴식 시작'}
        </button>
        <div className="onoff-stat">
          <div><b id="wlWork">{fmtDur(work)}</b><span>근무</span></div>
          <div><b id="wlRest">{fmtDur(parts.breakMs / 60000)}</b><span>휴게</span></div>
          <div><b id="wlOn">{day.onAt != null ? hhmm(day.onAt) : '–'}</b><span>출근</span></div>
        </div>
      </div>

      <div className="sec-t">오늘 목표</div>
      <div className={`goal${work > 0 && work >= goal ? ' hit' : ''}`}>
        <div className="goal-top"><b id="goalNow">{fmtDur(work)}</b><span id="goalOf">/ {+(goal / 60).toFixed(1)}시간</span></div>
        <div className="bar">
          <i className="done" id="barDone" style={{ width: `${pct}%` }} />
          <i className="now" id="barNow" style={{ width: `${!free && working && !open ? Math.min(2.5, 100 - pct) : 0}%` }} />
        </div>
        <div className="goal-sub"><span id="goalSess">뽀모도로 {day.pomos ?? 0}회</span><span id="goalPct">
          {free ? (work > 0 ? `+${fmtDur(work)}` : '0%') : `${Math.round(pct)}%`}
        </span></div>
      </div>
    </>
  );
}
