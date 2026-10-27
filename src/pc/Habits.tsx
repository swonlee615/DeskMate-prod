/**
 * 습관 — 세 자리 + 창 (v3 app.js hbRowHtml · renderHabitPanel · hbDayHtml · openHabit, v3.1.236)
 *   근태 전체 뷰 D-Day 상자의 「습관」 탭 · 오늘 패널 원형 고리 · 일간 상세 Today 위 칩 한 줄
 * 내 분석(습관 표)은 활동 단계에서. 스타일은 v3 styles.css
 */
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import {
  HB_MAX_NOTE, HB_MAX_TITLE, HB_SPANS, hbBest, hbEnded, hbFreqLabel, hbOfDay, hbRatio, hbSpanEnd, hbSpanOf, hbStreak, hbWeekCount,
  type Habit, type HbSpan, type HbType,
} from '../domain/habits';
import { DOW, dateOf, hhmm, keyOf } from '../ui/v3fmt';
import { DatePick, DD_EMO, EmojiField, shake } from './pickers';

/** 창을 여는 손잡이 — null = 새로 만들기 */
export type OpenHabit = (h: Habit | null) => void;

const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const mdw = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };
const full = (k: string) => { const d = dateOf(k); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${DOW[d.getDay()]})`; };
const CHECK = <svg viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" /></svg>;

/** ① 목록 줄 — D-Day 줄과 같은 부품. 오른쪽 숫자 = 매일 · 요일은 연속 일수, 주 N회는 이번 주 진행 */
export function HabitRow({ h, ws, onOpen }: { h: Habit; ws: Workspace; onOpen: () => void }) {
  const tk = ws.today, ended = hbEnded(h, tk);
  const st = hbStreak(h, tk, ws.offDay);
  const wk = h.type === 'perWeek' ? hbWeekCount(h, tk) : 0;
  const n = ended ? '종료' : h.type === 'perWeek' ? `${wk}/${h.n}` : `${st.n}일`;
  const sub = ended ? `${hbFreqLabel(h)} · ${md(h.start)} – ${md(h.end!)}`
    : `${hbFreqLabel(h)}${h.note ? ` · ${h.note}` : ''}${h.end ? ` · ~${mdw(h.end)}` : ''}`;
  const tip = ended ? `${h.title}\n${md(h.end!)}에 끝났어요`
    : `${h.title}\n${h.type === 'perWeek' ? `이번 주 ${wk}/${h.n}회 · 연속 ${st.n}주` : `연속 ${st.n}일`}`;
  return (
    <button className={`dd-row hb-row${ended ? ' past' : ''}`} data-hbedit={h.id} title={tip} onClick={onOpen}>
      {h.emoji && <span className="dd-em">{h.emoji}</span>}
      <span className="dd-b"><span className="dd-t">{h.title}</span><span className="dd-s">{sub}</span></span>
      <span className="dd-n">{n}</span>
    </button>
  );
}

/** ② 오늘 패널 — 원형 고리. 주 N회는 이번 주 진행만큼 차다가 다 채우면 초록 + 체크. 없으면 제목째 숨는다 */
export function HabitRings({ ws }: { ws: Workspace }) {
  const tk = ws.today, list = hbOfDay(ws.habits, tk, ws.offDay);
  if (!list.length) return null;
  const C = 2 * Math.PI * 23;
  let nFull = 0;
  const rings = list.map(({ h, at, week }) => {
    const frac = week ? Math.min(1, week.c / week.n) : at ? 1 : 0;
    const done = frac >= 1; if (done) nFull++;
    const meta = week ? `${week.c}/${week.n}` : at ? hhmm(at) : '';
    const say = `${h.title} · ${week ? `이번 주 ${week.c}/${week.n}회` : at ? `${hhmm(at)} 완료` : '아직'}${at ? ' — 누르면 취소' : ''}`;
    return (
      <button key={h.id} type="button" className={`hb-ring${done ? ' full' : frac ? ' part' : ''}`} data-hbtoggle={h.id}
        aria-pressed={!!at} aria-label={say} title={say} onClick={() => ws.toggleHabit(h.id, tk)}>
        <span className="hb-rg">
          <svg viewBox="0 0 52 52" aria-hidden="true"><circle className="tr" cx="26" cy="26" r="23" />
            <circle className="fg" cx="26" cy="26" r="23" strokeDasharray={`${(C * frac).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 26 26)" /></svg>
          <span className="hb-face">{h.emoji || (h.title || '?').slice(0, 1)}</span>
          {done && <span className="hb-ok" aria-hidden="true">{CHECK}</span>}
        </span>
        <span className="hb-rt">{h.title}</span><span className="hb-rm">{meta || ' '}</span>
      </button>
    );
  });
  return (
    <>
      <div className="sec-t hb-sec" id="hbSecT">오늘 습관 <span className="hb-cnt" id="hbCnt">{nFull} / {list.length}</span></div>
      <div className="hb-rings" id="hbRings">{rings}</div>
    </>
  );
}

/** ③ 일간 상세 — Today 위 칩 한 줄. 지난 날도 그대로 누른다 (Q11). 앞날 · 해당 없는 날은 안 그린다 */
export function HabitStrip({ ws, date }: { ws: Workspace; date: string }) {
  if (date > ws.today) return null;
  const list = hbOfDay(ws.habits, date, ws.offDay);
  if (!list.length) return null;
  return (
    <div className="hb-strip" aria-label="습관"><span className="hb-sl">습관</span>
      {list.map(({ h, at, week }) => {
        const meta = week ? `${week.c}/${week.n}` : at ? hhmm(at) : '';
        return (
          <button key={h.id} type="button" className={`hb-chip${at ? ' on' : ''}`} data-hbtoggle={h.id} aria-pressed={!!at}
            title={`${h.title} · ${hbFreqLabel(h)}${at ? ' — 누르면 취소' : ''}`} onClick={() => ws.toggleHabit(h.id, date)}>
            <i className="hb-cb" aria-hidden="true">{at ? CHECK : null}</i>
            <span>{h.emoji ? `${h.emoji} ` : ''}{h.title}</span>{meta && <em>{meta}</em>}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────── 창 (v3 #hbModal) — D-Day 창과 같은 형식 · 높이 고정

export function HabitModal({ ws, h, onClose, onSaved }: { ws: Workspace; h: Habit | null; onClose: () => void; onSaved?: () => void }) {
  const tk = ws.today;
  const live = h ? ws.habits.find((x) => x.id === h.id) ?? h : null;
  const [emoji, setEmoji] = useState(h ? h.emoji : DD_EMO[12]);
  const [title, setTitle] = useState(h?.title ?? '');
  const [note, setNote] = useState(h?.note ?? '');
  const [type, setType] = useState<HbType>(h?.type ?? 'daily');
  const [days, setDays] = useState<number[]>(h?.days ?? [1, 2, 3, 4, 5]);
  const [n, setN] = useState(h?.n ?? 3);
  const [skipOff, setSkipOff] = useState(h ? h.skipOff !== false : true);
  const [start, setStart] = useState(h?.start ?? tk);
  const [endOn, setEndOn] = useState(!!h?.end);
  const [span, setSpan] = useState<HbSpan>(h?.end ? hbSpanOf(h.start, h.end) : '1m');
  const [endK, setEndK] = useState(h?.end ?? '');
  const [cal, setCal] = useState<'start' | 'end' | null>(null);
  const [msg, setMsg] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);
  const endBtn = useRef<HTMLButtonElement>(null);
  const sig = `${emoji}|${title}|${note}|${type}|${days.join('')}|${n}|${skipOff}|${start}|${endOn}|${span}|${endK}`;
  const snap = useRef(sig);
  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 30); }, []);

  const end = span === 'custom' ? endK : hbSpanEnd(start, span);
  const archived = !!live?.archivedAt;

  const tryClose = () => {
    if (sig === snap.current) { onClose(); return; }
    shake(boxRef.current);
    ws.warn('적던 내용이 있어요 — 닫으려면 «취소» 를 눌러 주세요');
  };
  const save = () => {
    if (!title.trim()) { nameRef.current?.focus(); setMsg('어떤 습관인지 적어 주세요.'); return; }
    if (type === 'days' && !days.length) { setMsg('요일을 하나 이상 골라 주세요.'); return; }
    if (endOn && !end) { setMsg('끝나는 날을 골라 주세요.'); return; }
    const bad = ws.saveHabit(live?.id ?? null, { emoji, title, note, type, days, n, skipOff, start, end: endOn ? end : null });
    if (bad) { setMsg(bad); return; }
    if (!live) onSaved?.();
    onClose();
  };
  const pickSpan = (k: HbSpan) => { setSpan(k); if (k === 'custom' && !endK) setEndK(hbSpanEnd(start, '1m') ?? ''); };
  // 줄 어디를 눌러도 그 줄의 스위치를 누른 것이다 (v3.1.227)
  const rowClick = (sw: string, fn: () => void) => (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest(sw)) fn(); };

  let sum: React.ReactNode = null;
  if (live) {
    const st = hbStreak(live, tk, ws.offDay), best = hbBest(live, tk, ws.offDay);
    const q = hbRatio(live, keyOf(new Date(dateOf(tk).getFullYear(), dateOf(tk).getMonth(), 1)), tk, tk, ws.offDay);
    sum = <div className="hb-sum" id="hbSum"><span>연속 <b>{st.n}{st.unit}</b></span><span>이번 달 <b>{q.v == null ? '—' : `${Math.round(q.v * 100)}%`}</b></span><span>최장 <b>{best.n}{best.unit}</b></span></div>;
  }

  return (
    <div className="modal-bg open" id="hbModal" onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (cal) setCal(null); else onClose(); }
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && !(e.target as HTMLElement).hasAttribute('data-emoin')) { e.preventDefault(); save(); }
      }}>
      <div className="modal hb-modal" ref={boxRef} style={{ width: 'min(400px,92vw)' }}>
        <h3 id="hbTitle">{h ? '습관 수정' : '습관 추가'}</h3>
        <div className="modal-body">
          {sum}
          <EmojiField id="hb" value={emoji} onChange={setEmoji} />
          <div className="field">
            <label htmlFor="hbName">타이틀</label>
            <input id="hbName" ref={nameRef} placeholder="예 · 물 2L 마시기" maxLength={HB_MAX_TITLE} autoComplete="off" value={title} onChange={(e) => { setTitle(e.target.value); setMsg(''); }} />
          </div>
          <div className="field">
            <label htmlFor="hbNote">설명</label>
            <input id="hbNote" placeholder="간단한 설명을 입력하세요" maxLength={HB_MAX_NOTE} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label>주기</label>
            <div className="hb-seg" id="hbType" role="radiogroup" aria-label="주기">
              {([['daily', '매일'], ['days', '요일 지정'], ['perWeek', '주 N회']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" data-hbtype={k} className={type === k ? 'on' : undefined} aria-checked={type === k} onClick={() => setType(k)}>{l}</button>
              ))}
            </div>
            {/* 높이 32px 고정 — 어느 쪽이든 아래 줄이 움직이지 않는다 */}
            <div className="hb-subrow" id="hbSub">
              {type === 'days' ? [1, 2, 3, 4, 5, 6, 7].map((v) => (
                <button key={v} type="button" className={`hb-pill${days.includes(v) ? ' on' : ''}`} data-hbday={v} aria-pressed={days.includes(v)}
                  onClick={() => setDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v].sort()))}>{'월화수목금토일'[v - 1]}</button>
              )) : type === 'perWeek' ? <>
                <span className="hb-sw">주</span>
                {[1, 2, 3, 4, 5, 6].map((v) => <button key={v} type="button" className={`hb-pill${n === v ? ' on' : ''}`} data-hbn={v} aria-pressed={n === v} onClick={() => setN(v)}>{v}</button>)}
                <span className="hb-sw">회</span>
              </> : <span className="hb-hint">매일 오늘 패널에 나타납니다</span>}
            </div>
          </div>
          <div className="field">
            <label>시작일</label>
            <button className="dd-date" id="hbStartBtn" type="button" ref={startBtn} onClick={() => setCal((c) => (c === 'start' ? null : 'start'))}>
              <span id="hbStartTx">{full(start)}{start === tk ? ' · 오늘' : ''}</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2.2" /><path d="M3 8.4h14M7 3v3M13 3v3" /></svg>
            </button>
            <div className={`ses-msg${msg ? ' bad' : ''}`} id="hbMsg">{msg}</div>
          </div>
          <div className={`dd-arch hb-endrow${endOn ? ' on' : ''}`} id="hbEndRow">
            <div className="hb-endtop" onClick={rowClick('#hbEnd', () => { setEndOn((v) => !v); setCal(null); })}>
              <div className="tx"><b>끝나는 날 지정</b><span id="hbEndNote">{endOn && end
                ? `${full(end)}까지 · ${Math.round((dateOf(end).getTime() - dateOf(start).getTime()) / 864e5) + 1}일`
                : '끄면 끝나는 날 없이 계속 기록합니다.'}</span></div>
              <button className="tgl" id="hbEnd" type="button" role="switch" aria-checked={endOn} aria-label="끝나는 날 지정" onClick={() => { setEndOn((v) => !v); setCal(null); }} />
            </div>
            {endOn && (
              <div className="hb-spans" id="hbSpans">
                <div className="hb-spanbtns" id="hbSpanBtns">
                  {HB_SPANS.map(([k, l]) => <button key={k} type="button" className={`hb-pill${span === k ? ' on' : ''}`} data-hbspan={k} aria-pressed={span === k} onClick={() => pickSpan(k)}>{l}</button>)}
                </div>
                {span === 'custom' && (
                  <button className="dd-date" id="hbEndBtn" type="button" ref={endBtn} onClick={() => setCal((c) => (c === 'end' ? null : 'end'))}>
                    <span id="hbEndTx">{endK ? full(endK) : '날짜를 골라 주세요'}</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2.2" /><path d="M3 8.4h14M7 3v3M13 3v3" /></svg>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={`dd-arch${skipOff ? ' on' : ''}`} id="hbSkipRow" onClick={rowClick('#hbSkip', () => setSkipOff((v) => !v))}>
            <div className="tx"><b>쉬는 날 제외</b><span>연차 · 병가인 날은 해당일에서 빼고 셉니다.</span></div>
            <button className="tgl" id="hbSkip" type="button" role="switch" aria-checked={skipOff} aria-label="쉬는 날 제외" onClick={() => setSkipOff((v) => !v)} />
          </div>
          {live && (
            <div className={`dd-arch${archived ? ' on' : ''}`} id="hbArchRow" onClick={rowClick('#hbArch', () => ws.archiveHabit(live.id, !archived))}>
              <div className="tx"><b>아카이브로 이동</b><span id="hbArchS">{archived ? '「저장됨」 에 보관 중이에요 — 끄면 습관 목록으로 돌아와요.' : '목록에서 숨기고, 「저장됨」 메뉴로 이동합니다. 기록은 남습니다.'}</span></div>
              <button className="tgl" id="hbArch" type="button" role="switch" aria-checked={archived} aria-label="아카이브로 이동" onClick={() => ws.archiveHabit(live.id, !archived)} />
            </div>
          )}
        </div>
        <div className="modal-foot">
          {live && <button className="btn ghost" id="hbDel" style={{ marginRight: 'auto' }} onClick={() => { ws.deleteHabit(live.id); onClose(); }}>삭제</button>}
          <button className="btn ghost" id="hbCancel" onClick={onClose}>취소</button>
          <button className="btn primary" id="hbSave" onClick={save}>완료</button>
        </div>
      </div>
      {cal === 'start' && <DatePick id="hbCal" value={start} today={tk} anchor={startBtn} onClose={() => setCal(null)}
        onPick={(k) => { setStart(k); if (endK && endK < k) setEndK(k); setCal(null); }} />}
      {cal === 'end' && <DatePick id="hbCal" value={endK} today={tk} min={start} anchor={endBtn} onClose={() => setCal(null)}
        onPick={(k) => { setEndK(k < start ? start : k); setCal(null); }} />}
    </div>
  );
}
