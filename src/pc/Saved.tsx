/**
 * 저장됨 — 메모 · D-Day · 습관 (v3 renderLater · svGroups · v3.1.262 고정) — 마크업 · 클래스는 v3 와 같다
 * ★ 메모는 원본을 가리킨다. 오른쪽 칸은 상세 · 주간 뷰와 같은 편집기라, 여기서 고친 줄이 곧 그 날 · 그 주의 메모다
 * ★ 오른쪽 칸은 메모만 연다. D-Day · 습관은 줄을 누르면 다른 자리와 같은 창 (v3.1.208)
 * ★ 메시지는 옮기지 않는다 (대화는 웹에 없다 — 2026-10-27 소유자)
 * ★ 가운데 열이 680px 보다 좁으면 한 장씩 — 목록 → 상세. 뒤로는 머리줄의 «저장됨» (v3 svNarrow)
 */
import { useRef } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { ddLabel, type DDay } from '../domain/dday';
import { hbFreqLabel, type Habit } from '../domain/habits';
import { dayTitle, useSaved } from '../ui/useSaved';
import { MemoBm, NoteEditor } from './NoteEditor';

const PIN_SVG = <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.4 3.2l4.4 4.4-1.9.7-2.8 2.8.4 3.3-1.3 1.3-6.3-6.3 1.3-1.3 3.3.4 2.8-2.8.7-1.9Z" /><path d="M7 13l-3.6 3.6" /></svg>

export function SavedView({ ws, hidden, sel, setSel, open, setOpen, onDay, onWeek, onDD, onHb, onTrash }: {
  ws: Workspace; hidden: boolean;
  sel: string; setSel: (id: string) => void; open: boolean; setOpen: (v: boolean) => void;
  onDay: (k: string) => void; onWeek: (k: string) => void; onDD: (it: DDay) => void; onHb: (h: Habit) => void; onTrash: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { sort, memos, dds, hbs, empty } = useSaved(ws, hidden);

  const cur = memos.find((x) => x.id === sel) ?? memos[0] ?? null;
  const pick = (id: string) => {
    setSel(id);
    const w = host.current?.clientWidth ?? 0;
    if (w > 0 && w < 680) setOpen(true);
  };

  let body: React.ReactNode;
  if (empty) {
    body = <div className="sv-empty"><b>저장한 것이 없어요</b>
      <span>Memo 제목 줄의 북마크를 누르거나, D-Day · 습관을 «아카이브로 이동» 하면 여기에 모여요.</span></div>;
  } else {
    body = (
      <div className={`sv${open && cur ? ' open' : ''}${cur ? '' : ' solo'}`}>
        <div className="sv-list" role="list">
          <div className="sv-lh"><label className="sv-sl" htmlFor="svSort">정렬</label>
            <span className="sv-sortw"><span className="sv-sortv" aria-hidden="true">{sort === 'date' ? '날짜순' : '최근 저장순'}</span>
              <svg className="sv-sorti" viewBox="0 0 10 14" aria-hidden="true"><path d="M2 5l3-3 3 3M2 9l3 3 3-3" /></svg>
              <select id="svSort" className="sv-sort" value={sort} onChange={(e) => ws.setSavedSort(e.target.value === 'date' ? 'date' : 'saved')}>
                <option value="saved">최근 저장순</option><option value="date">날짜순</option></select></span></div>
          {memos.length > 0 && <>
            <div className="sv-g" data-g="memo">메모 <em>{memos.length}</em></div>
            {memos.map((x) => (
              <button key={x.id} type="button" className={`sv-it is-memo${x.id === cur?.id ? ' on' : ''}${x.pinnedAt ? ' pinned' : ''}`}
                aria-current={x.id === cur?.id} onClick={() => pick(x.id)}>
                <span className="t"><span className={`sv-kind ${x.kind}`}>{x.kind === 'week' ? '주간' : '일간'}</span><b>{x.title}</b>
                  {x.pinnedAt ? <span className="sv-pinmark" aria-label="고정됨">{PIN_SVG}</span> : null}</span>
                <span className={`s${x.gone ? ' gone' : ''}`}>{x.sub}</span>
              </button>
            ))}
          </>}
          {dds.length > 0 && <>
            <div className="sv-g" data-g="dd">D-Day <em>{dds.length}</em></div>
            {dds.map(({ it }) => (
              <div key={it.id} className="sv-ddr">
                <button type="button" className="sv-it sv-ddm" data-tip="눌러서 고치기" onClick={() => onDD(it)}>
                  <span className="t">{it.emoji && <span className="lt-em">{it.emoji}</span>}<b>{it.title}</b></span>
                  <span className="s">{dayTitle(it.date)} · {ddLabel(it.date, ws.today)}{it.note ? ` · ${it.note}` : ''}</span></button>
              </div>
            ))}
          </>}
          {hbs.length > 0 && <>
            <div className="sv-g" data-g="hb">습관 <em>{hbs.length}</em></div>
            {hbs.map(({ h }) => (
              <div key={h.id} className="sv-ddr">
                <button type="button" className="sv-it sv-ddm" data-tip="눌러서 고치기" onClick={() => onHb(h)}>
                  <span className="t">{h.emoji && <span className="lt-em">{h.emoji}</span>}<b>{h.title}</b></span>
                  <span className="s">{hbFreqLabel(h)} · {dayTitle(h.start)}부터</span></button>
              </div>
            ))}
          </>}
        </div>
        {cur && (
          <section className="sv-detail" aria-label={`${cur.title} Memo`}>
            <div className="sv-dh"><span className={`sv-kind ${cur.kind}`}>{cur.kind === 'week' ? '주간' : '일간'}</span>
              {/* 제목이 곧 길 — 그 메모가 사는 페이지로 (v3.1.209) */}
              <h3><button className="sv-tl" type="button" onClick={() => (cur.kind === 'week' ? onWeek(cur.key) : onDay(cur.key))}>{cur.title}</button></h3>
              <span className="sp" />
              <button className={`sv-pin${cur.pinnedAt ? ' on' : ''}`} type="button" aria-pressed={!!cur.pinnedAt}
                aria-label={cur.pinnedAt ? '고정 풀기' : '맨 위에 고정'} data-tip={cur.pinnedAt ? '고정 풀기' : '맨 위에 고정'}
                onClick={() => ws.pinSaved(cur.id)}>{PIN_SVG}</button>
              <MemoBm ws={ws} kind={cur.kind} k={cur.key} />
            </div>
            {cur.gone
              ? <div className="sv-gone">원본 하루가 휴지통에 있어요. 휴지통에서 복원하면 여기서 다시 고칠 수 있어요.
                <button className="btn ghost sm" type="button" onClick={onTrash}>휴지통 열기</button></div>
              : <>
                <NoteEditor key={cur.id} ws={ws} date={cur.key} area={cur.kind === 'week' ? 'wmemo' : 'memo'} title="" ph="메모를 입력하세요" icon={null} onDay={onDay} />
                <p className="sv-sync">{cur.kind === 'week' ? `${cur.title} 주간 뷰` : `${cur.title} 상세`}와 같은 메모예요. 여기서 고치면 원본에, 원본에서 고치면 여기에 바로 반영돼요.</p>
              </>}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className={`view${hidden ? '' : ' on'}`} id="view-later">
      <div className="dash sv-host" id="later" ref={host}>{body}</div>
    </div>
  );
}
