/**
 * 일간 상세의 Today · Memo — v3 노트 편집기 (noteHtml · blockHtml) 의 모양과 키 그대로
 *
 * ★ 저장은 트리(줄마다 부모), 이월은 «보여주기» — src/domain/todos/tree.ts
 *   · 오늘 화면: 오늘 적은 줄 아래에 «지난 날의 못 끝낸 줄» 이 D+N 뱃지를 달고 함께 보인다
 *     같은 이름의 묶음(제목)이 오늘에 있으면 그 밑에, 없으면 맨 아래에 그 묶음 이름으로
 *   · 지난 날 화면: 못 끝낸 줄은 v3 의 «→ 넘김» 모양 그대로 (글자는 못 고치고, 체크는 된다 =
 *     «그 날 끝낸 일» — v3 의 흔적 체크와 같은 뜻)
 *   · 끝낸 날 = 체크한 화면의 날짜
 * ★ 키: Enter 새 줄 · Backspace(맨 앞) 지우기/합치기/내어쓰기 · Tab/⇧Tab · ↑↓ · `# ` `## ` `### ` 제목 · `- ` 글머리 · `1. ` 번호(`3. ` 이면 3부터) · `[] ` 할 일
 *   한글 조합 중 Enter 는 무시한다
 * ★ 부분 체크(LOGIC §6-3) — 딸린 할 일이 있는 줄은 `ok/n` 이 항상 서고, 일부만 끝나면 가운데 줄(-)
 * ★ ⠿ 끌어서 옮기기 — 덩어리째, 같은 묶음의 형제 자리로 · ⌘Z — 이 기기의 마지막 동작 (글자 치기는 브라우저 몫)
 * ★ 폰 — 키보드 위 도구 줄(`KbBar`): 할 일 · 글머리 · 내어쓰기 · 들여쓰기 · 키보드 내리기. 동작은 위 키와 같은 함수
 * ★ 서식 · 칩 · 링크 — 저장은 v3 와 같은 글자 안 표시 (`domain/todos/inline`), 그리기 · 읽기는 `ui/inlineDom`. ⌘B · ⌘I · ⌘U · ⌘E · ⌘⇧S
 * ★ `@날짜` — 커서 앞 «@말» 로 메뉴(↑↓ · Enter/Tab · Esc), 칩을 누르면 달력(바꾸기 · 지우기 · 그 날로). `Mention.tsx`
 * ★ 여러 줄 고르기 — 줄 끝에서 ⇧↑↓ · 끌기 · ⇧클릭. 고른 줄에 ⌘C · ⌘X · 지우기 · Tab/⇧Tab · ⌘B 등 서식 (`domain/todos/select`)
 * ★ 여러 줄 붙여넣기는 줄마다 새 줄로 (두 칸 = 한 단 · `# ` `1. ` `- ` `[ ]` `[x]` 를 읽는다) — 복사한 것이 그대로 돌아온다
 * 아직 안 옮긴 것: 이미지
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import {
  appendBlock, carriedInto, continuesToToday, descendants, flatten, indent, insertBelow, isHead, markdownType, ordNo,
  moveChunk, outdent, removeEmpty, triOf, type Block, type BlockArea, type Patch, type Row, type Tri,
} from '../domain/todos/tree';
import { dateOf, hhmm } from '../ui/v3fmt';
import { dateCandidates, dateChipLabel, dateLabelOf, menToken, mkJoin, mkLen, mkParse, mkSplit, mkToggle, plainText, setChipDate, type DateCand, type Mk } from '../domain/todos/inline';
import { DatePick, MenMenu, type MenAt } from './Mention';
import { pasteLines, selDelete, selMark, selShift, selText } from '../domain/todos/select';
import { inlineHtml, inlineMark, inlineSel, readInline } from '../ui/inlineDom';
import { KbBar } from '../mobile/KbBar';

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

/** 커서 자리 — «내용 글자» 로 센다 (서식 표시는 0, 칩 · 링크는 토큰 길이 · v3 inlineSel) */
function caretOf(el: HTMLElement): number | null { return inlineSel(el)?.s ?? null; }
function selCollapsed() { const s = window.getSelection(); return !s || s.isCollapsed; }
const placeCaret = (el: HTMLElement, at: number | 'end') => inlineMark(el, at);
/**
 * 클립보드에 «확실히» 담는다 (v3.1.186 clipWrite) — 키를 누른 그 순간 동기로. 실패하면 false (잘라내기를 멈춘다)
 */
function clipWrite(text: string): boolean {
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-2000px;left:-2000px;width:1px;height:1px;opacity:0';
  document.body.appendChild(ta);
  let ok = false;
  try { ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (sel) { sel.removeAllRanges(); if (saved) sel.addRange(saved); }
  if (!ok) navigator.clipboard?.writeText(text).catch(() => undefined);
  return ok;
}
/** 캐럿이 그 줄의 첫 줄(-1) / 마지막 줄(+1) 에 닿았나 — 줄바꿈된 긴 글도 (v3 caretAtEdge) */
function caretAtEdge(el: HTMLElement, dir: -1 | 1) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return true;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(dir < 0);
  const rects = r.getClientRects(), er = el.getBoundingClientRect();
  if (!rects.length) return true;
  return dir < 0 ? rects[0].top - er.top < 6 : er.bottom - rects[0].bottom < 6;
}
/** 붙여넣기 · 끌어 놓기에 든 그림 파일 */
const imageFiles = (dt: DataTransfer | null) => Array.from(dt?.files ?? []).filter((f) => f.type.startsWith('image/'));
/** 줄 고르기를 시작하지 않는 자리 — 손잡이 · 체크 · 지우기 · 칩 · 링크 (v3 BM_SKIP) */
const BM_SKIP = '.grip, .del, .cb, .men, .lnk, button, a, input, select, textarea';
/** 링크는 그냥 눌러서 새 탭으로 (v3.1.30) — 글자를 고치려면 링크 옆을 누른다 */
function openLink(e: React.MouseEvent) {
  const a = (e.target as HTMLElement).closest<HTMLElement>('.lnk');
  if (!a) return;
  e.preventDefault();
  const url = a.dataset.href ?? '';
  if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
}
/** ⌘B 굵게 · ⌘I 기울임 · ⌘U 밑줄 · ⌘E 코드 · ⌘⇧S 취소선 (v2.9.63 · 76) */
function mkKey(e: React.KeyboardEvent): Mk | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (e.shiftKey) return k === 's' ? 's' : null;
  return k === 'b' ? 'b' : k === 'i' ? 'i' : k === 'u' ? 'u' : k === 'e' ? 'c' : null;
}

export function NoteEditor({ ws, date, area, title, ph, icon, onDay }: {
  ws: Workspace; date: string; area: BlockArea; title: string; ph: string; icon: React.ReactNode;
  /** 날짜 칩 달력의 «그 날 페이지로 이동» — 없으면 그 줄을 안 보인다 */
  onDay?: (k: string) => void;
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
    const text = readInline(el);
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
    if (md) { nb.type = md.type; nb.text = md.text; if (md.start) nb.start = md.start; }
    el.textContent = '';
    ws.addBlock(nb);
    focusNext.current = { id: nb.id, at: 'end' };
  };

  const editable = lines.filter((l) => !l.moved && !l.ghostHead);
  const rowsAll = lines.map((l) => l.row);
  const idxOf = (id: string) => editable.findIndex((l) => l.row.b.id === id);

  /** 들여쓰기 · 내어쓰기 — PC Tab/⇧Tab 과 폰 도구 줄이 같은 함수를 부른다 */
  const shiftLine = (line: Line, el: HTMLElement, out: boolean) => {
    if (line.carriedFrom) return;
    const b = line.row.b;
    const at = caretOf(el) ?? mkLen(readInline(el));
    flush(b.id, el);
    const p = out ? outdent(blocks, b) : indent(blocks, b, line.row.depth);
    if (p) { ws.patchBlocks([p]); focusNext.current = { id: b.id, at }; }
    else if (!out && line.row.depth >= 8) ws.say('8단까지 들여쓸 수 있어요');
  };
  /** 줄 종류 바꾸기 — PC 는 `[] ` · `- ` 를 쳐서, 폰은 도구 줄에서 */
  const setType = (line: Line, el: HTMLElement, type: Block['type']) => {
    const b = line.row.b;
    if (line.carriedFrom || b.type === type) return;
    const at = caretOf(el) ?? 0;
    flush(b.id, el);
    ws.patchBlocks([{ id: b.id, type }]);
    focusNext.current = { id: b.id, at };
  };

  // ── @날짜 — 커서 앞 «@말» 을 보고 메뉴를 연다 (v3 menContext · maybeOpenMenMenu)
  const [men, setMen] = useState<{ id: string; items: DateCand[]; idx: number; at: MenAt } | null>(null);
  const menCtx = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!r.collapsed || r.startContainer.nodeType !== 3) return null;
    const m = /@([^\s@\]]{0,24})$/.exec((r.startContainer.nodeValue ?? '').slice(0, r.startOffset));
    if (!m) return null;
    const rc = r.getClientRects()[0] ?? r.startContainer.parentElement!.getBoundingClientRect();
    return { node: r.startContainer as Text, offset: r.startOffset, q: m[1], len: m[0].length, at: { x: rc.left, top: rc.top, bottom: rc.bottom } };
  };
  const checkMen = (id: string) => { const c = menCtx(); setMen(c ? { id, items: dateCandidates(c.q, today), idx: 0, at: c.at } : null); };
  /** 고른 날을 칩으로 — 칩에는 절대 날짜를 박는다 (그릴 때 「내일」 로 읽힌다 · v3.1.152). 줄은 옮기지 않는다 (v3.1.161) */
  const pickMen = (i: number) => {
    const it = men?.items[i], c = menCtx(), id = men?.id;
    setMen(null);
    const el = id ? box.current?.querySelector<HTMLElement>(`[data-edit="${CSS.escape(id)}"]`) : null;
    if (!it || !c || !id || !el) return;
    const at = c.offset - c.len;
    c.node.nodeValue = (c.node.nodeValue ?? '').slice(0, at) + (c.node.nodeValue ?? '').slice(c.offset);
    const tmp = document.createElement('span');
    tmp.innerHTML = inlineHtml(menToken('date', it.ref, dateLabelOf(it.ref)), today);
    const chip = tmp.firstElementChild!, space = document.createTextNode(' ');
    const r = document.createRange();
    r.setStart(c.node, at); r.collapse(true); r.insertNode(space); r.insertNode(chip);
    const after = document.createRange();
    after.setStart(space, 1); after.collapse(true);
    const sl = window.getSelection(); sl?.removeAllRanges(); sl?.addRange(after);
    flush(id, el);
  };

  // ── 날짜 칩을 누르면 달력 (v2.9.82) — 바꾸기 · 지우기 · 그 날로
  const [dpick, setDpick] = useState<{ id: string; token: string; ref: string; at: MenAt } | null>(null);
  const onChip = (e: React.MouseEvent, id: string) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.men.date');
    if (!chip) return;
    e.preventDefault();
    const r = chip.getBoundingClientRect();
    setDpick({ id, token: chip.dataset.token ?? '', ref: chip.dataset.ref ?? '', at: { x: r.left, top: r.top, bottom: r.bottom } });
  };
  const pickDate = (key: string | null) => {
    const p = dpick;
    setDpick(null);
    if (!p || key === p.ref) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-edit="${CSS.escape(p.id)}"]`);
    const cur = el ? readInline(el) : blocks.find((x) => x.id === p.id)?.text ?? '';
    const next = setChipDate(cur, p.token, key);
    if (next == null) return;
    const t0 = saveTimer.current.get(p.id); if (t0) { window.clearTimeout(t0); saveTimer.current.delete(p.id); }
    ws.patchBlocks([{ id: p.id, text: next }]);
    if (el) el.innerHTML = inlineHtml(next, today);
    ws.say(key ? `날짜를 ${dateChipLabel(key, dateLabelOf(key), today)} 로 바꿨어요` : '날짜를 삭제했어요');
  };

  // ── 여러 줄 고르기 (v3 bsel · v2.9.56 · v3.1.161) — 줄마다 편집 칸이 따로라 브라우저 선택은 줄을 못 넘는다
  //    고른 동안에는 글자 칸에 커서가 없다. 키는 창 전체에서 먼저 받는다 (아래 효과)
  const [bsel, setBsel] = useState<{ anchor: string; head: string } | null>(null);
  const selRows = lines.filter((l) => l.ghostHead == null);
  const selIds = (() => {
    if (!bsel) return [] as string[];
    const ids = selRows.map((l) => l.row.b.id), a = ids.indexOf(bsel.anchor), h = ids.indexOf(bsel.head);
    return a < 0 || h < 0 ? [] : ids.slice(Math.min(a, h), Math.max(a, h) + 1);
  })();
  const selSet = new Set(selIds);
  // 고치는 일은 이 날 줄만 — 지난 날에서 함께 보이는 줄 · «→ 넘김» 흔적은 복사만 된다
  const editIds = selIds.filter((id) => { const l = selRows.find((x) => x.row.b.id === id); return l && !l.carriedFrom && !l.moved; });
  const startSel = (anchor: string, head: string) => {
    setBsel({ anchor, head });
    (document.activeElement as HTMLElement | null)?.blur?.();
    window.getSelection()?.removeAllRanges();
  };
  const endSel = (focusId?: string) => {
    setBsel(null);
    const el = focusId ? box.current?.querySelector<HTMLElement>(`[data-edit="${CSS.escape(focusId)}"]`) : null;
    if (el) placeCaret(el, 'end');
  };
  const bselKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  bselKey.current = (e: KeyboardEvent) => {
    if (!bsel) return;
    const k = e.key, stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape') { stop(); endSel(bsel.head); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      stop();
      if (!e.shiftKey) { endSel(bsel.head); return; }
      const ids = selRows.map((l) => l.row.b.id), j = ids.indexOf(bsel.head) + (k === 'ArrowUp' ? -1 : 1);
      if (j >= 0 && j < ids.length) setBsel({ ...bsel, head: ids[j] });
      return;
    }
    if (k === 'Tab') { stop(); const ps = selShift(blocks, own, editIds, e.shiftKey); if (ps.length) ws.patchBlocks(ps); return; }
    if (k === 'Backspace' || k === 'Delete') { stop(); const ps = selDelete(blocks, editIds, Date.now()); if (ps.length) ws.patchBlocks(ps); setBsel(null); return; }
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
    if (mod && (k.toLowerCase() === 'c' || k.toLowerCase() === 'x')) {
      stop();
      const ok = clipWrite(selText(selRows.map((l) => l.row), selIds));
      if (k.toLowerCase() === 'x') {
        if (!ok) { ws.say('복사가 안 돼서 잘라내기를 멈췄어요'); return; }
        const ps = selDelete(blocks, editIds, Date.now()); if (ps.length) ws.patchBlocks(ps); setBsel(null);
      } else ws.say(ok ? `${selIds.length}줄을 복사했어요` : '복사가 확실하지 않아요 — 붙여넣기 전에 확인해 주세요');
      return;
    }
    const mk = mod ? mkKey(e as unknown as React.KeyboardEvent) : null;
    if (mk) { stop(); const ps = selMark(blocks, editIds, mk); if (ps.length) ws.patchBlocks(ps); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // ⌘Z 같은 건 그대로
    if (k.length === 1) e.preventDefault();           // 실수로 덮어쓰지 않게
  };
  const selOn = !!bsel;
  useEffect(() => {
    if (!selOn) return;
    const key = (e: KeyboardEvent) => bselKey.current(e);
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setBsel(null); };
    window.addEventListener('keydown', key, true);
    document.addEventListener('mousedown', away, true);
    return () => { window.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', away, true); };
  }, [selOn]);
  // 끌어서 · ⇧클릭으로 고르기 — 다른 줄로 넘어간 그 순간부터 줄 선택 (v3.1.161)
  const bm = useRef<string | null>(null);
  const blkOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest<HTMLElement>('.blk[data-id]') ?? null;
  const onBoxDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const blk = blkOf(e.target), id = blk?.dataset.id;
    if (!blk || !id || (e.target as HTMLElement).closest(BM_SKIP)) { if (bsel) setBsel(null); bm.current = null; return; }
    if (e.shiftKey) {
      const from = bsel?.anchor ?? (document.activeElement as HTMLElement | null)?.dataset?.edit;
      if (from && from !== id && selRows.some((l) => l.row.b.id === from)) { e.preventDefault(); startSel(from, id); return; }
    }
    if (bsel) setBsel(null);
    bm.current = id;
  };
  const onBoxMove = (e: React.MouseEvent) => {
    if (!bm.current || !(e.buttons & 1)) return;
    const id = blkOf(e.target)?.dataset.id;
    if (!id || id === bm.current || bsel?.head === id) return;
    startSel(bm.current, id);
  };

  /** 붙여넣기 — 한 줄은 글자만 (v3.1.253 · 그림 · 남의 서식이 화면에만 꽂히지 않게), 여러 줄은 줄마다 새 줄로 */
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>, line: Line) => {
    e.preventDefault();
    const files = imageFiles(e.clipboardData);
    if (files.length && !line.carriedFrom) { flush(line.row.b.id, e.currentTarget); void putImages(files, line.row.b, true); return; }
    const t = e.clipboardData.getData('text/plain');
    if (!t) return;
    if (!/\n/.test(t.trim()) || line.carriedFrom) { document.execCommand('insertText', false, t.replace(/\s*\r?\n\s*/g, ' ')); return; }
    const el = e.currentTarget, b = line.row.b, text = readInline(el);
    const t0 = saveTimer.current.get(b.id); if (t0) { window.clearTimeout(t0); saveTimer.current.delete(b.id); }
    const base = blocks.map((x) => (x.id === b.id ? { ...x, text } : x));
    const r = pasteLines(base, { ...b, text }, t, area, ws.newId, Date.now());
    ws.editBlocks(text !== b.text && !r.patches.some((p) => p.id === b.id) ? [{ id: b.id, text }, ...r.patches] : r.patches, r.created, base);
    const last = r.created[r.created.length - 1];
    focusNext.current = { id: last ? last.id : b.id, at: 'end' };
  };

  // ── 그림 (SYNC §14) — 붙여넣기 · 끌어 놓기 · 폰 사진 단추. 그 줄 바로 뒤에 그림 줄로
  const putImages = async (files: File[], after: Block | null, pasted: boolean) => {
    const made = await ws.addImages(files, date, area, after, pasted);
    if (made.length) focusNext.current = null;
  };
  const filePick = useRef<HTMLInputElement>(null);
  const pickAfter = useRef<Block | null>(null);
  const onDropFiles = (e: React.DragEvent) => {
    const files = imageFiles(e.dataTransfer);
    if (!files.length) return;
    e.preventDefault();
    const id = blkOf(e.target)?.dataset.id;
    const after = (id && selRows.find((l) => l.row.b.id === id && !l.carriedFrom && !l.moved)?.row.b) || own[own.length - 1]?.b || null;
    void putImages(files, after, false);
  };

  // ── 폰 — 고치는 줄을 알아 두면 키보드 위 도구 줄이 그 줄에 일한다
  const mobile = document.body.dataset.platform === 'mobile';
  const [cur, setCur] = useState<string | null>(null);
  const curLine = cur ? editable.find((l) => l.row.b.id === cur) ?? null : null;
  const curEl = () => (cur ? box.current?.querySelector<HTMLElement>(`[data-edit="${CSS.escape(cur)}"]`) ?? null : null);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>, line: Line) => {
    const el = e.currentTarget;
    const b = line.row.b;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;            // 한글 조합 중
    const text = readInline(el);
    const at = caretOf(el) ?? mkLen(text);
    const i = idxOf(b.id);

    if (men?.id === b.id) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMen(null); return; }
      const n = men.items.length;
      if (n && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setMen({ ...men, idx: (men.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n }); return; }
      if (n && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickMen(men.idx); return; }
    }

    const mk = mkKey(e);
    if (mk) {
      // 브라우저도 같은 키로 제 태그를 넣는다 — 먼저 잡아서 막는다. 고른 글자가 없으면 아무 일도 안 한다
      e.preventDefault();
      const sel = inlineSel(el);
      if (!sel || sel.s === sel.e || line.carriedFrom) return;
      const s0 = Math.min(sel.s, sel.e), e0 = Math.max(sel.s, sel.e);
      const next = mkToggle(text, s0, e0, mk);
      if (next == null || next === text) return;
      const t0 = saveTimer.current.get(b.id); if (t0) { window.clearTimeout(t0); saveTimer.current.delete(b.id); }
      ws.patchBlocks([{ id: b.id, text: next }]);   // ⌘Z 한 번에 돌아온다
      el.innerHTML = inlineHtml(next, today);
      inlineMark(el, s0, e0);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 빈 줄 + 들여쓴 줄 → 한 단 내어쓰기 (노션)
      if (!plainText(text).trim() && line.row.depth > 0 && !line.carriedFrom) {
        const p = outdent(blocks, b); if (p) { ws.patchBlocks([p]); focusNext.current = { id: b.id, at: 0 }; }
        return;
      }
      const [before, after] = mkSplit(text, at);   // 서식을 지키며 자른다 (v3.1.136)
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
      const join = mkLen(pb.text);
      ws.patchBlocks([
        { id: pb.id, text: mkJoin([...mkParse(pb.text), ...mkParse(text)]) },   // 서식 경계를 다시 맞춘다 (`**보고**` + `**서**` → `**보고서**`)
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
      shiftLine(line, el, e.shiftKey);
      return;
    }

    // ⇧↑ · ⇧↓ — 글자 선택이 줄 끝에 닿으면 줄 단위로 (v2.9.56)
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (caretAtEdge(el, dir)) {
        e.preventDefault();
        flush(b.id, el);
        const ids = selRows.map((l) => l.row.b.id), j = ids.indexOf(b.id) + dir;
        startSel(b.id, ids[j] ?? b.id);
        return;
      }
    }

    if (e.key === 'ArrowUp' && at === 0 && i > 0) { e.preventDefault(); placeCaret(box.current!.querySelector(`[data-edit="${CSS.escape(editable[i - 1].row.b.id)}"]`) as HTMLElement, 'end'); return; }
    if (e.key === 'ArrowDown' && at === mkLen(text) && i < editable.length - 1) { e.preventDefault(); placeCaret(box.current!.querySelector(`[data-edit="${CSS.escape(editable[i + 1].row.b.id)}"]`) as HTMLElement, 0); }
  };

  const onInput = (e: React.FormEvent<HTMLDivElement>, line: Line) => {
    const el = e.currentTarget;
    const b = line.row.b;
    const text = readInline(el);
    // 줄 앞 표시 → 줄 종류 (`# ` 제목 · `- ` 글머리 · `[] ` 할 일)
    const md = !line.carriedFrom ? markdownType(text, area) : null;
    if (md && (md.type !== b.type || md.type === 'num')) {
      el.innerHTML = inlineHtml(md.text, today);
      ws.patchBlocks([{ id: b.id, type: md.type, text: md.text, start: md.type === 'num' ? md.start ?? null : null }]);
      focusNext.current = { id: b.id, at: 0 };
      return;
    }
    lastTyped.current = Date.now();
    scheduleSave(b.id, el);
    if (!line.carriedFrom) checkMen(b.id);
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
    <div className={area === 'wmemo' ? 'note memo wp-memo' : `note ${area}`} data-area={area} ref={box}
      onMouseDown={onBoxDown} onMouseMove={onBoxMove} onMouseUp={() => { bm.current = null; }}
      onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }} onDrop={onDropFiles}
      onFocus={mobile ? (e) => setCur((e.target as HTMLElement).dataset.edit ?? null) : undefined}
      onBlur={mobile ? () => setTimeout(() => { if (!box.current?.contains(document.activeElement)) setCur(null); }, 0) : undefined}>
      <h4>{icon}<span>{title}</span></h4>
      {lines.map((ln, li) => (
        <BlockRow key={ln.row.b.id} ln={ln} area={area} ph={ph} viewDate={date} today={today} no={ordNo(rowsAll, li)} sel={selSet.has(ln.row.b.id)} onPaste={onPaste}
          img={{ load: ws.imageBlob, size: (w) => ws.patchBlocks([{ id: ln.row.b.id, w }]), shift: (out) => { const el = box.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(ln.row.b.id)}"]`); if (el) shiftLine(ln, el, out); } }}
          tri={area === 'today' && ln.row.b.type === 'check' ? triOf(blocks, ln.row.b.id) : null}
          dnd={dragProps(ln)}
          dragCls={`${dragSet?.has(ln.row.b.id) ? ' dragging' : ''}${dropLine?.id === ln.row.b.id ? ` ${dropLine.cls}` : ''}`}
          onKey={onKey} onInput={onInput} onBlur={(id, el) => { flush(id, el); setMen(null); }} onChip={onChip}
          onCheck={(b) => ws.toggleBlock(b, date)} onDel={(b) => ws.removeBlock(b)} />
      ))}
      <input ref={filePick} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void putImages(f, pickAfter.current, false); }} />
      {men && <MenMenu at={men.at} items={men.items} idx={men.idx} onPick={pickMen} />}
      {dpick && <DatePick at={dpick.at} sel={dpick.ref} today={today} onPick={pickDate} onClose={() => setDpick(null)}
        onGo={onDay ? () => { const k = dpick.ref; setDpick(null); onDay(k); } : undefined} />}
      {mobile && curLine && (
        <KbBar area={area} type={curLine.row.b.type} depth={curLine.row.depth} fixed={!!curLine.carriedFrom}
          onShift={(out) => { const el = curEl(); if (el) shiftLine(curLine, el, out); }}
          onType={(t) => { const el = curEl(); if (el) setType(curLine, el, t); }}
          onDone={() => (document.activeElement as HTMLElement | null)?.blur()}
          onImage={() => { pickAfter.current = curLine.row.b; filePick.current?.click(); }} />
      )}
      {/* 빈 날 — 적을 자리는 «화면» 이 준다. 빈 줄을 데이터로 깔지 않는다 (결함표 B11) */}
      {!own.length && (
        <div className="blk" data-area={area} style={{ '--ind': 0 } as React.CSSProperties}>
          <span className="grip" aria-hidden="true">⠿</span>
          {area === 'today' ? <span className="cb">✓</span> : <span className="bul">•</span>}
          <div className="txt" contentEditable suppressContentEditableWarning data-ph={ph} data-ghost="1"
            onInput={(e) => { if (!(e.nativeEvent as InputEvent).isComposing) startFromGhost(e.currentTarget); }}
            onCompositionEnd={(e) => startFromGhost(e.currentTarget)}
            onPaste={(e) => {
              // 빈 날에 붙여넣기 — 빈 줄 하나를 세우고 그 줄에 여러 줄을 붓는다 (첫 줄이 그 줄을 채운다)
              e.preventDefault();
              const files = imageFiles(e.clipboardData);
              if (files.length) { void putImages(files, null, true); return; }
              const t = e.clipboardData.getData('text/plain');
              if (!t.trim() || own.length) return;
              const nb = appendBlock(blocks, date, area, '', { id: ws.newId(), now: Date.now() });
              const r = pasteLines([...blocks, nb], nb, /\n/.test(t.trim()) ? t : t.replace(/\s*\r?\n\s*/g, ' '), area, ws.newId, Date.now());
              const first = r.patches.find((p) => p.id === nb.id);
              e.currentTarget.textContent = '';
              ws.editBlocks([], [{ ...nb, ...first } as Block, ...r.created]);
              focusNext.current = { id: (r.created[r.created.length - 1] ?? nb).id, at: 'end' };
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        </div>
      )}
    </div>
  );
}

function BlockRow({ ln, area, ph, viewDate, today, no, sel, onPaste, img, tri, dnd, dragCls, onKey, onInput, onBlur, onChip, onCheck, onDel }: {
  ln: Line; area: BlockArea; ph: string; viewDate: string; today: string; no: number; sel: boolean;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>, ln: Line) => void;
  img: { load: (id: string) => Promise<Blob | null>; size: (w: number | null) => void; shift: (out: boolean) => void };
  tri: Tri | null; dnd: React.HTMLAttributes<HTMLDivElement>; dragCls: string;
  onKey: (e: React.KeyboardEvent<HTMLDivElement>, ln: Line) => void;
  onInput: (e: React.FormEvent<HTMLDivElement>, ln: Line) => void;
  onBlur: (id: string, el: HTMLElement) => void;
  onChip: (e: React.MouseEvent, id: string) => void;
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
    if (!mounted.current || (document.activeElement !== el && readInline(el) !== b.text)) el.innerHTML = inlineHtml(b.text, today);
    mounted.current = true;
  }, [b.text, today]);
  const style = { '--ind': depth } as React.CSSProperties;

  if (ln.ghostHead != null) {
    return <div className="blk head h3" data-area={area} style={style}><div className="txt">{ln.ghostHead}</div></div>;
  }
  // 구분선 (v3 div-blk) — 누르면 골라지고 Backspace · Delete 로 지운다
  if (b.type === 'divider') {
    return (
      <div className={`blk div-blk${dragCls}${sel ? ' bsel' : ''}`} tabIndex={0} data-id={b.id} data-area={area} style={style} {...dnd}
        onKeyDown={(e) => { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onDel(b); } }}>
        <span className="grip" data-grip={b.id} data-area={area}
          onMouseDown={(e) => (e.currentTarget.parentElement as HTMLElement).setAttribute('draggable', 'true')}
          onMouseUp={(e) => (e.currentTarget.parentElement as HTMLElement).removeAttribute('draggable')}>⠿</span>
        <hr /><button className="del" data-del={b.id} data-area={area} onClick={() => onDel(b)}>✕</button>
      </div>
    );
  }
  // 그림 줄 (v3 img-blk) — 누르면 골라지고(tabIndex) Tab · ⇧Tab 으로 들여쓰고 Backspace · Delete 로 지운다
  if (b.type === 'image' && b.img) {
    return (
      <div className={`blk img-blk${dragCls}${sel ? ' bsel' : ''}`} tabIndex={0} data-id={b.id} data-area={area} style={style} {...dnd}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onDel(b); }
          else if (e.key === 'Tab') { e.preventDefault(); img.shift(e.shiftKey); }
        }}>
        <span className="grip" data-grip={b.id} data-area={area}
          onMouseDown={(e) => (e.currentTarget.parentElement as HTMLElement).setAttribute('draggable', 'true')}
          onMouseUp={(e) => (e.currentTarget.parentElement as HTMLElement).removeAttribute('draggable')}>⠿</span>
        <ImgView id={b.img} w={b.w ?? null} nw={b.nw ?? null} load={img.load} onSize={img.size} />
        <button className="del" data-del={b.id} data-area={area} onClick={() => onDel(b)}>✕</button>
      </div>
    );
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
  const mark = b.type === 'num' ? <span className="bul num">{no || 1}.</span>
    : b.type === 'bullet' ? <span className="bul">•</span>
    : area === 'today' && b.type === 'check'
      ? <span className={`cb${b.done ? ' on' : part ? ' part' : ''}`} data-check={b.id} data-tip={tip} onClick={() => onCheck(b)}
          {...(ln.moved ? { 'data-mvchk': b.id, title: '이 날 끝낸 일로 체크' } : {})}>{part ? <i className="cb-dash" /> : '✓'}</span>
      : area !== 'today' && !isHead(b) ? <span className="bul">•</span> : null;

  // 지난 날 — v3 의 «→ 넘김» 모양 그대로. 글자는 못 고친다 (오늘 화면에서 고친다)
  if (ln.moved) {
    return (
      <div className={`blk moved-blk${b.done ? ' done' : ''}${isHead(b) ? ` head h${HEAD_N[b.type]}` : ''}${sel ? ' bsel' : ''}`} tabIndex={0}
        data-id={b.id} data-area={area} style={style}>
        {!isHead(b) && mark}<div className="txt" dangerouslySetInnerHTML={{ __html: inlineHtml(b.text, today) }} />{triCnt}{stamp}
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
      onKeyDown={(e) => onKey(e, ln)} onInput={(e) => onInput(e, ln)} onBlur={(e) => onBlur(b.id, e.currentTarget)}
      onPaste={(e) => onPaste(e, ln)} onClick={openLink} onMouseDown={(e) => onChip(e, b.id)} />
  );
  if (isHead(b)) {
    return <div className={`blk head h${HEAD_N[b.type]}${dragCls}${sel ? ' bsel' : ''}`} data-id={b.id} data-area={area} style={style} {...dnd}>{grip}{txt}{del}</div>;
  }
  return (
    <div className={`blk${b.done ? ' done' : ''}${tri ? ' tri' : ''}${dragCls}${sel ? ' bsel' : ''}`} data-id={b.id} data-area={area} style={style} {...dnd}>
      {grip}{mark}{txt}{triCnt}{born}{stamp}{del}
    </div>
  );
}

/**
 * 그림 한 장 (v3 .im-w · .im · .im-rz · DESIGN H) — 손을 안 댄 그림은 원본 크기(칸보다 크면 칸에 맞춤),
 * 손잡이로 조절하면 가로 비율(%)만 저장 · 두 번 누르면 원본으로. 100% 의 기준은 .im-w
 * 그림은 보일 때 받는다 (기기에 있으면 기기에서)
 */
function ImgView({ id, w, nw, load, onSize }: { id: string; w: number | null; nw: number | null; load: (id: string) => Promise<Blob | null>; onSize: (w: number | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    let alive = true, u: string | null = null;
    const el = box.current;
    const go = () => load(id).then((b) => { if (!alive) return; if (!b) { setMiss(true); return; } u = URL.createObjectURL(b); setUrl(u); }, () => alive && setMiss(true));
    // 화면에 들어올 때 받는다 — 하루를 열어도 안 보이는 그림은 안 받는다
    const io = el && 'IntersectionObserver' in window ? new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io?.disconnect(); go(); } }, { rootMargin: '400px' }) : null;
    if (io && el) io.observe(el); else go();
    return () => { alive = false; io?.disconnect(); if (u) URL.revokeObjectURL(u); };
  }, [id, load]);
  const pct = drag ?? w;
  const style: React.CSSProperties = pct ? { width: `${Math.max(10, Math.min(100, pct))}%` } : nw ? { width: `min(100%, ${Math.round(nw)}px)` } : {};
  const onRz = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const wrap = box.current; if (!wrap) return;
    const total = wrap.getBoundingClientRect().width, left = wrap.getBoundingClientRect().left;
    let last = pct ?? 100;
    const move = (ev: PointerEvent) => { last = Math.round(Math.max(10, Math.min(100, ((ev.clientX - left) / total) * 100))); setDrag(last); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDrag(null); onSize(last); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <div className="im-w" ref={box}>
      <div className="im" style={style}>
        {url ? <img src={url} alt="" draggable={false} /> : <div className="im-ph" aria-label={miss ? '그림을 못 불러왔어요' : '그림 불러오는 중'}>{miss ? '그림을 못 불러왔어요' : ''}</div>}
        <span className="im-rz" title="끌어서 크기 조절 · 두 번 누르면 원본 크기" onPointerDown={onRz} onDoubleClick={() => onSize(null)} />
      </div>
    </div>
  );
}
