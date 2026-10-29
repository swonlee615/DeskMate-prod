/**
 * 우측 패널의 「근태」 · 「오늘 목표」 (v3 index.html `.panel` · renderOnOff · renderPanel)
 *
 * ★ 마크업 · id 는 v3 와 같다. 스타일은 v3 styles.css 가 칠한다.
 *   습관 고리는 Habits.tsx (HabitRings) · 오늘 근무 랭킹은 Team.tsx (Ranking)
 */
import { Since } from '../ui/Live';
import type { Day } from '../domain/attendance/types';
import { dayGoalMin, dayParts, openBreak, type GoalCfg } from '../domain/attendance/rules';
import { fmtDur, hhmm } from '../ui/v3fmt';

interface Props {
  day: Day;
  now: number;
  goal: GoalCfg;
  onOn: () => void;
  onOff: () => void;
  onRest: () => void;
}

export function TodayPanelBody({ day, now, goal: g, onOn, onOff, onRest }: Props) {
  const working = day.onAt != null && day.offAt == null;
  const open = openBreak(day);
  const parts = dayParts(day, now);
  const work = parts.workMs / 60000;
  const goal = dayGoalMin(g, day);
  const free = goal <= 0;
  const pct = free ? (work > 0 ? 100 : 0) : Math.min(100, (work / goal) * 100);
  const offTitle = working ? '' : 'On 을 먼저 눌러주세요';

  return (
    <>
      <div className="sec-t">근태</div>
      <div className="onoff">
        {/* v3.1.265 — 단추 둘 (시안 A): 왼쪽 칸은 지금 할 수 있는 동작 하나 (On → Off → 재개), 오른쪽은 휴식 */}
        <div className="onoff-btns">
          <button className={`btn onoff-on${!working && day.onAt == null ? ' ready' : ''}${!working && day.offAt != null ? ' resume' : ''}`} id="btnOn" hidden={working} onClick={onOn}>
            {day.offAt != null ? '재개' : 'On'}
          </button>
          <button className="btn onoff-off" id="btnOff" hidden={!working} onClick={onOff}>Off</button>
          <button className={`btn rest${open ? ' on' : ''}`} id="btnRest" disabled={!working} title={offTitle} onClick={onRest}>
            {open ? <>☕️ <Since at={open.s} /> · 종료</> : '☕️ 휴식'}
          </button>
        </div>
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
