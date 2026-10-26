/**
 * 주간 플래너 — v3 weekPlannerHtml 의 판정을 트리 · 보여주기 이월 위에서 다시 세운 것
 *
 * ▣ 그릇
 *   · 날짜 칸의 할 일   area 'today'   date = 그 날
 *   · 미정 (날짜 없음)   area 'someday' date = 그 주 월요일 · group = 묶음 이름 (결함표 B09 — 미정은 «주» 값만)
 *   · 주 메모           area 'wmemo'   date = 그 주 월요일
 *   (월요일 날짜를 쓰는 건 «보는 기간만 받는» 질의에 그대로 걸리게 하려는 것뿐이다 — 화면은 월요일 칸에 안 그린다)
 *
 * ▣ 묶음 = 그 줄 위의 맨 바깥 제목 (결함표 Q3 «제목 줄이 정의»). 미정은 제목 줄이 없으니 group 값으로
 * ▣ 주간에 그리는 것은 «바깥 할 일» 만 (Q8 — v3 그대로). 딸린 줄은 `ok/n` 뱃지로
 * ▣ 어느 칸에 서나 (v3 에서 줄이 옮겨 다니던 자리를 그대로 계산한다 — 보여주기 이월)
 *   · 끝낸 줄  → 끝낸 날 칸
 *   · 못 끝낸 줄 → 적은 날이 지났으면 «오늘» 칸, 아니면 적은 날 칸 (단 오늘 손으로 지난 날에 옮긴 줄은 오늘 하루 그 칸에 — pinnedOn)
 *   · 못 끝낸 미정 → 지난 주 것이면 이번 주로 따라온다 (v3.1.196)
 */
import {
  descendants, flatten, isHead, posBetween, triOf, type Block, type BlockType, type NewBlockInput, type Patch, type Tri,
} from './tree';
import { addDays, dateOf, keyOf, weekStart } from '../../ui/v3fmt';

export const weekKeyOf = (date: string) => keyOf(weekStart(dateOf(date)));
export const weekDays = (wk: string) => Array.from({ length: 7 }, (_, i) => keyOf(addDays(dateOf(wk), i)));

/** 바깥 할 일 하나 */
export interface WItem {
  b: Block;
  /** 그려질 날 — 미정이면 '' */
  key: string;
  /** 묶음 이름 — 없으면 null («미분류») */
  title: string | null;
  tri: Tri | null;
  /** 적은 날의 화면 순서 (정렬용) */
  ord: number;
}
export interface WGroup { title: string | null; items: WItem[] }

/** 끝낸 줄은 끝낸 날, 못 끝낸 지난 줄은 오늘 (v3 의 «줄이 지금 있는 칸») */
export function displayDay(b: Block, today: string): string {
  if (b.done) return b.doneOn ?? b.date;
  return b.date < today && b.pinnedOn !== today ? today : b.date;
}

/** 그 날의 바깥 할 일과 묶음 이름 (화면 순서) */
function outerOfDay(blocks: Block[], date: string): { b: Block; title: string | null; ord: number }[] {
  const out: { b: Block; title: string | null; ord: number }[] = [];
  let title: string | null = null;
  flatten(blocks, date, 'today').forEach(({ b, depth }, i) => {
    if (depth === 0 && isHead(b)) { title = b.text.trim() || null; return; }
    if (depth === 0 && b.type === 'check') out.push({ b, title, ord: i });
  });
  return out;
}

/** 그 줄의 묶음 이름 */
export function groupOf(blocks: Block[], b: Block): string | null {
  if (b.area === 'someday') return b.group ?? null;
  return outerOfDay(blocks, b.date).find((x) => x.b.id === b.id)?.title ?? null;
}

/**
 * 한 주에 그릴 바깥 할 일 전부 — 날짜 칸 것 + 미정
 * keep: 방금 만든 빈 줄 (커서를 놓아야 하니 빈 줄이어도 그린다 — v3 S.wpKeep)
 */
export function weekItems(blocks: Block[], wk: string, today: string, keep?: string | null): WItem[] {
  const keys = new Set(weekDays(wk));
  const thisWk = weekKeyOf(today);
  const dates = [...new Set(blocks.filter((b) => !b.deletedAt && b.area === 'today').map((b) => b.date))].sort();
  const out: WItem[] = [];
  for (const date of dates) {
    for (const x of outerOfDay(blocks, date)) {
      if (!x.b.text.trim() && x.b.id !== keep) continue;
      const key = displayDay(x.b, today);
      if (!keys.has(key)) continue;
      out.push({ b: x.b, key, title: x.title, tri: triOf(blocks, x.b.id), ord: x.ord });
    }
  }
  const some = blocks.filter((b) => !b.deletedAt && b.area === 'someday' && !b.parent)
    .filter((b) => (b.done || b.date >= thisWk ? b.date === wk : wk === thisWk))
    .filter((b) => b.text.trim() || b.id === keep)
    .sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
  some.forEach((b, i) => out.push({ b, key: '', title: b.group ?? null, tri: triOf(blocks, b.id), ord: i }));
  return out;
}

/** 묶음으로 — 처음 나온 순서대로, 같은 이름은 하나로 */
export function groupItems(items: WItem[]): WGroup[] {
  const out: WGroup[] = [];
  for (const it of items) {
    let g = out.find((x) => x.title === it.title);
    if (!g) out.push((g = { title: it.title, items: [] }));
    g.items.push(it);
  }
  return out;
}

/** 날짜 칸 하나 — 그 날 적은 줄이 먼저, 지난 날에서 이어진 줄은 같은 이름 묶음 끝에 (일간 상세와 같은 순서) */
export function cellGroups(items: WItem[], key: string): WGroup[] {
  const mine = items.filter((x) => x.key === key)
    .sort((a, b) => (a.b.date === key ? 0 : 1) - (b.b.date === key ? 0 : 1) || (a.b.date < b.b.date ? -1 : a.b.date > b.b.date ? 1 : a.ord - b.ord));
  return groupItems(mine);
}

/**
 * 오른쪽 목록 — 묶음별 (v3 weekGroups · grpHtml)
 *  · 묶음 순서 = 요일 순으로 처음 나온 순서 (미정은 그 주 월요일에 있는 셈 — v3 가 월요일에 담았다)
 *  · 「미분류」 는 늘 맨 아래 (v3 — 아직 자리를 안 정한 것끼리 바닥에)
 *  · 묶음 안은 미정이 먼저, 그 다음 요일 순
 */
export function listGroups(items: WItem[], done: boolean): WGroup[] {
  const sel = items.filter((x) => !!x.b.done === done);
  const dayOrd = (x: WItem) => x.key || x.b.date;
  const appear = sel.slice().sort((a, b) => (dayOrd(a) < dayOrd(b) ? -1 : dayOrd(a) > dayOrd(b) ? 1 : (a.key ? 1 : 0) - (b.key ? 1 : 0) || a.ord - b.ord));
  const gs = groupItems(appear);
  for (const g of gs) {
    g.items.sort((a, b) => (a.key ? 1 : 0) - (b.key ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.b.date < b.b.date ? -1 : a.b.date > b.b.date ? 1 : a.ord - b.ord));
  }
  return [...gs.filter((g) => g.title != null), ...gs.filter((g) => g.title == null)];
}

// ─────────────────────────────────────────────────────────── 옮기기 · 만들기

export interface Change { patches: Patch[]; created: Block[] }

/**
 * 그 날 그 묶음의 «끝» 자리 — 묶음 이름이 null 이면 어떤 제목보다도 앞 (v3.1.28)
 * 그 날에 그 이름의 제목이 없으면 맨 끝에 제목 줄을 새로 만든다 (제목 줄이 묶음을 정의 — Q3)
 */
export function slotIn(blocks: Block[], date: string, title: string | null, n: NewBlockInput, headType: BlockType = 'h2', skip?: string): { pos: number; created: Block[] } {
  const top = blocks.filter((b) => !b.deletedAt && b.date === date && b.area === 'today' && !b.parent && b.id !== skip)
    .sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
  if (title == null) {
    const h = top.findIndex((b) => isHead(b));
    if (h < 0) return { pos: posBetween(top.length ? top[top.length - 1].pos : null, null), created: [] };
    return { pos: posBetween(h > 0 ? top[h - 1].pos : null, top[h].pos), created: [] };
  }
  const hi = top.findIndex((b) => isHead(b) && b.text.trim() === title);
  if (hi < 0) {
    const last = top[top.length - 1];
    const hp = posBetween(last ? last.pos : null, null);
    const head: Block = { id: `${n.id}h`, date, area: 'today', parent: null, pos: hp, type: headType, text: title, createdAt: n.now, updatedAt: n.now };
    return { pos: hp + 1, created: [head] };
  }
  let j = hi + 1;
  while (j < top.length && !isHead(top[j])) j++;
  return { pos: posBetween(top[j - 1].pos, top[j] ? top[j].pos : null), created: [] };
}

/** 미정 목록 맨 위 자리 (v3 unshift — 아직 아무 데도 속하지 않은 줄은 앞) */
function somedayTop(blocks: Block[], wk: string): number {
  const s = blocks.filter((b) => !b.deletedAt && b.area === 'someday' && b.date === wk && !b.parent);
  return s.length ? Math.min(...s.map((b) => b.pos)) - 1 : 1;
}

/**
 * 날짜 · 묶음 옮기기 (v3 moveTodo · moveToGroup · ungroup 을 하나로) — 덩어리째
 *  to.day: 'YYYY-MM-DD' 그 날 / '' 미정 / undefined 그대로
 *  to.title: 묶음 이름 / null 묶음에서 빼기 / undefined 그대로
 */
export function moveItem(blocks: Block[], b: Block, to: { day?: string; title?: string | null }, wk: string, today: string, n: NewBlockInput): Change | null {
  const curTitle = groupOf(blocks, b);
  const curDay = b.area === 'someday' ? '' : displayDay(b, today);
  const day = to.day === undefined ? curDay : to.day;
  const title = to.title === undefined ? curTitle : to.title;
  if (day === curDay && title === curTitle) return null;
  const kids = descendants(blocks, b.id);
  const headType = (() => {
    if (b.area !== 'today') return 'h2' as BlockType;
    const h = blocks.find((x) => !x.deletedAt && x.date === b.date && x.area === 'today' && !x.parent && isHead(x) && x.text.trim() === curTitle);
    return h ? h.type : 'h2';
  })();
  if (day === '') {
    const ps: Patch[] = [{ id: b.id, area: 'someday', date: wk, parent: null, pos: somedayTop(blocks, wk), group: title, done: false, doneOn: null, doneAt: null }];
    for (const k of kids) ps.push({ id: k.id, area: 'someday', date: wk });
    return { patches: ps, created: [] };
  }
  const slot = slotIn(blocks, day, title, n, headType, b.id);
  const p: Patch = { id: b.id, area: 'today', date: day, parent: null, pos: slot.pos, group: null, pinnedOn: day < today ? today : null };
  if (b.done) p.doneOn = day;
  const ps: Patch[] = [p];
  for (const k of kids) ps.push({ id: k.id, area: 'today', date: day, ...(k.done ? { doneOn: day } : {}) });
  return { patches: ps, created: slot.created };
}

/** ＋ — 그 날(또는 미정)의 그 묶음 끝에 빈 할 일 하나 */
export function addItem(blocks: Block[], wk: string, day: string, title: string | null, n: NewBlockInput): Change {
  if (day === '') {
    const nb: Block = { id: n.id, date: wk, area: 'someday', parent: null, pos: somedayTop(blocks, wk), type: 'check', text: '', group: title, createdAt: n.now, updatedAt: n.now };
    return { patches: [], created: [nb] };
  }
  const slot = slotIn(blocks, day, title, n);
  const nb: Block = { id: n.id, date: day, area: 'today', parent: null, pos: slot.pos, type: 'check', text: '', createdAt: n.now, updatedAt: n.now };
  return { patches: [], created: [...slot.created, nb] };
}

/** 주간 칸에서 Enter — 바로 아래 형제 자리에 새 할 일 (같은 날 · 같은 묶음). 지난 날에서 이어진 줄이면 오늘에 */
export function addAfter(blocks: Block[], it: WItem, wk: string, n: NewBlockInput): Change {
  const b = it.b;
  if (b.area === 'someday') {
    const s = blocks.filter((x) => !x.deletedAt && x.area === 'someday' && x.date === b.date && !x.parent).sort((a, c) => a.pos - c.pos);
    const i = s.findIndex((x) => x.id === b.id);
    const nb: Block = { id: n.id, date: b.date, area: 'someday', parent: null, pos: posBetween(b.pos, s[i + 1] ? s[i + 1].pos : null), type: 'check', text: '', group: b.group ?? null, createdAt: n.now, updatedAt: n.now };
    return { patches: [], created: [nb] };
  }
  if (b.date !== it.key) return addItem(blocks, wk, it.key, it.title, n);
  const sib = blocks.filter((x) => !x.deletedAt && x.date === b.date && x.area === 'today' && !x.parent).sort((a, c) => a.pos - c.pos);
  const i = sib.findIndex((x) => x.id === b.id);
  const nb: Block = { id: n.id, date: b.date, area: 'today', parent: null, pos: posBetween(b.pos, sib[i + 1] ? sib[i + 1].pos : null), type: 'check', text: '', createdAt: n.now, updatedAt: n.now };
  return { patches: [], created: [nb] };
}
