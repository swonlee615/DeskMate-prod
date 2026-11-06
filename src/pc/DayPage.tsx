/**
 * 일간 상세 (v3 renderDayPage · gridHtml · slotListHtml) — 근태 부분
 *
 * ★ 마크업 · 클래스 · id 는 v3 와 같다. 스타일은 v3 styles.css.
 * ★ 고치는 일은 전부 `ws.editDay(date, 순수함수)` 로 한다 — 함수는 src/domain/attendance/edit.ts (v3 이식)
 *   Today · Memo 는 NoteEditor.tsx.
 * ★ 시간 기록 · 근무 밖 휴게는 `ws.saveSpan` 하나로 (종류 바꾸기 · 겹침 · 나누기 규칙은 거기에)
 * 아직 안 옮긴 것: 카테고리 이름(설정 화면) · 할 일에서 고르기
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import type { Day, Leave } from '../domain/attendance/types';
import { baseGoalMin, dayGoalMin, dayParts, dayStartMs, effKind, openBreak, spanEnd, stateOf } from '../domain/attendance/rules';
import { deviceKind } from '../data/device';
import {
  addSessionAt, canAddSession, dropSession, mergeSession, sessionRows, sessionSlot,
  sessionWhy, setSessionTime,
} from '../domain/attendance/edit';
import { addDays, dateOf, DOW, dayLabel, fmtDur, goalTxt, hhmm, keyOf, leaveOf, LEAVES, normTime, weekStart } from '../ui/v3fmt';
import { PendBanner } from './PendBanner';
import { TimeIn } from './TimeIn';
import { NoteEditor } from './NoteEditor';
import { DDayLines, type OpenDDay } from './DDay';
import { HabitStrip } from './Habits';
import { catChoices, catKey, catName, labelPicks, type Cat, type LabelPick } from '../domain/attendance/cats';
import { appsIn, appTerms, cellApps, mergeAppDocs, type AppCells, type AppDoc } from '../domain/appUse';
import { appBucket, type WorkAppsCfg } from '../domain/workApps';
import { breakConflicts, catVar, logsOf, nextColor, slotOutside, type Log, type SpanRef } from '../domain/attendance/logs';

const GSTEP = 5;        // 격자 한 칸 = 5분
const GCOLS = 12;       // 한 줄 = 1시간
const MEMO_CHIPS = ['점심', '저녁', '병원', '회의 이동', '산책', '통화'];
/** v3 REST_GRADE — 휴게 ÷ (근무 + 휴게) */
const REST_GRADE = [
  { max: 8, cls: 'warn', label: '주의', tip: '너무 적어요. 쉬지 않고 붙어 있는 상태예요' },
  { max: 18, cls: 'good', label: '우수', tip: '이상적인 비율' },
  { max: 28, cls: 'ok', label: '양호', tip: '조금 넉넉하지만 무난해요' },
  { max: 40, cls: 'warn', label: '주의', tip: '자리를 비운 시간이 많아요' },
  { max: Infinity, cls: 'bad', label: '위험', tip: '기록 누락일 수도 있어요' },
];
const ordEn = (n: number) => {
  const r = n % 100;
  return `${n}${r >= 11 && r <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th'}`;
};

const msAt = (date: string, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return dayStartMs(date) + (h * 60 + m) * 60000;
};

interface Props {
  ws: Workspace;
  date: string;
  full: boolean;
  onClose: () => void;
  onFull: () => void;
  onGo: (date: string) => void;
  /** 열 때 차수 칸을 펼치고 마지막 퇴근 칸에 커서를 둘지 (자정 배너 「시각 직접 입력」) */
  focusOff?: boolean;
  /** D-Day 창 열기 — 창은 이 화면 밖에 산다 */
  onDD: OpenDDay;
}

export function DayPage({ ws, date, full, onClose, onFull, onGo, focusOff, onDD }: Props) {
  const d = ws.dayOf(date);
  const { now, today } = ws;
  const isToday = date === today;
  const dt = dateOf(date);
  const [open, setOpen] = useState(!!focusOff);
  const [sesDlg, setSesDlg] = useState<number | null>(null);
  const [addDlg, setAddDlg] = useState(false);
  const [brkDlg, setBrkDlg] = useState<OpenSpan | null>(null);
  // 앱 사용 기록 (v3 day.apps) — 격자 바탕 · 초안 줄 · 기록 줄의 앱 칩이 같이 읽는다
  const [appDocs, setAppDocs] = useState<AppDoc[]>([]);
  const apps = useMemo(() => mergeAppDocs(appDocs), [appDocs]);
  useEffect(() => { setAppDocs([]); return ws.watchApps(date, setAppDocs); }, [ws.watchApps, date]);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(!!focusOff); }, [date, focusOff]);
  useEffect(() => {
    if (!focusOff) return;
    const id = setTimeout(() => {
      const els = pageRef.current?.querySelectorAll<HTMLInputElement>('[data-ses-f="off"]');
      const el = els?.[els.length - 1];
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); el.select(); }
    }, 260);
    return () => clearTimeout(id);
  }, [focusOff, date]);
  // Esc — 상자가 떠 있으면 상자부터 닫는다
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sesDlg != null || addDlg || brkDlg != null) { setSesDlg(null); setAddDlg(false); setBrkDlg(null); return; }
      onClose();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [sesDlg, addDlg, brkDlg, onClose]);

  const rows = sessionRows(d);
  const parts = dayParts(d, now);
  const work = parts.workMs / 60000, rest = parts.breakMs / 60000;
  const lastRow = rows[rows.length - 1];
  const rangeLive = !!(lastRow && lastRow.off == null && rows.length > 1);
  const rangeFrom = rangeLive ? lastRow.on : d.onAt;
  const restN = d.breaks.filter((b) => effKind(d, b, now) !== 'off').length;
  const working = d.onAt != null && d.offAt == null && !d.pending;
  const isFuture = date > today;

  const setSes = (i: number, which: 'on' | 'off', raw: string, input: HTMLInputElement) => {
    const hm = normTime(raw);
    const prev = input.dataset.last ?? '';
    if (hm === prev || (!hm && !raw.trim())) { input.value = prev; return; }
    if (!hm) { ws.say('시각을 HH:MM 으로 적어 주세요'); input.value = prev; return; }
    let why = '';
    const ok = ws.editDay(date, (day) => {
      const r = setSessionTime(day, i, which, msAt(date, hm));
      if (!r.ok) { why = sessionWhy(r, hhmm); return null; }
      return r.day;
    }, `${i + 1}차 ${which === 'on' ? '출근' : '퇴근'}을 ${hm}로 고쳤어요`);
    if (!ok) { ws.say(why || '시간을 확인해 주세요'); input.value = prev; }
  };

  return (
    <div className="view on" id="view-day">
      <div className="peek-bar">
        <button className="icon-btn" id="peekClose" title="닫기 (Esc)" onClick={onClose}>
          <svg viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg></button>
        <button className="icon-btn" id="peekFull" title={full ? '옆에 띄워 보기' : '전체 페이지로 열기'} onClick={onFull}>
          <svg viewBox="0 0 20 20"><path d="M11.5 3.5h5v5M16.5 3.5l-6 6M8.5 16.5h-5v-5M3.5 16.5l6-6" /></svg></button>
      </div>
      <div className="day-wrap">
        <div className="dash" id="dayPage" ref={pageRef}>
          <div className="day-head">
            <div className="dh-l"><h1>{isToday ? '오늘' : dayLabel(dt, new Date(now))}</h1>
              <div className="sub">{dt.getFullYear()}년 {dt.getMonth() + 1}월 {dt.getDate()}일 {DOW[dt.getDay()]}요일</div></div>
            <WeekStrip ws={ws} date={date} onGo={onGo} />
          </div>

          {d.pending && <PendBanner ws={ws} date={date} onEdit={() => setOpen(true)} />}

          <div className="props">
            {d.carriedFrom && (
              <div className="autonote">전날({d.carriedFrom}) 근무가 자정을 넘겨 00:00 출근으로 이어졌어요.</div>
            )}
            {(d.autoClosed === 'away' || d.autoClosed === 'break' || d.autoClosed === 'midnight') && (
              <div className="autonote">{d.autoClosed === 'away'
                ? `${d.offAt != null ? hhmm(d.offAt) : '그 시각'}부터 자리를 비우셔서, 그때 퇴근한 것으로 기록했어요.`
                : d.autoClosed === 'break'
                  ? `휴식 중 자정을 넘겨서, 휴식을 누른 ${d.offAt != null ? hhmm(d.offAt) : '시각'}을 퇴근으로 기록했어요.`
                  : '퇴근을 누르지 않고 자정을 넘겨서 23:59로 자동 마감했어요.'} 시각이 다르면 <b>상세</b>에서 고쳐주세요.
                <button className="note-x" id="autoNoteX" title="확인했어요. 다시 띄우지 않아요"
                  onClick={() => ws.editDay(date, (day) => ({ ...day, autoClosed: 'confirmed' }), '확인했어요')}>✕</button></div>
            )}

            <div className={`dh-bar${open ? ' open' : ''}`} id="dhBar" role="button" tabIndex={0} aria-expanded={open}
              title={open ? '차수 접기' : '눌러서 차수별 시각 펼치기'}
              onClick={(e) => { if ((e.target as HTMLElement).closest('button, select')) return; setOpen((v) => !v); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}>
              {isToday
                ? <div className="dh-seg">
                    {/* v3.1.265 — On · Off 는 한 칸. 출근 전 On(.go) · 근무 중 Off · 퇴근 뒤 재개(.resume) */}
                    <button className={`mini-btn ${d.offAt != null ? 'resume' : 'go'}`} id="pOn" hidden={working} onClick={ws.onOn}>{d.offAt != null ? '재개' : 'On'}</button>
                    <button className="mini-btn" id="pOff" hidden={!working} onClick={ws.onOff}>Off</button>
                    <button className={`mini-btn${openBreak(d) ? ' rest' : ''}`} id="pRest" disabled={!working} onClick={ws.onRest}>{openBreak(d) ? '휴식 종료' : '휴식'}</button>
                  </div>
                : <LeaveSel date={date} v={d.leave} empty={isFuture ? '예정' : '지난 날짜'} onLeave={ws.onLeave} />}
              {d.onAt != null
                ? <span className="chip dh-range" title={rows.map((r, i) => `${i + 1}차 ${r.on != null ? hhmm(r.on) : ''} ~ ${r.off != null ? hhmm(r.off) : '근무 중'}`).join('\n')}>
                    🕐 {rangeFrom != null ? hhmm(rangeFrom) : ''} <em className="ar">→</em> {d.offAt != null ? hhmm(d.offAt) : d.pending ? hhmm(d.pending.guessOff) : '근무 중'}
                    {rows.length > 1 && <i className="nth">{ordEn(rows.length)}</i>}</span>
                : <span className="chip dh-range empty">아직 출근 전</span>}
              <span className="dh-sum">
                {d.onAt != null && d.offAt != null
                  ? <b title={`${(work / 60).toFixed(2)}시간`}>{fmtDur(work)}</b>
                  : <b className="empty" title={d.onAt != null ? `아직 근무 중이라 합계를 내지 않아요. 퇴근하면 채워져요 (지금까지 ${fmtDur(work)})` : '출근 기록이 없어요'}>–</b>}
                <i className="sl">/</i>
                <span className="rest" title={`휴게 ${restN}건${openBreak(d) ? ' · 진행 중' : ''}`}>휴게 {fmtDur(rest)}</span>
                <RestGrade d={d} work={work} rest={rest} />
                <GoalChip ws={ws} d={d} work={work} />
              </span>
              <span className="dh-sp" />
              <i className="dh-caret" aria-hidden="true">▾</i>
            </div>

            <div className="dh-detail" hidden={!open}>
              {rows.map((r, i) => (
                <div className="ss-row" key={i}>
                  {d.onAt != null
                    ? <button className="ss-del" data-ses-del={i} title={`${i + 1}차 기록을 삭제해요`} onClick={() => {
                        if (i === 0) ws.editDay(date, (day) => dropSession(day, 0), '1차 기록을 삭제했어요');
                        else setSesDlg(i);
                      }}>−</button>
                    : <span className="ss-del ghost" aria-hidden="true" />}
                  <span className="k">{i + 1}차</span>
                  <TimeIn value={r.on != null ? hhmm(r.on) : ''} attrs={{ 'data-ses-f': 'on', 'data-ses-i': i }}
                    onCommit={(v, el) => setSes(i, 'on', v, el)} />
                  <em>–</em>
                  <TimeIn value={r.off != null ? hhmm(r.off) : ''} attrs={{ 'data-ses-f': 'off', 'data-ses-i': i }}
                    onCommit={(v, el) => setSes(i, 'off', v, el)} />
                  {i === rows.length - 1 && isToday && d.onAt != null && (
                    d.offAt == null
                      ? <span className="live-chip on" title="지금 근무 중이에요">근무 중</span>
                      : <button type="button" className="live-chip" title="퇴근을 취소하고 아직 근무 중으로 되돌려요" onClick={ws.onOn}>↩ 근무 중으로</button>
                  )}
                  <span className="ss-d">{r.off != null && r.on != null ? fmtDur((r.off - r.on) / 60000) : ''}</span>
                </div>
              ))}
              <button className="ss-row ss-add" id="sesAdd" disabled={!canAddSession(d, now)} onClick={() => setAddDlg(true)}
                title={canAddSession(d, now) ? (d.offAt == null ? '지금까지를 한 차수로 닫고 새 차수를 시작해요' : '차수를 하나 더 만들어요') : '남은 시간이 없어요'}>
                <span className="ss-del" aria-hidden="true">＋</span>
                <span className="k ss-addk">차수 추가</span>
              </button>
            </div>
            <Conflicts ws={ws} date={date} d={d} />
          </div>

          <div className="day-cols">
            <div className="day-left">
              <HabitStrip ws={ws} date={date} />
              <NoteEditor ws={ws} date={date} area="today" title="Today" ph="할 일을 입력하세요" onDay={onGo}
                icon={<svg className="nh-ic" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m2.4 10.3 2.1 2.1 3.8-4.5" /><path d="M10.4 8h7.2" /><path d="M10.4 12.6h7.2" /></svg>} />
              <NoteEditor ws={ws} date={date} area="memo" title="Memo" ph="메모를 입력하세요" onDay={onGo}
                icon={<svg className="nh-ic" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2.6 5.6h14.8" /><path d="M2.6 10h14.8" /><path d="M2.6 14.4h9.4" /></svg>} />
            </div>
            <div className="day-right">
              <div className="tg-wrap">
                <Grid d={d} logs={ws.logs} now={now} isToday={isToday} onOpen={setBrkDlg} apps={apps} />
                <div className="tg-list" id="tgList">
                  <SlotList d={d} logs={ws.logs} cats={ws.cats} now={now} rows={rows} apps={apps} wa={ws.settings} onOpen={setBrkDlg} onGoto={() => setOpen(true)} />
                </div>
              </div>
              <div className="tg-foot"><div className="tg-legend">
                <span className="lg"><i className="work-line" />근무</span><span className="lg"><i className="brk-line" />휴게</span>
                {d.onAt != null && <span className="lg"><i className="mk-line on" />출근</span>}
                {(d.offAt != null || d.breaks.some((b) => effKind(d, b, now) === 'off')) && <span className="lg"><i className="mk-line off" />퇴근</span>}
                <span className="lg-sp2" />
                {isToday && <AppSync ws={ws} d={d} cells={Object.keys(apps)} />}
              </div></div>
              <DDayLines ws={ws} date={date} onOpen={onDD} />
            </div>
          </div>
        </div>
      </div>

      {sesDlg != null && <SesDialog ws={ws} date={date} d={d} i={sesDlg} onClose={() => setSesDlg(null)} />}
      {addDlg && <AddDialog ws={ws} date={date} d={d} onClose={() => setAddDlg(false)} />}
      {brkDlg && <SpanDialog ws={ws} date={date} d={d} o={brkDlg} appDocs={appDocs} onClose={() => setBrkDlg(null)} />}
    </div>
  );
}

// ───────────────────────────────────────────── 조각들

/**
 * 오늘 범례 오른쪽 끝 (v3 arSync · appUseState) — PC 앱에서만. 모으는 중이면 «↻ 싱크», 아니면 왜 안 모이는지 한 줄
 * ★ 웹은 표가 저절로 다시 그려진다. 싱크는 지금 10분 칸(아직 메모리에만 있는 것)을 바로 표에 올린다
 */
function AppSync({ ws, d, cells }: { ws: Workspace; d: Day; cells: string[] }) {
  if (deviceKind() !== 'desktop') return null;
  const s = ws.settings;
  const why = !s.away ? <>설정 › 자리비움에서 <b>자리비움 자동 감지</b>가 꺼져 있어요. 앱 사용은 이 감지 위에 얹혀 있어요.</>
    : !s.workAppsOn ? <>설정 › 자리비움에서 <b>업무 앱 기준</b>이 꺼져 있어요. 이게 켜져 있어야 앱 이름을 읽어요.</> : null;
  if (why) return <div className="ar-warn">⚠️ {why}</div>;
  if (stateOf(d) !== 'work') return <div className="ar-note"><span className="dot" /><span>출근하면 앱 사용을 다시 모아요.</span></div>;
  return <button className="mini-btn tiny" id="arSync" title="지금 쓰는 앱을 바로 표에 반영해요" onClick={() => ws.syncApps(cells)}>↻ 싱크</button>;
}

function LeaveSel({ date, v, empty, onLeave }: { date: string; v: Leave; empty: string; onLeave: (d: string, l: Leave) => void }) {
  const cur = leaveOf(v);
  return (
    <span className={`lv-cell${v ? ' on' : ''}`} style={cur[2] ? { '--lv': cur[2] } as React.CSSProperties : undefined}>
      <span className="lv-chip2"><i className="lv-dot" /><b>{v ? cur[1] : empty}</b></span>
      <select className="lv-sel" data-leave={date} aria-label="근태" value={v} onChange={(e) => onLeave(date, e.target.value as Leave)}>
        {LEAVES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </select>
    </span>
  );
}

/** 그 날의 목표 (v3.2.5 · 시안 C) — 목표가 날짜별로 고정돼 «이 날 목표» 를 읽는 자리. 퇴근한 날만 차이를 붙인다 */
function GoalChip({ ws, d, work }: { ws: Workspace; d: Day; work: number }) {
  const g = dayGoalMin(ws.goal, d);
  const df = work - g;
  return <>
    <span className="dh-goal" title={d.leave && g < baseGoalMin(ws.goal, d.date) ? `${d.leave}만큼 줄어든 목표` : undefined}>{goalTxt(g)}</span>
    {d.onAt != null && d.offAt != null && work > 0 && <span className={`dh-gap${df >= 0 ? ' hit' : ''}`}>
      {g > 0 ? (df >= 0 ? `달성 +${fmtDur(df)}` : `${fmtDur(-df)} 부족`) : `초과 +${fmtDur(work)}`}</span>}
  </>;
}

function RestGrade({ d, work, rest }: { d: Day; work: number; rest: number }) {
  if (d.onAt == null || !(work + rest > 0)) return null;
  const pct = Math.round((rest / (work + rest)) * 100);
  const g = work + rest >= 60 ? REST_GRADE.find((x) => pct < x.max) ?? null : null;
  return (
    <span className={`dh-rg${g ? ` g-${g.cls}` : ''}`} title={`휴게 비율: 휴게 ÷ (근무 + 휴게)\n${g ? `${g.label} · ${g.tip}` : '1시간이 안 돼 등급은 보류'}`}>
      {pct}%{g ? ` ${g.label}` : ''}
    </span>
  );
}

function WeekStrip({ ws, date, onGo }: { ws: Workspace; date: string; onGo: (k: string) => void }) {
  const mon = weekStart(dateOf(date));
  const scale = ws.goal.hours * 60;
  return (
    <div className="week-strip" title="이번 주. 날짜를 누르면 그 날로 가요">
      {Array.from({ length: 7 }, (_, i) => {
        const dt = addDays(mon, i);
        const k = keyOf(dt);
        const d = ws.days[k];
        const has = !!d && (d.onAt != null || !!d.leave);
        const min = has && d.onAt != null ? dayParts(d, ws.now).workMs / 60000 : 0;
        const goal = dayGoalMin(ws.goal, d ?? { leave: '' }, k);
        const pct = Math.max(0, Math.min(100, Math.round((min / scale) * 100)));
        const cls = ['ws-d', k === date ? 'on' : '', k === ws.today ? 'today' : '', has ? '' : 'none',
          dt.getDay() === 0 || dt.getDay() === 6 ? 'wk' : ''].filter(Boolean).join(' ');
        const tip = has
          ? [`${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})`,
            `출근 ${d.onAt != null ? hhmm(d.onAt) : '–'} · 퇴근 ${d.offAt != null ? hhmm(d.offAt) : '–'}`,
            `근무 ${d.onAt != null ? fmtDur(min) : '–'}`, d.leave ? `· ${d.leave}` : ''].filter(Boolean).join('\n')
          : `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})\n기록 없음. 누르면 열려요`;
        return (
          <button key={k} className={cls} data-wsd={k} title={tip} onClick={() => onGo(k)}>
            <em>{DOW[dt.getDay()]}</em><b>{dt.getDate()}</b>
            <i className="ws-bar">{min > 0 && <b className={min >= goal ? 'over' : ''} style={{ height: `${Math.max(12, pct)}%` }} />}</i>
          </button>
        );
      })}
    </div>
  );
}

/** 상자를 여는 값 — 이미 있는 것(ref)이거나 새로 끈 구간 */
export interface OpenSpan { ref: SpanRef | null; s: number; e: number; kind: 'slot' | 'break'; /** 앱 사용 초안 줄에서 열었다 */ draft?: boolean }
const gFloor = (m: number) => Math.floor(Math.max(0, m) / GSTEP) * GSTEP;

/** 휴게 상자로 열기 — 진행 중이라 길이가 0 이면 최소 한 칸 (v3 openSlot) */
export function openBrk(d: Day, idx: number, now: number): OpenSpan {
  const b = d.breaks[idx], base = dayStartMs(d.date);
  const s = Math.max(0, Math.min(1439, Math.round((b.s - base) / 60000)));
  const e = Math.min(1440, Math.round((spanEnd(d, b, now) - base) / 60000));
  return { ref: { type: 'brk', idx }, s, e: e <= s ? Math.min(1440, s + 10) : e, kind: 'break' };
}
const openLog = (l: Log): OpenSpan => ({ ref: { type: l.kind, id: l.id }, s: l.s, e: l.e, kind: l.kind === 'slot' ? 'slot' : 'break' });

/** 시간표 (v3 gridHtml · bindGrid) — 근태 · 시간 기록 · 근무 밖 휴게를 칠하고, 끌어서 새 구간을 연다 */
export function Grid({ d, logs, now, isToday, onOpen, apps = {} }: {
  d: Day; logs: Log[]; now: number; isToday: boolean; onOpen: (o: OpenSpan) => void; apps?: AppCells;
}) {
  // 앱 사용 바탕 (v3 appCells) — 아직 기록이 아니라는 게 보이도록 아주 옅게, 아무 뜻도 안 붙은 칸에만
  const slots = logsOf(logs, d.date, 'slot');
  const rests = logsOf(logs, d.date, 'rest');
  const cells = useMemo(() => {
    const base = dayStartMs(d.date);
    const minOf = (ms: number) => Math.round((ms - base) / 60000);
    const brk: Record<number, { off: boolean; idx?: number; rest?: string; t: string; note?: string; color?: string | null }> = {};
    d.breaks.forEach((b, idx) => {
      const off = effKind(d, b, now) === 'off';
      const s = minOf(b.s), e = minOf(spanEnd(d, b, now));
      for (let g = gFloor(s); g < Math.min(1440, e); g += GSTEP) {
        if (!brk[g]) brk[g] = { off, idx, note: b.note, color: off ? null : b.color, t: `${off ? '비근무' : '휴게'} ${hhmm(b.s)} ~ ${b.e != null ? hhmm(spanEnd(d, b, now)) : '진행 중'}${b.note ? `\n${b.note}` : ''}` };
      }
    });
    // «끌어 놓은 자리가 근태 휴게인가» 는 근태 휴게만 본다 — 근무 밖 휴게를 넣기 전에 센다 (v3 brkCoverOf)
    const brkOnly = { ...brk };
    // 근무 밖 휴게 — 근태 휴게 칸은 그쪽이 이기고, 비근무 칸은 근무 밖 휴게가 이긴다 (v3.1.241)
    for (const r of rests) {
      for (let g = gFloor(r.s); g < r.e; g += GSTEP) {
        if (!brk[g] || brk[g].off) brk[g] = { off: false, rest: r.id, note: r.text, color: r.color, t: `휴게 ${fmtM(r.s)} ~ ${fmtM(r.e)} · 근무시간에는 영향 없음${r.text ? `\n${r.text}` : ''}` };
      }
    }
    const slot: Record<number, Log> = {};
    for (const x of slots) for (let g = gFloor(x.s); g < x.e; g += GSTEP) slot[g] = x;
    const marks: Record<number, { cls: string; f: number; tip: string }[]> = {};
    const addMark = (ms: number | null, cls: string, label: string) => {
      if (ms == null) return;
      const m = minOf(ms);
      if (m < 0 || m > 1440) return;
      const gm = Math.min(1439, m), g = gFloor(gm);
      (marks[g] ??= []).push({ cls, f: (gm - g) / GSTEP, tip: `${label} ${hhmm(ms)}` });
    };
    addMark(d.onAt, 'on', '출근');
    addMark(d.offAt, 'off', '퇴근');
    for (const b of d.breaks) {
      if (effKind(d, b, now) !== 'off') continue;
      addMark(b.s, 'off', '퇴근');
      if (b.e != null) addMark(b.e, 'on', '업무 재개');
    }
    const work: Record<number, true> = {};
    for (const r of sessionRows(d)) {
      if (r.on == null) continue;
      const e = r.off ?? (d.pending ? d.pending.guessOff : now);
      const sm = Math.max(0, Math.floor((r.on - base) / 60000));
      const em = Math.min(1439, Math.ceil((e - base) / 60000) - 1);
      for (let m = gFloor(sm); m <= em; m += GSTEP) work[m] = true;
    }
    // 겹친 칸 — 판정은 breakConflicts 한 곳 (안내 · 정리와 같은 값)
    const clash: Record<number, number> = {};
    breakConflicts(d).forEach((c, ci) => { for (const [a, z] of c.parts) for (let g = gFloor(a); g < z; g += GSTEP) clash[g] = ci; });
    return { brk, brkOnly, slot, marks, work, clash };
  }, [d, now, slots, rests]); // eslint-disable-line react-hooks/exhaustive-deps

  // 끌기 — 누른 칸에서 뗀 칸까지 (v3 S.drag)
  const [drag, setDrag] = useState<{ a: number; b: number; shift: boolean } | null>(null);
  const gAt = (e: React.MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    return el?.classList.contains('tg-c') ? Number(el.dataset.g) : null;
  };
  const finish = () => {
    if (!drag) return;
    setDrag(null);
    const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b) + GSTEP;
    // 한 칸만 누르면 그 휴게를 연다 (v3.1.247). 끌거나 ⇧ 면 새로 긋는다
    if (drag.a === drag.b && !drag.shift) {
      const c = cells.brk[drag.a];
      const r = c?.rest ? rests.find((x) => x.id === c.rest) : null;
      if (r) { onOpen(openLog(r)); return; }
      if (c && !c.off && c.idx != null) { onOpen(openBrk(d, c.idx, now)); return; }
    }
    let n = 0;
    for (let g = a; g < b; g += GSTEP) if (cells.brkOnly[g] && !cells.brkOnly[g].off) n++;
    onOpen({ ref: null, s: a, e: b, kind: n * 2 >= (b - a) / GSTEP ? 'break' : 'slot' });
  };
  const lo = drag ? Math.min(drag.a, drag.b) : -1, hi = drag ? Math.max(drag.a, drag.b) : -2;

  const nowG = isToday ? (() => { const t = new Date(now); return t.getHours() * 60 + t.getMinutes(); })() : -1;
  return (
    <div className="tg-col"><div className="tg" id="tg"
      onMouseDown={(e) => {
        const g = gAt(e);
        if (g == null) return;
        e.preventDefault();
        const sl = cells.slot[g];
        if (sl && !e.shiftKey) { onOpen(openLog(sl)); return; }
        setDrag({ a: g, b: g, shift: e.shiftKey });
      }}
      onMouseMove={(e) => { if (!drag) return; const g = gAt(e); if (g != null && g !== drag.b) setDrag({ ...drag, b: g }); }}
      onMouseUp={finish} onMouseLeave={finish}>
      <div className="tg-h"><i />{Array.from({ length: GCOLS }, (_, i) => {
        const end = (i + 1) * GSTEP;
        return <i key={i} className={i % 2 ? 'fine' : ''}>{end % 10 ? '' : end}</i>;
      })}</div>
      {Array.from({ length: 24 }, (_, r) => (
        <div className="tg-r" key={r}><i className="h">{String(r).padStart(2, '0')}</i>
          {Array.from({ length: GCOLS }, (_, c) => {
            const g = (r * GCOLS + c) * GSTEP;
            const bk = cells.brk[g];
            const sl = cells.slot[g];
            const mk = cells.marks[g] ?? [];
            const isNow = g <= nowG && nowG < g + GSTEP;
            // 관찰은 10분 칸, 격자는 5분 — 한 관찰이 두 칸에 깔린다 (v3.1.92)
            const au = !sl && !bk ? apps[Math.floor(g / 10) * 10] : undefined;
            const cls = ['tg-c', c % 2 ? 'fine' : '', isNow ? 'now' : '', bk ? (bk.off ? 'nonwork' : bk.note ? 'brk memo' : 'brk') : '',
              au ? 'appuse' : '', sl ? 'slot' : '', !bk && !sl && cells.work[g] ? 'work' : '', cells.clash[g] != null ? 'clash' : '', g >= lo && g <= hi ? 'sel' : ''].filter(Boolean).join(' ');
            const tip = [sl ? `${fmtM(sl.s)} ~ ${fmtM(sl.e)} · ${fmtDur(sl.e - sl.s)}\n${sl.text}` : '', bk?.t, ...mk.map((x) => x.tip), au ? `💻 ${cellApps(au).join(' · ')}` : ''].filter(Boolean).join('\n');
            const st: Record<string, string> = {};
            if (sl) st['--c'] = catVar(sl.color ?? nextColor(0));
            else if (bk && !bk.off && bk.color) st['--hc'] = bk.color;
            return (
              <i key={c} className={cls} data-g={g} title={tip || undefined} style={st as React.CSSProperties}
                data-slot={sl?.id} data-hc={!sl && bk && !bk.off && bk.color ? '' : undefined} data-cl={cells.clash[g]}>
                {mk.map((x, j) => <u key={j} className={`tg-mk ${x.cls}`} style={{ left: `${Math.round(x.f * 100)}%` }} />)}
                {cells.clash[g] != null && <u className="tg-cl" />}
              </i>
            );
          })}
        </div>
      ))}
    </div></div>
  );
}

/**
 * 겹침 안내 (v3 conflictHtml) — 휴게가 시간 기록 안에 겹쳐 근무시간이 깎이고 있을 때만.
 * 칩 = 겹친 쪽(내가 그은 기록)의 시각. 누르면 격자의 그 칸이 깜빡인다 (저장하지 않는다)
 */
function Conflicts({ ws, date, d }: { ws: Workspace; date: string; d: Day }) {
  const conf = breakConflicts(d);
  const [on, setOn] = useState<number | null>(null);
  if (!conf.length) return null;
  const min = conf.reduce((a, c) => a + c.min, 0);
  const hit = (ci: number) => {
    setOn(ci);
    const cells = [...document.querySelectorAll<HTMLElement>(`#dayPage .tg-c[data-cl="${ci}"]`)];
    document.querySelectorAll('#dayPage .tg-c.hot').forEach((x) => x.classList.remove('hot'));
    cells.forEach((x) => x.classList.add('hot'));
    cells[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => cells.forEach((x) => x.classList.remove('hot')), 2400);
  };
  return (
    <div className="conflict"><div className="cf-row">
      <b>휴게 {conf.length}건이 시간 기록 안에 겹쳐 있어요 ({fmtDur(min)}).</b>
      {' '}그만큼 근무시간에서 빠지고 있어요. 그 시간에 일한 게 맞다면 정리해 주세요.
      <button className="mini-btn" id="cfFix" onClick={() => ws.fixConflicts(date)}>겹친 휴게 정리</button>
      <div className="cf-hits">{conf.map((c, ci) => (
        <button key={ci} className={`cf-hit${on === ci ? ' on' : ''}`} data-cfhit={ci} onClick={() => hit(ci)}
          title={`격자에서 이 자리를 짚어 줍니다\n${c.kind === 'off' ? '비근무' : '휴게'} ${fmtM(c.gs)} ~ ${fmtM(c.ge % 1440)} 안에 겹쳤어요`}>
          {fmtM(c.parts[0][0])}~{fmtM(c.parts[c.parts.length - 1][1] % 1440)}<u>{fmtDur(c.min)}</u><i>{c.kind === 'off' ? '비근무' : '휴게'}</i>
        </button>
      ))}</div>
    </div></div>
  );
}

/** 분 → HH:MM (24:00 까지) */
const fmtM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 오른쪽 아래 목록 — 시간 기록 · 휴게 · 근무 밖 휴게 · 출근 · 퇴근 (v3 slotListHtml) */
export function SlotList({ d, logs, cats, now, rows, apps = {}, wa, onOpen, onGoto }: {
  cats: Cat[]; apps?: AppCells; wa?: WorkAppsCfg;
  d: Day; logs: Log[]; now: number; rows: ReturnType<typeof sessionRows>; onOpen: (o: OpenSpan) => void; onGoto: () => void;
}) {
  type It = { at: number; el: React.ReactNode };
  const items: It[] = [];
  const base = dayStartMs(d.date);
  const minOf = (ms: number) => Math.max(0, Math.min(1440, Math.round((ms - base) / 60000)));
  // 기록 줄 밑 앱 칩 (v3 slotApps · brkApps) — 초안이 기록이 되어도 그때 쓴 앱은 사라지지 않는다
  const appChips = (list: string[], cls: string) => list.length > 0 && (
    <div className={cls}>{list.slice(0, 4).map((x) => <span key={x}>{x}</span>)}{list.length > 4 && <em>외 {list.length - 4}</em>}</div>);
  // 휴게 줄에는 딴짓 앱만 (v2.9.39 — 쉬는 줄에 업무 앱이 있으면 «쉬는 중인데 왜»)
  const awayOnly = (list: string[]) => (wa ? list.filter((x) => appBucket({ name: x }, wa) === 'away') : []);
  const restBar = (c: string | null | undefined) => (c ? <i className="tagged" style={{ '--hc': c } as React.CSSProperties} /> : <i style={{ background: 'rgba(236,178,46,.6)' }} />);
  rows.forEach((r, i) => {
    if (r.on != null) items.push({ at: r.on, el: (
      <div key={`on${i}`} className="tg-item mark-item on-item" data-ses-goto={i} data-ses-gof="on" title={`출근 ${hhmm(r.on)}\n눌러서 고칩니다`} onClick={onGoto}>
        <i /><span className="lb">출근</span><span className="bk-r"><span className="mark-t">{hhmm(r.on)}</span></span></div>) });
    const off = r.off ?? (d.pending ? d.pending.guessOff : null);
    if (off != null) {
      const next = rows[i + 1];
      items.push({ at: off + 0.5, el: (
        <div key={`off${i}`} className="tg-item mark-item off-mark" data-ses-goto={i} data-ses-gof="off"
          title={`퇴근 ${hhmm(off)}${next?.on != null ? `\n다음 출근까지 ${fmtDur((next.on - off) / 60000)}` : ''}\n눌러서 고칩니다`} onClick={onGoto}>
          <i /><span className="lb">퇴근</span><span className="bk-r"><span className="mark-t">{hhmm(off)}{d.pending && r.off == null ? ' ?' : ''}</span></span></div>) });
    }
  });
  const slotLogs = logsOf(logs, d.date, 'slot');
  for (const s of slotLogs) {
    const out = slotOutside(d, s.s), ap = appsIn(apps, s.s, s.e);
    items.push({ at: base + s.s * 60000 + 0.1, el: (
      <div key={s.id} className={`tg-item r2${ap.length ? ' has-apps' : ''}${out ? ' outside' : ''}`} data-slot={s.id} onClick={() => onOpen(openLog(s))}
        title={`${fmtM(s.s)} ~ ${fmtM(s.e)} · ${fmtDur(s.e - s.s)}${catName(cats, s.color) ? `\n[${catName(cats, s.color)}]` : ''}${s.text ? `\n${s.text}` : ''}${ap.length ? `\n💻 ${ap.join(' · ')}` : ''}${out ? '\n\n출퇴근 기록 밖에 적은 기록이에요. 근무시간에는 들어가요' : ''}`}>
        <i style={{ background: s.color ?? undefined }} />
        <span className="rg">{fmtM(s.s)} ~ {fmtM(s.e)}</span>
        <span className="du">{fmtDur(s.e - s.s)}</span>
        <div className="tg-mid">{catName(cats, s.color) && <span className="cat-tag" style={{ '--c': catVar(s.color ?? '') } as React.CSSProperties}>{catName(cats, s.color)}</span>}{s.text && <span className="lb">{s.text}</span>}</div>
        {appChips(ap, 'bk-apps sl-apps')}
      </div>) });
  }
  // 앱 사용 초안 (v3 appTerms) — 아직 기록이 아니라 점선 · 흐리게. 누르면 그 구간으로 시간 기록 만들기가 열린다
  const covered: [number, number][] = [...slotLogs.map((x): [number, number] => [x.s, x.e]),
    ...d.breaks.map((b): [number, number] => [minOf(b.s), minOf(spanEnd(d, b, now))])];
  const nowMin = keyOf(new Date(now)) === d.date ? minOf(now) : undefined;
  for (const t of appTerms(apps, { covered, cap: nowMin })) {
    items.push({ at: base + t.s * 60000 + 0.1, el: (
      <div key={`dr${t.s}`} className="tg-item r2 draft" data-draft={`${t.s}:${t.e}`} onClick={() => onOpen({ ref: null, s: t.s, e: t.e, kind: 'slot', draft: true })}
        title={`${fmtM(t.s)} ~ ${fmtM(t.e)} · ${fmtDur(t.e - t.s)}\n💻 ${t.apps.join(' · ')}\n\n눌러서 시간 기록으로 만들어요`}>
        <i className="dr-bar" />
        <span className="rg">{fmtM(t.s)} ~ {fmtM(t.e)}</span>
        <span className="du">{fmtDur(t.e - t.s)}</span>
        <div className="tg-mid"><span className="lb"><b>{t.apps[0]}</b>{t.apps.length > 1 && <em> · {t.apps.slice(1, 4).join(' · ')}{t.apps.length > 4 ? ` 외 ${t.apps.length - 4}` : ''}</em>}</span></div>
      </div>) });
  }
  d.breaks.forEach((b, idx) => {
    if (effKind(d, b, now) === 'off') return;
    const e = spanEnd(d, b, now);
    items.push({ at: b.s + 0.25, el: (
      <div key={`b${idx}`} className={`tg-item r2 brk-item${b.note ? ' has-note' : ''}${b.color ? ' tagged' : ''}`} data-brk={idx}
        style={b.color ? { '--hc': b.color } as React.CSSProperties : undefined}
        title={`휴게 ${hhmm(b.s)} ~ ${b.e != null ? hhmm(e) : '진행 중'}${b.note ? `\n${b.note}` : ''}\n${b.auto ? '자동 기록 · 자리비움' : '직접 만든 기록'}`}
        onClick={() => onOpen(openBrk(d, idx, now))}>
        {restBar(b.color ?? null)}
        <span className="rg">{hhmm(b.s)} ~ {b.e != null ? hhmm(e) : '지금'}</span>
        <span className="du">{b.e != null ? fmtDur((e - b.s) / 60000) : '진행 중'}</span>
        <div className="tg-mid">{b.color
          ? <span className="cat-tag" style={{ '--c': catKey(b.color) } as React.CSSProperties}>☕️ {catName(cats, b.color) || '휴게'}</span>
          : <span className="cat-tag kind-brk">☕️ 휴게</span>}{b.auto && !b.note && <span className="lb">자리비움</span>}{b.note && <span className="lb">{b.note}</span>}</div>
        {appChips(awayOnly(appsIn(apps, minOf(b.s), Math.max(minOf(b.s) + 1, minOf(e)))), 'bk-apps')}
      </div>) });
  });
  for (const r of logsOf(logs, d.date, 'rest')) {
    items.push({ at: base + r.s * 60000 + 0.25, el: (
      <div key={r.id} className={`tg-item r2 brk-item${r.text ? ' has-note' : ''}${r.color ? ' tagged' : ''}`} data-rest={r.id}
        style={r.color ? { '--hc': r.color } as React.CSSProperties : undefined} onClick={() => onOpen(openLog(r))}
        title={`휴게 ${fmtM(r.s)} ~ ${fmtM(r.e)}${r.text ? `\n${r.text}` : ''}\n근무 밖 휴게라 근무시간에는 영향이 없어요`}>
        {restBar(r.color)}
        <span className="rg">{fmtM(r.s)} ~ {fmtM(r.e)}</span>
        <span className="du">{fmtDur(r.e - r.s)}</span>
        <div className="tg-mid">{r.color
          ? <span className="cat-tag" style={{ '--c': catKey(r.color) } as React.CSSProperties}>☕️ {catName(cats, r.color) || '휴게'}</span>
          : <span className="cat-tag kind-brk">☕️ 휴게</span>}{r.text && <span className="lb">{r.text}</span>}</div>
      </div>) });
  }
  if (!items.length) return <p className="hint" style={{ padding: '10px 4px' }}>아직 기록이 없어요.</p>;
  return <>{items.sort((a, b) => a.at - b.at).map((x) => x.el)}</>;
}

// ───────────────────────────────────────────── 상자들 (v3 sesModal · sesAddModal · slotModal)

function Modal({ id, width, children, onClose }: { id: string; width: number; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg open" id={id} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: `min(${width}px,92vw)` }}>{children}</div>
    </div>
  );
}

/** 차수 「−」 — 합칠까 지울까. 결과 숫자를 먼저 보여 준다 (LOGIC §4 v3.1.10) */
function SesDialog({ ws, date, d, i, onClose }: { ws: Workspace; date: string; d: Day; i: number; onClose: () => void }) {
  const [pick, setPick] = useState<'merge' | 'drop' | null>(null);
  const rows = sessionRows(d);
  const r = rows[i], prev = rows[i - 1];
  const nowW = dayParts(d, ws.now).workMs / 60000;
  const m = mergeSession(d, i), dr = dropSession(d, i);
  const mw = m ? dayParts(m, ws.now).workMs / 60000 : null;
  const dw = dr ? dayParts(dr, ws.now).workMs / 60000 : null;
  const delta = (x: number | null) => {
    if (x == null) return '';
    const n = Math.round(x - nowW);
    return n === 0 ? '변화 없음' : `${n > 0 ? '+' : '−'}${fmtDur(Math.abs(n))}`;
  };
  if (!r) return null;
  return (
    <Modal id="sesModal" width={392} onClose={onClose}>
      <h3 id="sesTitle">{i + 1}차를 어떻게 할까요?</h3>
      <p className="ses-sub" id="sesSub">{r.on != null ? hhmm(r.on) : '—'} → {r.off != null ? hhmm(r.off) : '근무 중'}{r.on != null && r.off != null ? ` · ${fmtDur((r.off - r.on) / 60000)}` : ''}</p>
      <div className="modal-body">
        <button className={`ses-pick${pick === 'merge' ? ' on' : ''}`} data-pick="merge" disabled={!m} onClick={() => setPick('merge')}>
          <span className="l"><b>합치기</b><span className="t2" id="sesMergeT">{prev?.on != null ? hhmm(prev.on) : ''}부터 계속 일한 것으로</span></span>
          <span className="r"><b className="big" id="sesMergeV">{mw != null ? fmtDur(mw) : '—'}</b><span className="dl up" id="sesMergeD">{delta(mw)}</span></span>
        </button>
        <button className={`ses-pick${pick === 'drop' ? ' on' : ''}`} data-pick="drop" disabled={!dr} onClick={() => setPick('drop')}>
          <span className="l"><b>삭제</b><span className="t2" id="sesDropT">{prev?.off != null ? hhmm(prev.off) : ''}에 퇴근한 것으로</span></span>
          <span className="r"><b className="big" id="sesDropV">{dw != null ? fmtDur(dw) : '—'}</b><span className="dl dn" id="sesDropD">{delta(dw)}</span></span>
        </button>
        <div className="ses-help" id="sesHelp" />
      </div>
      <div className="modal-foot">
        <button className="btn ghost" id="sesCancel" onClick={onClose}>취소</button>
        <button className="btn primary" id="sesGo" disabled={!pick} onClick={() => {
          if (pick === 'merge') ws.editDay(date, (day) => mergeSession(day, i), `${i}차와 ${i + 1}차를 합쳤어요`);
          if (pick === 'drop') ws.editDay(date, (day) => dropSession(day, i), `${i + 1}차 기록을 삭제했어요`);
          onClose();
        }}>적용</button>
      </div>
    </Modal>
  );
}

/** 차수 추가 — 시각을 «받고 나서» 만든다. 추천 시각은 placeholder 로만 (LOGIC §4 v3.1.10) */
function AddDialog({ ws, date, d, onClose }: { ws: Workspace; date: string; d: Day; onClose: () => void }) {
  const slot = sessionSlot(d, ws.now);
  const [on, setOn] = useState('');
  const [off, setOff] = useState('');
  const onT = normTime(on), offT = off.trim() ? normTime(off) : null;
  let msg = '';
  if (on && !onT) msg = '출근 시각을 HH:MM 으로 적어 주세요';
  else if (off.trim() && !offT) msg = '퇴근 시각을 HH:MM 으로 적어 주세요';
  else if (onT && offT && !(msAt(date, offT) > msAt(date, onT))) msg = '퇴근이 출근보다 늦어야 해요';
  else if (onT && d.onAt != null && msAt(date, onT) <= d.onAt) msg = `${hhmm(d.onAt)}보다 뒤로 적어 주세요. 더 앞이어야 하면 1차 출근 시각을 고쳐 주세요`;
  const ok = !!onT && !msg;
  return (
    <Modal id="sesAddModal" width={352} onClose={onClose}>
      <h3 id="sesAddTitle">근무 시간 추가</h3>
      <p className="ses-sub" id="sesAddSub">{d.offAt == null ? '적은 출근 시각에 앞 차수가 퇴근 처리돼요' : `퇴근(${hhmm(d.offAt)})과 새 출근 사이는 비근무로 남아요`}</p>
      <div className="modal-body">
        <div className="field">
          <label id="sesAddLabel">출근 · 퇴근 시각</label>
          <div className="ses-two">
            <input id="sesAddOn" placeholder={slot ? hhmm(slot.on) : '00:00'} maxLength={5} autoComplete="off" aria-label="출근 시각" value={on} onChange={(e) => setOn(e.target.value)} autoFocus />
            <em>–</em>
            <input id="sesAddOff" placeholder={slot ? hhmm(slot.off) : '비워도 됩니다'} maxLength={5} autoComplete="off" aria-label="퇴근 시각 (비워도 됩니다)" value={off} onChange={(e) => setOff(e.target.value)} />
          </div>
          <div className="ses-msg" id="sesAddMsg">{msg}</div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" id="sesAddCancel" onClick={onClose}>취소</button>
        <button className="btn primary" id="sesAddGo" disabled={!ok} onClick={() => {
          if (!onT) return;
          const done = ws.editDay(date, (day) => addSessionAt(day, msAt(date, onT), offT ? msAt(date, offT) : null), '차수를 추가했어요');
          if (!done) ws.say('차수를 추가하지 못했어요. 시각을 확인해 주세요');
          onClose();
        }}>추가</button>
      </div>
    </Modal>
  );
}

/** 분 입력 — HH:MM · 끝은 24:00 까지 */
const toMin = (raw: string) => {
  if (raw.trim() === '24:00') return 1440;
  const hm = normTime(raw);
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * 「무엇을 했나요?」 — 치는 대로 남고, 목록에 있는 말이면 골라 넣는다 (v3.1.19 fillSlotTodo · `.ap-cb` 콤보)
 * ★ 상자를 열며 준 첫 포커스에는 안 펼친다 — 목록이 저장 · 삭제를 덮는다 (v3.1.40). 누르거나 치면 펼친다
 */
function LabelCombo({ picks, value, placeholder, onChange, onEnter }: { picks: LabelPick[]; value: string; placeholder: string; onChange: (v: string) => void; onEnter: () => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(-1);
  const [up, setUp] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, '');
  const q = norm(value);
  const items = picks.filter((a) => !q || norm(a.t).includes(q)).slice(0, 30);
  const show = (v: boolean) => {
    if (v && !picks.length) return;
    setOpen(v);
    if (v && inp.current) setUp(window.innerHeight - inp.current.getBoundingClientRect().bottom < 214);
  };
  const choose = (i: number) => { const a = items[i]; setOpen(false); setCur(-1); if (a) onChange(a.t); inp.current?.focus(); };
  let last = '';
  return (
    <div className={`ap-cb slot-cb${open ? ' open' : ''}${open && up ? ' up' : ''}`} id="slotLabelCb">
      <input ref={inp} id="slotLabel" className="ap-add" autoComplete="off" autoFocus role="combobox" aria-expanded={open} aria-autocomplete="list"
        placeholder={placeholder} value={value}
        onFocus={() => { if (first.current) { first.current = false; return; } show(true); }}
        onClick={() => show(true)}
        onBlur={() => setTimeout(() => setOpen(false), 80)}
        onChange={(x) => { onChange(x.target.value); setCur(-1); if (!open) show(true); }}
        onKeyDown={(x) => {
          if (x.nativeEvent.isComposing) return;
          if (x.key === 'ArrowDown' || x.key === 'ArrowUp') {
            x.preventDefault();
            if (!open) { show(true); return; }
            setCur((c) => Math.max(0, Math.min(items.length - 1, c + (x.key === 'ArrowDown' ? 1 : -1))));
          } else if (x.key === 'Escape' && open) { x.preventDefault(); x.stopPropagation(); setOpen(false); }
          else if (x.key === 'Enter') { x.preventDefault(); if (open && cur >= 0) choose(cur); else onEnter(); }
        }} />
      <button className="ap-cb-arrow" type="button" tabIndex={-1} aria-label="할 일 목록 열기"
        onMouseDown={(x) => x.preventDefault()} onClick={() => { if (open) setOpen(false); else { inp.current?.focus(); show(true); } }}>
        <svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg></button>
      <div className="ap-menu" id="slotLabelMenu" role="listbox" hidden={!open}>
        {items.length ? items.map((a, i) => {
          const head = a.kind !== last ? <div className="ap-mgrp">{a.kind}</div> : null;
          last = a.kind;
          return (
            <div key={a.t} style={{ display: 'contents' }}>
              {head}
              <button className={`ap-opt${i === cur ? ' on' : ''}`} role="option" aria-selected={i === cur} type="button"
                onMouseDown={(x) => { x.preventDefault(); choose(i); }} onMouseEnter={() => setCur(i)}>
                <span className="ao-n">{a.t}</span>{a.done && <i className="ao-dn">✓ 끝냄</i>}</button>
            </div>
          );
        }) : <div className="ap-opt none">맞는 게 없어요. <b>적은 그대로</b> 써요</div>}
      </div>
    </div>
  );
}

/** 시간 기록 · 휴게 상자 (v3 slotModal) — 종류 고르기 · 이름(메모) · 카테고리 · 삭제 */
function SpanDialog({ ws, date, d, o, appDocs = [], onClose }: { ws: Workspace; date: string; d: Day; o: OpenSpan; appDocs?: AppDoc[]; onClose: () => void }) {
  const orig = o.ref?.type === 'brk' ? d.breaks[o.ref.idx] : null;
  const log = o.ref && o.ref.type !== 'brk' ? ws.logs.find((x) => x.id === (o.ref as { id: string }).id) ?? null : null;
  const [kind, setKind] = useState(o.kind);
  const [s, setS] = useState(fmtM(o.s));
  const [e, setE] = useState(fmtM(o.e));
  const [text, setText] = useState(orig?.note ?? log?.text ?? '');
  // 시간 기록은 색이 늘 하나 (차례 색), 휴게는 없어도 된다 (v3.1.249)
  const [color, setColor] = useState<string | null>(log ? log.color : orig ? orig.color ?? null : o.kind === 'slot' ? nextColor(logsOf(ws.logs, date, 'slot').length) : null);
  const sM = toMin(s), eM = toMin(e);
  const dur = sM != null && eM != null ? eM - sM : null;
  const isSlot = kind === 'slot';
  const outNow = !o.ref || o.ref.type !== 'brk' ? sM != null && (d.onAt == null || slotOutside(d, sM)) : false;
  const brkEm = outNow ? '쉰 시간을 남깁니다 · 근무시간과 퇴근 시각에는 영향이 없습니다' : '근무시간에서 빠집니다 · 2시간을 넘기면 퇴근으로 간주됩니다';
  const locked = isSlot && !text.trim();
  const picks = useMemo(() => labelPicks(ws.blocks, ws.logs, date, ws.today), [ws.blocks, ws.logs, date, ws.today]);
  const save = () => {
    if (sM == null || eM == null) { ws.say('시각을 HH:MM 으로 적어 주세요'); return; }
    const why = ws.saveSpan(date, o.ref, { kind, s: sM, e: eM, text, color: isSlot ? color ?? nextColor(0) : color });
    if (why) { ws.warn(why); return; }
    onClose();
  };
  return (
    <Modal id="slotModal" width={400} onClose={onClose}>
      <h3 className="slot-h" id="slotTime">
        <span className="slot-times" id="slotTimes">
          <TimeIn id="slotStart" label="시작 시각" value={s} onLive={setS} onCommit={(v) => setS(v)} />
          <em className="slot-dash">~</em>
          <TimeIn id="slotEnd" label="끝 시각" value={e} onLive={setE} onCommit={(v) => setE(v)} />
        </span>
        <span className="slot-dur" id="slotDur">{dur != null && dur > 0 ? fmtDur(dur) : '—'}</span>
      </h3>
      <div className="modal-body">
        {!(orig && orig.e == null) && (
          <div className="field" id="slotKindField">
            <label>이 시간은</label>
            <div className="kind-pick two" id="slotKind">
              <button data-kind="slot" className={isSlot ? 'on' : ''} onClick={() => { setKind('slot'); if (!color) setColor(nextColor(logsOf(ws.logs, date, 'slot').length)); }}>
                <b>📝 시간 기록</b><em>무엇을 했는지 남깁니다</em></button>
              <button data-kind="break" className={isSlot ? '' : 'on'} onClick={() => { setKind('break'); if (!log) setColor(null); }}>
                <b>☕️ 휴게</b><em>{brkEm}</em></button>
            </div>
            <p className="kind-why" id="slotKindWhy">{isSlot ? '무엇을 했는지 남깁니다' : brkEm}</p>
          </div>
        )}
        <div className="field" id="slotLabelField">
          <label id="slotLabelLb">{isSlot ? <>무엇을 했나요?<i className="slot-req">*</i></> : '메모 (선택)'}</label>
          <LabelCombo picks={picks} value={text} placeholder={isSlot ? '예) 와이어프레임 정리' : '예) 점심 · 병원 · 회의 이동'}
            onChange={setText} onEnter={() => { if (!locked) save(); }} />
          {picks.length > 0 && <p className="f-hint" id="slotTodoHint">할 일 목록에서 고를 수도 있어요</p>}
          {!isSlot && (
            <div className="memo-chips" id="slotMemoChips">
              {MEMO_CHIPS.map((m) => <button type="button" key={m} data-memo={m} onClick={() => setText(m)}>{m}</button>)}
            </div>
          )}
        </div>
        {catChoices(ws.cats, color).length > 0 && (
          <div className="field" id="slotColorField">
            <label>카테고리 <span className="hint3">설정 → 시간 기록에서 관리해요</span></label>
            <div className="cats" id="slotColors">
              {catChoices(ws.cats, color).map((c) => {
                const on = c.color === catKey(color);
                return (
                  <button type="button" key={c.color} className={`cat${on ? ' on' : ''}`} data-c={c.color}
                    title={`${c.name || '이름 없는 색'}${!isSlot && on ? '\n다시 누르면 해제' : ''}`}
                    onClick={() => setColor(!isSlot && on ? null : c.color)}>
                    <i style={{ background: c.color }} /><span>{c.name || <em>이름 없음</em>}</span></button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        {(o.ref || o.draft) && (
          <button className="btn ghost" id="slotDelete" style={{ marginRight: 'auto' }} title={o.draft ? '이 구간의 앱 사용 기록만 지워요' : undefined}
            onClick={() => { if (o.ref) ws.deleteSpan(date, o.ref); else ws.dropApps(date, appDocs, o.s, o.e); onClose(); }}>삭제</button>
        )}
        <button className="btn ghost" id="slotCancel" style={o.ref || o.draft ? undefined : { marginLeft: 'auto' }} onClick={onClose}>취소</button>
        <button className="btn primary" id="slotSave" disabled={locked} title={locked ? '무엇을 했는지 적어 주세요' : ''} onClick={save}>저장</button>
      </div>
    </Modal>
  );
}
