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
import { catVar } from '../domain/attendance/logs';
import { hbFreqLabel } from '../domain/habits';
import { LEAVES } from '../ui/v3fmt';
import {
  catSplit, dowRhythm, hbTable, labelSplit, leaveSummary, weekGoal, period, rankSeries, rankStat, restGrade, series, summarize, weekHistory, yearHeat,
  type CatRow, type DayRow, type HbTable, type LabelRow, type MIv, type PeriodKind, type RankPt, type WeekRow,
} from '../domain/stats';
import { ROSTER } from '../domain/sim/team';
import { addDays, dateOf, fmtDur, keyOf, weekStart } from '../ui/v3fmt';

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

  const goal = ws.goal.hours * 60;
  const rows = useMemo(() => series(ws.days, p.from, p.to, ws.now, ws.goal), [ws.days, p.from, p.to, ws.now, ws.goal]);
  const sm = useMemo(() => summarize(rows, ws.blocks, p), [rows, ws.blocks, p.from, p.to, p.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const rg = restGrade(sm.restPct, sm.total + sm.rest);
  const openIf = (k: string) => { if (rows.find((r) => r.key === k)?.has) onDay(k); };
  const weeks = useMemo(() => (kind === 'month' ? weekHistory(ws.days, p, ws.now, ws.goal) : []), [kind, ws.days, p.from, p.to, ws.now, ws.goal]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => labelSplit(rows, ws.logs), [rows, ws.logs]);
  const hb = useMemo(() => hbTable(ws.habits, p, ws.today, ws.offDay), [ws.habits, p.from, p.end, ws.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = ws.ranking.find((r) => r.me);
  const todayRank = me && me.min > 0 ? { pos: me.rank, n: ws.ranking.length } : null;
  const ranks = useMemo(() => rankSeries(rows, ws.today, todayRank, ws.nick, ws.ranks), [rows, ws.today, todayRank?.pos, ws.nick, ws.ranks]); // eslint-disable-line react-hooks/exhaustive-deps
  /** 주간 히스토리의 줄 → 그 주의 «주간» (v3.1.194) */
  const toWeek = (k: string) => { setKind('week'); setOff(Math.round((weekStart(dateOf(ws.today)).getTime() - dateOf(k).getTime()) / (7 * 864e5))); };

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
            <span>{sm.goalDays}일 중 {sm.goalDays ? Math.round((sm.hit / sm.goalDays) * 100) : 0}% · {ws.goal.hours}시간 기준</span></div>
          <div className="m-card"><h4>연속 기록</h4><b>{sm.streak}<small>일</small></b><span>주말은 일한 날만 세요</span></div>
          <div className="m-card"><h4>휴게 비율</h4><b className={rg ? '' : 'none'}>{rg ? sm.restPct : '--'}<small>%</small>{rg && <em className={`g-${rg.cls}`}>{rg.label}</em>}</b>
            <span>{rg ? `총 휴게 ${fmtDur(sm.rest)} · ${rg.tip}` : '기록이 짧아 아직 등급을 매기지 않아요'}</span></div>
        </div>

        {kind === 'year' ? <Heat year={dateOf(p.from).getFullYear()} rows={rows} today={ws.today} onDay={openIf} /> : (
          <section className="m-card m-an-c">
            <h4>근무시간 추이 <em>— 목표 {ws.goal.hours}h</em></h4>
            <Bars rows={rows} goal={goal} today={ws.today} dense={kind === 'month'} onDay={openIf} end={p.end} />
          </section>
        )}

        {kind === 'month' && <WeekHist weeks={weeks} goal={goal * 5} onWeek={toWeek} />}
        {kind === 'week' && <Rhythm rows={rows} today={ws.today} onDay={openIf} />}
        {kind === 'month' && <DowRhythm rows={rows} avg={sm.avg} />}

        {kind !== 'month' && (
        <section className="m-card m-an-c">
            <h4>출퇴근 평균</h4>
            <div className="m-an-kv">
              <div><span>평균 출근</span><b>{sm.avgOn != null ? clock(sm.avgOn) : '–'}</b></div>
              <div><span>평균 퇴근</span><b>{sm.avgOff != null ? clock(sm.avgOff) : '–'}</b></div>
            </div>
          </section>
        )}

        {kind === 'year' && (
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
        )}

        {kind === 'week' && <GoalCard g={weekGoal(ws.days, rows, p, ws.today, ws.goal)} />}

        <section className="m-card m-an-c">
          <h4>할 일 달성률</h4>
          <div className="m-an-pct"><b>{sm.todo ? Math.round((sm.done / sm.todo) * 100) : 0}<small>%</small></b><span>{sm.done} / {sm.todo}개</span></div>
          <div className="m-an-track"><i style={{ width: `${sm.todo ? (sm.done / sm.todo) * 100 : 0}%` }} /></div>
        </section>

        <LeaveCard s={leaveSummary(rows, ws.firstDate, ws.today)} />

        <CatCard list={catSplit(rows, ws.logs, ws.cats)} />
        {labels.length > 0 && <Labels list={labels} />}
      </>}
      {/* 습관은 출근과 따로 쌓인다 — 출근 기록이 없는 기간에도 보여 준다 (v3.1.236) */}
      {hb && <HabitCard t={hb} kind={kind} live={p.live} />}
      {sm.days > 0 && <RankCard kind={kind} pts={ranks} rows={rows} from={p.from} end={p.end} today={ws.today} onDay={openIf} />}
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
      <h4>근무 히트맵 <em>— 진할수록 오래 · 초록은 목표를 채운 날</em></h4>
      <div className="m-an-heat" ref={box}>
        {weeks.map((w, i) => {
          const m = dateOf(w[0].key);
          const label = w.some((c) => c.key.endsWith('-01') && dateOf(c.key).getFullYear() === year)
            ? `${dateOf(w.find((c) => c.key.endsWith('-01'))!.key).getMonth() + 1}월` : '';
          return (
            <div key={i} className="m-an-wk" data-m={m.getMonth()}>
              <em>{label}</em>
              {w.map((c) => (
                <button key={c.key} className={`lv${c.lv === 'leave' ? '0 leave' : c.lv ?? 'x'}${c.hit ? ' hit' : ''}${c.top ? ' top' : ''}${c.leave && c.lv !== 'leave' ? ' leave' : ''}${c.weekend ? ' we' : ''}`}
                  disabled={!c.lv} onClick={() => onDay(c.key)}
                  aria-label={`${c.key} ${c.lv == null ? '' : typeof c.lv === 'number' && c.lv ? fmtDur(c.work) : LV_LABEL[0]}${c.leave ? ` · ${c.leave}` : ''}`} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="m-an-lg"><span>적게</span>{[1, 2, 3, 4].map((l) => <i key={l} className={`lv${l}`} />)}<span>많이</span><i className="lv4 hit" /><span>목표 달성</span><i className="leave" /><span>휴가</span></div>
    </section>
  );
}

const pctOf = (m: number) => `${Math.max(0, Math.min(100, (m / 1440) * 100)).toFixed(2)}%`;
const barStyle = (x: MIv, op?: number): React.CSSProperties =>
  ({ left: pctOf(x.s), width: `max(2px, ${(Math.max(1, x.e - x.s) / 14.4).toFixed(2)}%)`, opacity: op });
const hH = (v: number) => `${(Math.round(v) / 60).toFixed(1)}H`;
const Axis = () => (
  <div className="m-rh-ax" aria-hidden="true">{[0, 4, 8, 12, 16, 20, 24].map((h) => <i key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, '0')}</i>)}</div>
);

/** 출퇴근 리듬 (주간) — 축은 늘 하루 전체 (v3.1.161) · 안 나간 날도 줄은 지킨다 (v3.1.17) */
function Rhythm({ rows, today, onDay }: { rows: DayRow[]; today: string; onDay: (k: string) => void }) {
  if (!rows.some((r) => r.on != null)) return null;
  return (
    <section className="m-card m-an-c">
      <h4>출퇴근 리듬</h4>
      <div className="m-rh">
        {rows.map((r) => {
          const d = dateOf(r.key);
          return (
            <button key={r.key} className={`m-rh-r${r.on == null ? ' off' : ''}${r.key === today ? ' today' : ''}`} disabled={!r.has} onClick={() => onDay(r.key)}>
              <span className="m-rh-d">{d.getMonth() + 1}/{d.getDate()} {DOW[r.dow]}</span>
              <span className="m-rh-t">
                {r.segs.map((x, i) => <i key={i} className="m-rh-w" style={barStyle(x)} />)}
                {r.brks.map((x, i) => <i key={`b${i}`} className="m-rh-b" style={barStyle(x)} />)}
              </span>
              <b>{r.has ? fmtDur(r.work) : '–'}</b>
            </button>
          );
        })}
        <Axis />
      </div>
      <div className="m-rh-lg"><span><i className="m-rh-w" />근무</span><span><i className="m-rh-b" />휴게</span><span>빈 자리 — 일하지 않은 시간</span></div>
    </section>
  );
}

/** 요일 리듬 (월간) — 그 요일의 날들을 한 트랙에 겹쳐 그린다 (진하기 = 1/일수 · v3.1.171). 오른쪽은 휴게 · 비근무 (v3.1.266) */
function DowRhythm({ rows, avg }: { rows: DayRow[]; avg: number }) {
  const ds = dowRhythm(rows);
  if (!ds.some((x) => x.n)) return null;
  return (
    <section className="m-card m-an-c">
      <h4>요일 리듬 <em>— 이 달, 요일마다 언제 일하고 쉬었나</em></h4>
      <div className="m-rh dow">
        <div className="m-rh-r hd"><span /><span /><span className="m-rh-v"><i>휴게</i><i>비근무</i></span></div>
        {ds.map((x) => {
          const op = x.n ? 1 / x.n : 1;
          return (
            <div key={x.dow} className={`m-rh-r${x.n ? '' : ' off'}`}>
              <span className="m-rh-d">{DOW[x.dow]}{x.n > 0 && <small> {x.n}일</small>}</span>
              <span className="m-rh-t">
                {x.rs.map((r) => [
                  ...r.segs.map((g, i) => <i key={`${r.key}s${i}`} className="m-rh-w" style={barStyle(g, op)} />),
                  ...r.brks.map((g, i) => <i key={`${r.key}b${i}`} className="m-rh-b" style={barStyle(g, op)} />),
                ])}
              </span>
              <span className="m-rh-v"><i>{x.n ? hH(x.avgRest) : '–'}</i><i>{x.n ? hH(x.avgIdle) : '–'}</i></span>
            </div>
          );
        })}
        <Axis />
      </div>
      <div className="m-rh-lg"><span><i className="m-rh-w" />근무</span><span><i className="m-rh-b" />휴게</span><span>겹쳐 그려요 — 진할수록 그 시각에 자주 일했어요</span></div>
      <p className="m-an-sub">평균 근무시간 <b>{fmtDur(avg)}</b> — 날짜별로 보려면 주간으로</p>
    </section>
  );
}

/** 주간 히스토리 (월간) — 월~일 통째로 · 줄을 누르면 그 주의 주간 (v3.1.194) */
function WeekHist({ weeks, goal, onWeek }: { weeks: WeekRow[]; goal: number; onWeek: (k: string) => void }) {
  const max = Math.max(goal, ...weeks.map((w) => w.work)) || 1;
  const out = weeks.some((w) => w.out);
  return (
    <section className="m-card m-an-c">
      <h4>주간 히스토리 <em>— 주 {Math.round(goal / 60)}시간 기준</em></h4>
      <div className="m-wh">
        {weeks.map((w, i) => {
          const s0 = dateOf(w.key), e0 = dateOf(w.end);
          const pw = w.goal ? Math.round((w.work / w.goal) * 100) : 0;
          return (
            <button key={w.key} className="m-wh-r" onClick={() => onWeek(w.key)}>
              <span className="m-wh-n"><b>{i + 1}주</b><i>{s0.getMonth() + 1}/{s0.getDate()}–{e0.getMonth() + 1}/{e0.getDate()}{w.out ? ' *' : ''}</i></span>
              <span className="m-wh-bar"><i className={w.work > 0 && w.work >= w.goal ? 'hit' : ''} style={{ width: `${Math.min(100, (w.work / max) * 100)}%` }} />
                <em style={{ left: `${(w.goal / max) * 100}%` }} /></span>
              <span className="m-wh-v"><b>{w.work ? fmtDur(w.work) : '–'}</b><i>{w.work ? `${w.goal ? `${pw}%` : '목표 없음'} · ${w.hit}/${w.days}일` : '기록 없음'}</i></span>
            </button>
          );
        })}
      </div>
      <p className="m-an-sub">{out ? '* 다른 달의 날이 섞인 주 — 주간 탭과 같은 값이 되게 주 전체를 셉니다 · ' : ''}줄을 누르면 그 주로</p>
    </section>
  );
}

/** 라벨별 — 시간 기록 · 휴게 탭 (v3.1.249) · 메모 없는 휴게 = 미분류(회색 · v3.1.250) · 8줄까지 */
function Labels({ list }: { list: LabelRow[] }) {
  const [tab, setTab] = useState<'all' | 'slot' | 'rest'>('all');
  const vis = list.filter((x) => tab === 'all' || x.kind === tab)
    .sort((a, b) => Number(a.kind === 'rest' && !a.label) - Number(b.kind === 'rest' && !b.label) || b.min - a.min).slice(0, 8);
  const mx = Math.max(1, ...vis.map((x) => x.min));
  return (
    <section className="m-card m-an-c">
      <div className="m-lb-h"><h4>라벨별</h4>
        <div className="m-seg sm" role="tablist">{([['all', '전체'], ['slot', '시간 기록'], ['rest', '휴게']] as const).map(([v, t]) => (
          <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>{t}</button>))}</div>
      </div>
      <ul className="m-an-cats">
        {vis.map((x) => {
          const none = x.kind === 'rest' && !x.label;
          const c = none || !x.color ? (x.kind === 'rest' ? '#9b9b9b' : 'var(--blue)') : catVar(x.color);
          return (
            <li key={`${x.kind}|${x.label}`}>
              <i className={x.kind === 'rest' ? 'r' : ''} style={{ background: c }} />
              <span>{none ? '미분류' : x.label}</span>
              <em>{x.kind === 'rest' ? '휴게' : ''}</em><b>{fmtDur(x.min)}</b>
              <u><s className={x.kind === 'rest' ? 'r' : ''} style={{ width: `${(x.min / mx) * 100}%`, background: c }} /></u>
            </li>
          );
        })}
        {!vis.length && <li className="m-an-sub">이 기간에는 없어요</li>}
      </ul>
    </section>
  );
}

/** 습관 표 — 완전 달성 초록 · 부분 파랑(50% 미만 옅게) · 미달성 회색 · 지금 칸은 점선 하나 */
function HabitCard({ t, kind, live }: { t: HbTable; kind: PeriodKind; live: boolean }) {
  return (
    <section className="m-card m-an-c">
      <h4>습관{t.note && <em> — {t.note}</em>}</h4>
      <div className="m-hb" style={{ '--cols': t.heads.length } as React.CSSProperties}>
        <div className="m-hb-r hd"><span />
          <div className="m-hb-cs">{t.heads.map((x, i) => <span key={i} className={`${x.now ? 'now' : ''}${x.fut ? ' fut' : ''}`}><b>{kind === 'year' ? x.t.replace('월', '') : x.t}</b>{x.s && kind === 'week' && <i>{x.s}</i>}</span>)}</div>
          <span className="m-hb-rt">{t.rateLabel}</span></div>
        {t.rows.map((r) => (
          <div key={r.h.id} className={`m-hb-r${r.h.archivedAt ? ' arch' : ''}`}>
            <span className="m-hb-nm">{r.h.emoji && <span>{r.h.emoji}</span>}<span><b>{r.h.title}</b><i>{hbFreqLabel(r.h)}{r.h.archivedAt ? ' · 보관' : ''}</i></span></span>
            <div className="m-hb-cs">{r.cells.map((c, i) => <span key={i} className={`m-hb-c ${c.c}${c.now ? ' now' : ''}`}>{c.t}</span>)}</div>
            <span className="m-hb-rt"><b>{r.rate}</b></span>
          </div>
        ))}
      </div>
      <div className="m-hb-lg"><span><i className="m-hb-c ok" />완전 달성</span><span><i className="m-hb-c p2" />부분</span><span><i className="m-hb-c p1" />50% 미만</span>
        <span><i className="m-hb-c miss" />{kind === 'week' ? '미완료' : '0%'}</span><span><i className="m-hb-c na">·</i>해당 없음</span>
        {live && <span><i className="m-hb-c fut now" />{kind === 'week' ? '오늘' : kind === 'month' ? '이번 주' : '이번 달'}</span>}</div>
    </section>
  );
}

/** 내 순위 이력 — 주간 · 월간은 등수 선(위가 1위 · 점 크기 = 겨룬 사람 수 · 오늘은 속 빈 점), 연간은 히트맵 (v3.1.257) */
function RankCard({ kind, pts, rows, from, end, today, onDay }: { kind: PeriodKind; pts: RankPt[]; rows: DayRow[]; from: string; end: string; today: string; onDay: (k: string) => void }) {
  const year = dateOf(from).getFullYear();
  const N = ROSTER.length + 1;
  const st = rankStat(pts, N);
  if (!st.days && !pts.length) return null;
  const sum = st.days > 0 && (
    <div className="m-an-kv m-rk-sum">
      <div><span>평균 · {N}명 환산</span><b>{st.avg.toFixed(1)}위</b></div>
      <div><span>최고 순위</span><b>{st.best}위</b></div>
      <div><span>{st.days}일 기준</span><b>상위 {st.pct}%</b></div>
    </div>
  );
  if (kind === 'year') {
    const by = new Map(pts.map((x) => [x.key, x]));
    const { weeks } = yearHeat(year, rows, today);
    return (
      <section className="m-card m-an-c m-rk-y">
        <h4>내 순위 이력 <em>— 진하기 = 그 날 상위 몇 %</em></h4>
        {sum}
        <HeatScroll year={year}>
          {weeks.map((w, i) => (
            <div key={i} className="m-an-wk">
              {w.map((c) => {
                const v = by.get(c.key);
                const up = v && v.n > 1 ? (v.pos - 1) / (v.n - 1) : null;
                const lv = c.lv == null ? 'x' : !v ? '0' : up == null ? 'z' : v.pos === 1 ? '4 hit' : up <= 0.25 ? '4' : up <= 0.5 ? '3' : up <= 0.75 ? '2' : '1';
                return <button key={c.key} className={`lv${lv}${c.weekend ? ' we' : ''}`} disabled={!v} onClick={() => onDay(c.key)}
                  aria-label={`${c.key}${v ? ` ${v.n}명 중 ${v.pos}위` : ''}`} />;
              })}
            </div>
          ))}
        </HeatScroll>
        <div className="m-an-lg"><span>하위</span>{[1, 2, 3, 4].map((l) => <i key={l} className={`lv${l}`} />)}<span>상위</span><i className="lv4 hit" /><span>1위</span><i className="lvz" /><span>혼자</span></div>
      </section>
    );
  }
  // 가로축은 기간 전체 — 진행 중이면 남은 날은 자리만 둔다 (오늘 점이 오른쪽 끝에 붙지 않게)
  const dayIx = (k: string) => Math.round((dateOf(k).getTime() - dateOf(from).getTime()) / 864e5);
  const n = dayIx(end) + 1;
  const W = 340, H = 120, PL = 22, PR = 8, PT = 10, PB = 10;
  const X = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const Y = (pos: number) => PT + ((Math.min(pos, N) - 1) / Math.max(1, N - 1)) * (H - PT - PB);
  const R = (k: number) => 2.5 + ((Math.max(2, Math.min(k, N)) - 2) / Math.max(1, N - 2)) * 2;
  const dots = pts.map((x) => ({ ...x, i: dayIx(x.key) }));
  const solid = dots.filter((d) => !d.live);
  const last = dots.at(-1), prev = solid.at(-1);
  return (
    <section className="m-card m-an-c">
      <h4>내 순위 이력</h4>
      {sum}
      <svg className="m-rk" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="내 순위 이력 그래프">
        {[1, Math.round((1 + N) / 2), N].map((v) => <g key={v}><line className="gl" x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} /><text x={PL - 5} y={Y(v) + 3.5}>{v}</text></g>)}
        {st.days > 1 && <line className="avg" x1={PL} x2={W - PR} y1={Y(st.avg)} y2={Y(st.avg)} />}
        {solid.length > 1 && <path className="ln" d={solid.map((d, k) => `${k ? 'L' : 'M'}${X(d.i).toFixed(1)},${Y(d.pos).toFixed(1)}`).join(' ')} />}
        {last?.live && prev && <path className="ln dash" d={`M${X(prev.i)},${Y(prev.pos)} L${X(last.i)},${Y(last.pos)}`} />}
        {dots.map((d) => (
          <g key={d.key} onClick={() => onDay(d.key)}>
            <circle className="hit" cx={X(d.i)} cy={Y(d.pos)} r={11} />
            <circle className={`dot${d.live ? ' live' : ''}`} cx={X(d.i)} cy={Y(d.pos)} r={R(d.n)}><title>{`${d.key} · ${d.n}명 중 ${d.pos}위`}</title></circle>
          </g>
        ))}
      </svg>
      {!st.days && <p className="m-an-sub">아직 끝난 날의 순위가 없어요 — 오늘 점은 진행 중이에요</p>}
    </section>
  );
}

function HeatScroll({ year, children }: { year: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, [year]);
  return <div className="m-an-heat" ref={box}>{children}</div>;
}

/** 근태 — 칩(근무 · 연차 · 반차 · 병가)은 근태 «종류», 아래 줄은 «일했나» (v3.1.222 · 3.1.242). 평일 미근무만 강조 */
function LeaveCard({ s }: { s: ReturnType<typeof leaveSummary> }) {
  const n = s.miss.wd + s.miss.we;
  return (
    <section className="m-card m-an-c">
      <h4>근태</h4>
      <div className="m-lv">
        {LEAVES.filter(([v]) => s.chips[v]).map(([v, label, c]) => (
          <span key={v} className="m-lv-c" style={{ '--lv': c || '#4a90e2' } as React.CSSProperties}><b>{s.chips[v]}</b>{label}</span>
        ))}
      </div>
      <p className="m-an-sub">근무 <b>{s.worked}일</b>
        {s.leaveDays > 0 && <> · 휴가 <b>{s.leaveDays % 1 ? s.leaveDays.toFixed(1) : s.leaveDays}일</b></>}
        {n > 0 && <> · 미근무 <b>{n}일</b> (평일 <em className="m-lv-wd">{s.miss.wd}</em> · 주말 {s.miss.we})</>}</p>
    </section>
  );
}

/** 목표까지 (주간 · v3.1.71) — 주 목표 = 평일 목표 합 · 하루 몫은 오늘 한 것을 더해 남은 날로 (v3.1.146) */
function GoalCard({ g }: { g: ReturnType<typeof weekGoal> }) {
  const sub = g.gap <= 0 ? <>주 목표를 <b>{fmtDur(-g.gap)}</b> 넘겼어요</>
    : g.left > 0 ? <>남은 {g.left}일{g.halfN ? `(반차 ${g.halfN})` : ''} · 하루 <b>{fmtDur(Math.round(g.halfN === g.left ? g.per / 2 : g.per))}</b>{g.left > 1 ? '씩' : ''}
      {g.rest7 > g.left && <> · 주말까지면 {fmtDur(Math.round(g.per7))}{g.rest7 > 1 ? '씩' : ''}</>}</>
      : <>주 목표에 <b>{fmtDur(g.gap)}</b> 못 미쳤어요</>;
  return (
    <section className="m-card m-an-c">
      <h4>목표까지 <em>— 주 {fmtDur(g.goal)}</em></h4>
      <div className="m-an-pct"><b>{g.pct}<small>%</small></b><span>{sub}</span></div>
      <div className="m-an-track"><i style={{ width: `${Math.min(100, g.pct)}%` }} /></div>
    </section>
  );
}

/** 카테고리별 (v3.1.249) — 근무(시간 기록 · 미분류) + 휴게(빗금) · 탭 [전체 · 시간 기록 · 휴게] · 미분류는 회색 맨 뒤 */
function CatCard({ list }: { list: CatRow[] }) {
  const [tab, setTab] = useState<'all' | 'slot' | 'rest'>('all');
  if (!list.length) return null;
  const vis = list.map((c) => ({ ...c, w: tab === 'rest' ? 0 : c.work, r: tab === 'slot' ? 0 : c.rest })).filter((c) => c.w + c.r > 0.5);
  const mx = Math.max(1, ...vis.map((c) => c.w + c.r));
  return (
    <section className="m-card m-an-c">
      <div className="m-lb-h"><h4>카테고리별</h4>
        <div className="m-seg sm" role="tablist">{([['all', '전체'], ['slot', '시간 기록'], ['rest', '휴게']] as const).map(([v, t]) => (
          <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>{t}</button>))}</div>
      </div>
      <ul className="m-an-cats">
        {vis.map((c) => {
          const col = c.none ? '#9b9b9b' : catVar(c.color);
          return (
            <li key={c.color || 'none'}>
              <i style={{ background: col }} />
              <span>{c.none ? '미분류' : c.name || (c.known ? '이름 없는 색' : '미지정')}</span>
              <em>{tab === 'all' && c.w > 0.5 && c.r > 0.5 ? `휴게 ${fmtDur(c.r)}` : tab === 'all' && c.r > 0.5 ? '휴게' : ''}</em><b>{fmtDur(c.w + c.r)}</b>
              <u className="m-act-u" style={{ width: `${((c.w + c.r) / mx) * 100}%` }}>
                {c.w > 0 && <s style={{ flex: c.w, background: col }} />}{c.r > 0 && <s className="r" style={{ flex: c.r, background: col }} />}</u>
            </li>
          );
        })}
        {!vis.length && <li className="m-an-sub">이 기간에는 없어요</li>}
      </ul>
    </section>
  );
}
