/**
 * 모바일 «시간표» — PC 일간 상세(v3 renderDayPage)를 폰 모양으로
 *
 * ★ 날짜: ‹ › · 이번 주 띠 · 제목을 누르면 달력 (PC 캘린더와 같은 ws.days · setCalMonth)
 * ★ 차수 시각 · 차수 추가/합치기/지우기 · 근태(연차 등) · 겹친 휴게 정리 — PC 와 같은 edit.ts · ws 함수
 * ★ 시간표는 세로 24시간. 그리는 구간은 `timeline()` 한 곳에서 (LOGIC §8-1). 빈 곳을 누르면 시간 기록 · 휴게를 새로,
 *   칸을 누르면 그 기록을 고친다 — 저장은 PC 와 같은 `ws.saveSpan`
 */
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import type { Day, Leave } from '../domain/attendance/types';
import { dayGoalMin, dayParts, dayStartMs } from '../domain/attendance/rules';
import {
  addSessionAt, canAddSession, dropSession, mergeSession, sessionRows, sessionSlot, sessionWhy, setSessionTime,
} from '../domain/attendance/edit';
import { breakConflicts, catVar, logsOf, nextColor, slotOutside, timeline, type SpanRef, type TLSpan } from '../domain/attendance/logs';
import { addDays, dateOf, DOW, dayLabel, fmtDur, hhmm, keyOf, leaveOf, LEAVES, normTime, weekStart } from '../ui/v3fmt';
import { HabitChips, Pend, Sheet, TimeBox, Todos } from './parts';

const PX = 0.8;          // 1분 = 0.8px → 한 시간 48px
const MEMO_CHIPS = ['점심', '저녁', '병원', '회의 이동', '산책', '통화'];
const fmtM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (raw: string) => {
  if (raw.trim() === '24:00') return 1440;
  const hm = normTime(raw);
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const msAt = (date: string, hm: string) => dayStartMs(date) + (toMin(hm) ?? 0) * 60000;
const workOf = (d: Day | undefined, now: number) => (d?.onAt != null ? dayParts(d, now).workMs / 60000 : 0);

interface OpenSpan { ref: SpanRef | null; s: number; e: number; kind: 'slot' | 'break' }

export function MDay({ ws, date, setDate, editOpen }: { ws: Workspace; date: string; setDate: (k: string) => void; editOpen?: boolean }) {
  const d = ws.dayOf(date);
  const [cal, setCal] = useState(false);
  const [span, setSpan] = useState<OpenSpan | null>(null);
  const [sesPick, setSesPick] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [focusOff, setFocusOff] = useState(!!editOpen);
  useEffect(() => { setFocusOff(!!editOpen); }, [editOpen, date]);
  const dt = dateOf(date);
  const isToday = date === ws.today;
  const go = (n: number) => setDate(keyOf(addDays(dt, n)));

  // 달력 · 이번 주 띠가 보는 기간을 받아 두게 한다 (노션 방식 — 보이는 것만)
  useEffect(() => {
    const m = new Date(dt.getFullYear(), dt.getMonth(), 1);
    if (m.getTime() !== ws.calMonth.getTime()) ws.setCalMonth(m);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="m-dnav">
        <button className="m-x" onClick={() => go(-1)} aria-label="전날">‹</button>
        <button className="m-dnav-t" onClick={() => setCal(true)} aria-label="달력 열기">
          <b>{isToday ? '오늘' : dayLabel(dt, new Date(ws.now))} ▾</b>
          <span>{dt.getFullYear()}년 {dt.getMonth() + 1}월 {dt.getDate()}일 {DOW[dt.getDay()]}요일</span>
        </button>
        <button className="m-x" onClick={() => go(1)} aria-label="다음날">›</button>
      </div>
      <WeekStrip ws={ws} date={date} onGo={setDate} />
      {!isToday && <button className="m-link m-dnav-today" onClick={() => setDate(ws.today)}>오늘로</button>}

      {d.pending && <Pend ws={ws} date={date} onEdit={() => setFocusOff(true)} />}
      <Summary ws={ws} d={d} date={date} />
      <Sessions ws={ws} d={d} date={date} autoFocusOff={focusOff} onPick={setSesPick} onAdd={() => setAdding(true)} />
      <Conflicts ws={ws} d={d} date={date} />
      <Timeline ws={ws} d={d} onOpen={setSpan} />
      <HabitChips ws={ws} date={date} />
      <Todos ws={ws} date={date} area="today" />
      <Todos ws={ws} date={date} area="memo" />

      {cal && <CalSheet ws={ws} date={date} onPick={(k) => { setDate(k); setCal(false); }} onClose={() => setCal(false)} />}
      {span && <SpanSheet ws={ws} date={date} d={d} o={span} onClose={() => setSpan(null)} />}
      {sesPick != null && <SesSheet ws={ws} date={date} d={d} i={sesPick} onClose={() => setSesPick(null)} />}
      {adding && <AddSheet ws={ws} date={date} d={d} onClose={() => setAdding(false)} />}
    </>
  );
}

/** 이번 주 띠 — 요일 · 날짜 · 근무시간 */
function WeekStrip({ ws, date, onGo }: { ws: Workspace; date: string; onGo: (k: string) => void }) {
  const w0 = weekStart(dateOf(date));
  return (
    <div className="m-strip">
      {Array.from({ length: 7 }, (_, i) => {
        const k = keyOf(addDays(w0, i));
        const m = workOf(ws.days[k], ws.now);
        return (
          <button key={k} className={`${k === date ? 'on' : ''}${k === ws.today ? ' today' : ''}`} onClick={() => onGo(k)}>
            <small>{'월화수목금토일'[i]}</small>
            <b>{dateOf(k).getDate()}</b>
            <em>{m ? `${+(m / 60).toFixed(1)}h` : ws.days[k]?.leave ? ws.days[k].leave.slice(0, 2) : ''}</em>
          </button>
        );
      })}
    </div>
  );
}

/** 하루 요약 — 근무 · 휴게 · 범위 · 근태 종류 */
function Summary({ ws, d, date }: { ws: Workspace; d: Day; date: string }) {
  const p = dayParts(d, ws.now);
  const work = p.workMs / 60000;
  const goal = dayGoalMin(GOAL_HOURS, d);
  const rows = sessionRows(d);
  const last = rows[rows.length - 1];
  const lv = leaveOf(d.leave);
  return (
    <section className="m-card m-dsum">
      <div className="m-dsum-g">
        <div><b className={work > 0 && work >= goal ? 'hit' : ''}>{fmtDur(work)}</b><span>근무{d.onAt != null && d.offAt == null && !d.pending ? ' (진행 중)' : ''}</span></div>
        <div><b>{fmtDur(p.breakMs / 60000)}</b><span>휴게</span></div>
        <div><b>{d.onAt != null ? `${hhmm(d.onAt)}–${d.offAt != null ? hhmm(d.offAt) : last?.off == null ? '' : hhmm(last.off)}` : '–'}</b><span>{rows.length > 1 ? `${rows.length}차` : '출퇴근'}</span></div>
      </div>
      <label className={`m-lv${d.leave ? ' on' : ''}`} style={lv[2] ? { '--lv': lv[2] } as React.CSSProperties : undefined}>
        <i aria-hidden="true" />{lv[1]} ▾
        <select aria-label="근태" value={d.leave} onChange={(e) => ws.onLeave(date, e.target.value as Leave)}>
          {LEAVES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    </section>
  );
}

/** 차수 — 시각 고치기 · − (합치기/지우기) · 차수 추가 (PC dh-detail 과 같은 함수) */
function Sessions({ ws, d, date, autoFocusOff, onPick, onAdd }: {
  ws: Workspace; d: Day; date: string; autoFocusOff?: boolean; onPick: (i: number) => void; onAdd: () => void;
}) {
  const rows = sessionRows(d);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocusOff) return;
    const els = box.current?.querySelectorAll<HTMLInputElement>('input[aria-label$="퇴근"]');
    const el = els?.[els.length - 1];
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
  }, [autoFocusOff, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (i: number, which: 'on' | 'off', hm: string) => {
    let why = '';
    const ok = ws.editDay(date, (day) => {
      const r = setSessionTime(day, i, which, msAt(date, hm));
      if (!r.ok) { why = sessionWhy(r, hhmm); return null; }
      return r.day;
    }, `${i + 1}차 ${which === 'on' ? '출근' : '퇴근'}을 ${hm}로 고쳤어요`);
    if (!ok) ws.say(why || '시간을 확인해 주세요');
  };
  const bad = () => ws.say('시각을 HH:MM 으로 적어 주세요');
  const hm = (ms: number | null | undefined) => (ms == null ? '' : hhmm(ms));
  return (
    <section className="m-card m-sess" ref={box} aria-label="차수">
      <div className="m-sum-t">출퇴근</div>
      {d.onAt == null && <p className="m-hint">출근 기록이 없어요.</p>}
      {rows.map((r, i) => (
        <div className="m-ses" key={`${i}-${r.on}-${r.off}`}>
          <span className="k">{i + 1}차</span>
          <TimeBox value={hm(r.on)} label={`${i + 1}차 출근`} onCommit={(v) => set(i, 'on', v)} onBad={bad} />
          <em>–</em>
          <TimeBox value={hm(r.off ?? d.pending?.guessOff)} label={`${i + 1}차 퇴근`} onCommit={(v) => set(i, 'off', v)} onBad={bad} />
          <button className="m-x" aria-label={`${i + 1}차 지우기`} onClick={() => {
            if (i === 0) ws.editDay(date, (day) => dropSession(day, 0), '1차 기록을 삭제했어요');
            else onPick(i);
          }}>−</button>
        </div>
      ))}
      <button className="m-link m-ses-add" disabled={!canAddSession(d, ws.now)} onClick={onAdd}>＋ 차수 추가</button>
    </section>
  );
}

/** 겹침 안내 — 휴게가 시간 기록 안에 겹쳐 근무시간이 깎일 때만 (PC Conflicts 와 같은 breakConflicts) */
function Conflicts({ ws, d, date }: { ws: Workspace; d: Day; date: string }) {
  const conf = breakConflicts(d);
  if (!conf.length) return null;
  const min = conf.reduce((a, c) => a + c.min, 0);
  return (
    <section className="m-card m-pend">
      <b>휴게 {conf.length}건이 시간 기록 안에 겹쳐 있어요 ({fmtDur(min)})</b>
      <p>그만큼 근무시간에서 빠지고 있어요. 그 시간에 일한 게 맞다면 정리해 주세요.</p>
      <button className="m-btn" onClick={() => ws.fixConflicts(date)}>겹친 휴게 정리</button>
    </section>
  );
}

/** 세로 시간표 — 왼쪽 띠 = 근태(근무 · 비근무), 가운데 = 시간 기록, 오른쪽 = 휴게 */
function Timeline({ ws, d, onOpen }: { ws: Workspace; d: Day; onOpen: (o: OpenSpan) => void }) {
  const tl = timeline(d, ws.logs, ws.now);
  const isToday = d.date === ws.today;
  const nowMin = isToday ? (() => { const t = new Date(ws.now); return t.getHours() * 60 + t.getMinutes(); })() : null;
  const wrap = useRef<HTMLDivElement>(null);
  // 열 때 «지금» 이나 그 날 첫 기록이 보이게 — 시간표 안에서만 굴린다
  useEffect(() => {
    const first = nowMin ?? tl[0]?.s ?? 9 * 60;
    if (wrap.current) wrap.current.scrollTop = Math.max(0, first * PX - 120);
  }, [d.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const openOf = (x: TLSpan): OpenSpan | null => {
    if (!x.ref) return null;
    const e = x.e <= x.s ? Math.min(1440, x.s + 10) : x.e;
    return { ref: x.ref, s: x.s, e, kind: x.kind === 'slot' ? 'slot' : 'break' };
  };
  const tapEmpty = (e: React.MouseEvent<HTMLDivElement>, kind: 'slot' | 'break') => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const s = Math.max(0, Math.min(1410, Math.floor(y / PX / 10) * 10));
    onOpen({ ref: null, s, e: s + 30, kind });
  };
  const box = (x: TLSpan, i: number) => {
    const o = openOf(x);
    const h = Math.max(14, (x.e - x.s) * PX);
    const st: Record<string, string | number> = { top: x.s * PX, height: h };
    if (x.kind === 'slot') st['--c'] = catVar(x.color ?? nextColor(0));
    if (x.kind === 'rest' && x.color) st['--c'] = x.color;
    return (
      <button key={i} className={`m-tl-b ${x.kind}${x.live ? ' live' : ''}${h < 30 ? ' thin' : ''}`} style={st as React.CSSProperties}
        onClick={() => o && onOpen(o)} aria-label={`${fmtM(x.s)}–${fmtM(x.e)} ${x.text || (x.kind === 'slot' ? '시간 기록' : '휴게')}`}>
        <b>{x.kind === 'slot' ? x.text : `☕️ ${x.text || '휴게'}`}</b>
        <span>{fmtM(x.s)}–{x.live ? '지금' : fmtM(x.e)} · {fmtDur(x.e - x.s)}</span>
      </button>
    );
  };
  return (
    <section className="m-card m-tlc" aria-label="시간표">
      <div className="m-tl-h">
        <div className="m-sum-t">시간표</div>
        <span className="m-tl-lg"><i className="work" />근무 <i className="slot" />기록 <i className="break" />휴게</span>
        <span className="m-sp" />
        <button className="m-btn sm" onClick={() => {
          const s = nowMin != null ? Math.max(0, Math.floor((nowMin - 30) / 10) * 10) : 9 * 60;
          onOpen({ ref: null, s, e: Math.min(1440, s + 30), kind: 'slot' });
        }}>＋ 기록</button>
      </div>
      <div className="m-tl" ref={wrap}>
        <div className="m-tl-in" style={{ height: 1440 * PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="m-tl-hr" style={{ top: h * 60 * PX }}><i>{String(h).padStart(2, '0')}</i></div>
          ))}
          <div className="m-tl-att">
            {tl.filter((x) => x.kind === 'work' || x.kind === 'off').map((x, i) => (
              <i key={i} className={`${x.kind}${x.live ? ' live' : ''}`} style={{ top: x.s * PX, height: Math.max(2, (x.e - x.s) * PX) }} />
            ))}
          </div>
          <div className="m-tl-lane slots" onClick={(e) => tapEmpty(e, 'slot')}>
            {tl.map((x, i) => (x.kind === 'slot' ? box(x, i) : null))}
          </div>
          <div className="m-tl-lane brks" onClick={(e) => tapEmpty(e, 'break')}>
            {tl.map((x, i) => (x.kind === 'break' || x.kind === 'rest' ? box(x, i) : null))}
          </div>
          {nowMin != null && <div className="m-tl-now" style={{ top: nowMin * PX }} />}
        </div>
      </div>
      <p className="m-hint">빈 곳을 누르면 그 시각에 새로 적어요 · 칸을 누르면 고쳐요</p>
    </section>
  );
}

/** 달력 — PC 캘린더처럼 날마다 근무시간 · 근태 */
function CalSheet({ ws, date, onPick, onClose }: { ws: Workspace; date: string; onPick: (k: string) => void; onClose: () => void }) {
  const m = ws.calMonth;
  const first = weekStart(m);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const weeks = cells[35].getMonth() === m.getMonth() ? 6 : 5;
  const move = (n: number) => ws.setCalMonth(new Date(m.getFullYear(), m.getMonth() + n, 1));
  let total = 0;
  return (
    <Sheet title={`${m.getFullYear()}년 ${m.getMonth() + 1}월`} onClose={onClose}>
      <div className="m-cal-nav">
        <button className="m-x" onClick={() => move(-1)} aria-label="이전 달">‹</button>
        <button className="m-link" onClick={() => onPick(ws.today)}>오늘</button>
        <button className="m-x" onClick={() => move(1)} aria-label="다음 달">›</button>
      </div>
      <div className="m-cal">
        {'월화수목금토일'.split('').map((x) => <small key={x}>{x}</small>)}
        {cells.slice(0, weeks * 7).map((c) => {
          const k = keyOf(c);
          const d = ws.days[k];
          const w = workOf(d, ws.now);
          const out = c.getMonth() !== m.getMonth();
          if (!out) total += w;
          const lv = leaveOf(d?.leave);
          return (
            <button key={k} className={`${out ? 'out' : ''}${k === ws.today ? ' today' : ''}${k === date ? ' on' : ''}${w >= GOAL_HOURS * 60 ? ' hit' : ''}`} onClick={() => onPick(k)}>
              <b>{c.getDate()}</b>
              <em>{w ? `${+(w / 60).toFixed(1)}h` : ''}</em>
              {lv[2] && <i style={{ background: lv[2] }} />}
            </button>
          );
        })}
      </div>
      <p className="m-hint">이 달 근무 {fmtDur(total)}</p>
    </Sheet>
  );
}

/** 차수 「−」 — 합칠까 지울까. 결과 숫자를 먼저 보여 준다 (LOGIC §4 v3.1.10) */
function SesSheet({ ws, date, d, i, onClose }: { ws: Workspace; date: string; d: Day; i: number; onClose: () => void }) {
  const rows = sessionRows(d);
  const prev = rows[i - 1];
  const m = mergeSession(d, i), dr = dropSession(d, i);
  const w = (x: Day | null) => (x ? fmtDur(dayParts(x, ws.now).workMs / 60000) : '—');
  return (
    <Sheet title={`${i + 1}차를 어떻게 할까요?`} onClose={onClose}>
      <button className="m-opt" disabled={!m} onClick={() => { ws.editDay(date, (day) => mergeSession(day, i), `${i}차와 ${i + 1}차를 합쳤어요`); onClose(); }}>
        <span><b>합치기</b><small>{prev?.on != null ? hhmm(prev.on) : ''}부터 계속 일한 것으로</small></span><em>{w(m)}</em>
      </button>
      <button className="m-opt" disabled={!dr} onClick={() => { ws.editDay(date, (day) => dropSession(day, i), `${i + 1}차 기록을 삭제했어요`); onClose(); }}>
        <span><b>삭제</b><small>{prev?.off != null ? hhmm(prev.off) : ''}에 퇴근한 것으로</small></span><em>{w(dr)}</em>
      </button>
    </Sheet>
  );
}

/** 차수 추가 — 시각을 «받고 나서» 만든다. 추천 시각은 placeholder 로만 (LOGIC §4) */
function AddSheet({ ws, date, d, onClose }: { ws: Workspace; date: string; d: Day; onClose: () => void }) {
  const slot = sessionSlot(d, ws.now);
  const [on, setOn] = useState('');
  const [off, setOff] = useState('');
  const onT = normTime(on), offT = off.trim() ? normTime(off) : null;
  let msg = '';
  if (on && !onT) msg = '출근 시각을 HH:MM 으로 적어 주세요';
  else if (off.trim() && !offT) msg = '퇴근 시각을 HH:MM 으로 적어 주세요';
  else if (onT && offT && !(msAt(date, offT) > msAt(date, onT))) msg = '퇴근이 출근보다 늦어야 해요';
  else if (onT && d.onAt != null && msAt(date, onT) <= d.onAt) msg = `${hhmm(d.onAt)} 뒤여야 해요 — 그 날 첫 출근보다 앞이면 1차 출근을 고쳐 주세요`;
  return (
    <Sheet title="근무 시간 추가" sub={d.offAt == null ? '적은 출근 시각에 앞 차수가 닫혀요' : `퇴근(${hhmm(d.offAt)})과 새 출근 사이는 비근무로 남아요`} onClose={onClose}>
      <div className="m-ses">
        <input className="m-tin" inputMode="numeric" maxLength={5} placeholder={slot ? hhmm(slot.on) : '00:00'} aria-label="출근 시각" value={on} onChange={(e) => setOn(e.target.value)} />
        <em>–</em>
        <input className="m-tin" inputMode="numeric" maxLength={5} placeholder={slot ? hhmm(slot.off) : '비워도 돼요'} aria-label="퇴근 시각" value={off} onChange={(e) => setOff(e.target.value)} />
      </div>
      {msg && <p className="m-bad">{msg}</p>}
      <button className="m-btn go" disabled={!onT || !!msg} onClick={() => {
        if (!onT) return;
        if (!ws.editDay(date, (day) => addSessionAt(day, msAt(date, onT), offT ? msAt(date, offT) : null), '차수를 추가했어요')) ws.say('추가하지 못했어요 — 시각을 확인해 주세요');
        onClose();
      }}>추가</button>
    </Sheet>
  );
}

/** 시간 기록 · 휴게 시트 (PC SpanDialog · v3 slotModal) — 저장은 같은 ws.saveSpan */
function SpanSheet({ ws, date, d, o, onClose }: { ws: Workspace; date: string; d: Day; o: OpenSpan; onClose: () => void }) {
  const orig = o.ref?.type === 'brk' ? d.breaks[o.ref.idx] : null;
  const log = o.ref && o.ref.type !== 'brk' ? ws.logs.find((x) => x.id === (o.ref as { id: string }).id) ?? null : null;
  const nSlots = logsOf(ws.logs, date, 'slot').length;
  const [kind, setKind] = useState(o.kind);
  const [s, setS] = useState(fmtM(o.s));
  const [e, setE] = useState(fmtM(o.e));
  const [text, setText] = useState(orig?.note ?? log?.text ?? '');
  const [color, setColor] = useState<string | null>(log ? log.color : o.kind === 'slot' ? nextColor(nSlots) : null);
  const sM = toMin(s), eM = toMin(e);
  const dur = sM != null && eM != null ? eM - sM : null;
  const isSlot = kind === 'slot';
  const outNow = o.ref?.type !== 'brk' && sM != null && (d.onAt == null || slotOutside(d, sM));
  const brkEm = outNow ? '쉰 시간을 남겨요 · 근무시간과 퇴근 시각에는 영향이 없어요' : '근무시간에서 빠져요 · 2시간을 넘기면 퇴근으로 봐요';
  const locked = isSlot && !text.trim();
  const save = () => {
    if (sM == null || eM == null) { ws.say('시각을 HH:MM 으로 적어 주세요'); return; }
    const why = ws.saveSpan(date, o.ref, { kind, s: sM, e: eM, text, color: isSlot ? color ?? nextColor(0) : color });
    if (why) { ws.warn(why); return; }
    onClose();
  };
  return (
    <Sheet title={o.ref ? '고치기' : '새로 적기'} sub={dur != null && dur > 0 ? fmtDur(dur) : undefined} onClose={onClose}>
      <div className="m-ses">
        <input className="m-tin" inputMode="numeric" maxLength={5} aria-label="시작 시각" value={s} onChange={(x) => setS(x.target.value)} />
        <em>~</em>
        <input className="m-tin" inputMode="numeric" maxLength={5} aria-label="끝 시각" value={e} onChange={(x) => setE(x.target.value)} />
      </div>
      {!(orig && orig.e == null) && (
        <div className="m-seg">
          <button className={isSlot ? 'on' : ''} onClick={() => { setKind('slot'); if (!color) setColor(nextColor(nSlots)); }}>📝 시간 기록</button>
          <button className={isSlot ? '' : 'on'} onClick={() => { setKind('break'); if (!log) setColor(null); }}>☕️ 휴게</button>
        </div>
      )}
      <p className="m-hint">{isSlot ? '무엇을 했는지 남겨요 · 근무시간에 들어가요' : brkEm}</p>
      <input className="m-field" autoComplete="off" placeholder={isSlot ? '무엇을 했나요? (필수)' : '메모 (선택)'} value={text} onChange={(x) => setText(x.target.value)}
        onKeyDown={(x) => { if (x.key === 'Enter' && !x.nativeEvent.isComposing && !locked) save(); }} />
      {!isSlot && (
        <div className="m-chips wrap">{MEMO_CHIPS.map((m) => <button key={m} className={text === m ? 'on' : ''} onClick={() => setText(m)}>{m}</button>)}</div>
      )}
      <div className="m-sheet-f">
        {o.ref && <button className="m-btn off" onClick={() => { ws.deleteSpan(date, o.ref as SpanRef); onClose(); }}>삭제</button>}
        <button className="m-btn go" disabled={locked} onClick={save}>저장</button>
      </div>
    </Sheet>
  );
}
