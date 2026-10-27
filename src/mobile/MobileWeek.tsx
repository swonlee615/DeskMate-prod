/**
 * 모바일 주간 — PC 주간 플래너(v3 weekPlannerHtml)와 같은 판정(week.ts)을 폰 모양으로
 *
 * ★ PC 주간 오른쪽 「이번 주 할 일」 상자와 같은 모양 (2026-10-28 소유자 — 요일별 칸은 폰에서 뺐다)
 *   달성 막대 · 근무 · 출근 · 일 평균 · 묶음별 목록 · 완료 · 줄마다 요일 칩
 * ★ 요일 칩을 누르면 옮기기 시트 — PC 콤보 · 끌기와 같은 moveItem 하나를 부른다
 * 아직 안 옮긴 것: 주 메모 · 딸린 줄 펼치기 (폰에서는 바깥 할 일만 — PC 주간과 같다)
 */
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { descendants, rangeRate } from '../domain/todos/tree';
import { addItem, listGroups, moveItem, weekDays, weekItems, weekKeyOf, type Change, type WGroup, type WItem } from '../domain/todos/week';
import { addDays, dateOf, DOW, keyOf, weekTag } from '../ui/v3fmt';
import { workMinutes } from '../pc/Worklog';

const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function MobileWeek({ ws }: { ws: Workspace }) {
  const { blocks, days, now, today, wpWeek: wk } = ws;
  const [sheet, setSheet] = useState<WItem | null>(null);
  const keys = weekDays(wk);
  const isThis = wk === weekKeyOf(today);
  const items = weekItems(blocks, wk, today);
  const rate = rangeRate(blocks, keys[0], keys[6]);
  const tag = weekTag(dateOf(wk));
  let total = 0;
  for (const k of keys) { const d = days[k]; if (d?.onAt != null) total += workMinutes(d, now); }

  const nid = () => ({ id: ws.newId(), now: Date.now() });
  const apply = (c: Change | null, msg?: string) => {
    if (!c) return;
    ws.editBlocks(c.patches, c.created);
    if (msg) ws.say(msg, { label: '되돌리기', run: () => ws.undoBlocks() });
  };
  const add = (day: string, text: string) => {
    const c = addItem(blocks, wk, day, null, nid());
    c.created[c.created.length - 1].text = text;
    apply(c);
  };
  const move = (it: WItem, to: { day?: string; title?: string | null }) => {
    const c = moveItem(blocks, it.b, to, wk, today, nid());
    const kids = descendants(blocks, it.b.id).length;
    const where = to.day === undefined ? (to.title == null ? '묶음에서 뺐어요' : `「${to.title}」 로 옮겼어요`)
      : to.day ? `${md(to.day)} 로 옮겼어요` : '날짜 미정으로 옮겼어요';
    apply(c, `${where}${kids ? ` (딸린 ${kids}줄도 함께)` : ''}`);
    setSheet(null);
  };
  const row = (it: WItem) => <MItem key={it.b.id} it={it} ws={ws} onMore={() => setSheet(it)} />;

  const undone = listGroups(items, false);
  const done = listGroups(items, true);
  const doneN = done.reduce((a, g) => a + g.items.length, 0);
  const dcnt = keys.filter((k) => days[k]?.onAt != null).length;
  const pct = rate.n ? Math.round((rate.done / rate.n) * 100) : 0;

  return (
    <>
      <div className="m-wk-h">
        <button className="m-x" aria-label="이전 주" onClick={() => ws.setWpWeek(keyOf(addDays(dateOf(wk), -7)))}>‹</button>
        <div className="m-wk-t"><b>{tag.month}월 {tag.no}주</b></div>
        <button className="m-x" aria-label="다음 주" onClick={() => ws.setWpWeek(keyOf(addDays(dateOf(wk), 7)))}>›</button>
        {!isThis && <button className="m-link" onClick={() => ws.setWpWeek(weekKeyOf(today))}>이번 주</button>}
      </div>

      <section className="m-card m-wps" aria-label="이번 주 할 일">
        <div className="m-wps-h">
          <h3>{isThis ? '이번 주 할 일' : '그 주 할 일'}</h3><em>{rate.done} / {rate.n}</em>
        </div>
        <div className="m-wps-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="m-wps-sum">
          <span>근무 <b>{fmtDurH(total)}</b></span><i>·</i><span>출근 <b>{dcnt}일</b></span><i>·</i>
          <span>일 평균 <b>{dcnt ? fmtDurH(total / dcnt) : '–'}</b></span>
        </div>
        <div className="m-wps-l">
          {items.length ? <>
            <Groups gs={undone} row={row} />
            {doneN > 0 && <><div className="m-wps-sep"><span>완료 {doneN}</span></div><Groups gs={done} row={row} /></>}
          </> : <p className="m-empty">이 주에는 적어 둔 할 일이 없어요. 아래에 적으면 요일 미정으로 들어가요.</p>}
          <MAdd onAdd={(t) => add('', t)} />
        </div>
      </section>

      {sheet && <MoveSheet it={sheet} keys={keys} items={items} today={today} onMove={(to) => move(sheet, to)}
        onDelete={() => { ws.removeBlock(sheet.b); setSheet(null); }} onClose={() => setSheet(null)} />}
    </>
  );
}

/** 0.0H — PC 주간 플래너 표기 (v3 fmtDurH) */
function fmtDurH(mins: number) {
  const t = (Math.round(mins) / 60).toFixed(1);
  return (t.endsWith('.0') ? t.slice(0, -2) : t) + 'H';
}

function Groups({ gs, row }: { gs: WGroup[]; row: (it: WItem) => React.ReactNode }) {
  return <>{gs.map((g) => (
    <div key={g.title ?? '\u0000'} className="m-wg">
      {g.title != null && <div className="m-wg-t">{g.title}</div>}
      {g.items.map(row)}
    </div>
  ))}</>;
}

function MItem({ it, ws, onMore }: { it: WItem; ws: Workspace; onMore: () => void }) {
  const { b, tri } = it;
  const part = !!tri && tri.ok > 0 && !b.done;   // v3.1.245 — 하위를 다 끝내도 상위는 «-»
  return (
    <div className={`m-wi${b.done ? ' done' : ''}`}>
      <button className={`m-cb${b.done ? ' on' : part ? ' part' : ''}`} aria-label={b.done ? '완료 취소' : '완료'}
        onClick={() => ws.toggleBlock(b, it.key || ws.today)}>{part ? '–' : '✓'}</button>
      <input className="m-todo-t" defaultValue={b.text} key={b.text} aria-label="할 일"
        onBlur={(e) => { if (e.target.value !== b.text) ws.patchBlocks([{ id: b.id, text: e.target.value }]); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }} />
      {tri && <span className={`m-wi-sub${tri.state === 'full' ? ' full' : ''}`}>{tri.ok}/{tri.n}</span>}
      {it.key && b.date < it.key && !b.done && <span className="m-born">D+{Math.round((dateOf(it.key).getTime() - dateOf(b.date).getTime()) / 86400000)}</span>}
      <button className={`m-wday${it.key ? '' : ' none'}`} aria-label="요일 · 묶음 옮기기 · 지우기" onClick={onMore}>
        {it.key ? DOW[dateOf(it.key).getDay()] : '미정'}<i aria-hidden="true">▾</i>
      </button>
    </div>
  );
}

function MAdd({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  const go = () => { const t = v.trim(); if (t) { onAdd(t); setV(''); } };
  return (
    <div className="m-add">
      <input value={v} placeholder="할 일 추가" aria-label="할 일 추가" onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) go(); }} />
      {v.trim() && <button className="m-btn sm go" onClick={go}>추가</button>}
    </div>
  );
}

/** ⋯ 시트 — 날짜(그 주 7일 + 미정) · 묶음 · 지우기. 끌기 대신 */
function MoveSheet({ it, keys, items, today, onMove, onDelete, onClose }: {
  it: WItem; keys: string[]; items: WItem[]; today: string;
  onMove: (to: { day?: string; title?: string | null }) => void; onDelete: () => void; onClose: () => void;
}) {
  const titles = [...new Set(items.map((x) => x.title).filter((t): t is string => t != null))];
  return (
    <div className="m-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m-sheet" role="dialog" aria-label="할 일 옮기기">
        <div className="m-sheet-h"><b className="m-sheet-it">{it.b.text || '(빈 할 일)'}</b><span className="m-sp" /><button className="m-link" onClick={onClose}>닫기</button></div>
        <div className="m-sheet-sub">날짜</div>
        <div className="m-pick">
          {keys.map((k) => (
            <button key={k} className={it.key === k ? 'on' : ''} onClick={() => onMove({ day: k })}>
              {DOW[dateOf(k).getDay()]}<small>{k === today ? '오늘' : md(k)}</small>
            </button>
          ))}
          <button className={it.key === '' ? 'on wide' : 'wide'} onClick={() => onMove({ day: '' })}>미정</button>
        </div>
        {titles.length > 0 && <>
          <div className="m-sheet-sub">묶음</div>
          <div className="m-pick">
            {titles.map((t) => <button key={t} className={`wide${it.title === t ? ' on' : ''}`} onClick={() => onMove({ title: t })}>{t}</button>)}
            <button className={`wide${it.title == null ? ' on' : ''}`} onClick={() => onMove({ title: null })}>묶음 없음</button>
          </div>
        </>}
        <button className="m-btn off" onClick={onDelete}>지우기</button>
      </div>
    </div>
  );
}
