/**
 * 모바일 「저장됨」 — PC 저장됨(v3 renderLater)과 같은 목록 · 같은 정렬 (`useSaved`)
 * ★ 폰은 한 장씩: 목록 → 메모를 누르면 그 메모만 (뒤로는 머리의 ‹ 저장됨). PC 의 좁은 창과 같다
 * ★ 메모 칸은 하루 상세 · 주간과 같은 편집기라, 여기서 고친 줄이 곧 그 날 · 그 주의 메모다
 * ★ D-Day · 습관은 홈 상자와 같은 시트 — 보관된 것이라 «목록으로 되돌리기» 가 보인다
 */
import { useEffect, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { ddLabel, type DDay } from '../domain/dday';
import { hbFreqLabel, type Habit } from '../domain/habits';
import { dayTitle, useSaved } from '../ui/useSaved';
import { MemoBm, NoteEditor } from '../pc/NoteEditor';
import { DDaySheet, HabitSheet } from './MPlans';

const PIN_SVG = <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.4 3.2l4.4 4.4-1.9.7-2.8 2.8.4 3.3-1.3 1.3-6.3-6.3 1.3-1.3 3.3.4 2.8-2.8.7-1.9Z" /><path d="M7 13l-3.6 3.6" /></svg>;

export function MSaved({ ws, hidden, open, setOpen, goDay, goWeek, goTrash }: {
  ws: Workspace; hidden: boolean; open: string | null; setOpen: (id: string | null) => void;
  goDay: (k: string) => void; goWeek: (k: string) => void; goTrash: () => void;
}) {
  const { sort, memos, dds, hbs, empty } = useSaved(ws, hidden);
  const [dd, setDd] = useState<DDay | null>(null);
  const [hb, setHb] = useState<Habit | null>(null);
  const cur = open ? memos.find((x) => x.id === open) : null;
  // 열어 둔 메모를 저장됨에서 빼면 목록으로 (머리의 ‹ 저장됨 도 같이 걷힌다)
  useEffect(() => { if (open && !cur) setOpen(null); }, [open, cur, setOpen]);

  if (cur) return (
    <section className="m-sv-d" aria-label={`${cur.title} Memo`}>
      <div className="m-sv-dh">
        <span className={`m-sv-kind ${cur.kind}`}>{cur.kind === 'week' ? '주간' : '일간'}</span>
        <button className="m-sv-tl" onClick={() => (cur.kind === 'week' ? goWeek(cur.key) : goDay(cur.key))}>{cur.title} ›</button>
        <span className="m-sp" />
        <button className={`m-sv-pin${cur.pinnedAt ? ' on' : ''}`} aria-pressed={!!cur.pinnedAt}
          aria-label={cur.pinnedAt ? '고정 풀기' : '맨 위에 고정'} onClick={() => ws.pinSaved(cur.id)}>{PIN_SVG}</button>
        <MemoBm ws={ws} kind={cur.kind} k={cur.key} />
      </div>
      {cur.gone
        ? <div className="m-card m-sv-gone"><p>원본 하루가 휴지통에 있어요. 휴지통에서 복원하면 여기서 다시 고칠 수 있어요.</p>
          <button className="m-btn" onClick={goTrash}>휴지통 열기</button></div>
        : <>
          <div className="m-dsec m-notes"><NoteEditor key={cur.id} ws={ws} date={cur.key} area={cur.kind === 'week' ? 'wmemo' : 'memo'} title="" ph="메모를 입력하세요" icon={null} onDay={goDay} /></div>
          <p className="m-hint m-sv-sync">{cur.kind === 'week' ? `${cur.title} 주간` : `${cur.title} 하루 상세`}의 메모와 같아요. 어느 쪽에서 고쳐도 바로 반영돼요.</p>
        </>}
    </section>
  );

  if (empty) return (
    <div className="m-soon">
      <b>저장한 것이 없어요</b>
      <p>Memo 제목 줄의 북마크를 누르거나, D-Day와 습관을 «보관»하면 여기에 모여요.</p>
    </div>
  );

  return <>
    <div className="m-seg" role="tablist" aria-label="정렬">
      <button role="tab" aria-selected={sort === 'saved'} className={sort === 'saved' ? 'on' : ''} onClick={() => ws.setSavedSort('saved')}>최근 저장순</button>
      <button role="tab" aria-selected={sort === 'date'} className={sort === 'date' ? 'on' : ''} onClick={() => ws.setSavedSort('date')}>날짜순</button>
    </div>
    {memos.length > 0 && <>
      <h3 className="m-set-h">메모 {memos.length}</h3>
      <ul className="m-card m-list">
        {memos.map((x) => (
          <li key={x.id} className="m-row" onClick={() => setOpen(x.id)}>
            <div className="m-row-l"><b><span className={`m-sv-kind ${x.kind}`}>{x.kind === 'week' ? '주간' : '일간'}</span>{x.title}</b>
              <span className={x.gone ? 'm-sv-gone-s' : undefined}>{x.sub}</span></div>
            {x.pinnedAt ? <span className="m-sv-pinmark" aria-label="고정됨">{PIN_SVG}</span> : null}
          </li>
        ))}
      </ul>
    </>}
    {dds.length > 0 && <>
      <h3 className="m-set-h">D-Day {dds.length}</h3>
      <ul className="m-card m-list">
        {dds.map(({ it }) => (
          <li key={it.id} className="m-row" onClick={() => setDd(it)}>
            <span className="m-emo">{it.emoji || '📌'}</span>
            <div className="m-row-l"><b>{it.title}</b><span>{dayTitle(it.date)}{it.note ? `, ${it.note}` : ''}</span></div>
            <div className="m-row-r"><b className="m-ddn">{ddLabel(it.date, ws.today)}</b></div>
          </li>
        ))}
      </ul>
    </>}
    {hbs.length > 0 && <>
      <h3 className="m-set-h">습관 {hbs.length}</h3>
      <ul className="m-card m-list">
        {hbs.map(({ h }) => (
          <li key={h.id} className="m-row" onClick={() => setHb(h)}>
            <span className="m-emo">{h.emoji || '✅'}</span>
            <div className="m-row-l"><b>{h.title}</b><span>{hbFreqLabel(h)}, {dayTitle(h.start)}부터</span></div>
          </li>
        ))}
      </ul>
    </>}
    {dd && <DDaySheet ws={ws} x={dd} onClose={() => setDd(null)} />}
    {hb && <HabitSheet ws={ws} h={hb} onClose={() => setHb(null)} />}
  </>;
}
