/**
 * 활동 › 내 분석 (v3 「활동」 #view-dash · renderAnalytics) — PC
 *
 * ★ 마크업 · 클래스 · id 는 v3 renderAnalytics 와 같다 (스타일은 v3 styles.css 그대로). 숫자는 전부 domain/stats — 폰과 같은 함수
 * ★ 날짜 하나를 가리키는 그림(막대 · 리듬 줄 · 히트맵 칸)은 누르면 그 날 상세 — 기록 없는 날은 안 열린다 (v3.1.212)
 * ★ 아직 안 옮긴 것: «이번 주 해석» (Claude 리포트)
 * ★ 순위 이력은 v3 의 «최근 6개월까지» 안내 없이 기록이 있는 데까지 (SYNC §11 · 2026-10-30 소유자)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import { catVar } from '../domain/attendance/logs';
import { hbFreqLabel } from '../domain/habits';
import {
  catSplit, dowRhythm, hbTable, labelSplit, leaveSummary, period, rankSeries, rankStat, REST_GRADE, restGrade, series, summarize,
  weekGoal, weekHistory, yearHeat, type DayRow, type HbTable, type MIv, type PeriodKind, type RankPt,
} from '../domain/stats';
import { ROSTER } from '../domain/sim/team';
import { dateOf, DOW, fmtClock, fmtDur, keyOf, leaveOf, LEAVES, weekStart } from '../ui/v3fmt';
import { CHEV } from './Worklog';

const PERIOD_NOW: Record<PeriodKind, string> = { week: '이번 주로', month: '이번 달로', year: '올해로' };
const ACT_NONE = '#9b9b9b';
const pad = (n: number) => String(n).padStart(2, '0');

/** 큰 숫자 자리 — 단위만 <u> (v3 fmtDurU) */
function DurU({ m: m0 }: { m: number }) {
  const m = Math.round(m0), h = Math.floor(m / 60);
  if (h > 0) return <>{h}<u>시간</u>{m % 60 ? <> {m % 60}<u>분</u></> : null}</>;
  return <>{m}<u>분</u></>;
}
const fmtDurU = (m0: number) => { const m = Math.round(m0), h = Math.floor(m / 60); return h > 0 ? (m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`) : `${m}분`; };
/** 소수 시간 (v3 fmtDurH) — `.0` 은 뗀다 */
const fmtDurH = (m: number) => { const t = (Math.round(m) / 60).toFixed(1); return `${t.endsWith('.0') ? t.slice(0, -2) : t}H`; };
/** 툴팁 한 줄 — 「목표 8h +1시간 12분」 · 목표가 0 이면 「목표 없음 · 초과 +3시간」 (v3.1.209) */
const goalGapTxt = (v: number, g: number) => (!(g > 0) ? `목표 없음 · 초과 +${fmtDur(v)}`
  : `목표 ${+(g / 60).toFixed(1)}h ${v - g >= 0 ? `+${fmtDur(v - g)}` : `−${fmtDur(g - v)}`}`);
const mFmt = (m: number) => { const v = Math.round(Math.min(1440, Math.max(0, m))); return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
const pct = (m: number) => Math.max(0, Math.min(100, (m / 1440) * 100));
const bar = (x: MIv) => { const l = pct(x.s); return { left: `${l.toFixed(2)}%`, width: `${Math.max(0.7, pct(Math.max(x.s + 1, x.e)) - l).toFixed(2)}%` }; };

/** v3 segSlide — 고른 칸 바탕은 알약 하나가 미끄러진다 */
function Seg<T extends string>({ id, cls, items, value, onChange, data }: {
  id?: string; cls: string; items: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; data?: Record<string, string>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const on = box.current?.querySelector<HTMLButtonElement>(':scope > button.on');
    if (on) setPill({ x: on.offsetLeft, w: on.offsetWidth });
  }, [value]);
  return (
    <div className={`${cls} has-pill`} id={id} role="tablist" ref={box} {...data}>
      <i className="seg-pill" aria-hidden="true" style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : { opacity: 0 }} />
      {items.map(([v, t]) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}
    </div>
  );
}

export function PcActivity({ ws, hidden, onOpenDay }: { ws: Workspace; hidden: boolean; onOpenDay: (k: string) => void }) {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [off, setOff] = useState(0);
  const p = period(kind, off, ws.today);
  const { setDashSpan } = ws;
  useEffect(() => { setDashSpan([p.from, p.end]); }, [setDashSpan, p.from, p.end]);
  useEffect(() => () => setDashSpan(null), [setDashSpan]);

  const goal = GOAL_HOURS * 60;
  const rows = useMemo(() => series(ws.days, p.from, p.to, ws.now, GOAL_HOURS), [ws.days, p.from, p.to, ws.now]);
  const sm = useMemo(() => summarize(rows, ws.blocks, p), [rows, ws.blocks, p.from, p.to, p.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const hb = useMemo(() => hbTable(ws.habits, p, ws.today, ws.offDay), [ws.habits, p.from, p.end, ws.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = ws.ranking.find((r) => r.me);
  const todayRank = me && me.min > 0 ? { pos: me.rank, n: ws.ranking.length } : null;
  const ranks = useMemo(() => rankSeries(rows, ws.today, todayRank, ws.nick), [rows, ws.today, todayRank?.pos, ws.nick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 기록이 있는 날만 누를 수 있다 — 표시 자체를 안 붙인다 (v3 odAttr · odTip)
  const odOk = (k: string) => { const d = ws.days[k]; return !!d && (d.onAt != null || !!d.leave); };
  const od = (k: string) => (odOk(k) ? { 'data-oday': k, onClick: () => onOpenDay(k) } : {});
  const odTip = (k: string) => (odOk(k) ? '\n눌러서 근태 상세' : '');
  const toWeek = (k: string) => { setKind('week'); setOff(Math.max(0, Math.round((weekStart(dateOf(ws.today)).getTime() - dateOf(k).getTime()) / (7 * 864e5)))); };

  const perBar = (
    <div className="per-bar">
      <Seg id="periodTabs" cls="seg sub" items={[['week', '주간'], ['month', '월간'], ['year', '연간']] as const} value={kind}
        onChange={(v) => { if (v !== kind) setOff(0); setKind(v); }} />
      <div className="per-nav">
        <button className="per-a" id="perPrev" onClick={() => setOff(off + 1)}>{CHEV(-1)}</button>
        <span className="per-l">{p.label}</span>
        <button className="per-a" id="perNext" disabled={!off} onClick={() => setOff(Math.max(0, off - 1))}>{CHEV(1)}</button>
        {off > 0 && <button className="per-now" id="perNow" onClick={() => setOff(0)}>{PERIOD_NOW[kind]}</button>}
      </div>
    </div>
  );
  const tail = <>
    {hb && <HabitCard t={hb} kind={kind} live={p.live} />}
    <RankCard kind={kind} pts={ranks} from={p.from} end={p.end} today={ws.today} first={ws.firstDate} od={od} odTip={odTip} />
  </>;

  let body: React.ReactNode;
  if (!sm.days) {
    body = <>{perBar}<div className="empty-state">이 기간에 출근 기록이 없어요.<br />근태에서 On을 누르면 여기에 쌓입니다.</div>{tail}</>;
  } else {
    const rg = restGrade(sm.restPct, sm.total + sm.rest);
    const worked = rows.filter((r) => r.has);
    body = <>
      {perBar}
      <div className="dash-grid" style={{ marginBottom: 12 }}>
        <div className="card"><h4>총 근무</h4><div className="big"><DurU m={sm.total} /></div>
          <div className="sub2">{sm.days}일 · 일 평균 {fmtDur(sm.avg)}</div></div>
        <div className="card"><h4>근무시간 달성</h4><div className="big">{sm.hit}<span>일</span></div>
          <div className="sub2">{sm.goalDays}일 중 {sm.goalDays ? Math.round((sm.hit / sm.goalDays) * 100) : 0}% · {GOAL_HOURS}시간 기준
            {sm.goalDays < sm.days && <> <i className="gi" aria-label="셈 기준"
              data-tip={`연차·병가인 날 ${sm.days - sm.goalDays}일은 목표가 없어서 뺐어요.\n반차인 날은 목표 절반으로 셉니다.`}>i</i></>}</div></div>
        <div className="card"><h4>연속 기록</h4><div className="big">{sm.streak}<span>일</span></div></div>
        <div className="card"><h4>휴게 비율 <span className="ihost"><i className="iico">i</i><RestTip cur={rg} /></span></h4>
          <div className={`big${rg ? '' : ' none'}`}>{rg ? sm.restPct : '--'}<span>%</span>{rg && <b className={`grade g-${rg.cls}`}>{rg.label}</b>}</div>
          <div className="sub2">총 휴게 {fmtDur(sm.rest)}{!rg && <em>기록이 짧아 아직 등급을 매기지 않아요</em>}</div></div>
      </div>

      {kind === 'year' ? <YearHeat year={dateOf(p.from).getFullYear()} rows={rows} today={ws.today} od={od} odTip={odTip} /> : (
        <div className="card" style={{ marginBottom: 12 }}><h4>근무시간 추이 <span className="goalline">— 목표 {GOAL_HOURS}h</span></h4>
          <div className="bars dow2" style={{ '--goal': goal / (Math.max(goal, ...rows.map((r) => r.work)) * 1.05) } as React.CSSProperties}>
            {rows.map((r) => {
              const d = dateOf(r.key), max = Math.max(goal, ...rows.map((x) => x.work)) * 1.05;
              const tip = `${d.getMonth() + 1}/${d.getDate()} ${DOW[d.getDay()]}${r.leave ? ` · ${r.leave}` : ''}\n근무 ${r.work ? fmtDur(r.work) : '기록 없음'}${r.work ? `\n${goalGapTxt(r.work, r.goal)}` : ''}${odTip(r.key)}`;
              return (
                <div key={r.key} className="bar-col" {...od(r.key)} data-tip={tip}>
                  <div className={`bar-fill${r.work > 0 && r.work >= r.goal ? ' hit' : ''}`} style={{ height: `${(r.work / max) * 100}%` }} />
                  <span>{d.getDate()}</span>
                  <i className={`bc-dow${r.dow === 0 || r.dow === 6 ? ' we' : ''}`}>{DOW[r.dow]}</i>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {kind === 'month' && <WeekHist weeks={weekHistory(ws.days, p, ws.now, GOAL_HOURS)} goal={goal * 5} today={ws.today} onWeek={toWeek} />}
      {kind === 'week' && <Rhythm rows={rows} today={ws.today} now={ws.now} sm={sm} od={od} />}
      {kind === 'month' && <DowRhythm rows={rows} avg={sm.avg} />}

      <div className="dash-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
        {kind === 'week' ? <GoalLeft g={weekGoal(ws.days, rows, p, ws.today, GOAL_HOURS)} /> : (
          <div className="card"><h4>요일별 평균 근무</h4><div className="bars sm">
            {sm.dow.map((b) => (
              <div key={b.dow} className="bar-col" data-tip={`${DOW[b.dow]}요일\n${b.n}일 기록 · 평균 근무 ${fmtDur(b.avg)}`}>
                <div className="bar-fill" style={{ height: `${(b.avg / Math.max(1, ...sm.dow.map((x) => x.avg))) * 100}%` }} /><span>{DOW[b.dow]}</span></div>
            ))}
          </div></div>
        )}
        <div className="card"><h4>할 일 달성률</h4>
          <div className="big">{sm.todo ? Math.round((sm.done / sm.todo) * 100) : 0}<span>%</span></div>
          <div className="sub2">{sm.done} / {sm.todo}개 완료</div>
          <div className="bar" style={{ marginTop: 10 }}><i className="done" style={{ width: `${sm.todo ? (sm.done / sm.todo) * 100 : 0}%` }} /></div>
        </div>
      </div>

      <LeaveCard rows={rows} first={ws.firstDate} today={ws.today} />
      <ActCards rows={worked} logs={ws.logs} ws={ws} />
      {tail}
    </>;
  }

  return (
    <div className={`view${hidden ? '' : ' on'}`} id="view-dash">
      <div className="dash"><div id="dashMe">{body}</div></div>
    </div>
  );
}

/** 휴게 비율 등급 표 — 반열린 구간으로 양 끝을 다 적는다 (v3.1.125) */
function RestTip({ cur }: { cur: ReturnType<typeof restGrade> }) {
  return (
    <span className="rtip"><span className="rtt">휴게 비율 등급</span>
      {REST_GRADE.map((g, i) => {
        const lo = i ? REST_GRADE[i - 1].max : 0;
        const rg = !i ? `${g.max}% 미만` : g.max === Infinity ? `${lo}% 이상` : `${lo}% ~ ${g.max}% 미만`;
        return <span key={i} className={`rgl${g === cur ? ' on' : ''}`}><span className="rgr">{rg}</span>
          <span className={`rgn g-${g.cls}`}>{g.label}</span><span className="rgd">{g.tip}</span></span>;
      })}
    </span>
  );
}

const Axis = ({ ticks }: { ticks: number[] }) => (
  <div className="rh-axis">{ticks.map((m) => {
    const q = pct(m);
    const st: React.CSSProperties = q <= 0.1 ? { left: 0 } : q >= 99.9 ? { right: 0 } : { left: `${q.toFixed(2)}%`, transform: 'translateX(-50%)' };
    return <i key={m} style={st}>{pad(Math.floor(m / 60))}</i>;
  })}</div>
);
const TICKS = [0, 240, 480, 720, 960, 1200, 1440];

/** 출퇴근 리듬 (주간) — 축은 늘 하루 전체 (v3.1.161) · 7일을 다 그린다 (v3.1.17) · 진행 중인 끝 조각만 깜빡인다 (v3.1.123) */
function Rhythm({ rows, today, now, sm, od }: { rows: DayRow[]; today: string; now: number; sm: ReturnType<typeof summarize>; od: (k: string) => object }) {
  if (!rows.some((r) => r.on != null)) return null;
  const nowM = (now - dateOf(today).getTime()) / 60000;
  const worked = rows.filter((r) => r.has);
  const ons = worked.filter((r) => r.on != null).length, offs = worked.filter((r) => r.off != null).length;
  const basis = (n: number) => (worked.length && n < worked.length ? <i className="rh-bas">({n}일)</i> : null);
  return (
    <div className="card" style={{ marginBottom: 12 }}><h4>출퇴근 리듬</h4>
      <div className="rhythm">{rows.map((r) => {
        const d = dateOf(r.key);
        const lab = `${d.getMonth() + 1}/${d.getDate()} ${DOW[r.dow]}`;
        if (r.on == null) return (
          <div key={r.key} className="rh-row off"><span className="rh-d">{lab}</span>
            <span className="rh-track" data-tip="출근 기록이 없어요" /><span className="rh-t"><b>–</b></span></div>
        );
        const live = r.off == null && r.key === today;
        const segs = r.segs.length ? r.segs : [{ s: r.on, e: r.off ?? Math.max(r.on + 10, nowM) }];
        const tip = segs.map((g, i) => `${i + 1}차 ${mFmt(g.s)} – ${mFmt(g.e)}`).join('\n')
          + (r.brks.length ? `\n휴게 ${r.brks.length}건 · ${fmtDur(r.rest)}` : '') + (live ? `\n아직 진행 중 — 지금 ${mFmt(nowM)}` : '');
        return (
          <div key={r.key} className={`rh-row${live ? ' live' : ''}`} {...od(r.key)}><span className="rh-d">{lab}</span>
            <span className="rh-track" data-tip={tip}>
              {segs.map((g, i) => <i key={i} className={`rh-seg${live && i === segs.length - 1 ? ' live' : ''}`} style={bar(g)} />)}
              {r.brks.map((g, i) => <i key={`b${i}`} className="rest" style={bar(g)} />)}
            </span>
            <span className="rh-t">{segs.length > 1 && <i className="rh-n">{segs.length}차</i>}<b>{mFmt(r.on)}{r.off != null ? ` → ${mFmt(r.off)}` : live ? ' → 지금' : ' → –'}</b></span>
          </div>
        );
      })}</div>
      <Axis ticks={TICKS} />
      <div className="sub2" style={{ marginTop: 8 }}>기록된 <b>{worked.length}일</b> 기준 ·
        평균 출근 <b>{sm.avgOn != null ? fmtClock(Math.round(sm.avgOn)) : '–'}</b>{basis(ons)}
        {' '}· 평균 퇴근 <b>{sm.avgOff != null ? fmtClock(Math.round(sm.avgOff)) : '–'}</b>{basis(offs)}
        {' '}· 평균 근무시간 <b>{fmtDur(sm.avg)}</b>
        <span style={{ color: 'var(--text-dim)' }}> — 위 줄들은 날짜별 «실제 기록» 이에요{offs < worked.length ? ' · 아직 안 끝난 날은 퇴근이 없어 평균에 못 넣어요' : ''}</span></div>
    </div>
  );
}

/** 요일 리듬 (월간) — 그 요일의 날들을 한 트랙에 겹쳐 그린다 (진하기 1/일수 · v3.1.171) · 오른쪽 휴게 · 비근무 (v3.1.266) */
function DowRhythm({ rows, avg }: { rows: DayRow[]; avg: number }) {
  const ds = dowRhythm(rows);
  if (!ds.some((x) => x.n)) return null;
  const hH = (v: number) => `${(Math.round(v) / 60).toFixed(1)}H`;
  return (
    <div className="card rh-dow" style={{ marginBottom: 12 }}><h4>요일 리듬 <span className="goalline">— 이 달, 요일마다 언제 일하고 언제 쉬었나</span></h4>
      <div className="rh-hd"><span /><span /><span className="rh-t"><span>휴게</span><span>비근무</span></span></div>
      <div className="rhythm">{ds.map((x) => {
        if (!x.n) return (
          <div key={x.dow} className="rh-row off"><span className="rh-d">{DOW[x.dow]}</span>
            <span className="rh-track" data-tip={`이 달에 ${DOW[x.dow]}요일 기록이 없어요`} /><span className="rh-t"><span>–</span><span>–</span></span></div>
        );
        const op = 1 / x.n;
        const tip = `${DOW[x.dow]}요일 ${x.n}일\n평균 휴게 ${hH(x.avgRest)} · 평균 비근무 ${hH(x.avgIdle)}${x.n > 1 ? `\n${x.n}일을 겹쳐 그렸어요 — 진할수록 그 시각에 자주 일했다는 뜻입니다` : ''}`;
        return (
          <div key={x.dow} className="rh-row"><span className="rh-d">{DOW[x.dow]} <i className="rh-n2">{x.n}일</i></span>
            <span className="rh-track" data-tip={tip}>{x.rs.map((r) => [
              ...(r.segs.length ? r.segs : [{ s: r.on!, e: r.off ?? r.on! + 10 }]).map((g, i) => <i key={`${r.key}s${i}`} className="rh-seg" style={{ ...bar(g), opacity: op }} />),
              ...r.brks.map((g, i) => <i key={`${r.key}b${i}`} className="rest" style={{ ...bar(g), opacity: op }} />),
            ])}</span>
            <span className="rh-t"><span>{hH(x.avgRest)}</span><span>{hH(x.avgIdle)}</span></span>
          </div>
        );
      })}</div>
      <Axis ticks={TICKS} />
      <div className="rh-help">
        <span><i className="k-seg" />근무</span><span><i className="k-rest" />휴게</span>
        <span>빈 자리 — 붙어 있지 않았거나 일하지 않은 시간</span>
        <span>여러 날은 <b>겹쳐서</b> 그립니다 — 진할수록 그 시각에 자주 일했어요</span>
      </div>
      <div className="sub2" style={{ marginTop: 8 }}>평균 근무시간 <b>{fmtDur(avg)}</b>
        <span style={{ color: 'var(--text-dim)' }}> — 날짜별로 보려면 <b>주간</b> 으로</span></div>
    </div>
  );
}

/** 주간 히스토리 (월간) — 월~일 통째로 · 줄을 누르면 그 주의 주간 (v3.1.194) */
function WeekHist({ weeks, goal, today, onWeek }: { weeks: ReturnType<typeof weekHistory>; goal: number; today: string; onWeek: (k: string) => void }) {
  const max = Math.max(goal, ...weeks.map((w) => w.work)) || 1;
  const nowWk = keyOf(weekStart(dateOf(today)));
  const less = weeks.some((w) => w.goal < goal);
  return (
    <div className="card" style={{ marginBottom: 12 }}><h4>주간 히스토리
      <span className="goalline">— 주 {fmtDurU(goal)} 기준 · 월~일 한 주를 통째로 셉니다</span></h4>
      <div className="wh">{weeks.map((w, i) => {
        const s0 = dateOf(w.key), e0 = dateOf(w.end);
        const pw = w.goal ? Math.round((w.work / w.goal) * 100) : 0;
        const lab = `${s0.getMonth() + 1}/${s0.getDate()} – ${e0.getMonth() + 1}/${e0.getDate()}`;
        const tip = `${lab}${w.key === nowWk ? ' · 이번 주' : ''}\n근무 ${w.work ? fmtDur(w.work) : '기록 없음'}${w.work ? ` · 주 목표 ${fmtDurU(w.goal)}${w.goal < goal ? ' (근태만큼 줄어듦)' : ''} 대비 ${w.goal ? `${pw}%` : '—'}` : ''}${w.days ? `\n기록 ${w.days}일 · 목표를 채운 날 ${w.hit}일` : ''}${w.out ? `\n— 다른 달의 날이 ${w.out}일 섞인 주예요. 「주간」 탭과 같은 값이 되도록 주 전체를 셉니다` : ''}\n\n눌러서 이 주의 「주간」 보기`;
        return (
          <button key={w.key} className={`wh-r${w.key === nowWk ? ' now' : ''}`} data-whk={w.key} data-tip={tip} onClick={() => onWeek(w.key)}>
            <span className="wh-n"><b>{i + 1}주</b><i>{lab}{w.out ? ' *' : ''}</i></span>
            <span className="wh-bar"><i className={w.work > 0 && w.work >= w.goal ? 'hit' : ''} style={{ width: `${Math.min(100, (w.work / max) * 100).toFixed(2)}%` }} />
              <em style={{ left: `${((w.goal / max) * 100).toFixed(2)}%` }} /></span>
            <span className="wh-v"><b>{w.work ? fmtDur(w.work) : '–'}</b><i>{w.work ? `${w.goal ? `${pw}%` : '목표 없음'} · 달성 ${w.hit}/${w.days}일` : '기록 없음'}</i></span>
          </button>
        );
      })}</div>
      <div className="rh-help"><span><i className="k-seg" />그 주의 근무 합계</span>
        <span><i className="k-goal" />주 목표 {fmtDurU(goal)}{less ? ' · 연차·반차가 낀 주는 그만큼 줄어요' : ''}</span>
        {weeks.some((w) => w.out) && <span><b>*</b> 다른 달의 날이 섞인 주 — 「주간」 탭과 같은 값이 되도록 <b>주 전체</b>를 셉니다</span>}
        <span>줄을 누르면 그 주의 <b>주간</b> 으로 갑니다</span></div>
    </div>
  );
}

/** 목표까지 (주간) — 숫자는 100% 에서 자르지 않고 막대만 멈춘다 (v3.1.220) · «씩» 은 남은 날이 둘 이상일 때만 (v3.1.150) */
function GoalLeft({ g }: { g: ReturnType<typeof weekGoal> }) {
  const wkTip = g.gap > 0 && g.rest7 > Math.max(0, g.left)
    ? <i className="gi" aria-label="주말을 포함하면" data-tip={`주말까지 일한다면\n남은 ${g.rest7}일 · 하루 ${fmtDur(Math.round(g.per7))}${g.rest7 > 1 ? '씩' : ''}`}>i</i> : null;
  const sub = g.gap <= 0 ? <>주 목표 {fmtDurU(g.goal)}을 <b>{fmtDur(-g.gap)}</b> 넘겼어요</>
    : g.left > 0 ? <>남은 {g.left}일{g.halfN ? `(반차 ${g.halfN})` : ''} · 하루 <b>{fmtDur(Math.round(g.halfN === g.left ? g.per / 2 : g.per))}</b>{g.left > 1 ? '씩' : ''}
      {g.halfN > 0 && g.left > g.halfN && <> · 반차 날 <b>{fmtDur(Math.round(g.per / 2))}</b></>}{wkTip}</>
      : <>주 목표 {fmtDurU(g.goal)}에 <b>{fmtDur(g.gap)}</b> 못 미쳤어요{wkTip}</>;
  const live = g.gap > 0 && g.left > 0;
  const tip = live ? Math.min(2.5, Math.max(0, 100 - g.pct)) : 0;
  return (
    <div className="card"><h4>목표까지 <span className="goalline">— 주 <DurU m={g.goal} /></span></h4>
      <div className="big">{g.pct}<span>%</span></div>
      <div className="sub2">{sub}</div>
      <div className="bar" style={{ marginTop: 10 }}><i className="done" style={{ width: `${Math.min(100, g.pct)}%` }} />{tip > 0 && <i className="now" style={{ width: `${tip}%` }} />}</div>
    </div>
  );
}

/** 근태 — 칩은 근태 «종류», 합계 줄은 «일했나» (v3.1.222 · 3.1.242) */
function LeaveCard({ rows, first, today }: { rows: DayRow[]; first: string | null; today: string }) {
  const s = leaveSummary(rows, first, today);
  if (!s.worked && Object.keys(s.chips).length <= 1) return null;
  const n = s.miss.wd + s.miss.we;
  return (
    <div className="card" style={{ marginBottom: 12 }}><h4>근태</h4>
      <div className="lv-sum">
        <span className="lv-chip" style={{ '--lv': '#4a90e2' } as React.CSSProperties} data-tip="근태가 «근무» 인 날 — 연차·반차·병가가 찍힌 날은 각 칩에서 셉니다"><b>{s.chips['']}</b>근무</span>
        {LEAVES.filter(([v]) => v && s.chips[v]).map(([v, label, c]) => <span key={v} className="lv-chip" style={{ '--lv': c } as React.CSSProperties}><b>{s.chips[v]}</b>{label}</span>)}
        <span className="lv-total" data-tip="근태와 상관없이 근무시간이 있는 날 · 미근무는 첫 기록 이후 어제까지 근무도 근태도 없는 날">근무 <b>{s.worked}일</b>
          {s.leaveDays > 0 && <> · 휴가 <b>{s.leaveDays % 1 ? s.leaveDays.toFixed(1) : s.leaveDays}일</b></>}
          {n > 0 && <> · 미근무 <b>{n}일</b> <i className="lv-incl">(평일 <em className="lv-wd">{s.miss.wd}</em> · 주말 {s.miss.we})</i></>}</span>
      </div>
    </div>
  );
}

/** 카테고리별 · 라벨별 (v3.1.249) — 탭 [전체 · 시간 기록 · 휴게] 은 카드마다 따로 · 범례 줄은 늘 둔다 (v3.1.250) */
function ActCards({ rows, logs, ws }: { rows: DayRow[]; logs: Workspace['logs']; ws: Workspace }) {
  type T = 'all' | 'slot' | 'rest';
  const [tab, setTab] = useState<{ cat: T; lbl: T }>({ cat: 'all', lbl: 'all' });
  const TABS = [['all', '전체'], ['slot', '시간 기록'], ['rest', '휴게']] as const;
  const legend = (t: T) => <div className="act-leg"><span className={t === 'rest' ? 'dim' : undefined}><i />근무 · 시간 기록</span><span className={t === 'slot' ? 'dim' : undefined}><i className="r" />휴게</span></div>;
  const row = (key: string, name: React.ReactNode, c: string, w: number, r: number, mx: number, sub: string, tip: string) => (
    <div key={key} className="act-row" data-tip={tip}>
      <span className="act-name">{name}</span>
      <div className="act-track"><div className="act-bar" style={{ width: `${Math.max(0.8, ((w + r) / mx) * 100)}%` }}>
        {w > 0 && <b style={{ flex: w, background: c }} />}{r > 0 && <b className="r" style={{ flex: r, backgroundColor: `color-mix(in srgb, ${c} 45%, var(--surface-2))` }} />}</div></div>
      <span className="act-time">{fmtDur(w + r)}{sub && <em>{sub}</em>}</span>
    </div>
  );
  const split = catSplit(rows, logs, ws.cats);
  const lsplit = labelSplit(rows, logs);
  const head = (id: 'cat' | 'lbl', title: string) => (
    <div className="act-h"><h4>{title}</h4><Seg cls="seg act-seg" items={TABS} value={tab[id]} onChange={(v) => setTab({ ...tab, [id]: v })} data={{ 'data-act-seg': id }} /></div>
  );
  const ct = tab.cat, lt = tab.lbl;
  const vis = split.map((c) => ({ ...c, w: ct === 'rest' ? 0 : c.work, r: ct === 'slot' ? 0 : c.rest })).filter((c) => c.w + c.r > 0.5)
    .sort((x, y) => Number(x.none) - Number(y.none) || y.w + y.r - (x.w + x.r));
  const cmx = Math.max(1, ...vis.map((c) => c.w + c.r));
  const cRows = Math.max(1, ...(['all', 'slot', 'rest'] as const).map((t) => split.filter((c) => (t === 'rest' ? 0 : c.work) + (t === 'slot' ? 0 : c.rest) > 0.5).length));
  const lvis = lsplit.filter((x) => lt === 'all' || x.kind === lt)
    .sort((x, y) => Number(x.kind === 'rest' && !x.label) - Number(y.kind === 'rest' && !y.label) || y.min - x.min).slice(0, 8);
  const lmx = Math.max(1, ...lvis.map((x) => x.min));
  const lRows = Math.max(1, ...(['all', 'slot', 'rest'] as const).map((t) => Math.min(8, lsplit.filter((x) => t === 'all' || x.kind === t).length)));
  const dim = (t: string) => <span style={{ color: 'var(--text-dim)' }}>{t}</span>;
  const empty = <p className="hint" style={{ margin: '6px 0 0' }}>이 기간에는 없어요</p>;
  return <>
    {split.length > 0 && (
      <div className="card act-card" style={{ marginBottom: 12 }}>{head('cat', '카테고리별')}{legend(ct)}
        <div className="act-list" style={{ '--rows': cRows } as React.CSSProperties}>
          {vis.length ? vis.map((c) => row(c.color || 'none', c.none ? '미분류' : c.name || dim(c.known ? '이름 없는 색' : '미지정'),
            c.none ? ACT_NONE : c.color ? catVar(c.color) : 'var(--blue)', c.w, c.r, cmx,
            ct === 'all' && c.w > 0.5 && c.r > 0.5 ? `휴게 ${fmtDur(c.r)}` : ct === 'all' && c.r > 0.5 ? '휴게' : '',
            c.none ? '미분류 — 카테고리를 안 붙인 근무(근무시간 중 시간 기록이 없는 몫)와 휴게(휴식 버튼 · 자동 포함)' : `근무 · 시간 기록 ${fmtDur(c.work)} · 휴게 ${fmtDur(c.rest)}`)) : empty}
        </div>
        {split.some((c) => c.known && !c.name) && <p className="hint" style={{ margin: '8px 0 0' }}>설정 → 시간 기록에서 색에 이름을 붙이면 여기에 카테고리 이름으로 나와요.</p>}
        {split.some((c) => !c.none && !c.known) && <p className="hint" style={{ margin: '8px 0 0' }}><b>미지정</b>은 지금 팔레트에 없는 색으로 남은 기록이에요. 그리드에서 그 칸의 색을 다시 골라 주면 합쳐집니다.</p>}
      </div>
    )}
    {lsplit.length > 0 && (
      <div className="card act-card" style={{ marginBottom: 12 }}>{head('lbl', '라벨별')}{legend(lt)}
        <div className="act-list" style={{ '--rows': lRows } as React.CSSProperties}>
          {lvis.length ? lvis.map((x) => {
            const none = x.kind === 'rest' && !x.label;
            const c = none ? ACT_NONE : x.color ? catVar(x.color) : x.kind === 'rest' ? ACT_NONE : 'var(--blue)';
            return row(`${x.kind}|${x.label}`, none ? '미분류' : x.label, c, x.kind === 'rest' ? 0 : x.min, x.kind === 'rest' ? x.min : 0, lmx, '',
              `${x.kind === 'rest' ? '휴게' : '시간 기록'} · ${x.label || '미분류 (메모 없음)'} · ${fmtDur(x.min)}`);
          }) : empty}
        </div>
      </div>
    )}
  </>;
}

/** 연간 히트맵 격자 (v3 yh-*) — 근무 히트맵 · 순위 히트맵이 같은 부품 */
function YhGrid({ year, cells }: { year: number; cells: React.ReactNode[] }) {
  const mon = (d: Date) => (d.getDay() + 6) % 7;
  const s0 = new Date(year, 0, 1); s0.setDate(s0.getDate() - mon(s0));
  const e0 = new Date(year, 11, 31); e0.setDate(e0.getDate() + (6 - mon(e0)));
  const cols = Math.round((e0.getTime() - s0.getTime()) / (7 * 864e5)) + 1;
  return (
    <div className="yh">
      <div className="yh-dow">{['월', '화', '수', '목', '금', '토', '일'].map((x, i) => <i key={x} className={i >= 5 ? 'we' : undefined}>{x}</i>)}</div>
      <div className="yh-body"><div className="yh-in" style={{ minWidth: cols * 7 + (cols - 1) * 3 }}>
        <div className="yh-mon">{Array.from({ length: 12 }, (_, m) => (
          <i key={m} style={{ left: `${((Math.floor((new Date(year, m, 1).getTime() - s0.getTime()) / (7 * 864e5)) / cols) * 100).toFixed(3)}%` }}>{m + 1}월</i>))}</div>
        <div className="yh-grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>{cells}</div>
      </div></div>
    </div>
  );
}
const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };

/** 근무 히트맵 (연간 · v2.9.101) — 진하기 = 그 해 분위수 · 초록 = 그 날 목표 · 일 안 한 근태 날은 테두리 · 최장 하루 링 */
function YearHeat({ year, rows, today, od, odTip }: { year: number; rows: DayRow[]; today: string; od: (k: string) => object; odTip: (k: string) => string }) {
  const { weeks, th, max, total, days } = yearHeat(year, rows, today);
  if (!days) return null;
  const lvSeen = LEAVES.filter(([v]) => v && rows.some((r) => r.leave === v));
  const cells = weeks.flat().map((c) => {
    if (c.lv == null) return <i key={c.key} className="yh-c" />;
    if (c.lv === 'leave') { const l = leaveOf(c.leave); return <i key={c.key} className="yh-c lv" style={{ '--lv': l[2] || '#ecb22e' } as React.CSSProperties} {...od(c.key)} data-tip={`${md(c.key)}\n${l[1] || '휴가'}${odTip(c.key)}`} />; }
    if (c.lv === 0) return <i key={c.key} className={`yh-c ${c.weekend ? 'we' : 'n0'}`} data-tip={`${md(c.key)}\n기록 없음`} />;
    const lw = c.leave ? leaveOf(c.leave) : null;
    return <i key={c.key} className={`yh-c l${c.lv}${c.hit ? ' hit' : ''}${c.top ? ' top' : ''}${lw ? ' lvw' : ''}`} style={lw ? { '--lv': lw[2] || '#ecb22e' } as React.CSSProperties : undefined} {...od(c.key)}
      data-tip={`${md(c.key)}${lw ? `\n${lw[1] || '휴가'}` : ''}\n근무 ${fmtDur(c.work)}\n${goalGapTxt(c.work, c.goal)}${c.top ? '\n— 올해 가장 오래 일한 날' : ''}${odTip(c.key)}`} />;
  });
  const sw = (c: string) => <i className={`yh-sw ${c}`} />;
  return (
    <div className="card" style={{ marginBottom: 12 }}><h4>근무 히트맵
      <span className="goalline">— 진할수록 오래 일했다 · <b className="yh-hitk">초록</b>은 목표 {GOAL_HOURS}시간을 채운 날</span></h4>
      <YhGrid year={year} cells={cells} />
      <div className="yh-foot">
        <span className="yh-lg scale"><i className="lb">0</i>{sw('z')}{sw('l1')}<i className="lb">{fmtDurH(th[0])}</i>{sw('l2')}<i className="lb">{fmtDurH(th[1])}</i>
          {sw('l3')}<i className="lb">{fmtDurH(th[2])}</i>{sw('l4')}<i className="lb">{fmtDurH(max)}</i></span>
        <span className="yh-lg">{sw('hit')}목표 {GOAL_HOURS}시간 달성<em />
          {lvSeen.map(([v, l, c]) => <span key={v}><i className="yh-sw lv" style={{ '--lv': c } as React.CSSProperties} />{l}<em /></span>)}
          {sw('n0')}기록 없음<em /><i className="yh-sw l4 top" />가장 오래</span>
        <span className="yh-sum" data-tip="근태와 상관없이 근무시간이 있는 날 — 연차·반차·병가에 일한 날도 셉니다">근무한 날 <b>{days}일</b> · 총 근무 <b>{Math.round(total / 60)}시간</b> · 하루 평균 <b>{fmtDur(Math.round(total / days))}</b></span>
      </div>
    </div>
  );
}

/** 습관 표 (v3 hbCardHtml) — 주간 = 날 · 월간 = 주 · 연간 = 달 · 지금 칸은 모든 줄에 같은 점선 */
function HabitCard({ t, kind, live }: { t: HbTable; kind: PeriodKind; live: boolean }) {
  return (
    <div className="card hb-card" style={{ marginBottom: 12 }}>
      <div className="hb-ch"><h4>습관</h4>{t.note && <span className="sub2">{t.note}</span>}</div>
      <div className="hb-tbl" style={{ '--hb-cols': t.heads.length } as React.CSSProperties}>
        <div className="hb-tr hb-th"><span className="hb-nm">습관</span>
          <div className="hb-cells">{t.heads.map((x, i) => <span key={i} className={`hb-hd${x.now ? ' now' : ''}${x.fut ? ' fut' : ''}`}><b>{x.t}</b>{x.s && <i>{x.s}</i>}</span>)}</div>
          <span className="hb-rt">{t.rateLabel}</span></div>
        {t.rows.map((r) => (
          <div key={r.h.id} className={`hb-tr${r.h.archivedAt ? ' arch' : ''}`}>
            <span className="hb-nm">{r.h.emoji && <span className="hb-e">{r.h.emoji}</span>}<span className="hb-nt"><b>{r.h.title}</b><i>{hbFreqLabel(r.h)}{r.h.archivedAt ? ' · 보관' : ''}</i></span></span>
            <div className="hb-cells">{r.cells.map((c, i) => <span key={i} className={`hb-c ${c.c}${c.now ? ' now' : ''}`}>{c.t}</span>)}</div>
            <span className="hb-rt"><b>{r.rate}</b></span>
          </div>
        ))}
      </div>
      <div className="hb-lg"><span><i className="hb-c ok" />완전 달성</span><span><i className="hb-c p2" />부분 달성</span><span><i className="hb-c p1" />50% 미만</span>
        <span><i className="hb-c miss" />{kind === 'week' ? '미완료' : '0%'}</span><span><i className="hb-c na">·</i>해당 없음 · 쉬는 날</span>
        {live && <span><i className="hb-c fut now" />{kind === 'week' ? '오늘' : kind === 'month' ? '이번 주' : '이번 달'}</span>}</div>
    </div>
  );
}

/** 내 순위 이력 (v3.1.106 · 252 · 257) — 위가 1위 · 점 크기 = 그 날 겨룬 사람 수 · 오늘은 속 빈 점 + 점선 · 연간은 히트맵 */
function RankCard({ kind, pts, from, end, today, first, od, odTip }: {
  kind: PeriodKind; pts: RankPt[]; from: string; end: string; today: string; first: string | null; od: (k: string) => object; odTip: (k: string) => string;
}) {
  const N = ROSTER.length + 1;
  const st = rankStat(pts, N);
  const head = <h4>내 순위 이력</h4>;
  if (!st.days && !pts.some((x) => x.live)) {
    return <div className="card rk-card" style={{ marginBottom: 12 }}>{head}<div className="empty-state">이 {kind === 'year' ? '해' : '기간'}에 순위가 없어요.<br />출근해서 근무를 기록하면 그 날부터 등수가 쌓입니다.</div></div>;
  }
  const sum = st.days > 0 && (
    <div className="rk-sum">
      <div><b>{st.avg.toFixed(1)}위</b><span>평균 · {N}명 환산</span></div>
      <div><b>{st.best}위</b><span>최고 순위</span></div>
      <div><b>상위 {st.pct}%</b><span>{st.days}일 기준</span></div>
    </div>
  );
  if (kind === 'year') {
    const year = dateOf(from).getFullYear();
    const by = new Map(pts.map((x) => [x.key, x]));
    const mon = (d: Date) => (d.getDay() + 6) % 7;
    const cells: React.ReactNode[] = [];
    const s0 = new Date(year, 0, 1); s0.setDate(s0.getDate() - mon(s0));
    const e0 = new Date(year, 11, 31); e0.setDate(e0.getDate() + (6 - mon(e0)));
    let firsts = 0, done = 0;
    for (const d = new Date(s0); d <= e0; d.setDate(d.getDate() + 1)) {
      const k = keyOf(d);
      if (d.getFullYear() !== year || k > today || !first || k < first) { cells.push(<i key={k} className="yh-c" />); continue; }
      const v = by.get(k), we = d.getDay() === 0 || d.getDay() === 6;
      if (!v) { cells.push(<i key={k} className={`yh-c ${we ? 'we' : 'n0'}`} data-tip={`${md(k)}\n출근 기록 없음`} />); continue; }
      if (v.n < 2) { cells.push(<i key={k} className="yh-c z" {...od(k)} data-tip={`${md(k)}\n혼자 근무 — 겨룬 사람이 없어 순위 없음\n근무 ${fmtDur(v.my)}${odTip(k)}`} />); continue; }
      if (!v.live) { done++; if (v.pos === 1) firsts++; }
      const up = (v.pos - 1) / (v.n - 1);
      const lv = v.pos === 1 ? 'l4 hit' : up <= 0.25 ? 'l4' : up <= 0.5 ? 'l3' : up <= 0.75 ? 'l2' : 'l1';
      cells.push(<i key={k} className={`yh-c ${lv}`} {...od(k)} data-tip={`${md(k)}${v.live ? ' · 아직 진행 중' : ''}\n${v.n}명 중 ${v.pos}위 · 상위 ${Math.round(up * 100)}%\n근무 ${fmtDur(v.my)}${odTip(k)}`} />);
    }
    const sw = (c: string) => <i className={`yh-sw ${c}`} />;
    return (
      <div className="card rk-card" style={{ marginBottom: 12 }}>{head}{sum}
        <YhGrid year={year} cells={cells} />
        <div className="yh-foot">
          <span className="yh-lg scale"><i className="lb">상위 0</i>{sw('l4')}<i className="lb">25%</i>{sw('l3')}<i className="lb">50%</i>{sw('l2')}<i className="lb">75%</i>{sw('l1')}<i className="lb">100%</i></span>
          <span className="yh-lg">{sw('hit')}1위<em />{sw('z')}혼자 근무<em />{sw('n0')}출근 안 함</span>
          <span className="yh-sum">순위가 있는 날 <b>{done}일</b> · 1위 <b>{firsts}일</b></span>
        </div>
      </div>
    );
  }
  // 가로축은 기간 전체 — 앞날은 자리만 둔다 · 점이 타원이 되지 않게 비율을 지킨다
  const W = 640, H = 128, PL = 26, PR = 8, PT = 10, PB = 16;
  const n = Math.round((dateOf(end).getTime() - dateOf(from).getTime()) / 864e5) + 1;
  const X = (k: string) => PL + (Math.round((dateOf(k).getTime() - dateOf(from).getTime()) / 864e5) / Math.max(1, n - 1)) * (W - PL - PR);
  const Y = (pos: number) => PT + ((Math.min(pos, N) - 1) / Math.max(1, N - 1)) * (H - PT - PB);
  const R = (k: number) => 3 + ((Math.max(2, Math.min(k, N)) - 2) / Math.max(1, N - 2)) * 2;
  const solid = pts.filter((x) => !x.live), last = pts.at(-1), prev = solid.at(-1);
  return (
    <div className="card rk-card" style={{ marginBottom: 12 }}>{head}{sum}
      <div className="rk-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="내 순위 이력 그래프">
        {[1, Math.round((1 + N) / 2), N].map((v) => <g key={v}><line className="rk-gl" x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} /><text className="rk-ax" x={PL - 6} y={Y(v) + 3.5}>{v}</text></g>)}
        {st.days > 1 && <line className="rk-avg" x1={PL} x2={W - PR} y1={Y(st.avg)} y2={Y(st.avg)} />}
        {last?.live && prev && <path className="rk-line dash" d={`M${X(prev.key).toFixed(1)},${Y(prev.pos).toFixed(1)} L${X(last.key).toFixed(1)},${Y(last.pos).toFixed(1)}`} />}
        {solid.length > 1 && <path className="rk-line" d={solid.map((d, i) => `${i ? ' L' : 'M'}${X(d.key).toFixed(1)},${Y(d.pos).toFixed(1)}`).join('')} />}
        {pts.map((d) => {
          const up = d.n > 1 ? Math.round(((d.pos - 1) / (d.n - 1)) * 100) : 0;
          const dd = dateOf(d.key);
          const tip = `${dd.getMonth() + 1}월 ${dd.getDate()}일 (${DOW[dd.getDay()]})${d.live ? ' · 아직 진행 중' : ''}\n${d.n}명 중 ${d.pos}위 · 상위 ${up}%${d.my ? `\n근무 ${fmtDur(d.my)}` : ''}`;
          return <g key={d.key}>
            <circle className="rk-hit" cx={X(d.key)} cy={Y(d.pos)} r={Math.max(R(d.n) + 7, 11)} data-tip={tip} {...od(d.key)} />
            <circle className={`rk-dot${d.live ? ' live' : ''}`} cx={X(d.key)} cy={Y(d.pos)} r={R(d.n)} />
          </g>;
        })}
      </svg></div>
    </div>
  );
}
