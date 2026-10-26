/**
 * 할 일 · 메모 — 줄(블록) 트리 (2026-10-26 소유자 결정: 이월은 «보여주기», 계층은 트리)
 *
 * ▣ 저장은 줄 하나 = 문서 하나. 줄마다 «부모» 와 «형제 사이 순서(pos)» 를 갖는다.
 *   화면은 이것을 위에서부터 펼쳐(깊이 = 들여쓰기) v3 와 같은 모양으로 그린다.
 *   v3 는 «평평한 목록 + 들여쓰기 숫자» 라 누가 누구 밑인지를 순서로 짐작했다 — 여러 기기가 동시에
 *   고치면 순서가 섞여 남의 밑으로 들어간다. 트리는 부모가 적혀 있어 섞이지 않는다 (결함표 B23 · B31)
 *
 * ▣ 이월은 하지 않는다 — 줄은 적힌 날에 그대로 있다.
 *   오늘 화면은 «지난 날의 못 끝낸 줄» 을 함께 보여 줄 뿐이다 (v3 의 D+N 뱃지 모양 그대로).
 *   그래서 자정 이월 · 흔적 · 흔적 체크 · 이월 되돌리기가 없다 (결함표 B12~B15 · B18 · D7 소멸)
 *
 * ▣ 끝낸 날 = 체크한 화면의 날짜 (소유자 결정). 월요일 화면에서 체크하면 월요일에 끝낸 것
 */

/** today 할 일 · memo 하루 메모 · someday 미정(주) · wmemo 주 메모 — 자세한 건 week.ts */
export type BlockArea = 'today' | 'memo' | 'someday' | 'wmemo';
export type BlockType = 'check' | 'bullet' | 'h1' | 'h2' | 'h3';

export interface Block {
  id: string;
  /** 적힌 날 (YYYY-MM-DD). 옮겨 다니지 않는다 */
  date: string;
  area: BlockArea;
  /** 부모 줄 id. 맨 바깥이면 null */
  parent: string | null;
  /** 형제 사이 순서 — 작을수록 위 */
  pos: number;
  type: BlockType;
  text: string;
  done?: boolean;
  /** 끝낸 날 = 체크한 화면의 날짜 */
  doneOn?: string | null;
  /** 체크한 시각 (v3 stamp) */
  doneAt?: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** 미정(someday) 줄의 묶음 이름 — 날짜 칸 줄은 위 제목 줄이 묶음을 정한다 */
  group?: string | null;
  /**
   * 지난 날로 «손으로» 옮긴 날 — 그 날 하루는 옮긴 칸에 그대로 둔다 (v3 는 다음 자정 이월 때까지 거기 있었다).
   * 다음 날부터는 다른 못 끝낸 줄처럼 오늘로 이어진다
   */
  pinnedOn?: string | null;
}

export const isHead = (b: Pick<Block, 'type'>) => b.type === 'h1' || b.type === 'h2' || b.type === 'h3';
/** v3 MAX_IND */
export const MAX_DEPTH = 8;

export interface Row { b: Block; depth: number }

/** 형제 정렬 — 순서, 같으면 id (어느 기기에서 그려도 같은 순서) */
const bySibling = (a: Block, b: Block) => a.pos - b.pos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 그 날 그 영역의 줄을 화면 순서로 펼친다. 부모가 사라진(지워진) 줄은 맨 바깥으로 올린다 */
export function flatten(blocks: Block[], date: string, area: BlockArea): Row[] {
  const mine = blocks.filter((b) => !b.deletedAt && b.date === date && b.area === area);
  const ids = new Set(mine.map((b) => b.id));
  const kids = new Map<string | null, Block[]>();
  for (const b of mine) {
    const p = b.parent && ids.has(b.parent) ? b.parent : null;
    (kids.get(p) ?? kids.set(p, []).get(p)!).push(b);
  }
  for (const list of kids.values()) list.sort(bySibling);
  const out: Row[] = [];
  const seen = new Set<string>();
  const walk = (p: string | null, depth: number) => {
    for (const b of kids.get(p) ?? []) {
      if (seen.has(b.id)) continue; // 순환 방어
      seen.add(b.id);
      out.push({ b, depth: Math.min(depth, MAX_DEPTH) });
      walk(b.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** 자식 · 손자 전부 (지워진 것 빼고) */
export function descendants(blocks: Block[], id: string): Block[] {
  const live = blocks.filter((b) => !b.deletedAt);
  const out: Block[] = [];
  const stack = [id];
  while (stack.length) {
    const p = stack.pop()!;
    for (const b of live) if (b.parent === p && !out.includes(b)) { out.push(b); stack.push(b.id); }
  }
  return out;
}

const siblingsOf = (blocks: Block[], b: Pick<Block, 'date' | 'area' | 'parent'>) =>
  blocks.filter((x) => !x.deletedAt && x.date === b.date && x.area === b.area && x.parent === b.parent).sort(bySibling);

/** a 와 b 사이 순서값 (b 가 없으면 a 뒤, a 가 없으면 b 앞) */
export function posBetween(a: number | null, b: number | null): number {
  if (a == null && b == null) return 1;
  if (a == null) return (b as number) - 1;
  if (b == null) return a + 1;
  return (a + b) / 2;
}

/** 바뀔 필드만 담은 고침 — 저장소는 이것을 그대로 보낸다 (바뀐 필드만) */
export type Patch = { id: string } & Partial<Omit<Block, 'id'>>;

export interface NewBlockInput { id: string; now: number }

/**
 * Enter — 그 줄 아래에 새 줄 (v3 감각)
 * 자식이 있으면 «첫 자식» 으로 넣는다 — 형제로 넣으면 그 줄의 자식들이 새 줄을 건너뛰어 보인다
 * 새 줄의 종류: 제목 아래는 할 일(Today) / 글머리(Memo), 그 밖에는 같은 종류
 */
export function insertBelow(blocks: Block[], cur: Block, text: string, n: NewBlockInput, date = cur.date): Block {
  const kids = siblingsOf(blocks, { date: cur.date, area: cur.area, parent: cur.id });
  const type: BlockType = isHead(cur) ? (cur.area === 'today' ? 'check' : 'bullet') : cur.type;
  if (kids.length && !isHead(cur)) {
    return { id: n.id, date, area: cur.area, parent: cur.id, pos: posBetween(null, kids[0].pos), type, text, createdAt: n.now, updatedAt: n.now };
  }
  const sib = siblingsOf(blocks, cur);
  const i = sib.findIndex((x) => x.id === cur.id);
  const next = sib[i + 1];
  return { id: n.id, date, area: cur.area, parent: cur.parent, pos: posBetween(cur.pos, next ? next.pos : null), type, text, createdAt: n.now, updatedAt: n.now };
}

/** 빈 영역에 첫 줄 (또는 맨 끝에 줄 하나) */
export function appendBlock(blocks: Block[], date: string, area: BlockArea, text: string, n: NewBlockInput, type?: BlockType): Block {
  const top = siblingsOf(blocks, { date, area, parent: null });
  const last = top[top.length - 1];
  return {
    id: n.id, date, area, parent: null, pos: posBetween(last ? last.pos : null, null),
    type: type ?? (area === 'today' ? 'check' : 'bullet'), text, createdAt: n.now, updatedAt: n.now,
  };
}

/** Tab — 바로 위 형제의 마지막 자식으로. 위 형제가 없거나 너무 깊으면 null (v3 «한 줄이라도 못 가면 그대로») */
export function indent(blocks: Block[], cur: Block, depth: number): Patch | null {
  if (depth >= MAX_DEPTH) return null;
  const sib = siblingsOf(blocks, cur);
  const i = sib.findIndex((x) => x.id === cur.id);
  const prev = sib[i - 1];
  if (!prev) return null;
  const pk = siblingsOf(blocks, { date: cur.date, area: cur.area, parent: prev.id });
  const last = pk[pk.length - 1];
  return { id: cur.id, parent: prev.id, pos: posBetween(last ? last.pos : null, null) };
}

/** ⇧Tab — 부모 바로 아래 형제로. 맨 바깥이면 null */
export function outdent(blocks: Block[], cur: Block): Patch | null {
  if (!cur.parent) return null;
  const parent = blocks.find((b) => b.id === cur.parent && !b.deletedAt);
  if (!parent) return null;
  const psib = siblingsOf(blocks, parent);
  const i = psib.findIndex((x) => x.id === parent.id);
  const next = psib[i + 1];
  return { id: cur.id, parent: parent.parent, pos: posBetween(parent.pos, next ? next.pos : null) };
}

/**
 * 줄을 지운다 — 덩어리째 (v3 B32: 부모를 지우면 자식도 함께, 되살릴 때도 함께)
 * 돌려주는 것은 지운 줄 id 전부 (되돌리기에 쓴다)
 */
export function deleteChunk(blocks: Block[], cur: Block): string[] {
  return [cur.id, ...descendants(blocks, cur.id).map((b) => b.id)];
}

/**
 * 비어 있는 줄을 Backspace 로 지울 때 — 자식은 남겨서 그 자리로 올린다
 * (빈 줄에 자식이 달린 건 사람이 의도한 상태가 아니다 — v3.1.131)
 */
export function removeEmpty(blocks: Block[], cur: Block): Patch[] {
  const kids = siblingsOf(blocks, { date: cur.date, area: cur.area, parent: cur.id });
  const sib = siblingsOf(blocks, cur);
  const i = sib.findIndex((x) => x.id === cur.id);
  const next = sib[i + 1];
  // 자식들을 cur 자리에 차례로 끼운다
  const lo = cur.pos, hi = next ? next.pos : null;
  const step = hi == null ? 1 : (hi - lo) / (kids.length + 1);
  return kids.map((k, j) => ({ id: k.id, parent: cur.parent, pos: hi == null ? lo + (j + 1) * 0.001 : lo + step * (j + 1) }));
}

/** 줄 앞에서 치는 표시 → 줄 종류 (v3: `# ` ~ `### ` 제목 · `- ` 글머리 · `[] ` 할 일) */
export function markdownType(text: string, area: BlockArea): { type: BlockType; text: string } | null {
  const m = /^(#{1,3}|-|\*|\[\]|\[ \])\s/.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length);
  if (m[1].startsWith('#')) return { type: (`h${m[1].length}` as BlockType), text: rest };
  if (m[1] === '-' || m[1] === '*') return { type: 'bullet', text: rest };
  return area === 'today' ? { type: 'check', text: rest } : null;
}

// ─────────────────────────────────────────────────────────── 보여주기 이월

/**
 * 오늘 화면에 함께 보여 줄 «지난 날의 못 끝낸 줄» (v3 carryTodos 의 대상 규칙 그대로)
 *  · 맨 바깥 할 일만 (제목 · 글머리 · 빈 줄 · 끝낸 줄은 안 넘긴다 — B16)
 *  · 단, «오늘 화면에서 끝낸» 줄은 오늘에 남는다 (v3 에서 오늘 체크한 줄이 오늘 목록에 남듯이)
 *  · 그 줄의 자식은 함께 따라온다 (덩어리)
 *  · 묶음(바로 위 제목)의 이름을 같이 준다 — 오늘 같은 이름의 묶음이 있으면 그 밑에 그린다
 * 돌려주는 순서: 오래된 날 → 최근 날, 같은 날 안에서는 화면 순서
 */
export interface Carried { root: Row; kids: Row[]; group: string; fromDate: string }

export function carriedInto(blocks: Block[], today: string): Carried[] {
  const dates = [...new Set(blocks.filter((b) => !b.deletedAt && b.area === 'today' && b.date < today).map((b) => b.date))].sort();
  const out: Carried[] = [];
  for (const date of dates) {
    const rows = flatten(blocks, date, 'today');
    let group = '';
    for (let i = 0; i < rows.length; i++) {
      const { b, depth } = rows[i];
      if (depth === 0 && isHead(b)) { group = b.text.trim(); continue; }
      if (depth !== 0 || b.type !== 'check' || !b.text.trim()) continue;
      if (b.done && b.doneOn !== today) continue;
      if (!b.done && b.pinnedOn === today) continue;
      const kids: Row[] = [];
      for (let j = i + 1; j < rows.length && rows[j].depth > 0; j++) kids.push(rows[j]);
      out.push({ root: rows[i], kids, group, fromDate: date });
    }
  }
  return out;
}

/** 지난 날 화면에서 «오늘로 이어지고 있는» 줄인가 (v3 의 「→ 넘김」 자리) */
export function continuesToToday(b: Block, depth: number, today: string): boolean {
  return b.area === 'today' && depth === 0 && b.type === 'check' && !b.done && !!b.text.trim() && b.date < today && b.pinnedOn !== today;
}

// ─────────────────────────────────────────────────────────── 집계

/** 그 기간에 «적힌» 할 일의 달성 (v3 todosOfRange · 결함표 Q1-3 «적은 날 분모») — 맨 바깥 할 일만 */
export function rangeRate(blocks: Block[], from: string, to: string): { n: number; done: number } {
  let n = 0, done = 0;
  for (const b of blocks) {
    if (b.deletedAt || (b.area !== 'today' && b.area !== 'someday') || b.type !== 'check' || !b.text.trim()) continue;   // 미정은 만든 주에 센다 (Q7)
    if (b.date < from || b.date > to) continue;
    const parent = b.parent ? blocks.find((x) => x.id === b.parent && !x.deletedAt) : null;
    if (parent && !isHead(parent)) continue; // 딸린 줄은 세지 않는다 (바깥 줄만)
    n++;
    if (b.done) done++;
  }
  return { n, done };
}

// ─────────────────────────────────────────────────────────── 부분 체크 (v3 LOGIC §6-3 · 결함표 Q6)
//  상위 완료 = 하위 전부 해결. «-» 는 저장하지 않고 그릴 때 센다. 저장하는 것은 done 뿐이다
//  ★ Q6 — 맞추는 일은 «고친 기기가 고치는 순간» 한 번만 한다 (그릴 때 맞추면 여는 기기마다 쓰기가 생긴다)

/** 판정 대상 하위 — 다른 체크 줄 밑의 줄은 그 줄의 것 · 글머리 밑은 위 체크 줄의 것 · 글자 없는 줄은 뺀다 */
export function triKids(blocks: Block[], id: string): Block[] {
  const live = blocks.filter((b) => !b.deletedAt);
  const out: Block[] = [];
  const walk = (p: string) => {
    for (const b of live.filter((x) => x.parent === p)) {
      if (b.type === 'check') { if (b.text.trim()) out.push(b); continue; }
      if (!isHead(b)) walk(b.id);
    }
  };
  walk(id);
  return out;
}

export interface Tri { ok: number; n: number; state: 'empty' | 'part' | 'full' }
export function triOf(blocks: Block[], id: string): Tri | null {
  const k = triKids(blocks, id);
  if (!k.length) return null;
  const ok = k.filter((b) => b.done).length;
  return { ok, n: k.length, state: ok === 0 ? 'empty' : ok === k.length ? 'full' : 'part' };
}

const applyPatches = (blocks: Block[], ps: Patch[]) => {
  const m = new Map<string, Patch>();
  for (const p of ps) m.set(p.id, { ...(m.get(p.id) ?? {}), ...p });
  return blocks.map((b) => (m.has(b.id) ? { ...b, ...m.get(b.id) } as Block : b));
};

/** 체크를 누른다 — 딸린 할 일이 있으면 전부 함께 (full 이면 전부 해제, 아니면 전부 완료) */
export function triToggle(blocks: Block[], b: Block, viewDate: string, now: number): Patch[] {
  const t = triOf(blocks, b.id);
  const on = t ? t.state !== 'full' : !b.done;
  const set = (x: Block): Patch => ({ id: x.id, done: on, doneOn: on ? viewDate : null, doneAt: on ? now : null });
  const ps: Patch[] = [set(b)];
  if (t) for (const d of descendants(blocks, b.id)) if (d.type === 'check' && d.text.trim() && !!d.done !== on) ps.push(set(d));
  return [...ps, ...triFix(applyPatches(blocks, ps), [b.id], viewDate)];
}

/**
 * 고친 줄의 윗줄들을 아래에서부터 맞춘다 (v3 triSync) — 고친 기기가 고칠 때 한 번만 부른다
 * v3.1.245 — 상위를 «끄는» 것만 한다 (하위를 풀면 상위도 풀림). 하위를 다 끝내도 상위는 사람이 눌러야 완료
 */
export function triFix(blocks: Block[], touched: string[], viewDate: string): Patch[] {
  let cur = blocks;
  const out: Patch[] = [];
  const seen = new Set<string>();
  for (const id of touched) {
    let b = cur.find((x) => x.id === id);
    let p = b?.parent ? cur.find((x) => x.id === b!.parent && !x.deletedAt) : undefined;
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      if (p.type === 'check') {
        const k = triKids(cur, p.id);
        if (k.length) {
          const all = k.every((x) => x.done);
          // v3.1.245 (소유자 결정 A안) — 하위를 다 끝내도 상위는 저절로 안 켜진다. 내려가는 것만 맞춘다
          if (p.done && !all) {
            const last = Math.max(0, ...k.map((x) => x.doneAt ?? 0));
            const fix: Patch = { id: p.id, done: all, doneOn: all ? viewDate : null, doneAt: all ? (last || null) : null };
            out.push(fix);
            cur = applyPatches(cur, [fix]);
          }
        }
      }
      b = p;
      p = b.parent ? cur.find((x) => x.id === b!.parent && !x.deletedAt) : undefined;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── 끌어서 옮기기 (v3 ⠿)

/**
 * 덩어리째 옮긴다 — 대상 줄의 위(before) 또는 아래(after) 형제 자리로.
 * 자기 자신이나 자기 밑으로는 못 간다 (null)
 */
export function moveChunk(blocks: Block[], drag: Block, target: Block, where: 'before' | 'after'): Patch | null {
  if (drag.id === target.id) return null;
  if (descendants(blocks, drag.id).some((d) => d.id === target.id)) return null;
  const sib = siblingsOf(blocks, target).filter((x) => x.id !== drag.id);
  const i = sib.findIndex((x) => x.id === target.id);
  const pos = where === 'before'
    ? posBetween(sib[i - 1] ? sib[i - 1].pos : null, target.pos)
    : posBetween(target.pos, sib[i + 1] ? sib[i + 1].pos : null);
  return { id: drag.id, parent: target.parent, pos };
}

// ─────────────────────────────────────────────────────────── 되돌리기 (결함표 Q4 — 그 기기의 동작 = 반대 고침 한 건)

/** 고치기 «전» 값으로 되돌리는 고침 — 새로 만든 줄은 지우기로 */
export function inverseOf(blocks: Block[], patches: Patch[], created: Block[] = []): Patch[] {
  const inv: Patch[] = [];
  for (const p of patches) {
    const b = blocks.find((x) => x.id === p.id);
    if (!b) continue;
    const back: Patch = { id: p.id };
    for (const k of Object.keys(p) as (keyof Patch)[]) {
      if (k === 'id' || k === 'updatedAt') continue;
      (back as Record<string, unknown>)[k] = (b as unknown as Record<string, unknown>)[k] ?? (k === 'deletedAt' ? 0 : null);
    }
    inv.push(back);
  }
  for (const c of created) inv.push({ id: c.id, deletedAt: Date.now() });
  return inv.reverse();
}
