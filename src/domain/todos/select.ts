/**
 * 여러 줄 고르기 (v3 bsel* · v2.9.56 · 65 · 74 · v3.1.161 · 186 · 256) — 고른 줄에 한 번에 하는 일
 *
 * ▣ 고른 줄 = 화면 순서로 이어진 줄들 (rows · ids). 트리라서 «부모만 골랐을 때» 를 따로 다룬다
 *     지우기 — 고르지 않은 딸린 줄은 지운 줄 자리로 올린다 (사라지지 않는다)
 *     들여쓰기 — 부모까지 고른 줄은 부모와 함께 움직인다 (따로 안 옮긴다)
 * ▣ 복사는 v3 형식 그대로 — `# 제목` · `1. 번호` · `- 글머리` · `[ ] 할 일` · 깊이마다 두 칸 (붙여넣기가 되읽는다)
 */
import { appendBlock, indent, markdownType, ordNo, outdent, posBetween, type Block, type BlockArea, type BlockType, type Patch, type Row } from './tree';
import { mkChars, mkJoin, mkNorm, type Mk } from './inline';

const live = (blocks: Block[]) => blocks.filter((b) => !b.deletedAt);
const sibs = (blocks: Block[], b: Pick<Block, 'date' | 'area' | 'parent'>) =>
  live(blocks).filter((x) => x.date === b.date && x.area === b.area && x.parent === b.parent).sort((a, c) => a.pos - c.pos || (a.id < c.id ? -1 : 1));
const apply = (blocks: Block[], ps: Patch[]) => {
  const m = new Map<string, Patch>();
  for (const p of ps) m.set(p.id, { ...(m.get(p.id) ?? {}), ...p });
  return blocks.map((b) => (m.has(b.id) ? ({ ...b, ...m.get(b.id) } as Block) : b));
};
/** 고른 줄 중 «부모가 안 골라진» 줄 — 덩어리째 움직일 머리들 */
const heads = (blocks: Block[], ids: string[]) => { const on = new Set(ids); return ids.map((id) => blocks.find((b) => b.id === id)!).filter((b) => b && !(b.parent && on.has(b.parent))); };

/** 고른 줄 지우기 — 고르지 않은 딸린 줄은 지운 줄의 자리로 올린다 */
export function selDelete(blocks: Block[], ids: string[], now: number): Patch[] {
  const on = new Set(ids);
  let cur = blocks;
  const out: Patch[] = [];
  for (const id of ids) {
    const b = cur.find((x) => x.id === id);
    if (!b || b.deletedAt) continue;
    const kids = sibs(cur, { date: b.date, area: b.area, parent: b.id }).filter((k) => !on.has(k.id));
    const ps: Patch[] = [{ id, deletedAt: now }];
    if (kids.length) {
      const sib = sibs(cur, b);
      const next = sib[sib.findIndex((x) => x.id === b.id) + 1];
      const step = next ? (next.pos - b.pos) / (kids.length + 1) : 1;
      kids.forEach((k, j) => ps.push({ id: k.id, parent: b.parent, pos: b.pos + step * (j + 1) }));
    }
    cur = apply(cur, ps);
    out.push(...ps);
  }
  return out;
}

/** 고른 줄을 한 단 안(Tab) · 밖(⇧Tab)으로 — 안으로는 위에서부터, 밖으로는 아래에서부터 (순서를 지킨다) */
export function selShift(blocks: Block[], rows: Pick<Row, 'b' | 'depth'>[], ids: string[], out: boolean): Patch[] {
  const depth = new Map(rows.map((r) => [r.b.id, r.depth]));
  const hs = heads(blocks, ids);
  let cur = blocks;
  const res: Patch[] = [];
  for (const h of out ? [...hs].reverse() : hs) {
    const b = cur.find((x) => x.id === h.id)!;
    const p = out ? outdent(cur, b) : indent(cur, b, depth.get(b.id) ?? 0);
    if (!p) continue;
    cur = apply(cur, [p]);
    res.push(p);
  }
  return res;
}

const HEAD_N: Partial<Record<BlockType, number>> = { h1: 1, h2: 2, h3: 3 };
/** 고른 줄 → 글자 (v3 blockToText) */
export function selText(rows: Pick<Row, 'b' | 'depth'>[], ids: string[]): string {
  const on = new Set(ids);
  return rows.map((r, i) => {
    if (!on.has(r.b.id)) return null;
    if (r.b.type === 'image') return '(이미지)';   // v3 blockToText
    if (r.b.type === 'divider') return '---';
    const pad = '  '.repeat(r.depth), t = r.b.text;
    const h = HEAD_N[r.b.type];
    if (h) return `${pad}${'#'.repeat(h)} ${t}`;
    if (r.b.type === 'num') return `${pad}${ordNo(rows, i)}. ${t}`;
    if (r.b.type === 'bullet') return `${pad}- ${t}`;
    return `${pad}[${r.b.done ? 'x' : ' '}] ${t}`;
  }).filter((x) => x != null).join('\n');
}

/** 고른 줄 전부에 서식 하나 — 전부 이미 걸려 있으면 풀고, 하나라도 아니면 전부에 (v3.1.256 · 노션) */
export function selMark(blocks: Block[], ids: string[], mk: Mk): Patch[] {
  const lines = ids.map((id) => blocks.find((b) => b.id === id)).filter((b): b is Block => !!b && !!b.text.trim());
  if (!lines.length) return [];
  const fullOn = (t: string) => { const cs = mkChars(t).filter((x) => /\S/.test(x.c)); return cs.length > 0 && cs.every((x) => x.m.includes(mk)); };
  const allOn = lines.every((b) => fullOn(b.text));
  const paint = (t: string) => {
    const cs = mkChars(t);
    let a = 0, z = cs.length;
    if (!allOn) { while (a < z && /\s/.test(cs[a].c)) a++; while (z > a && /\s/.test(cs[z - 1].c)) z--; }
    for (let i = a; i < z; i++) cs[i].m = allOn ? mkNorm(cs[i].m.split(mk).join('')) : cs[i].m.includes(mk) ? cs[i].m : mkNorm(cs[i].m + mk);
    const parts: { t: string; m: string }[] = [];
    for (const x of cs) { const l = parts[parts.length - 1]; if (l && l.m === x.m) l.t += x.c; else parts.push({ t: x.c, m: x.m }); }
    return mkJoin(parts);
  };
  return lines.map((b) => ({ id: b.id, text: paint(b.text) })).filter((p, i) => p.text !== lines[i].text);
}

/**
 * 여러 줄 붙여넣기 — 그 줄 아래에 줄마다 새 줄로 (v3 붙여넣기). 앞 두 칸마다 한 단 · `# ` `1. ` `- ` `[ ]` `[x]` 를 읽는다
 * 지금 줄이 비어 있으면 첫 줄은 그 줄에 채운다. 깊이는 바로 윗줄보다 한 단까지만 깊어진다
 */
export function pasteLines(blocks: Block[], cur: Block, text: string, area: BlockArea, newId: () => string, now: number): { patches: Patch[]; created: Block[] } {
  const src = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!src.length) return { patches: [], created: [] };
  const lead = (l: string) => Math.floor(((/^[ \t]*/.exec(l) ?? [''])[0].replace(/\t/g, '  ').length) / 2);
  const min = Math.min(...src.map(lead));
  const parse = (l: string) => {
    const t = l.trim();
    const x = /^\[(x|X)\]\s(.*)$/.exec(t);
    if (x) return { type: 'check' as BlockType, text: x[2], done: true, start: null };
    const md = markdownType(t, area);
    return md ? { type: md.type, text: md.text, done: false, start: md.start ?? null } : { type: (area === 'today' ? 'check' : 'bullet') as BlockType, text: t, done: false, start: null };
  };
  let work = blocks;
  const patches: Patch[] = [], created: Block[] = [];
  // 깊이마다 «마지막으로 놓은 줄» — 0 은 cur 와 같은 단
  const stack: Block[] = [cur];
  let prevDepth = 0;
  src.forEach((l, k) => {
    const p = parse(l);
    if (k === 0 && !cur.text.trim()) {
      const ch: Patch = { id: cur.id, type: p.type, text: p.text, ...(p.done ? { done: true, doneOn: cur.date, doneAt: now } : {}), start: p.start };
      patches.push(ch); work = apply(work, [ch]);
      return;
    }
    const d = Math.min(lead(l) - min, prevDepth + 1);
    prevDepth = d;
    let parent: string | null, pos: number;
    if (d === 0) {
      const ref = work.find((b) => b.id === stack[0].id)!;
      const sib = sibs(work, ref);
      const next = sib[sib.findIndex((x) => x.id === ref.id) + 1];
      parent = ref.parent; pos = posBetween(ref.pos, next ? next.pos : null);
    } else {
      const par = stack[d - 1];
      const kids = sibs(work, { date: cur.date, area: cur.area, parent: par.id });
      parent = par.id; pos = posBetween(kids.length ? kids[kids.length - 1].pos : null, null);
    }
    const nb: Block = { ...appendBlock([], cur.date, cur.area, p.text, { id: newId(), now }, p.type), parent, pos,
      ...(p.done ? { done: true, doneOn: cur.date, doneAt: now } : {}), ...(p.start ? { start: p.start } : {}) };
    created.push(nb); work = [...work, nb];
    stack[d] = nb; stack.length = d + 1;
  });
  return { patches, created };
}
