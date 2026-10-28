/**
 * 활동 › 내 분석 — 주간 · 월간 · 연간 (v3 renderAnalytics). 숫자는 전부 domain/stats 에서
 *
 * ★ 기간 바 = 단위(주간/월간/연간) + ‹ › (앞으로는 지금 기간에서 멈춘다) + «이번 주로»
 * ★ 주간 · 월간 = 근무시간 추이 막대 (요일 함께) · 연간 = 근무 히트맵 (365칸 막대는 카드를 넘친다 — v2.9.101)
 * ★ 날짜 하나를 가리키는 그림(막대 · 히트맵 칸)을 누르면 그 날 상세 (기록 없는 날은 안 열린다 — v3.1.212)
 * ★ 보는 기간만큼 받아 둔다 (ws.setDashSpan) — 탭을 떠나면 놓는다
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import { catName } from '../domain/attendance/cats';
import { catVar } from '../domain/attendance/logs';
import { period, restGrade, series, summarize, yearHeat, type PeriodKind } from '../domain/stats';
import { addDays, dateOf, fmtDur, keyOf } from '../ui/v3fmt';

const DOW = '일월화수목금토';
const NOW_LABEL: Record<PeriodKind, string> = { week: '이번 주로', month: '이번 달로', year: '올해로' };
const clock = (x: number) => { const m = Math.round(x); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const LV_LABEL = ['기록 없음', '적게', '보통', '많이', '아주 많이'];

export function MActivity({ ws, onDay }: { ws: Workspace; onDay: (k: string) => void }) {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [off, setOff] = useState(0);
  const p = period(kind, off, ws.today);
  const { setDashSpan } = ws;
  useEffect(() => { setDashSpan([p.from, p.end]); }, [setDashSpan, p.from, p.end]);
  useEffect(() => () => setDashSpan(null), [setDashSpan]);

  const goal = GOAL_HOURS * 60;
  const rows = useMemo(() => series(ws.days, p.from, p.to, ws.now, GOAL_HOURS), [ws.days, p.from, p.to, ws.now]);
  const sm = useMemo(() => summarize(rows, ws.blocks, ws.logs, p), [rows, ws.blocks, ws.logs, p.from, p.to, p.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const rg = restGrade(sm.restPct, sm.total + sm.rest);
  const openIf = (k: string) => { if (rows.find((r) => r.key === k)?.has) onDay(k); };

  return (
    <div className="m-an">
      <div className="m-an-bar">
        <div className="m-seg" role="tablist" aria-label="기간">
          {(['week', 'month', 'year'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setOff(0); }}>
              {k === 'week' ? '주간' : k === 'month' ? '월간' : '연간'}</button>
          ))}
        </div>
        <div className="m-an-nav">
          <button className="m-an-a" aria-label="이전 기간" onClick={() => setOff(off + 1)}>‹</button>
          <b>{p.label}</b>
          <button className="m-an-a" aria-label="다음 기간" disabled={!off} onClick={() => setOff(off - 1)}>›</button>
          {off > 0 && <button className="m-an-now" onClick={() => setOff(0)}>{NOW_LABEL[kind]}</button>}
        </div>
      </div>

      {!sm.days ? (
        <p className="m-card m-an-empty">이 기간에 출근 기록이 없어요.<br />홈에서 출근을 누르면 여기에 쌓입니다.</p>
      ) : <>
        <div className="m-an-tiles">
          <div className="m-card"><h4>총 근무</h4><b>{fmtDur(sm.total)}</b><span>{sm.days}일 · 일 평균 {fmtDur(sm.avg)}</span></div>
          <div className="m-card"><h4>근무시간 달성</h4><b>{sm.hit}<small>일</small></b>
            <span>{sm.goalDays}일 중 {sm.goalDays ? Math.round((sm.hit / sm.goalDays) * 100) : 0}% · {GOAL_HOURS}시간 기준</span></div>
          <div className="m-card"><h4>연속 기록</h4><b>{sm.streak}<small>일</small></b><span>주말은 일한 날만 세요</span></div>
          <div className="m-card"><h4>휴게 비율</h4><b className={rg ? '' : 'none'}>{rg ? sm.restPct : '--'}<small>%</small>{rg && <em className={`g-${rg.cls}`}>{rg.label}</em>}</b>
            <span>{rg ? `총 휴게 ${fmtDur(sm.rest)} · ${rg.tip}` : '기록이 짧아 아직 등급을 매기지 않아요'}</span></div>
        </div>

        {kind === 'year' ? <Heat year={dateOf(p.from).getFullYear()} rows={rows} today={ws.today} onDay={openIf} /> : (
          <section className="m-card m-an-c">
            <h4>근무시간 추이 <em>— 목표 {GOAL_HOURS}h</em></h4>
            <Bars rows={rows} goal={goal} today={ws.today} dense={kind === 'month'} onDay={openIf} end={p.end} />
          </section>
        )}

        <section className="m-card m-an-c">
          <h4>출퇴근 평균</h4>
          <div className="m-an-kv">
            <div><span>평균 출근</span><b>{sm.avgOn != null ? clock(sm.avgOn) : '–'}</b></div>
            <div><span>평균 퇴근</span><b>{sm.avgOff != null ? clock(sm.avgOff) : '–'}</b></div>
          </div>
        </section>

        <section className="m-card m-an-c">
          <h4>요일별 평균 근무</h4>
          <div className="m-an-dow">
            {sm.dow.map((x) => (
              <div key={x.dow} className={x.n ? '' : 'none'}>
                <span className="m-an-b"><i style={{ height: `${Math.min(100, (x.avg / Math.max(goal, ...sm.dow.map((y) => y.avg))) * 100)}%` }} /></span>
                <small>{DOW[x.dow]}</small><em>{x.n ? `${(x.avg / 60).toFixed(1)}h` : ''}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="m-card m-an-c">
          <h4>할 일 달성률</h4>
          <div className="m-an-pct"><b>{sm.todo ? Math.round((sm.done / sm.todo) * 100) : 0}<small>%</small></b><span>{sm.done} / {sm.todo}개</span></div>
          <div className="m-an-track"><i style={{ width: `${sm.todo ? (sm.done / sm.todo) * 100 : 0}%` }} /></div>
        </section>

        {Object.keys(sm.leaves).length > 0 && (
          <section className="m-card m-an-c">
            <h4>근태</h4>
            <div className="m-an-kv">{Object.entries(sm.leaves).map(([k, n]) => <div key={k}><span>{k}</span><b>{n}일</b></div>)}</div>
          </section>
        )}

        {sm.cats.length > 0 && (
          <section className="m-card m-an-c">
            <h4>카테고리별 <em>— 시간 기록</em></h4>
            <ul className="m-an-cats">
              {sm.cats.map((c) => (
                <li key={c.color}>
                  <i style={{ background: c.color ? catVar(c.color) : 'var(--text-dim)' }} />
                  <span>{catName(ws.cats, c.color) || '이름 없음'}</span>
                  <em>{c.count}건</em><b>{fmtDur(c.min)}</b>
                  <u><s style={{ width: `${(c.min / sm.cats[0].min) * 100}%`, background: c.color ? catVar(c.color) : undefined }} /></u>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>}
    </div>
  );
}

/** 근무시간 추이 — 목표선과 막대가 같은 상자를 기준으로 잰다 (v3.1.46) · 오지 않은 날은 빈 칸 */
function Bars({ rows, goal, today, dense, onDay, end }: { rows: ReturnType<typeof series>; goal: number; today: string; dense: boolean; onDay: (k: string) => void; end: string }) {
  const max = Math.max(goal, ...rows.map((r) => r.work)) * 1.05;
  // 진행 중인 기간의 남은 날도 자리는 둔다 — 막대 폭이 날마다 바뀌지 않게
  const pad: string[] = [];
  for (let d = addDays(dateOf(rows.at(-1)?.key ?? today), 1); keyOf(d) <= end; d = addDays(d, 1)) pad.push(keyOf(d));
  return (
    <div className={`m-an-bars${dense ? ' dense' : ''}`} style={{ '--goal': goal / max } as React.CSSProperties}>
      <i className="m-an-goal" aria-hidden="true" />
      {rows.map((r) => {
        const d = dateOf(r.key);
        return (
          <button key={r.key} className={`${r.work >= r.goal && r.goal > 0 ? 'hit' : ''}${r.key === today ? ' today' : ''}`} disabled={!r.has}
            onClick={() => onDay(r.key)} aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 ${fmtDur(r.work)}`}>
            <span className="m-an-b"><i style={{ height: `${(r.work / max) * 100}%` }} /></span>
            <small>{dense ? (d.getDate() === 1 || d.getDate() % 5 === 0 ? d.getDate() : '') : `${d.getDate()}`}</small>
            {!dense && <small className="dw">{r.leave ? r.leave.slice(0, 2) : DOW[r.dow]}</small>}
          </button>
        );
      })}
      {pad.map((k) => <span key={k} className="m-an-pad" />)}
    </div>
  );
}

/** 연간 근무 히트맵 — 폭이 모자라 옆으로 넘긴다. 처음엔 가장 최근 주가 보이게 오른쪽 끝에서 */
function Heat({ year, rows, today, onDay }: { year: number; rows: ReturnType<typeof series>; today: string; onDay: (k: string) => void }) {
  const { weeks } = yearHeat(year, rows, today);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, [year]);
  return (
    <section className="m-card m-an-c">
      <h4>근무 히트맵 <em>— 진하기 = 그 해 기록 대비 근무 시간</em></h4>
      <div className="m-an-heat" ref={box}>
        {weeks.map((w, i) => {
          const m = dateOf(w[0].key);
          const label = w.some((c) => c.key.endsWith('-01') && dateOf(c.key).getFullYear() === year)
            ? `${dateOf(w.find((c) => c.key.endsWith('-01'))!.key).getMonth() + 1}월` : '';
          return (
            <div key={i} className="m-an-wk" data-m={m.getMonth()}>
              <em>{label}</em>
              {w.map((c) => (
                <button key={c.key} className={`lv${c.lv ?? 'x'}${c.top ? ' top' : ''}${c.leave ? ' leave' : ''}${c.weekend ? ' we' : ''}`}
                  disabled={!c.lv} onClick={() => onDay(c.key)}
                  aria-label={`${c.key} ${c.lv == null ? '' : c.lv ? fmtDur(c.work) : LV_LABEL[0]}${c.leave ? ` · ${c.leave}` : ''}`} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="m-an-lg"><span>적게</span>{[1, 2, 3, 4].map((l) => <i key={l} className={`lv${l}`} />)}<span>많이</span><i className="leave" /><span>휴가</span></div>
    </section>
  );
}
