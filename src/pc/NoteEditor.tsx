/**
 * 일간 상세의 Today · Memo — v3 노트 편집기 (noteHtml · blockHtml) 의 모양과 키 그대로
 *
 * ★ 저장은 트리(줄마다 부모), 이월은 «보여주기» — src/domain/todos/tree.ts
 *   · 오늘 화면: 오늘 적은 줄 아래에 «지난 날의 못 끝낸 줄» 이 D+N 뱃지를 달고 함께 보인다
 *     같은 이름의 묶음(제목)이 오늘에 있으면 그 밑에, 없으면 맨 아래에 그 묶음 이름으로
 *   · 지난 날 화면: 못 끝낸 줄은 v3 의 «→ 넘김» 모양 그대로 (글자는 못 고치고, 체크는 된다 =
 *     «그 날 끝낸 일» — v3 의 흔적 체크와 같은 뜻)
 *   · 끝낸 날 = 체크한 화면의 날짜
 * ★ 키: Enter 새 줄 · Backspace(맨 앞) 지우기/합치기/내어쓰기 · Tab/⇧Tab · ↑↓ · `# ` `## ` `### ` 제목 · `- ` 글머리 · `[] ` 할 일
 *   한글 조합 중 Enter 는 무시한다
 * ★ 부분 체크(LOGIC §6-3) — 딸린 할 일이 있는 줄은 `ok/n` 이 항상 서고, 일부만 끝나면 가운데 줄(-)
 * ★ ⠿ 끌어서 옮기기 — 덩어리째, 같은 묶음의 형제 자리로 · ⌘Z — 이 기기의 마지막 동작 (글자 치기는 브라우저 몫)
 * 아직 안 옮긴 것: 여러 줄 고르기 · 이미지 · `@날짜` · 글자 서식
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import {
  appendBlock, carriedInto, continuesToToday, descendants, flatten, indent, insertBelow, isHead, markdownType,
  moveChunk, outdent, removeEmpty, triOf, type Block, type BlockArea, type Patch, type Row, type Tri,
} from '../domain/todos/tree';
import { dateOf, hhmm } from '../ui/v3fmt';

const HEAD_N: Record<string, number> = { h1: 1, h2: 2, h3: 3 };

/** 화면에 그릴 한 줄 */
interface Line {
  row: Row;
  /** 지난 날에서 오늘로 함께 보이는 줄 (오늘 화면) */
  carriedFrom?: string;
  /** 지난 날 화면에서 «→ 넘김» 모양 (글자 못 고침) */
  moved?: boolean;
  /** 지난 날 묶음 이름만 빌려 온 제목 (오늘에 같은 이름의 묶음이 없을 때) */
  ghostHead?: string;
}

/** 커서 자리 (글자 수) */
function caretOf(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function selCollapsed() { const s = window.getSelection(); return !s || s.isCollapsed; }
function placeCaret(el: HTMLElement, at: number | 'end') {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  const tn = el.firstChild;
  if (!tn || tn.nodeType !== Node.TEXT_NODE) { r.selectNodeContents(el); r.collapse(at !== 0); }
  else { const n = at === 'end' ? (tn.textContent ?? '').length : Math.min(at, (tn.textContent ?? '').length); r.setStart(tn, n); r.collapse(true); }
  sel.removeAllRanges(); sel.addRange(r);
}

export function NoteEditor({ ws, date, area, title, ph, icon }: {
  ws: Workspace; date: string; area: BlockArea; title: string; ph: string; icon: React.ReactNode;
}) {
  const { blocks, today } = ws;
  const box = useRef<HTMLDivElement>(null);
  const focusNext = useRef<{ id: string; at: number | 'end' } | null>(null);
  const saveTimer = useRef(new Map<string, number>());
  const lastTyped = useRef(0);
  // 끌어서 옮기기 — 표시선과 실제 놓는 자리를 같은 값으로 (v3 markDrop)
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; below: boolean } | null>(null);

  // ── 그릴 줄 만들기
  const own = flatten(blocks, date, area);
  const lines: Line[] = [];
  if (area === 'today' && date === today) {
    // 오늘 적은 줄을 묶음(맨 바깥 제목) 단위로 나눈 뒤, 같은 이름의 묶음 끝에 지난 줄을 붙인다
    const carried = carriedInto(blocks, today);
    const groups: { name: string; lines: Line[] }[] = [{ name: '', lines: [] }];
    for (const row of own) {
      if (row.depth === 0 && isHead(row.b)) groups.push({ name: row.b.text.trim(), lines: [] });
      groups[groups.length - 1].lines.push({ row });
    }
    const extra = new Map<string, Line[]>();
    for (const c of carried) {
      const ln: Line[] = [{ row: c.root, carriedFrom: c.fromDate }, ...c.kids.map((k) => ({ row: k, carriedFrom: c.fromDate }))];
      const g = groups.find((x) => x.name === c.group);
      if (g) g.lines.push(...ln);
      else (extra.get(c.group) ?? extra.set(c.group, []).get(c.group)!).push(...ln);
    }
    for (const g of groups) lines.push(...g.lines);
    for (const [name, ln] of extra) {
      lines.push({ row: { b: { ...ln[0].row.b, id: `gh:${name}`, type: 'h3', text: name }, depth: 0 }, ghostHead: name });
      lines.push(...ln);
    }
  } else {
    let movedUntil = -1;
    own.forEach((row, i) => {
      if (area === 'today' && continuesToToday(row.b, row.depth, today)) {
        movedUntil = i;
        for (let j = i + 1; j < own.length && own[j].depth > 0; j++) movedUntil = j;
      }
      lines.push({ row, moved: i <= movedUntil && area === 'today' && date < today });
    });
  }

  // 새로 만든 줄 · 옮긴 줄에 커서를 다시 세운다 (저장 → 구독 → 다시 그림 뒤)
  useLayoutEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-edit="${CSS.escape(f.id)}"]`);
    if (el) { focusNext.current = null; placeCaret(el, f.at); }
  });

  const flush = (id: string, el: HTMLElement) => {
    const t = saveTimer.current.get(id);
    if (t) { window.clearTimeout(t); saveTimer.current.delete(id); }
    const b = blocks.find((x) => x.id === id);
    const text = el.textContent ?? '';
    if (b && b.text !== text) ws.patchBlocks([{ id, text }], false);   // 글자 치기 — 되돌리기는 브라우저 몫
  };
  const scheduleSave = (id: string, el: HTMLElement) => {
    const m = saveTimer.current;
    const t = m.get(id); if (t) window.clearTimeout(t);
    m.set(id, window.setTimeout(() => { m.delete(id); flush(id, el); }, 400));
  };

  /** 빈 날의 자리에서 첫 글자를 치면 그때 줄이 생긴다 (한글은 조합이 끝난 뒤) */
  const startFromGhost = (el: HTMLElement) => {
    const t = el.textContent ?? '';
    if (!t || own.length) return;
    const nb = appendBlock(blocks, date, area, t, { id: ws.newId(), now: Date.now() });
    const md = markdownType(t, area);
    if (md) { nb.type = md.type; nb.text = md.text; }
    el.textContent = '';
    ws.addBlock(nb);
    focusNext.current = { id: nb.id, at: 'end' };
  };

  const editable = lines.filter((l) => !l.moved && !l.ghostHead);
  const idxOf = (id: string) => editable.findIndex((l) => l.row.b.id === id);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>, line: Line) => {
    const el = e.currentTarget;
    const b = line.row.b;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;            // 한글 조합 중
    const text = el.textContent ?? '';
    const at = caretOf(el) ?? text.length;
    const i = idxOf(b.id);

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 빈 줄 + 들여쓴 줄 → 한 단 내어쓰기 (노션)
      if (!text.trim() && line.row.depth > 0 && !line.carriedFrom) {
        const p = outdent(blocks, b); if (p) { ws.patchBlocks([p]); focusNext.current = { id: b.id, at: 0 }; }
        return;
      }
      const before = text.slice(0, at), after = text.slice(at);
      // 되돌리면 «치던 글자 그대로» 로 돌아가게 — 아직 저장 안 된 글자를 기준으로 삼는다
      const t0 = saveTimer.current.get(b.id); if (t0) { window.clearTimeout(t0); saveTimer.current.delete(b.id); }
      const base = blocks.map((x) => (x.id === b.id ? { ...x, text } : x));
      const split: Patch[] = before !== b.text ? [{ id: b.id, text: before }] : [];
      const nb = line.carriedFrom
        // 지난 날 줄 아래 Enter — 새 줄은 «오늘» 에 적힌다
        ? appendBlock(blocks, date, area, after, { id: ws.newId(), now: Date.now() })
        : insertBelow(blocks, { ...b, text: before }, after, { id: ws.newId(), now: Date.now() }, date);
      ws.editBlocks(split, [nb], base);
      focusNext.current = { id: nb.id, at: 0 };
      return;
    }

    if (e.key === 'Backspace' && at === 0 && selCollapsed()) {
      if (line.carriedFrom) return;
      e.preventDefault();
      if (!text) {
        // 빈 줄 지우기 — 자식은 그 자리로 올린다. 커서는 윗줄 끝으로
        const ps: Patch[] = [...removeEmpty(blocks, b), { id: b.id, deletedAt: Date.now() }];
        ws.patchBlocks(ps);
        const prev = editable[i - 1];
        if (prev) focusNext.current = { id: prev.row.b.id, at: 'end' };
        return;
      }
      if (line.row.depth > 0) { const p = outdent(blocks, b); if (p) { ws.patchBlocks([p]); focusNext.current = { id: b.id, at: 0 }; } return; }
      if (isHead(b)) { ws.patchBlocks([{ id: b.id, type: area === 'today' ? 'check' : 'bullet' }]); focusNext.current = { id: b.id, at: 0 }; return; }
      // 윗줄에 이어 붙인다 — 자식은 윗줄로 옮긴다
      const prev = editable[i - 1];
      if (!prev || prev.carriedFrom || prev.row.b.date !== b.date) return;
      const pb = prev.row.b;
      const kids = blocks.filter((x) => !x.deletedAt && x.parent === b.id);
      const join = pb.text.length;
      ws.patchBlocks([
        { id: pb.id, text: pb.text + text },
        ...kids.map((k, j) => ({ id: k.id, parent: pb.id, pos: Date.now() + j })),
        { id: b.id, deletedAt: Date.now() },
      ]);
      focusNext.current = { id: pb.id, at: join };
      return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      // 줄 동작이 마지막 글자 치기보다 나중이면 그걸 되돌린다. 아니면 브라우저가 글자를 되돌린다
      if (ws.lastEditAt() > lastTyped.current) { e.preventDefault(); flush(b.id, el); ws.undoBlocks(); focusNext.current = { id: b.id, at: 'end' }; }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (line.carriedFrom) return;
      flush(b.id, el);
      const p = e.shiftKey ? outdent(blocks, b) : indent(blocks, b, line.row.depth);
      if (p) { ws.patchBlocks([p]); focusNext.current = { id: b.id, at }; }
      else if (!e.shiftKey && line.row.depth >= 8) ws.say('8단까지 들여쓸 수 있어요');
      return;
    }

    if (e.key === 'ArrowUp' && at === 0 && i > 0) { e.preventDefault(); placeCaret(box.current!.querySelector(`[data-edit="${CSS.escape(editable[i - 1].row.b.id)}"]`) as HTMLElement, 'end'); return; }
    if (e.key === 'ArrowDown' && at === text.length && i < editable.length - 1) { e.preventDefault(); placeCaret(box.current!.querySelector(`[data-edit="${CSS.escape(editable[i + 1].row.b.id)}"]`) as HTMLElement, 0); }
  };

  const onInput = (e: React.FormEvent<HTMLDivElement>, line: Line) => {
    const el = e.currentTarget;
    const b = line.row.b;
    const text = el.textContent ?? '';
    // 줄 앞 표시 → 줄 종류 (`# ` 제목 · `- ` 글머리 · `[] ` 할 일)
    const md = !line.carriedFrom ? markdownType(text, area) : null;
    if (md && md.type !== b.type) {
      el.textContent = md.text;
      ws.patchBlocks([{ id: b.id, type: md.type, text: md.text }]);
      focusNext.current = { id: b.id, at: 0 };
      return;
    }
    lastTyped.current = Date.now();
    scheduleSave(b.id, el);
  };

  // ── 끌어서 옮기기
  const lineIds = (id: string) => [id, ...descendants(blocks, id).map((d) => d.id)];
  const dragProps = (ln: Line) => {
    const b = ln.row.b;
    if (ln.ghostHead != null || ln.carriedFrom || ln.moved) return {};
    return {
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/dm-block', `${area}:${b.id}`);
        setDrag(b.id);
      },
      onDragEnd: (e: React.DragEvent) => { (e.currentTarget as HTMLElement).removeAttribute('draggable'); setDrag(null); setDrop(null); },
      onDragOver: (e: React.DragEvent) => {
        if (!drag || lineIds(drag).includes(b.id)) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const below = e.clientY > r.top + r.height / 2;
        if (drop?.id !== b.id || drop.below !== below) setDrop({ id: b.id, below });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const d = blocks.find((x) => x.id === drag);
        if (d && drop) { const p = moveChunk(blocks, d, b, drop.below ? 'after' : 'before'); if (p) ws.patchBlocks([p]); }
        setDrag(null); setDrop(null);
      },
    };
  };
  /** 아래에 놓을 때는 그 줄에 딸린 줄들 «뒤» 에 선을 그린다 (v3 blkGroupEls) */
  const dropLine = (() => {
    if (!drop) return null;
    if (!drop.below) return { id: drop.id, cls: 'drop-above' };
    const kids = new Set(descendants(blocks, drop.id).map((d) => d.id));
    const vis = lines.filter((l) => kids.has(l.row.b.id));
    return { id: vis.length ? vis[vis.length - 1].row.b.id : drop.id, cls: 'drop-below' };
  })();
  const dragSet = drag ? new Set(lineIds(drag)) : null;

  return (
    <div className={area === 'wmemo' ? 'note memo wp-memo' : `note ${area}`} data-area={area} ref={box}>
      <h4>{icon}<span>{title}</span></h4>
      {lines.map((ln) => (
        <BlockRow key={ln.row.b.id} ln={ln} area={area} ph={ph} viewDate={date}
          tri={area === 'today' && ln.row.b.type === 'check' ? triOf(blocks, ln.row.b.id) : null}
          dnd={dragProps(ln)}
          dragCls={`${dragSet?.has(ln.row.b.id) ? ' dragging' : ''}${dropLine?.id === ln.row.b.id ? ` ${dropLine.cls}` : ''}`}
          onKey={onKey} onInput={onInput} onBlur={(id, el) => flush(id, el)}
          onCheck={(b) => ws.toggleBlock(b, date)} onDel={(b) => ws.removeBlock(b)} />
      ))}
      {/* 빈 날 — 적을 자리는 «화면» 이 준다. 빈 줄을 데이터로 깔지 않는다 (결함표 B11) */}
      {!own.length && (
        <div className="blk" data-area={area} style={{ '--ind': 0 } as React.CSSProperties}>
          <span className="grip" aria-hidden="true">⠿</span>
          {area === 'today' ? <span className="cb">✓</span> : <span className="bul">•</span>}
          <div className="txt" contentEditable suppressContentEditableWarning data-ph={ph} data-ghost="1"
            onInput={(e) => { if (!(e.nativeEvent as InputEvent).isComposing) startFromGhost(e.currentTarget); }}
            onCompositionEnd={(e) => startFromGhost(e.currentTarget)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        </div>
      )}
    </div>
  );
}

function BlockRow({ ln, area, ph, viewDate, tri, dnd, dragCls, onKey, onInput, onBlur, onCheck, onDel }: {
  ln: Line; area: BlockArea; ph: string; viewDate: string;
  tri: Tri | null; dnd: React.HTMLAttributes<HTMLDivElement>; dragCls: string;
  onKey: (e: React.KeyboardEvent<HTMLDivElement>, ln: Line) => void;
  onInput: (e: React.FormEvent<HTMLDivElement>, ln: Line) => void;
  onBlur: (id: string, el: HTMLElement) => void;
  onCheck: (b: Block) => void;
  onDel: (b: Block) => void;
}) {
  const { b, depth } = ln.row;
  const ref = useRef<HTMLDivElement>(null);
  // 처음 그릴 때는 글자를 바로 채운다 (커서를 세우기 «전» 에 — 부모의 커서 세우기보다 먼저 돈다)
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 그 뒤로는 «고치는 중이 아닐 때만» 바깥 값으로 맞춘다 — 치는 도중 다른 기기 변경으로 커서가 튀지 않게
    if (!mounted.current || (document.activeElement !== el && el.textContent !== b.text)) el.textContent = b.text;
    mounted.current = true;
  }, [b.text]);
  const style = { '--ind': depth } as React.CSSProperties;

  if (ln.ghostHead != null) {
    return <div className="blk head h3" data-area={area} style={style}><div className="txt">{ln.ghostHead}</div></div>;
  }
  // 손잡이를 누를 때만 줄이 끌린다 — 글자를 고르는 끌기와 섞이지 않게 (v3 와 같다)
  const grip = <span className="grip" data-grip={b.id} data-area={area}
    onMouseDown={(e) => (e.currentTarget.parentElement as HTMLElement).setAttribute('draggable', 'true')}
    onMouseUp={(e) => (e.currentTarget.parentElement as HTMLElement).removeAttribute('draggable')}>⠿</span>;
  const part = !!tri && tri.ok > 0 && !b.done;   // v3.1.245 — 하위를 다 끝내도 상위는 «-» 로 남는다
  const triCnt = tri ? <span className={`tri-n${tri.state === 'full' ? ' full' : ''}`} data-tip={`딸린 할 일 ${tri.ok}/${tri.n}`}>{tri.ok}/{tri.n}</span> : null;
  const tip = tri ? (b.done ? '누르면 딸린 할 일까지 모두 해제' : tri.state === 'full' ? '딸린 할 일은 다 끝났어요 — 누르면 이 할 일도 완료' : '누르면 딸린 할 일까지 모두 완료') : undefined;
  const del = <button className="del" data-del={b.id} data-area={area} onClick={() => onDel(b)}>✕</button>;
  const stamp = b.done && b.doneAt ? <span className="stamp">{hhmm(b.doneAt)}</span> : null;
  const mark = b.type === 'bullet' ? <span className="bul">•</span>
    : area === 'today' && b.type === 'check'
      ? <span className={`cb${b.done ? ' on' : part ? ' part' : ''}`} data-check={b.id} data-tip={tip} onClick={() => onCheck(b)}
          {...(ln.moved ? { 'data-mvchk': b.id, title: '이 날 끝낸 일로 체크' } : {})}>{part ? <i className="cb-dash" /> : '✓'}</span>
      : area !== 'today' && !isHead(b) ? <span className="bul">•</span> : null;

  // 지난 날 — v3 의 «→ 넘김» 모양 그대로. 글자는 못 고친다 (오늘 화면에서 고친다)
  if (ln.moved) {
    return (
      <div className={`blk moved-blk${b.done ? ' done' : ''}${isHead(b) ? ` head h${HEAD_N[b.type]}` : ''}`} tabIndex={0}
        data-id={b.id} data-area={area} style={style}>
        {!isHead(b) && mark}<div className="txt">{b.text}</div>{triCnt}{stamp}
        {depth === 0 && <span className="mv-to">→ 넘김</span>}{del}
      </div>
    );
  }

  const born = ln.carriedFrom && depth === 0
    ? (() => {
        const dd = Math.round((dateOf(viewDate).getTime() - dateOf(ln.carriedFrom).getTime()) / 86400000);
        const d0 = dateOf(ln.carriedFrom);
        return dd > 0 ? <span className="born" title={`${d0.getMonth() + 1}월 ${d0.getDate()}일에 적은 일이에요`}>D+{dd}</span> : null;
      })()
    : null;
  const txt = (
    <div className="txt" ref={ref} contentEditable suppressContentEditableWarning
      data-ph={isHead(b) ? '제목' : ph} data-edit={b.id} data-area={area}
      onKeyDown={(e) => onKey(e, ln)} onInput={(e) => onInput(e, ln)} onBlur={(e) => onBlur(b.id, e.currentTarget)} />
  );
  if (isHead(b)) {
    return <div className={`blk head h${HEAD_N[b.type]}${dragCls}`} data-id={b.id} data-area={area} style={style} {...dnd}>{grip}{txt}{del}</div>;
  }
  return (
    <div className={`blk${b.done ? ' done' : ''}${tri ? ' tri' : ''}${dragCls}`} data-id={b.id} data-area={area} style={style} {...dnd}>
      {grip}{mark}{txt}{triCnt}{born}{stamp}{del}
    </div>
  );
}
