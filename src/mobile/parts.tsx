/**
 * 모바일 공통 조각 — 시트 · 시각 칸 · 할 일 목록 · 습관 줄 · 자정 넘김 안내
 * ★ 동작은 전부 `ws` (useWorkspace) 를 부른다. 여기서 규칙을 새로 만들지 않는다
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Workspace } from '../app/useWorkspace';
import { plainText } from '../domain/todos/inline';
import { appendBlock, carriedInto, flatten, isHead, type BlockArea, type Row } from '../domain/todos/tree';
import { hbOfDay } from '../domain/habits';
import { addDays, dateOf, hhmm, keyOf, normTime } from '../ui/v3fmt';

/** 닫기 — 글자 대신 ✕ */
export const CloseX = ({ onClick }: { onClick: () => void }) => (
  <button className="m-close" onClick={onClick} aria-label="닫기">
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
  </button>
);

/**
 * 아래에서 올라오는 시트. ★ body 에 바로 그린다 — 하루 상세 페이지 안에 그리면 그 층에 갇혀
 * 하단 메뉴가 시트 아래쪽(저장 · 삭제 줄)을 덮었다
 */
export function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="m-sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m-sheet" role="dialog" aria-label={title}>
        <div className="m-sheet-h"><b>{title}</b>{sub && <span>{sub}</span>}<span className="m-sp" /><CloseX onClick={onClose} /></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 24시간 HH:MM 입력 — 이 앱의 시각 표기는 전부 24시간제다 (v3 fmtClock). 기기 시계 설정을 안 따른다 */
export function TimeBox({ value, label, onCommit, onBad }: { value: string; label: string; onCommit: (v: string) => void; onBad: () => void }) {
  return (
    <input className="m-tin" type="text" inputMode="numeric" maxLength={5} placeholder="--:--" defaultValue={value} key={value} aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => {
        const raw = e.target.value;
        if (!raw.trim()) { e.target.value = value; return; }
        const hm = normTime(raw);
        if (!hm) { onBad(); e.target.value = value; return; }
        e.target.value = hm;
        if (hm !== value) onCommit(hm);
      }} />
  );
}

/**
 * 할 일 · 메모 — 그 날 적은 줄 (+ 오늘이면 지난 날의 못 끝낸 줄 D+N). 규칙은 PC 와 같은 함수(tree.ts)
 * 폰에서는 체크 · 글자 고치기 · 추가 · 지우기. 들여쓰기 · 제목은 PC 에서 (보이는 모양은 같다)
 */
export function Todos({ ws, date, area }: { ws: Workspace; date: string; area: BlockArea }) {
  const [adding, setAdding] = useState('');
  const own = flatten(ws.blocks, date, area);
  const carried = area === 'today' && date === ws.today ? carriedInto(ws.blocks, date) : [];
  const rows: { row: Row; from?: string }[] = [
    ...own.map((row) => ({ row })),
    ...carried.flatMap((c) => [{ row: c.root, from: c.fromDate }, ...c.kids.map((k) => ({ row: k, from: c.fromDate }))]),
  ];
  const add = () => {
    const t = adding.trim();
    if (!t) return;
    ws.addBlock(appendBlock(ws.blocks, date, area, t, { id: ws.newId(), now: Date.now() }));
    setAdding('');
  };
  const isTodo = area === 'today';
  return (
    <section className="m-card m-todo" aria-label={isTodo ? '할 일' : '메모'}>
      <div className="m-sum-t">{isTodo ? (date === ws.today ? '오늘 할 일' : '할 일') : '메모'}</div>
      <ul>
        {rows.map(({ row: { b, depth }, from }) => (
          <li key={b.id} className={`${isHead(b) ? 'head' : ''}${b.done ? ' done' : ''}`} style={{ paddingLeft: depth * 22 }}>
            {b.type === 'check' && <button className={`m-cb${b.done ? ' on' : ''}`} aria-label={b.done ? '완료 취소' : '완료'} onClick={() => ws.toggleBlock(b, date)}>✓</button>}
            {b.type === 'bullet' && <span className="m-bul">•</span>}
            <input className="m-todo-t" defaultValue={plainText(b.text)} key={b.text} aria-label={isTodo ? '할 일' : '메모'}
              onBlur={(e) => { if (e.target.value !== plainText(b.text)) ws.patchBlocks([{ id: b.id, text: e.target.value }]); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }} />
            {from && depth === 0 && <span className="m-born">D+{Math.round((dateOf(date).getTime() - dateOf(from).getTime()) / 86400000)}</span>}
            <button className="m-x sm" aria-label="지우기" onClick={() => ws.removeBlock(b)}>✕</button>
          </li>
        ))}
      </ul>
      <div className="m-add">
        <input value={adding} placeholder={isTodo ? '할 일 추가' : '메모 추가'} aria-label={isTodo ? '할 일 추가' : '메모 추가'} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
        <button className="m-btn sm go" onClick={add} disabled={!adding.trim()}>추가</button>
      </div>
    </section>
  );
}

/**
 * 그 날 체크할 습관 — PC 오늘 패널 고리(hb-ring)처럼 작은 원 + 짧은 이름. 가로로 길어지지 않게 한 줄에 다섯 칸
 * 주 N회는 원 아래 이름 대신 «c/n»
 */
export function HabitChips({ ws, date }: { ws: Workspace; date: string }) {
  const list = hbOfDay(ws.habits, date, ws.offDay);
  if (!list.length) return null;
  const n = list.filter((x) => x.at).length;
  return (
    <section className="m-hb" aria-label="습관">
      <div className="m-sum-t">습관 <em>{n}/{list.length}</em></div>
      <div className="m-hb-l">
        {list.map(({ h, at, week }) => (
          <button key={h.id} className={at ? 'on' : ''} onClick={() => ws.toggleHabit(h.id, date)} aria-pressed={!!at}
            aria-label={`${h.title}${week ? ` (이번 주 ${week.c}/${week.n})` : ''} — ${at ? '했어요' : '아직'}`}>
            <i aria-hidden="true">{at ? '✓' : h.emoji || '·'}</i>
            <span>{h.title}</span>
            {week && <small>{week.c}/{week.n}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}

/** 자정 넘김 (LOGIC §7) — PC 배너와 같은 resolvePending */
export function Pend({ ws, date, onEdit }: { ws: Workspace; date: string; onEdit: () => void }) {
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
