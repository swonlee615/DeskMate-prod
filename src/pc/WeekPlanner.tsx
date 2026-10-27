/**
 * 주간 플래너 — v3 weekPlannerHtml · renderWeekPlanner 의 마크업 · 클래스 그대로
 *
 * ★ 판정(어느 칸 · 어느 묶음 · 옮기기)은 전부 src/domain/todos/week.ts. 여기서는 그리고 손만 단다
 * ★ 주간에 그리는 것은 바깥 할 일만 (결함표 Q8 — v3 그대로). 딸린 줄 · 줄 종류 바꾸기는 상세에서
 * ★ 날짜는 콤보와 끌기 둘 다로 — 둘 다 moveItem 하나를 부른다 (v3 wpMove 와 같은 이유)
 * 아직 안 옮긴 것: 주 메모 책갈피 · 그림 붙여넣기 막기 안내 · 스크롤 경계 페이드
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import { descendants, rangeRate, type Tri } from '../domain/todos/tree';
import {
  addAfter, addItem, cellGroups, listGroups, moveItem, weekDays, weekItems, weekKeyOf, type Change, type WGroup, type WItem,
} from '../domain/todos/week';
import { addDays, dateOf, fmtDur, hhmm, keyOf, leaveOf, weekTag } from '../ui/v3fmt';
import { attDotCls, Calendar, CHEV, workMinutes } from './Worklog';
import { NoteEditor } from './NoteEditor';
import { DDayBox, type OpenDDay } from './DDay';

const WD_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WD_KO = ['월', '화', '수', '목', '금', '토', '일'];
const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
function fmtDurH(mins: number) {
  const t = (Math.round(mins) / 60).toFixed(1);
  return (t.endsWith('.0') ? t.slice(0, -2) : t) + 'H';
}

/* 묶음 접기 — 보고 있는 영역 안에서만 먹는다 (v3.1.53 · grid / todo / done). 기기별 편의라 브라우저 저장소에 */
const FOLD_KEY = 'dm.wpFold';
const foldKey = (title: string | null, scope: string) => `${scope}\u0001${title ?? '\u0000'}`;
function loadFold(): Record<string, 1> { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}'); } catch { return {}; } }

const MEMO_IC = (
  <svg className="nh-ic" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.6 5.6h14.8" /><path d="M2.6 10h14.8" /><path d="M2.6 14.4h9.4" />
  </svg>
);

interface Drag { id: string; el: HTMLElement; x: number; y: number; on: boolean; fromList: boolean; ghost?: HTMLDivElement }

export function WeekPlanner({ ws, onOpenDay, onDD }: { ws: Workspace; onOpenDay: (date: string) => void; onDD: OpenDDay }) {
  const { blocks, days, now, today, wpWeek: wk } = ws;
  const keys = weekDays(wk);
  const isThis = wk === weekKeyOf(today);
  const [keep, setKeep] = useState<string | null>(null);
  const [fold, setFold] = useState(loadFold);
  const focusNext = useRef<{ id: string; scope: 'g' | 's' } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const items = weekItems(blocks, wk, today, keep);
  const byId = new Map(items.map((x) => [x.b.id, x]));

  // ── 요약 — 근태에서 나온다 (v3 그대로)
  let total = 0, dcnt = 0;
  for (const k of keys) { const d = days[k]; if (d?.onAt != null) { dcnt++; total += workMinutes(d, now); } }
  const rate = rangeRate(blocks, keys[0], keys[6]);   // 처음 적힌 주 기준 (v3.1.140 · Q7)

  const nid = () => ({ id: ws.newId(), now: Date.now() });
  const apply = (c: Change | null, msg?: string) => {
    if (!c) return;
    ws.editBlocks(c.patches, c.created);
    if (msg) ws.say(msg, { label: '되돌리기', run: () => ws.undoBlocks() });
  };

  // ── 옮기기 — 콤보 · 끌기가 함께 쓰는 한 곳 (v3 wpMove)
  const move = (it: WItem, to: { day?: string; title?: string | null }) => {
    const c = moveItem(blocks, it.b, to, wk, today, nid());
    if (!c) return;
    const kids = descendants(blocks, it.b.id).length;
    const where = to.day === undefined
      ? (to.title == null ? '묶음에서 뺐어요' : `「${to.title}」 로 옮겼어요`)
      : to.day ? `${md(to.day)} 로 옮겼어요` : '날짜 미정으로 옮겼어요';
    apply(c, `${where}${kids ? ` (딸린 ${kids}줄도 함께)` : ''}`);
  };

  const add = (day: string, title: string | null, scope: 'g' | 's') => {
    const c = addItem(blocks, wk, day, title, nid());
    const nb = c.created[c.created.length - 1];
    apply(c);
    setKeep(nb.id);
    focusNext.current = { id: nb.id, scope };
  };

  useLayoutEffect(() => {
    const f = focusNext.current;
    if (!f || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(`${f.scope === 'g' ? '.wp-grid' : '.wp-side'} .txt[data-edit="${CSS.escape(f.id)}"]`)
      ?? root.current.querySelector<HTMLElement>(`.txt[data-edit="${CSS.escape(f.id)}"]`);
    if (el) {
      focusNext.current = null;
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    }
  });

  const toggleFold = (k: string) => {
    const next = { ...fold };
    if (next[k]) delete next[k]; else next[k] = 1;
    setFold(next);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* 이번 화면만 */ }
  };

  // ── 끌어서 옮기기 — 네이티브 드래그 대신 포인터로 (v3.1.15 — 글자 긁기와 안 부딪히게)
  const drag = useRef<Drag | null>(null);
  const live = useRef({ blocks, items: byId, move });
  live.current = { blocks, items: byId, move };
  useEffect(() => {
    const zoneAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el?.closest) return null;
      return (el.closest('.wp-gh') ?? el.closest('.wp-day[data-wpk], .wp-list')) as HTMLElement | null;
    };
    const headDay = (z: HTMLElement) => (z.closest('.wp-day') as HTMLElement | null)?.dataset.wpk;
    /** 놓아도 아무 일 없는 자리인가 — 조각을 흐린다 */
    const same = (z: HTMLElement, it: WItem, d: Drag) => {
      if (z.classList.contains('wp-gh')) {
        const t = z.dataset.wptitle === '\u0000' ? null : z.dataset.wptitle!;
        if (z.classList.contains('bare')) return it.title == null;
        const hd = headDay(z);
        return it.title === t && (!hd || hd === it.key);
      }
      if (z.classList.contains('wp-list')) return d.fromList || it.key === '';
      return it.key === z.dataset.wpk;
    };
    const clear = () => document.querySelectorAll('.wp-drop').forEach((x) => x.classList.remove('wp-drop'));
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const it = live.current.items.get(d.id);
      if (!it) return;
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        d.on = true;
        d.el.classList.add('wp-dragging');
        document.body.classList.add('wp-dnd');
        window.getSelection()?.removeAllRanges();
        const kids = descendants(live.current.blocks, d.id).length;
        const gh = document.createElement('div');
        gh.className = 'wp-ghost';
        gh.textContent = it.b.text + (kids ? `  +${kids}줄` : '');
        document.body.appendChild(gh);
        d.ghost = gh;
      }
      d.ghost!.style.left = `${e.clientX + 14}px`;
      d.ghost!.style.top = `${e.clientY + 12}px`;
      const z = zoneAt(e.clientX, e.clientY);
      document.querySelectorAll('.wp-drop').forEach((x) => { if (x !== z) x.classList.remove('wp-drop'); });
      if (z) z.classList.add('wp-drop');
      const no = !z || same(z, it, d);
      d.ghost!.classList.toggle('no', no);
      if (z && !no && z.classList.contains('wp-gh')) {
        const t = z.dataset.wptitle === '\u0000' ? '' : z.dataset.wptitle;
        const hd = headDay(z);
        d.ghost!.dataset.into = z.classList.contains('bare') ? '→ 묶음에서 빼기' : hd && hd !== it.key ? `→ ${t} · ${md(hd)}` : `→ ${t}`;
      } else delete d.ghost!.dataset.into;
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      document.body.classList.remove('wp-dnd');
      d.ghost?.remove();
      d.el.classList.remove('wp-dragging');
      clear();
      if (!d.on) return;
      const it = live.current.items.get(d.id);
      const z = zoneAt(e.clientX, e.clientY);
      if (!it || !z || same(z, it, d)) return;
      if (z.classList.contains('wp-gh')) {
        if (z.classList.contains('bare')) { live.current.move(it, { title: null }); return; }
        const hd = headDay(z);
        live.current.move(it, { title: z.dataset.wptitle!, ...(hd ? { day: hd } : {}) });
        return;
      }
      live.current.move(it, { day: z.classList.contains('wp-list') ? '' : z.dataset.wpk! });
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
  }, []);
  const grab = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest('.wp-it') as HTMLElement;
    drag.current = { id, el, x: e.clientX, y: e.clientY, on: false, fromList: !!el.closest('.wp-list') };
  };

  // ── 글 고치기 — 상세와 같은 줄을 그대로 고친다 (사본 없음)
  const saveTimer = useRef(new Map<string, number>());
  const lastTyped = useRef(0);
  const flush = (id: string, el: HTMLElement) => {
    const t = saveTimer.current.get(id); if (t) { window.clearTimeout(t); saveTimer.current.delete(id); }
    const b = blocks.find((x) => x.id === id);
    const text = el.textContent ?? '';
    if (b && b.text !== text) ws.patchBlocks([{ id, text }], false);
  };
  const ed = {
    input: (it: WItem, el: HTMLElement) => {
      lastTyped.current = Date.now();
      const m = saveTimer.current;
      const t = m.get(it.b.id); if (t) window.clearTimeout(t);
      m.set(it.b.id, window.setTimeout(() => { m.delete(it.b.id); flush(it.b.id, el); }, 400));
    },
    blur: (it: WItem, el: HTMLElement) => {
      flush(it.b.id, el);
      // 비워 둔 채 떠난 줄은 남기지 않는다 — 사람이 만든 적 없는 빈 체크박스가 남지 않게 (v3 B11)
      if (!(el.textContent ?? '').trim() && !descendants(blocks, it.b.id).length) {
        ws.patchBlocks([{ id: it.b.id, deletedAt: Date.now() }], false);
      }
      if (keep === it.b.id) setKeep(null);
    },
    key: (e: React.KeyboardEvent<HTMLDivElement>, it: WItem, side: boolean) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      const el = e.currentTarget;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (ws.lastEditAt() > lastTyped.current) { e.preventDefault(); flush(it.b.id, el); ws.undoBlocks(); }
        return;
      }
      if (e.key === 'Escape') { el.blur(); return; }
      if (e.key === 'Tab') { e.preventDefault(); ws.say('들여쓰기 · 줄 종류는 날짜를 눌러 상세에서 바꿔요'); return; }   // Q8
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!(el.textContent ?? '').trim()) { el.blur(); return; }
        flush(it.b.id, el);
        const c = addAfter(blocks, it, wk, nid());
        const nb = c.created[c.created.length - 1];
        apply(c);
        setKeep(nb.id);
        focusNext.current = { id: nb.id, scope: side ? 's' : 'g' };
      }
    },
  };

  const itemEl = (it: WItem, side: boolean) => (
    <WpItem key={it.b.id} it={it} side={side} keys={keys}
      onCheck={() => ws.toggleBlock(it.b, it.key || today)}
      onMove={(v) => move(it, { day: v })}
      onBadge={() => onOpenDay(it.key || today)}
      onGrab={grab(it.b.id)} ed={ed} />
  );

  const head = (g: WGroup, scope: 'grid' | 'todo' | 'done', bare: boolean, addDay: string | null) => {
    if (g.title == null && !bare) return null;
    const k = foldKey(g.title, scope);
    const f = !!fold[k];
    return (
      <div className="wp-ghw" key={`h:${k}`}>
        <button className={`wp-gh${f ? ' fold' : ''}${g.title == null ? ' bare' : ''}`} data-wpfold={k}
          data-wptitle={g.title ?? '\u0000'} data-tip={f ? `펼치기 (${g.items.length}개)` : '접기'} onClick={() => toggleFold(k)}>
          <i className="wp-ar">▸</i><b>{g.title ?? '미분류'}</b>{f && <em>{g.items.length}</em>}
        </button>
        {addDay != null && !f && (
          <button className="wp-gh-add" onClick={(e) => { e.stopPropagation(); add(addDay, g.title, addDay ? 'g' : 's'); }}>＋</button>
        )}
      </div>
    );
  };
  const groupsEl = (gs: WGroup[], scope: 'grid' | 'todo' | 'done', addDay: string | null, side: boolean) => {
    const bare = side && gs.some((g) => g.title != null);
    return gs.map((g) => (
      <div key={`${scope}:${g.title ?? ''}`} style={{ display: 'contents' }}>
        {head(g, scope, bare, addDay)}
        {!fold[foldKey(g.title, scope)] && g.items.map((it) => itemEl(it, side))}
      </div>
    ));
  };

  const tag = weekTag(dateOf(wk));
  const undone = listGroups(items, false);
  const done = listGroups(items, true);
  const doneN = done.reduce((a, g) => a + g.items.length, 0);

  return (
    <div style={{ display: 'contents' }} ref={root}>
      <div className="wp-head">
        <button className="wp-nav" data-wpmove="-1" onClick={() => ws.setWpWeek(keyOf(addDays(dateOf(wk), -7)))}>{CHEV(-1)}</button>
        <h2 className="wp-title">{tag.month}월 {tag.no}주</h2>
        <button className="wp-nav" data-wpmove="1" onClick={() => ws.setWpWeek(keyOf(addDays(dateOf(wk), 7)))}>{CHEV(1)}</button>
        {!isThis && <button className="wp-back" data-wpmove="0" onClick={() => ws.setWpWeek(weekKeyOf(today))}>오늘</button>}
      </div>
      <div className="wp-body">
        <section className="wp-main">
          <i className="wp-fade-t" aria-hidden="true" />
          <div className="wp-grid">
            {keys.map((k, i) => {
              const dt = dateOf(k);
              const d = days[k];
              const lv = leaveOf(d?.leave);
              let att: React.ReactNode = <span className="wp-att"><i className="none">–</i></span>;
              if (d?.leave) {
                att = (
                  <span className="lv-cell on" style={lv[2] ? { '--lv': lv[2] } as React.CSSProperties : undefined}>
                    <span className="lv-chip2"><i className="lv-dot" /><b>{lv[1]}</b></span>
                  </span>
                );
                if (d.onAt != null) att = <span className="wp-lvw"><span className="wp-att"><i className={`dot ${attDotCls(d, now, GOAL_HOURS)}`} /><b>{fmtDur(workMinutes(d, now))}</b></span>{att}</span>;
              } else if (d?.onAt != null) {
                att = (
                  <span className="wp-att"><i className={`dot ${attDotCls(d, now, GOAL_HOURS)}`} />
                    <span className="rg">{hhmm(d.onAt)} ~ {d.offAt != null ? hhmm(d.offAt) : '근무 중'}</span> <b>{fmtDur(workMinutes(d, now))}</b></span>
                );
              }
              const cls = ['wp-day', i === 5 && 'sat', i === 6 && 'sun', k === today && 'today'].filter(Boolean).join(' ');
              return (
                <div key={k} className={cls} data-wpk={k}>
                  <button className="wp-dh" data-wpday={k} data-tip={`${dt.getMonth() + 1}월 ${dt.getDate()}일 상세 열기`} onClick={() => onOpenDay(k)}>
                    <span className="wp-dn">{dt.getDate()}</span><span className="wp-dw">{WD_EN[i]}</span>
                    <span className="wp-sp" />{att}
                  </button>
                  <div className="wp-db">{groupsEl(cellGroups(items, k), 'grid', k, false)}</div>
                  <button className="wp-add" data-wpadd={k} data-tip="이 날에 할 일 추가" onClick={() => add(k, null, 'g')}>＋ 할 일</button>
                </div>
              );
            })}
            <div className="wp-cal"><div className="wl-cal">
              <Calendar month={ws.calMonth} setMonth={ws.setCalMonth} today={today} days={days} onOpen={onOpenDay} />
            </div></div>
          </div>
          <NoteEditor ws={ws} date={wk} area="wmemo" title="Memo" ph="메모를 입력하세요" icon={MEMO_IC} />
          <i className="wp-fade-b" aria-hidden="true" />
        </section>
        <div className="wp-col">
          <aside className="wp-side">
            <div className="wp-sh">
              <div className="wp-sr"><h3>이번 주 할 일</h3><em>{rate.done} / {rate.n}</em>
                <button className="wp-addw" data-wpaddw="1" data-tip="이번 주에 할 일 추가 — 요일은 나중에(「미정」)" onClick={() => add('', null, 's')}>＋</button>
              </div>
              <div className="wp-bar"><i style={{ width: `${rate.n ? Math.round((rate.done / rate.n) * 100) : 0}%` }} /></div>
              <div className="wp-msum">
                <span>근무 <b>{fmtDurH(total)}</b><i>·</i></span><span>출근 <b>{dcnt}일</b><i>·</i></span>
                <span>일 평균 <b>{dcnt ? fmtDurH(total / dcnt) : '–'}</b></span>
              </div>
            </div>
            <div className="wp-scroll">
              <div className="wp-list">
                {items.length ? <>
                  {groupsEl(undone, 'todo', '', true)}
                  {doneN > 0 && <><div className="wp-sep">완료 {doneN}</div>{groupsEl(done, 'done', null, true)}</>}
                </> : (
                  <div className="wp-empty">이 주에는 적어 둔 할 일이 없어요.<br />위 <b>＋</b> 로 시작하거나, 날짜 칸에 바로 적어도 돼요.</div>
                )}
              </div>
            </div>
          </aside>
          <section className="wp-ddc" aria-label="D-Day"><DDayBox ws={ws} onOpen={onDD} /></section>
        </div>
      </div>
    </div>
  );
}

function WpItem({ it, side, keys, onCheck, onMove, onBadge, onGrab, ed }: {
  it: WItem; side: boolean; keys: string[];
  onCheck: () => void; onMove: (day: string) => void; onBadge: () => void; onGrab: (e: React.PointerEvent) => void;
  ed: {
    input: (it: WItem, el: HTMLElement) => void; blur: (it: WItem, el: HTMLElement) => void;
    key: (e: React.KeyboardEvent<HTMLDivElement>, it: WItem, side: boolean) => void;
  };
}) {
  const { b, tri } = it;
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mounted.current || (document.activeElement !== el && el.textContent !== b.text)) el.textContent = b.text;
    mounted.current = true;
  }, [b.text]);
  return (
    <div className={`wp-it${b.done ? ' done' : ''}`} data-wpid={b.id}>
      <span className="wp-grip" data-wpdrag={b.id} data-tip="끌어서 다른 날로" onPointerDown={onGrab} />
      <TriBox done={!!b.done} tri={tri} onClick={onCheck} />
      <div className="wp-tx txt" contentEditable suppressContentEditableWarning data-ph="할 일" ref={ref}
        data-edit={b.id} data-area="today" data-wkey={it.key} data-sc={side ? 's' : 'g'}
        onInput={(e) => ed.input(it, e.currentTarget)} onBlur={(e) => ed.blur(it, e.currentTarget)}
        onKeyDown={(e) => ed.key(e, it, side)} />
      {tri && (
        <span className={`wp-sub${tri.state === 'full' ? ' full' : ''}`} data-wpday={it.key} data-wphl={b.id}
          data-tip={`딸린 할 일 ${tri.ok}/${tri.n} — 눌러서 상세로`} onClick={onBadge}>{tri.ok}/{tri.n}</span>
      )}
      {side && (
        <select className={`wp-sel${it.key ? '' : ' none'}`} data-wpmv={b.id} data-tip="다른 날로 옮기기" value={it.key}
          onChange={(e) => onMove(e.target.value)}>
          <option value="">미정</option>
          {keys.map((k, j) => <option key={k} value={k}>{WD_KO[j]}</option>)}
        </select>
      )}
    </div>
  );
}

/** v3 triBox — 딸린 할 일이 일부만 끝났으면 가운데 줄 */
function TriBox({ done, tri, onClick }: { done: boolean; tri: Tri | null; onClick: () => void }) {
  const part = !!tri && tri.ok > 0 && !done;   // v3.1.245
  const tip = tri ? (done ? '누르면 딸린 할 일까지 모두 해제' : tri.state === 'full' ? '딸린 할 일은 다 끝났어요 — 누르면 이 할 일도 완료' : '누르면 딸린 할 일까지 모두 완료')
    : done ? '되돌리기' : '완료로';
  return (
    <span className={`cb${done ? ' on' : part ? ' part' : ''}`} data-tip={tip} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {part ? <i className="cb-dash" /> : '✓'}
    </span>
  );
}
