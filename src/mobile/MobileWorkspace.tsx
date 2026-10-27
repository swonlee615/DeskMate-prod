/**
 * 모바일 화면 — PC(v3) 와 따로 설계하는 레이아웃
 *
 * ★ 데이터 · 동기화 · 근태 버튼 동작은 PC 와 같은 것(`useWorkspace`)을 쓴다. 여기서 다시 만들지 않는다.
 * ★ 모양만 다르다 — 한 손으로 누르기 좋게, 한 화면에 한 가지. 클래스는 전부 `m-` 로 시작해 PC(v3)와 안 섞인다.
 * ★ 색 · 글꼴은 v3 토큰을 그대로 쓴다 (같은 앱으로 보여야 하므로)
 * 하단 탭: 근태 · 주간 · 팀 · 더보기
 */
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS, WEEKS_SHOWN } from '../app/useWorkspace';
import { PRESETS } from '../app/usePomodoro';
import { appendBlock, carriedInto, flatten, isHead, type Row } from '../domain/todos/tree';
import type { Day, Leave } from '../domain/attendance/types';
import { dayGoalMin, dayParts, dayStartMs, openBreak, sessions } from '../domain/attendance/rules';
import { dropSession, removeBreak, sessionRows, sessionWhy, setSessionTime } from '../domain/attendance/edit';
import { AccountDialog } from '../ui/AccountDialog';
import { SyncBadge } from '../ui/SyncBadge';
import {
  addDays, DOW, dateOf, fmtClock, fmtDur, hhmm, keyOf, leaveOf, LEAVES, mmss, normTime, rowDate, weekLabel, weekStart, weekTag,
} from '../ui/v3fmt';
import { MobileWeek } from './MobileWeek';
import './mobile.css';

type Tab = 'att' | 'week' | 'team' | 'more';
const TITLE: Record<Tab, string> = { att: '근태', week: '주간', team: '팀', more: '더보기' };
const mins = (d: Day, now: number) => dayParts(d, now).workMs / 60000;

export function MobileWorkspace({ ws }: { ws: Workspace }) {
  const [tab, setTab] = useState<Tab>('att');
  const [acctOpen, setAcctOpen] = useState(false);
  const t = dateOf(ws.today);

  return (
    <div className="m-app">
      <header className="m-head">
        <h1>{TITLE[tab]}</h1>
        {tab === 'att' && <span className="m-date">{t.getMonth() + 1}월 {t.getDate()}일 ({DOW[t.getDay()]})</span>}
        <span className="m-sp" />
        <SyncBadge s={ws.sync} />
      </header>

      <main className="m-body">
        {tab === 'att' && <AttTab ws={ws} />}
        {tab === 'week' && <MobileWeek ws={ws} />}
        {tab === 'team' && <TeamTab ws={ws} />}
        {tab === 'more' && <MoreTab ws={ws} onAccount={() => setAcctOpen(true)} />}
      </main>

      <nav className="m-tabs" aria-label="하단 탭">
        <TabBtn on={tab === 'att'} onClick={() => setTab('att')} label="근태"
          icon={<><circle cx="10" cy="10" r="7.1" /><path d="M10 5.7v4.5l3 1.8" /></>} />
        <TabBtn on={tab === 'week'} onClick={() => setTab('week')} label="주간"
          icon={<><rect x="3" y="4.2" width="14" height="12.6" rx="2.2" /><path d="M3 8.2h14M7 2.8v2.6M13 2.8v2.6M6.6 11.4h1.6M9.2 11.4h1.6M11.8 11.4h1.6M6.6 14h1.6" /></>} />
        <TabBtn on={tab === 'team'} onClick={() => setTab('team')} label="팀"
          icon={<><circle cx="8" cy="7.4" r="2.9" /><path d="M2.9 16.2c0-2.6 2.3-4.2 5.1-4.2s5.1 1.6 5.1 4.2" /><path d="M13.6 5.1a2.6 2.6 0 0 1 0 4.9M15.2 12.4c1.4.5 2.4 1.7 2.4 3.4" /></>} />
        <TabBtn on={tab === 'more'} onClick={() => setTab('more')} label="더보기"
          icon={<><circle cx="4.6" cy="10" r="1.3" /><circle cx="10" cy="10" r="1.3" /><circle cx="15.4" cy="10" r="1.3" /></>} />
      </nav>

      <div className={`m-toast${ws.toast ? ' show' : ''}`} role="status">
        {ws.toast?.text}
        {ws.toast?.action && <button className="m-toast-act" onClick={ws.toast.action.run}>{ws.toast.action.label}</button>}
      </div>

      {acctOpen && (
        <AccountDialog auth={ws.backend.auth} user={ws.user} pending={ws.sync?.pending ?? 0} onClose={() => setAcctOpen(false)} />
      )}
    </div>
  );
}

function TabBtn({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button className={on ? 'on' : ''} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <svg viewBox="0 0 20 20" aria-hidden="true">{icon}</svg>{label}
    </button>
  );
}

// ───────────────────────────────────────────── 근태 탭

const STATE_LABEL = { none: '출근 전', work: '근무 중', break: '휴식 중', off: '퇴근' } as const;

function AttTab({ ws }: { ws: Workspace }) {
  const { day, now, state } = ws;
  const [sheet, setSheet] = useState<string | null>(null);
  const parts = dayParts(day, now);
  const work = parts.workMs / 60000;
  const goal = dayGoalMin(GOAL_HOURS, day);
  const pct = goal > 0 ? Math.min(100, (work / goal) * 100) : (work > 0 ? 100 : 0);
  const brk = openBreak(day);

  return (
    <>
      {ws.unavailable && <p className="m-note">오프라인이라 이 기기에서 열어 본 적 없는 날은 불러올 수 없어요.</p>}
      {ws.pendingDays.length > 0 && <MPend ws={ws} date={ws.pendingDays[0]} onEdit={() => setSheet(ws.pendingDays[0])} />}

      <section className="m-card m-today" aria-label="오늘">
        <div className="m-state">
          <i className={`m-dot ${state}`} aria-hidden="true" />
          <b>{STATE_LABEL[state]}</b>
          {brk && <span>{mmss((now - brk.s) / 1000)}째</span>}
          {state !== 'none' && day.onAt != null && <span className="m-sp-r">출근 {hhmm(day.onAt)}</span>}
        </div>
        <div className="m-big"><b>{fmtDur(work)}</b><span>/ {+(goal / 60).toFixed(1)}시간</span></div>
        <div className={`m-bar${work > 0 && work >= goal ? ' hit' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <div className="m-meta"><span>휴게 <b>{fmtDur(parts.breakMs / 60000)}</b></span><span>{Math.round(pct)}%</span></div>

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
      </section>

      <button className="m-link m-edit-today" onClick={() => setSheet(ws.today)}>오늘 시각 고치기</button>
      <TodayTodos ws={ws} />
      <FocusCard ws={ws} />
      <WeekSummary ws={ws} />
      <DayList ws={ws} onOpen={setSheet} />
      {sheet && <DaySheet ws={ws} date={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

/**
 * 오늘 할 일 — 오늘 적은 줄 + 지난 날의 못 끝낸 줄(D+N). 규칙은 PC 와 같은 함수(tree.ts)
 * 폰에서는 체크 · 글자 고치기 · 추가 · 지우기만. 들여쓰기 · 제목은 PC 에서 (보이는 모양은 같다)
 */
function TodayTodos({ ws }: { ws: Workspace }) {
  const [adding, setAdding] = useState('');
  const own = flatten(ws.blocks, ws.today, 'today');
  const carried = carriedInto(ws.blocks, ws.today);
  const rows: { row: Row; from?: string }[] = [
    ...own.map((row) => ({ row })),
    ...carried.flatMap((c) => [{ row: c.root, from: c.fromDate }, ...c.kids.map((k) => ({ row: k, from: c.fromDate }))]),
  ];
  const add = () => {
    const t = adding.trim();
    if (!t) return;
    ws.addBlock(appendBlock(ws.blocks, ws.today, 'today', t, { id: ws.newId(), now: Date.now() }));
    setAdding('');
  };
  return (
    <section className="m-card m-todo" aria-label="오늘 할 일">
      <div className="m-sum-t">오늘 할 일</div>
      <ul>
        {rows.map(({ row: { b, depth }, from }) => (
          <li key={b.id} className={`${isHead(b) ? 'head' : ''}${b.done ? ' done' : ''}`} style={{ paddingLeft: depth * 22 }}>
            {b.type === 'check' && <button className={`m-cb${b.done ? ' on' : ''}`} aria-label={b.done ? '완료 취소' : '완료'} onClick={() => ws.toggleBlock(b, ws.today)}>✓</button>}
            {b.type === 'bullet' && <span className="m-bul">•</span>}
            <input className="m-todo-t" defaultValue={b.text} key={b.text} aria-label="할 일"
              onBlur={(e) => { if (e.target.value !== b.text) ws.patchBlocks([{ id: b.id, text: e.target.value }]); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }} />
            {from && depth === 0 && (() => {
              const dd = Math.round((dateOf(ws.today).getTime() - dateOf(from).getTime()) / 86400000);
              return <span className="m-born">D+{dd}</span>;
            })()}
            <button className="m-x sm" aria-label="지우기" onClick={() => ws.removeBlock(b)}>✕</button>
          </li>
        ))}
      </ul>
      <div className="m-add">
        <input value={adding} placeholder="할 일 추가" aria-label="할 일 추가" onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
        <button className="m-btn sm go" onClick={add} disabled={!adding.trim()}>추가</button>
      </div>
    </section>
  );
}

/** 집중 타이머 — 한 줄짜리. 시간 고르기는 PC 처럼 칩으로 */
function FocusCard({ ws }: { ws: Workspace }) {
  const t = ws.timer;
  return (
    <section className="m-card m-focus" aria-label="집중 타이머">
      <div className="m-focus-top">
        <div className="m-focus-clock">
          <b className={t.mode === 'focus' ? '' : 'rest'}>{t.clock}</b>
          <span>{t.label}{t.running ? ' 중' : ' 대기'} · 오늘 {ws.day.pomos ?? 0}회</span>
        </div>
        <button className={`m-btn sm${t.running ? '' : ' go'}`} onClick={t.toggle}>{t.running ? '일시정지' : '시작'}</button>
        <button className="m-btn sm" onClick={t.skip} aria-label="건너뛰기">⏭</button>
      </div>
      <div className="m-bar"><i style={{ width: `${t.pct * 100}%`, background: t.mode === 'focus' ? 'var(--green)' : 'var(--yellow)' }} /></div>
      <div className="m-chips">
        {PRESETS.map((n) => (
          <button key={n} className={t.cfg.focusMin === n ? 'on' : ''} onClick={() => t.setFocusMin(n)}>{n}분</button>
        ))}
      </div>
    </section>
  );
}

function WeekSummary({ ws }: { ws: Workspace }) {
  const ws0 = weekStart(dateOf(ws.today));
  let total = 0, n = 0, onSum = 0;
  for (let i = 0; i < 7; i++) {
    const d = ws.days[keyOf(addDays(ws0, i))];
    if (d?.onAt != null) {
      n++; total += mins(d, ws.now);
      const o = new Date(d.onAt); onSum += o.getHours() * 60 + o.getMinutes();
    }
  }
  const tag = weekTag(dateOf(ws.today));
  return (
    <section className="m-card m-sum" aria-label="이번 주 요약">
      <div className="m-sum-t">{tag.month}월 {tag.no}주</div>
      <div className="m-sum-g">
        <div><b>{fmtDur(total)}</b><span>총 근무</span></div>
        <div><b>{n}일</b><span>출근</span></div>
        <div><b>{fmtDur(n ? total / n : 0)}</b><span>일 평균</span></div>
        <div><b>{n ? fmtClock(onSum / n) : '–'}</b><span>평균 출근</span></div>
      </div>
    </section>
  );
}

function DayList({ ws, onOpen }: { ws: Workspace; onOpen: (k: string) => void }) {
  const nowD = new Date(ws.now);
  const ws0 = weekStart(dateOf(ws.today));
  const weeks: { start: Date; rows: string[] }[] = [];
  for (let w = 0; w < WEEKS_SHOWN; w++) {
    const start = addDays(ws0, -7 * w);
    const rows: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = keyOf(addDays(start, i));
      if (k > ws.today || k === ws.today) continue;           // 오늘은 위 카드에 있다
      const d = ws.days[k];
      if (d && (d.onAt != null || d.leave)) rows.push(k);
    }
    if (rows.length) weeks.push({ start, rows });
  }
  if (!weeks.length) return <p className="m-empty">지난 기록이 여기에 쌓여요.</p>;

  return (
    <>
      {weeks.map((g) => {
        let sum = 0;
        for (const k of g.rows) sum += mins(ws.days[k], ws.now);
        return (
          <section key={keyOf(g.start)} className="m-week">
            <h2>{weekLabel(g.start)} <em>· {fmtDur(sum)}</em></h2>
            <ul className="m-card m-list">
              {g.rows.map((k) => <DayRow key={k} k={k} d={ws.days[k]} now={ws.now} nowD={nowD} onLeave={ws.onLeave} onOpen={() => onOpen(k)} />)}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function DayRow({ k, d, now, nowD, onLeave, onOpen }: { k: string; d: Day; now: number; nowD: Date; onLeave: (k: string, l: Leave) => void; onOpen: () => void }) {
  const rd = rowDate(k, nowD);
  const ses = sessions(d);
  const w = mins(d, now);
  const g = dayGoalMin(GOAL_HOURS, d);
  const lv = leaveOf(d.leave);
  return (
    <li className="m-row" onClick={(e) => { if (!(e.target as HTMLElement).closest('.m-lv')) onOpen(); }}>
      <div className="m-row-l">
        <b>{rd.b}{d.pending && <em className="m-pendtag">확인 필요</em>}</b>
        <span>{ses.length ? `${hhmm(ses[0].on)} – ${ses[ses.length - 1].off != null ? hhmm(ses[ses.length - 1].off as number) : d.pending ? hhmm(d.pending.guessOff) : '근무 중'}` : '출근 기록 없음'}
          {ses.length > 1 ? ` · ${ses.length}회` : ''}</span>
      </div>
      <div className="m-row-r">
        {d.onAt != null && <b className={w > 0 && w >= g ? 'hit' : ''}>{fmtDur(w)}</b>}
        <label className={`m-lv${d.leave ? ' on' : ''}`} style={lv[2] ? { '--lv': lv[2] } as React.CSSProperties : undefined}>
          <i aria-hidden="true" />{lv[1]}
          <select aria-label={`${rd.b} 근태`} value={d.leave} onChange={(e) => onLeave(k, e.target.value as Leave)}>
            {LEAVES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
    </li>
  );
}

// ───────────────────────────────────────────── 자정 넘김 · 하루 고치기

function MPend({ ws, date, onEdit }: { ws: Workspace; date: string; onEdit: () => void }) {
  const d = ws.dayOf(date);
  if (!d.pending) return null;
  const dt = dateOf(date);
  const nx = dateOf(keyOf(addDays(dt, 1)));
  const canCarry = ws.canCarry(date);
  return (
    <section className="m-card m-pend" aria-label="확인 필요">
      <b>⏳ {dt.getMonth() + 1}/{dt.getDate()} 근무가 마무리되지 않았어요</b>
      <p>퇴근을 누르지 않고 자정을 넘겼어요. 어느 쪽인지 알려주시면 그대로 기록할게요.</p>
      <div className="m-pend-a">
        {canCarry && <button className="m-btn go" onClick={() => ws.resolvePending(date, 'carry')}>계속 일했어요 → {nx.getMonth() + 1}/{nx.getDate()} 00:00</button>}
        <button className={`m-btn${canCarry ? '' : ' go'}`} onClick={() => ws.resolvePending(date, 'at')}>{hhmm(d.pending.guessOff)}에 퇴근했어요</button>
        <button className="m-btn" onClick={onEdit}>시각 직접 입력</button>
      </div>
    </section>
  );
}

/** 24시간 HH:MM 입력 — 이 앱의 시각 표기는 전부 24시간제다 (v3 fmtClock). 기기 시계 설정을 안 따른다 */
function TimeBox({ value, label, onCommit, onBad }: { value: string; label: string; onCommit: (v: string) => void; onBad: () => void }) {
  return (
    <input className="m-tin" type="text" inputMode="numeric" maxLength={5} placeholder="--:--" defaultValue={value} aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => {
        const raw = e.target.value;
        if (!raw.trim()) { e.target.value = value; return; }
        const hm = normTime(raw);
        if (!hm) { onBad(); e.target.value = value; return; }
        e.target.value = hm;
        onCommit(hm);
      }} />
  );
}

const hmOf = (ms: number | null) => (ms == null ? '' : hhmm(ms));
const msAt = (date: string, hm: string) => { const [h, m] = hm.split(':').map(Number); return dayStartMs(date) + (h * 60 + m) * 60000; };

/** 하루 고치기 — 차수 시각 · 휴게 지우기 · 차수 지우기. 규칙은 PC 와 같은 함수(edit.ts) */
function DaySheet({ ws, date, onClose }: { ws: Workspace; date: string; onClose: () => void }) {
  const d = ws.dayOf(date);
  const rows = sessionRows(d);
  const rd = rowDate(date, new Date(ws.now));
  const set = (i: number, which: 'on' | 'off', hm: string) => {
    if (!hm) return;
    let why = '';
    const ok = ws.editDay(date, (day) => {
      const r = setSessionTime(day, i, which, msAt(date, hm));
      if (!r.ok) { why = sessionWhy(r, hhmm); return null; }
      return r.day;
    }, `${i + 1}차 ${which === 'on' ? '출근' : '퇴근'}을 ${hm}로 고쳤어요`);
    if (!ok) ws.say(why || '시간을 확인해 주세요');
  };
  return (
    <div className="m-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m-sheet" role="dialog" aria-label={`${rd.b} 고치기`}>
        <div className="m-sheet-h"><b>{rd.b}</b><span>{rd.span}</span><span className="m-sp" /><button className="m-link" onClick={onClose}>닫기</button></div>
        {d.pending && <p className="m-note">퇴근 시각을 적으면 확정돼요.</p>}
        {d.onAt == null && <p className="m-empty">출근 기록이 없어요.</p>}
        {rows.map((r, i) => (
          <div className="m-ses" key={`${i}-${r.on}-${r.off}`}>
            <span className="k">{i + 1}차</span>
            <TimeBox value={hmOf(r.on)} label={`${i + 1}차 출근`} onCommit={(v) => { if (v !== hmOf(r.on)) set(i, 'on', v); }} onBad={() => ws.say('시각을 HH:MM 으로 적어 주세요')} />
            <em>–</em>
            <TimeBox value={hmOf(r.off ?? (d.pending ? d.pending.guessOff : null))} label={`${i + 1}차 퇴근`}
              onCommit={(v) => { if (v !== hmOf(r.off) || d.pending) set(i, 'off', v); }} onBad={() => ws.say('시각을 HH:MM 으로 적어 주세요')} />
            {d.onAt != null && (
              <button className="m-x" aria-label={`${i + 1}차 지우기`} onClick={() => ws.editDay(date, (day) => dropSession(day, i), `${i + 1}차 기록을 삭제했어요`)}>✕</button>
            )}
          </div>
        ))}
        {d.breaks.some((b) => b.kind === 'break' && b.e != null) && <div className="m-sheet-sub">휴게</div>}
        {d.breaks.map((b, i) => (b.kind === 'break' && b.e != null ? (
          <div className="m-ses" key={`b${i}`}>
            <span className="k">☕️</span>
            <span className="m-brk-t">{hhmm(b.s)} – {hhmm(b.e)} · {fmtDur((b.e - b.s) / 60000)}{b.note ? ` · ${b.note}` : ''}</span>
            <button className="m-x" aria-label="휴게 지우기" onClick={() => ws.editDay(date, (day) => removeBreak(day, i), '휴게를 지웠어요')}>✕</button>
          </div>
        ) : null))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── 팀 · 더보기

function TeamTab({ ws }: { ws: Workspace }) {
  return (
    <>
      <ul className="m-card m-list">
        <li className="m-row">
          <span className="m-av">{ws.initial}<i className={`m-dot ${ws.state}`} /></span>
          <div className="m-row-l"><b>{ws.nick} <small>(나)</small></b><span>{STATE_LABEL[ws.state]}</span></div>
        </li>
      </ul>
      <p className="m-empty">아직 팀원이 없어요.</p>
    </>
  );
}

function MoreTab({ ws, onAccount }: { ws: Workspace; onAccount: () => void }) {
  return (
    <ul className="m-card m-list">
      <li className="m-row">
        <div className="m-row-l"><b>{ws.nick}</b><span>{ws.user.email ?? (ws.backend.mode === 'local' ? '개발 모드 · 이 기기에만 저장' : '')}</span></div>
      </li>
      {ws.backend.mode === 'cloud' && (
        <li className="m-row"><button className="m-link" onClick={onAccount}>계정 · 로그아웃</button></li>
      )}
    </ul>
  );
}
