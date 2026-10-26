import { describe, expect, it } from 'vitest';
import {
  appendBlock, carriedInto, continuesToToday, deleteChunk, flatten, indent, insertBelow, markdownType, outdent,
  rangeRate, removeEmpty, type Block, type Patch,
} from './tree';

let n = 0;
const B = (date: string, text: string, x: Partial<Block> = {}): Block => ({
  id: `b${++n}`, date, area: 'today', parent: null, pos: n, type: 'check', text, createdAt: 0, updatedAt: 0, ...x,
});
const apply = (list: Block[], p: Patch | null) => (p ? list.map((b) => (b.id === p.id ? { ...b, ...p } : b)) : list);
const view = (list: Block[], date: string) => flatten(list, date, 'today').map((r) => `${'  '.repeat(r.depth)}${r.b.text}`);
const D1 = '2026-10-26', D2 = '2026-10-27';

describe('트리 → 화면 순서', () => {
  it('부모 아래 자식이 들여써져 보인다', () => {
    const a = B(D1, '보고서'); const b = B(D1, '자료', { parent: a.id }); const c = B(D1, '초안', { parent: a.id }); const d = B(D1, '운동');
    expect(view([d, c, b, a], D1)).toEqual(['보고서', '  자료', '  초안', '운동']);
  });
  it('부모가 지워졌으면 맨 바깥으로', () => {
    const a = B(D1, 'A', { deletedAt: 1 }); const b = B(D1, 'B', { parent: a.id });
    expect(view([a, b], D1)).toEqual(['B']);
  });
});

describe('편집', () => {
  it('Enter — 자식이 있으면 첫 자식으로, 없으면 바로 아래 형제로', () => {
    const a = B(D1, '보고서'); const b = B(D1, '자료', { parent: a.id }); const c = B(D1, '운동');
    let list = [a, b, c];
    list = [...list, insertBelow(list, a, '새1', { id: 'n1', now: 0 })];
    list = [...list, insertBelow(list, c, '새2', { id: 'n2', now: 0 })];
    expect(view(list, D1)).toEqual(['보고서', '  새1', '  자료', '운동', '새2']);
  });
  it('제목 아래 Enter 는 할 일', () => {
    const h = B(D1, '프로젝트', { type: 'h3' });
    expect(insertBelow([h], h, '', { id: 'x', now: 0 }).type).toBe('check');
  });
  it('Tab · ⇧Tab — 자식은 부모를 따라간다', () => {
    const a = B(D1, 'A'); const b = B(D1, 'B'); const c = B(D1, 'C', { parent: b.id });
    let list = [a, b, c];
    list = apply(list, indent(list, b, 0));
    expect(view(list, D1)).toEqual(['A', '  B', '    C']);
    list = apply(list, outdent(list, list.find((x) => x.id === b.id)!));
    expect(view(list, D1)).toEqual(['A', 'B', '  C']);
    expect(indent(list, a, 0)).toBeNull(); // 위 형제가 없다
  });
  it('지우기는 덩어리째', () => {
    const a = B(D1, 'A'); const b = B(D1, 'B', { parent: a.id }); const c = B(D1, 'C', { parent: b.id });
    expect(deleteChunk([a, b, c], a).sort()).toEqual([a.id, b.id, c.id].sort());
  });
  it('빈 줄을 지우면 자식은 그 자리로 올라온다', () => {
    const a = B(D1, ''); const b = B(D1, 'B', { parent: a.id }); const c = B(D1, 'C');
    let list = [a, b, c];
    for (const p of removeEmpty(list, a)) list = apply(list, p);
    list = list.filter((x) => x.id !== a.id);
    expect(view(list, D1)).toEqual(['B', 'C']);
  });
  it('줄 앞 표시로 종류 바꾸기', () => {
    expect(markdownType('## 기획', 'today')).toEqual({ type: 'h2', text: '기획' });
    expect(markdownType('- 메모', 'today')).toEqual({ type: 'bullet', text: '메모' });
    expect(markdownType('[] 할 일', 'memo')).toBeNull();
    expect(markdownType('그냥 글', 'today')).toBeNull();
  });
  it('맨 끝에 붙이기', () => {
    const a = B(D1, 'A');
    const x = appendBlock([a], D1, 'today', 'B', { id: 'x', now: 0 });
    expect(view([a, x], D1)).toEqual(['A', 'B']);
  });
});

describe('보여주기 이월 — 옮기지 않는다', () => {
  it('지난 날의 못 끝낸 바깥 할 일만, 자식과 함께, 묶음 이름과 함께', () => {
    const h = B(D1, 'DeskMate', { type: 'h3' });
    const a = B(D1, '로그인'); const a1 = B(D1, '구글', { parent: a.id, done: true });
    const done = B(D1, '끝낸 일', { done: true });
    const bul = B(D1, '글머리', { type: 'bullet' });
    const empty = B(D1, '  ');
    const c = carriedInto([h, a, a1, done, bul, empty], D2);
    expect(c).toHaveLength(1);
    expect(c[0].root.b.text).toBe('로그인');
    expect(c[0].kids.map((k) => k.b.text)).toEqual(['구글']);
    expect(c[0].group).toBe('DeskMate');
    expect(c[0].fromDate).toBe(D1);
  });
  it('지난 날에서 체크하면 그 날 끝낸 것이 되고, 오늘에는 더 안 보인다', () => {
    const a = B(D1, '보고서', { done: true, doneOn: D1 });
    expect(carriedInto([a], D2)).toHaveLength(0);
  });
  it('원래 날에는 그대로 있다 (사라지지 않는다)', () => {
    const a = B(D1, '보고서');
    expect(view([a], D1)).toEqual(['보고서']);
    expect(continuesToToday(a, 0, D2)).toBe(true);
    expect(continuesToToday(a, 0, D1)).toBe(false);
  });
  it('오늘 적은 줄은 이월 대상이 아니다', () => {
    expect(carriedInto([B(D2, '오늘 일')], D2)).toHaveLength(0);
  });
});

describe('달성 — 적은 날 기준, 바깥 줄만', () => {
  it('딸린 줄은 세지 않고, 제목 밑 줄은 센다', () => {
    const h = B(D1, '묶음', { type: 'h3' });
    const a = B(D1, 'A', { parent: h.id, done: true });
    const a1 = B(D1, 'A-1', { parent: a.id });
    const b = B(D1, 'B');
    expect(rangeRate([h, a, a1, b], D1, D1)).toEqual({ n: 2, done: 1 });
  });
});

describe('오늘 화면에서 끝낸 지난 할 일', () => {
  it('오늘 체크했으면 오늘 목록에 끝낸 채로 남는다', () => {
    const a = B(D1, '보고서', { done: true, doneOn: D2 });
    expect(carriedInto([a], D2)).toHaveLength(1);
    expect(carriedInto([a], '2026-10-28')).toHaveLength(0); // 그 다음 날에는 안 보인다
  });
});

import { inverseOf, moveChunk, triFix, triOf, triToggle } from './tree';
const ap = (list: Block[], ps: Patch[]) => ps.reduce((l, p) => l.map((b) => (b.id === p.id ? { ...b, ...p } : b)), list);

describe('부분 체크 — LOGIC §6-3', () => {
  const tree = () => {
    const a = B(D1, '보고서'); const k1 = B(D1, '자료', { parent: a.id }); const k2 = B(D1, '초안', { parent: a.id });
    const bul = B(D1, '메모', { parent: a.id, type: 'bullet' }); const k3 = B(D1, '그림', { parent: bul.id });
    const empty = B(D1, '', { parent: a.id });
    return { a, k1, k2, k3, list: [a, k1, k2, bul, k3, empty] };
  };
  it('글머리 밑 할 일은 위 체크 줄의 것, 빈 줄은 안 센다', () => {
    const { a, list } = tree();
    expect(triOf(list, a.id)).toEqual({ ok: 0, n: 3, state: 'empty' });
  });
  it('하위를 전부 끝내도 상위는 저절로 안 켜진다 (v3.1.245 A안)', () => {
    const { a, k1, k2, k3, list } = tree();
    const l = ap(list, [{ id: k1.id, done: true, doneAt: 10 }, { id: k2.id, done: true, doneAt: 30 }, { id: k3.id, done: true, doneAt: 20 }]);
    expect(triFix(l, [k3.id], D1)).toEqual([]);
    expect(triOf(l, a.id)!.state).toBe('full');
    expect(l.find((b) => b.id === a.id)!.done).toBeFalsy();
  });
  it('상위를 누르면 하위 전부 — full 이면 전부 해제', () => {
    const { a, list } = tree();
    const on = ap(list, triToggle(list, a, D1, 5));
    expect(on.filter((b) => b.type === 'check' && b.text).every((b) => b.done)).toBe(true);
    const off = ap(on, triToggle(on, on.find((b) => b.id === a.id)!, D1, 6));
    expect(off.filter((b) => b.type === 'check').some((b) => b.done)).toBe(false);
  });
  it('하위 하나를 풀면 상위도 풀린다', () => {
    const { a, k1, list } = tree();
    let l = ap(list, triToggle(list, a, D1, 5));
    l = ap(l, triToggle(l, l.find((b) => b.id === k1.id)!, D1, 6));
    expect(l.find((b) => b.id === a.id)!.done).toBe(false);
    expect(triOf(l, a.id)!.state).toBe('part');
  });
});

describe('끌어서 옮기기 · 되돌리기', () => {
  it('덩어리째 대상 아래로, 자기 밑으로는 못 간다', () => {
    const a = B(D1, 'A'); const a1 = B(D1, 'A1', { parent: a.id }); const b = B(D1, 'B'); const c = B(D1, 'C');
    let l = [a, a1, b, c];
    l = ap(l, [moveChunk(l, a, c, 'after')!]);
    expect(view(l, D1)).toEqual(['B', 'C', 'A', '  A1']);
    expect(moveChunk(l, a, a1, 'after')).toBeNull();
  });
  it('반대 고침으로 원래대로', () => {
    const a = B(D1, 'A'); const b = B(D1, 'B');
    const ps: Patch[] = [{ id: b.id, parent: a.id, pos: 1, text: '바뀜' }];
    const inv = inverseOf([a, b], ps);
    const back = ap(ap([a, b], ps), inv);
    expect(view(back, D1)).toEqual(['A', 'B']);
  });
});
