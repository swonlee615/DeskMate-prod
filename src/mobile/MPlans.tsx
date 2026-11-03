/**
 * 모바일 「D-Day | 습관」 상자 — PC 근태 전체 뷰의 D-Day 상자(v3 DDayBox, 알약 탭)와 같은 자리 · 같은 묶음
 * ★ 저장은 PC 창과 같은 ws.saveDDay · pinDDay · saveHabit … (규칙은 dday.ts · habits.ts)
 * ★ 날짜는 폰 기본 날짜 고르기(`input type=date`), 이모지는 폰 이모지 자판
 */
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { DD_PIN_MAX, ddDateLabel, ddLabel, ddLive, type DDay } from '../domain/dday';
import { HB_SPANS, hbFreqLabel, hbLive, hbSpanEnd, hbSpanOf, hbStreak, type Habit, type HbSpan, type HbType } from '../domain/habits';
import { Sheet } from './parts';

export function PlansBox({ ws }: { ws: Workspace }) {
  const [tab, setTab] = useState<'dd' | 'hb'>('dd');
  const [dd, setDd] = useState<DDay | 'new' | null>(null);
  const [hb, setHb] = useState<Habit | 'new' | null>(null);
  const dds = ddLive(ws.ddays, ws.today);
  const hbs = hbLive(ws.habits, ws.today);
  return (
    <section className="m-card m-plans" aria-label="D-Day · 습관">
      <div className="m-plans-h">
        <div className="m-seg">
          <button className={tab === 'dd' ? 'on' : ''} onClick={() => setTab('dd')}>D-Day</button>
          <button className={tab === 'hb' ? 'on' : ''} onClick={() => setTab('hb')}>습관</button>
        </div>
        <button className="m-x" aria-label={tab === 'dd' ? 'D-Day 추가' : '습관 추가'} onClick={() => (tab === 'dd' ? setDd('new') : setHb('new'))}>＋</button>
      </div>
      {tab === 'dd' && (dds.length ? (
        <ul className="m-list">
          {dds.map((x) => (
            <li key={x.id} className="m-row" onClick={() => setDd(x)}>
              <span className="m-emo">{x.emoji || '📌'}</span>
              <div className="m-row-l"><b>{x.title}{x.pinned && <small> · 고정</small>}</b><span>{ddDateLabel(x.date, ws.today)}</span></div>
              <div className="m-row-r"><b className="m-ddn">{ddLabel(x.date, ws.today)}</b></div>
            </li>
          ))}
        </ul>
      ) : <p className="m-empty">＋를 눌러 다가오는 날을 적어 두세요.</p>)}
      {tab === 'hb' && (hbs.length ? (
        <ul className="m-list">
          {hbs.map((h) => { const st = hbStreak(h, ws.today, ws.offDay); return (
            <li key={h.id} className="m-row" onClick={() => setHb(h)}>
              <span className="m-emo">{h.emoji || '✅'}</span>
              <div className="m-row-l"><b>{h.title}</b><span>{hbFreqLabel(h)}{h.end ? ` · ${h.end}까지` : ''}</span></div>
              <div className="m-row-r"><b>{st.n}{st.unit}</b><small className="m-hint">연속</small></div>
            </li>
          ); })}
        </ul>
      ) : <p className="m-empty">＋를 눌러 매일 할 일을 습관으로 만들어 보세요.</p>)}

      {dd && <DDaySheet ws={ws} x={dd === 'new' ? null : dd} onClose={() => setDd(null)} />}
      {hb && <HabitSheet ws={ws} h={hb === 'new' ? null : hb} onClose={() => setHb(null)} />}
    </section>
  );
}

function DDaySheet({ ws, x, onClose }: { ws: Workspace; x: DDay | null; onClose: () => void }) {
  const [emoji, setEmoji] = useState(x?.emoji ?? '📌');
  const [title, setTitle] = useState(x?.title ?? '');
  const [date, setDate] = useState(x?.date ?? ws.today);
  const [note, setNote] = useState(x?.note ?? '');
  const save = () => {
    if (!ws.saveDDay(x?.id ?? null, { emoji, title, note, date })) { ws.warn('이름과 날짜를 적어 주세요'); return; }
    onClose();
  };
  return (
    <Sheet title={x ? 'D-Day 고치기' : '새 D-Day'} sub={date ? ddLabel(date, ws.today) : undefined} onClose={onClose}>
      <div className="m-ses">
        <input className="m-tin m-emo-in" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="이모지" />
        <input className="m-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="무슨 날인가요?" autoFocus={!x} />
      </div>
      <input className="m-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
      <input className="m-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택)" />
      {x && (
        <div className="m-sheet-f">
          <button className="m-btn" onClick={() => { if (!ws.pinDDay(x.id, !x.pinned)) ws.warn(`고정은 ${DD_PIN_MAX}개까지예요`); else onClose(); }}>{x.pinned ? '고정 풀기' : '오늘 화면에 고정'}</button>
          <button className="m-btn" onClick={() => { ws.archiveDDay(x.id, true); onClose(); }}>보관</button>
          <button className="m-btn off" onClick={() => { ws.deleteDDay(x.id); onClose(); }}>삭제</button>
        </div>
      )}
      <button className="m-btn go" onClick={save}>저장</button>
    </Sheet>
  );
}

const TYPES: [HbType, string][] = [['daily', '매일'], ['days', '요일 지정'], ['perWeek', '주 N회']];

function HabitSheet({ ws, h, onClose }: { ws: Workspace; h: Habit | null; onClose: () => void }) {
  const [emoji, setEmoji] = useState(h?.emoji ?? '✅');
  const [title, setTitle] = useState(h?.title ?? '');
  const [note, setNote] = useState(h?.note ?? '');
  const [type, setType] = useState<HbType>(h?.type ?? 'daily');
  const [days, setDays] = useState<number[]>(h?.days ?? [1, 2, 3, 4, 5]);
  const [n, setN] = useState(h?.n ?? 3);
  const [skipOff, setSkipOff] = useState(h ? h.skipOff !== false : true);
  const [start, setStart] = useState(h?.start ?? ws.today);
  const [span, setSpan] = useState<HbSpan | 'none'>(h?.end ? hbSpanOf(h.start, h.end) : 'none');
  const [endK, setEndK] = useState(h?.end ?? '');
  const end = span === 'none' ? null : span === 'custom' ? endK || null : hbSpanEnd(start, span);
  const save = () => {
    const bad = ws.saveHabit(h?.id ?? null, { emoji, title, note, type, days, n, skipOff, start, end });
    if (bad) { ws.warn(bad); return; }
    onClose();
  };
  return (
    <Sheet title={h ? '습관 고치기' : '새 습관'} onClose={onClose}>
      <div className="m-ses">
        <input className="m-tin m-emo-in" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="이모지" />
        <input className="m-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="어떤 습관인가요?" autoFocus={!h} />
      </div>
      <div className="m-seg">{TYPES.map(([k, l]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{l}</button>)}</div>
      {type === 'days' && (
        <div className="m-chips">{'월화수목금토일'.split('').map((l, i) => (
          <button key={l} className={days.includes(i + 1) ? 'on' : ''} onClick={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])}>{l}</button>
        ))}</div>
      )}
      {type === 'perWeek' && (
        <div className="m-chips">{[1, 2, 3, 4, 5, 6].map((k) => <button key={k} className={n === k ? 'on' : ''} onClick={() => setN(k)}>{k}회</button>)}</div>
      )}
      <label className="m-check"><input type="checkbox" checked={skipOff} onChange={(e) => setSkipOff(e.target.checked)} /> 연차 · 병가인 날은 빼기</label>
      <div className="m-sheet-sub">시작</div>
      <input className="m-field" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작일" />
      <div className="m-sheet-sub">기간</div>
      <div className="m-chips wrap">
        <button className={span === 'none' ? 'on' : ''} onClick={() => setSpan('none')}>계속</button>
        {HB_SPANS.map(([k, l]) => <button key={k} className={span === k ? 'on' : ''} onClick={() => { setSpan(k); if (k === 'custom' && !endK) setEndK(hbSpanEnd(start, '1m') ?? ''); }}>{l}</button>)}
      </div>
      {span === 'custom' && <input className="m-field" type="date" value={endK} min={start} onChange={(e) => setEndK(e.target.value)} aria-label="끝나는 날" />}
      {end && span !== 'custom' && <p className="m-hint">{end}까지</p>}
      <input className="m-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택)" />
      {h && (
        <div className="m-sheet-f">
          <button className="m-btn" onClick={() => { ws.archiveHabit(h.id, true); onClose(); }}>보관</button>
          <button className="m-btn off" onClick={() => { ws.deleteHabit(h.id); onClose(); }}>삭제</button>
        </div>
      )}
      <button className="m-btn go" onClick={save}>저장</button>
    </Sheet>
  );
}
