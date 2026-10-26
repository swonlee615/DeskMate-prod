/**
 * 일간 상세 (v3 renderDayPage · gridHtml · slotListHtml) — 근태 부분
 *
 * ★ 마크업 · 클래스 · id 는 v3 와 같다. 스타일은 v3 styles.css.
 * ★ 고치는 일은 전부 `ws.editDay(date, 순수함수)` 로 한다 — 함수는 src/domain/attendance/edit.ts (v3 이식)
 *   Today · Memo 는 NoteEditor.tsx. 아직 안 옮긴 것: 시간 기록 칸 끌어 그리기 (시간 기록 단계) · 습관 칩 · D-Day 선
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import type { Day, Leave, Span } from '../domain/attendance/types';
import { dayGoalMin, dayParts, dayStartMs, effKind, openBreak, spanEnd } from '../domain/attendance/rules';
import {
  addSessionAt, canAddSession, dropSession, editBreak, mergeSession, removeBreak, sessionRows, sessionSlot,
  sessionWhy, setSessionTime,
} from '../domain/attendance/edit';
import { addDays, dateOf, DOW, dayLabel, fmtDur, hhmm, keyOf, leaveOf, LEAVES, normTime, weekStart } from '../ui/v3fmt';
import { PendBanner } from './PendBanner';
import { NoteEditor } from './NoteEditor';

const GSTEP = 5;        // 격자 한 칸 = 5분
const GCOLS = 12;       // 한 줄 = 1시간
const MEMO_CHIPS = ['점심', '저녁', '병원', '회의 이동', '산책', '통화'];
/** v3 REST_GRADE — 휴게 ÷ (근무 + 휴게) */
const REST_GRADE = [
  { max: 8, cls: 'warn', label: '주의', tip: '너무 적어요 — 쉬지 않고 붙어 있는 상태' },
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
}

export function DayPage({ ws, date, full, onClose, onFull, onGo, focusOff }: Props) {
  const d = ws.dayOf(date);
  const { now, today } = ws;
  const isToday = date === today;
  const dt = dateOf(date);
  const [open, setOpen] = useState(!!focusOff);
  const [sesDlg, setSesDlg] = useState<number | null>(null);
  const [addDlg, setAddDlg] = useState(false);
  const [brkDlg, setBrkDlg] = useState<number | null>(null);
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
            {(d.autoClosed === 'away' || d.autoClosed === 'break') && (
              <div className="autonote">{d.autoClosed === 'away'
                ? `${d.offAt != null ? hhmm(d.offAt) : '그 시각'}부터 자리를 비우셔서, 그때 퇴근한 것으로 기록했어요.`
                : `휴식 중 자정을 넘겨서, 휴식을 누른 ${d.offAt != null ? hhmm(d.offAt) : '시각'}을 퇴근으로 기록했어요.`} 시각이 다르면 <b>상세</b>에서 고쳐주세요.
                <button className="note-x" id="autoNoteX" title="확인했어요 — 다시 안 띄웁니다"
                  onClick={() => ws.editDay(date, (day) => ({ ...day, autoClosed: 'confirmed' }), '확인했어요')}>✕</button></div>
            )}

            <div className={`dh-bar${open ? ' open' : ''}`} id="dhBar" role="button" tabIndex={0} aria-expanded={open}
              title={open ? '차수 접기' : '눌러서 차수별 시각 펼치기'}
              onClick={(e) => { if ((e.target as HTMLElement).closest('button, select')) return; setOpen((v) => !v); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}>
              {isToday
                ? <div className="dh-seg">
                    <button className={`mini-btn${working ? ' on' : ''}`} id="pOn" disabled={working} onClick={ws.onOn}>{d.offAt != null ? '재개' : 'On'}</button>
                    <button className={`mini-btn${d.offAt != null ? ' off' : ''}`} id="pOff" disabled={!working} onClick={ws.onOff}>Off</button>
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
                  : <b className="empty" title={d.onAt != null ? `아직 근무 중이라 합계를 내지 않아요 — 퇴근하면 채워집니다 (지금까지 ${fmtDur(work)})` : '출근 기록이 없어요'}>–</b>}
                <i className="sl">/</i>
                <span className="rest" title={`휴게 ${restN}건${openBreak(d) ? ' · 진행 중' : ''}`}>휴게 {fmtDur(rest)}</span>
                <RestGrade d={d} work={work} rest={rest} />
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
          </div>

          <div className="day-cols">
            <div className="day-left">
              <NoteEditor ws={ws} date={date} area="today" title="Today" ph="할 일을 입력하세요"
                icon={<svg className="nh-ic" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m2.4 10.3 2.1 2.1 3.8-4.5" /><path d="M10.4 8h7.2" /><path d="M10.4 12.6h7.2" /></svg>} />
              <NoteEditor ws={ws} date={date} area="memo" title="Memo" ph="메모를 입력하세요"
                icon={<svg className="nh-ic" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2.6 5.6h14.8" /><path d="M2.6 10h14.8" /><path d="M2.6 14.4h9.4" /></svg>} />
            </div>
            <div className="day-right">
              <div className="tg-wrap">
                <Grid d={d} now={now} isToday={isToday} onBreak={setBrkDlg} />
                <div className="tg-list" id="tgList">
                  <SlotList d={d} now={now} rows={rows} onBreak={setBrkDlg} onGoto={() => setOpen(true)} />
                </div>
              </div>
              <div className="tg-foot"><div className="tg-legend">
                <span className="lg"><i className="work-line" />근무</span><span className="lg"><i className="brk-line" />휴게</span>
                {d.onAt != null && <span className="lg"><i className="mk-line on" />출근</span>}
                {(d.offAt != null || d.breaks.some((b) => effKind(d, b, now) === 'off')) && <span className="lg"><i className="mk-line off" />퇴근</span>}
                <span className="lg-sp2" />
              </div></div>
            </div>
          </div>
        </div>
      </div>

      {sesDlg != null && <SesDialog ws={ws} date={date} d={d} i={sesDlg} onClose={() => setSesDlg(null)} />}
      {addDlg && <AddDialog ws={ws} date={date} d={d} onClose={() => setAddDlg(false)} />}
      {brkDlg != null && d.breaks[brkDlg] && <BreakDialog ws={ws} date={date} b={d.breaks[brkDlg]} idx={brkDlg} now={now} d={d} onClose={() => setBrkDlg(null)} />}
    </div>
  );
}

// ───────────────────────────────────────────── 조각들

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

function RestGrade({ d, work, rest }: { d: Day; work: number; rest: number }) {
  if (d.onAt == null || !(work + rest > 0)) return null;
  const pct = Math.round((rest / (work + rest)) * 100);
  const g = work + rest >= 60 ? REST_GRADE.find((x) => pct < x.max) ?? null : null;
  return (
    <span className={`dh-rg${g ? ` g-${g.cls}` : ''}`} title={`휴게 비율 — 휴게 ÷ (근무 + 휴게)\n${g ? `${g.label} · ${g.tip}` : '1시간이 안 돼 등급은 보류'}`}>
      {pct}%{g ? ` ${g.label}` : ''}
    </span>
  );
}

/** HH:MM 입력 — 엔터 · 칸 벗어나기로 확정, Esc 로 되돌리기 (v3 timeInput) */
function TimeIn({ value, attrs, onCommit, id }: {
  value: string; attrs?: Record<string, string | number>; id?: string; onCommit: (v: string, el: HTMLInputElement) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) { ref.current.value = value; ref.current.dataset.last = value; } }, [value]);
  return (
    <span className="tin-w">
      <input ref={ref} id={id} className="tin tin-i" type="text" inputMode="numeric" maxLength={5} autoComplete="off" placeholder="--:--"
        defaultValue={value} data-last={value} {...attrs}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { e.stopPropagation(); const el = e.target as HTMLInputElement; el.value = el.dataset.last ?? ''; el.blur(); }
        }}
        onBlur={(e) => onCommit(e.target.value, e.target)} />
      <button className="tin-c" type="button" tabIndex={-1} title="시각 적기" onClick={() => { ref.current?.focus(); ref.current?.select(); }}>
        <svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg></button>
    </span>
  );
}

function WeekStrip({ ws, date, onGo }: { ws: Workspace; date: string; onGo: (k: string) => void }) {
  const mon = weekStart(dateOf(date));
  const scale = GOAL_HOURS * 60;
  return (
    <div className="week-strip" title="이번 주 — 날짜를 누르면 그 날로 갑니다">
      {Array.from({ length: 7 }, (_, i) => {
        const dt = addDays(mon, i);
        const k = keyOf(dt);
        const d = ws.days[k];
        const has = !!d && (d.onAt != null || !!d.leave);
        const min = has && d.onAt != null ? dayParts(d, ws.now).workMs / 60000 : 0;
        const goal = dayGoalMin(GOAL_HOURS, d ?? { leave: '' });
        const pct = Math.max(0, Math.min(100, Math.round((min / scale) * 100)));
        const cls = ['ws-d', k === date ? 'on' : '', k === ws.today ? 'today' : '', has ? '' : 'none',
          dt.getDay() === 0 || dt.getDay() === 6 ? 'wk' : ''].filter(Boolean).join(' ');
        const tip = has
          ? [`${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})`,
            `출근 ${d.onAt != null ? hhmm(d.onAt) : '–'} · 퇴근 ${d.offAt != null ? hhmm(d.offAt) : '–'}`,
            `근무 ${d.onAt != null ? fmtDur(min) : '–'}`, d.leave ? `· ${d.leave}` : ''].filter(Boolean).join('\n')
          : `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]}) — 기록 없음\n눌러서 엽니다`;
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

/** 시간표 — 지금은 근태만 칠한다 (근무 · 휴게 · 비근무 · 출퇴근 선). 시간 기록은 그 단계에서 */
function Grid({ d, now, isToday, onBreak }: { d: Day; now: number; isToday: boolean; onBreak: (i: number) => void }) {
  const cells = useMemo(() => {
    const base = dayStartMs(d.date);
    const minOf = (ms: number) => Math.round((ms - base) / 60000);
    const brk: Record<number, { off: boolean; idx: number; t: string; note?: string }> = {};
    d.breaks.forEach((b, idx) => {
      const off = effKind(d, b, now) === 'off';
      const s = minOf(b.s), e = minOf(spanEnd(d, b, now));
      for (let g = Math.floor(Math.max(0, s) / GSTEP) * GSTEP; g < Math.min(1440, e); g += GSTEP) {
        if (!brk[g]) brk[g] = { off, idx, note: b.note, t: `${off ? '비근무' : '휴게'} ${hhmm(b.s)} ~ ${b.e != null ? hhmm(spanEnd(d, b, now)) : '진행 중'}${b.note ? `\n${b.note}` : ''}` };
      }
    });
    const marks: Record<number, { cls: string; f: number; tip: string }[]> = {};
    const addMark = (ms: number | null, cls: string, label: string) => {
      if (ms == null) return;
      const m = minOf(ms);
      if (m < 0 || m > 1440) return;
      const gm = Math.min(1439, m), g = Math.floor(gm / GSTEP) * GSTEP;
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
      for (let m = Math.floor(sm / GSTEP) * GSTEP; m <= em; m += GSTEP) work[m] = true;
    }
    return { brk, marks, work };
  }, [d, now]);

  const nowG = isToday ? (() => { const t = new Date(now); return t.getHours() * 60 + t.getMinutes(); })() : -1;
  return (
    <div className="tg-col"><div className="tg" id="tg">
      <div className="tg-h"><i />{Array.from({ length: GCOLS }, (_, i) => {
        const end = (i + 1) * GSTEP;
        return <i key={i} className={i % 2 ? 'fine' : ''}>{end % 10 ? '' : end}</i>;
      })}</div>
      {Array.from({ length: 24 }, (_, r) => (
        <div className="tg-r" key={r}><i className="h">{String(r).padStart(2, '0')}</i>
          {Array.from({ length: GCOLS }, (_, c) => {
            const g = (r * GCOLS + c) * GSTEP;
            const bk = cells.brk[g];
            const mk = cells.marks[g] ?? [];
            const isNow = g <= nowG && nowG < g + GSTEP;
            const cls = ['tg-c', c % 2 ? 'fine' : '', isNow ? 'now' : '', bk ? (bk.off ? 'nonwork' : bk.note ? 'brk memo' : 'brk') : '',
              !bk && cells.work[g] ? 'work' : ''].filter(Boolean).join(' ');
            const tip = [bk?.t, ...mk.map((x) => x.tip)].filter(Boolean).join('\n');
            return (
              <i key={c} className={cls} data-g={g} title={tip || undefined}
                onClick={bk && !bk.off ? () => onBreak(bk.idx) : undefined}>
                {mk.map((x, j) => <u key={j} className={`tg-mk ${x.cls}`} style={{ left: `${Math.round(x.f * 100)}%` }} />)}
              </i>
            );
          })}
        </div>
      ))}
    </div></div>
  );
}

/** 오른쪽 아래 목록 — 출근 · 휴게 · 퇴근 (v3 slotListHtml 의 근태 줄) */
function SlotList({ d, now, rows, onBreak, onGoto }: {
  d: Day; now: number; rows: ReturnType<typeof sessionRows>; onBreak: (i: number) => void; onGoto: () => void;
}) {
  type It = { at: number; el: React.ReactNode };
  const items: It[] = [];
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
  d.breaks.forEach((b, idx) => {
    if (effKind(d, b, now) === 'off') return;
    const e = spanEnd(d, b, now);
    items.push({ at: b.s + 0.25, el: (
      <div key={`b${idx}`} className="tg-item r2 brk-item" data-brk={idx}
        title={`휴게 ${hhmm(b.s)} ~ ${b.e != null ? hhmm(e) : '진행 중'}\n${b.auto ? '자동 기록 · 자리비움' : '직접 만든 기록'}`}
        onClick={() => { if (b.e != null) onBreak(idx); }}>
        <i style={{ background: 'rgba(236,178,46,.6)' }} />
        <span className="rg">{hhmm(b.s)} ~ {b.e != null ? hhmm(e) : '진행 중'}</span>
        <span className="du">{fmtDur((e - b.s) / 60000)}</span>
        <div className="tg-mid"><span className="cat-tag kind-brk">☕️ 휴게</span>{b.auto && <span className="lb">자리비움</span>}{b.note && <span className="lb">{b.note}</span>}</div>
      </div>) });
  });
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
  else if (onT && d.onAt != null && msAt(date, onT) <= d.onAt) msg = `${hhmm(d.onAt)} 뒤여야 해요 — 그 날 첫 출근보다 앞이면 1차 출근을 고쳐 주세요`;
  const ok = !!onT && !msg;
  return (
    <Modal id="sesAddModal" width={352} onClose={onClose}>
      <h3 id="sesAddTitle">근무 시간 추가</h3>
      <p className="ses-sub" id="sesAddSub">{d.offAt == null ? '적은 출근 시각에 앞 차수가 닫혀요' : `퇴근(${hhmm(d.offAt)})과 새 출근 사이는 비근무로 남아요`}</p>
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
          if (!done) ws.say('추가하지 못했어요 — 시각을 확인해 주세요');
          onClose();
        }}>추가</button>
      </div>
    </Modal>
  );
}

/** 휴게 상자 — 시각 · 메모 · 삭제 (v3 slotModal 의 휴게) */
function BreakDialog({ ws, date, b, idx, now, d, onClose }: { ws: Workspace; date: string; b: Span; idx: number; now: number; d: Day; onClose: () => void }) {
  const [s, setS] = useState(hhmm(b.s));
  const [e, setE] = useState(hhmm(spanEnd(d, b, now)));
  const [note, setNote] = useState(b.note ?? '');
  const sT = normTime(s), eT = normTime(e);
  const dur = sT && eT ? (msAt(date, eT) - msAt(date, sT)) / 60000 : null;
  return (
    <Modal id="slotModal" width={400} onClose={onClose}>
      <h3 className="slot-h" id="slotTime">
        <span className="slot-times" id="slotTimes">
          <span className="tin-w"><input className="tin tin-i" type="text" inputMode="numeric" maxLength={5} id="slotStart" aria-label="시작 시각" value={s} onChange={(x) => setS(x.target.value)} /></span>
          <em className="slot-dash">~</em>
          <span className="tin-w"><input className="tin tin-i" type="text" inputMode="numeric" maxLength={5} id="slotEnd" aria-label="끝 시각" value={e} onChange={(x) => setE(x.target.value)} /></span>
        </span>
        <span className="slot-dur" id="slotDur">{dur != null && dur > 0 ? fmtDur(dur) : '—'}</span>
      </h3>
      <div className="modal-body">
        <div className="field" id="slotLabelField">
          <label id="slotLabelLb">메모 (선택)</label>
          <div className="ap-cb slot-cb" id="slotLabelCb">
            <input id="slotLabel" className="ap-add" autoComplete="off" placeholder="예) 점심 · 병원 · 회의 이동" value={note} onChange={(x) => setNote(x.target.value)} />
          </div>
          <div className="memo-chips" id="slotMemoChips">
            {MEMO_CHIPS.map((m) => <button type="button" key={m} data-memo={m} onClick={() => setNote(m)}>{m}</button>)}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" id="slotDelete" style={{ marginRight: 'auto' }} onClick={() => {
          ws.editDay(date, (day) => removeBreak(day, idx), '휴게를 지웠어요');
          onClose();
        }}>삭제</button>
        <button className="btn ghost" id="slotCancel" onClick={onClose}>취소</button>
        <button className="btn primary" id="slotSave" onClick={() => {
          if (!sT || !eT) { ws.say('시각을 HH:MM 으로 적어 주세요'); return; }
          const ok = ws.editDay(date, (day) => editBreak(day, idx, msAt(date, sT), msAt(date, eT), note), '휴게를 고쳤어요');
          if (!ok) { ws.say('끝이 시작보다 1분 이상 늦어야 해요'); return; }
          onClose();
        }}>저장</button>
      </div>
    </Modal>
  );
}
