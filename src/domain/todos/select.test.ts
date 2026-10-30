import { describe, expect, it } from 'vitest';
import { flatten, type Block, type Patch } from './tree';
import { pasteLines, selDelete, selMark, selShift, selText } from './select';

let n = 0;
const D = '2026-10-30';
const B = (text: string, x: Partial<Block> = {}): Block => ({ id: `s${++n}`, date: D, area: 'memo', parent: null, pos: n, type: 'bullet', text, createdAt: 0, updatedAt: 0, ...x });
const apply = (list: Block[], ps: Patch[]) => list.map((b) => { const p = ps.filter((x) => x.id === b.id); return p.length ? Object.assign({ ...b }, ...p) : b; });
const view = (list: Block[]) => flatten(list, D, 'memo').map((r) => `${'  '.repeat(r.depth)}${r.b.text}`);

describe('여러 줄 고르기 (v3 bsel)', () => {
  it('지우기 — 고르지 않은 딸린 줄은 그 자리로 올라온다', () => {
    const a = B('가'), a1 = B('가-1', { parent: a.id }), b = B('나');
    const list = [a, a1, b];
    expect(view(apply(list, selDelete(list, [a.id], 1)))).toEqual(['가-1', '나']);
    expect(view(apply(list, selDelete(list, [a.id, a1.id], 1)))).toEqual(['나']);
  });
  it('Tab · ⇧Tab — 순서를 지키고, 부모를 같이 고르면 부모와 함께', () => {
    const a = B('가'), b = B('나'), c = B('다');
    let list = [a, b, c];
    list = apply(list, selShift(list, flatten(list, D, 'memo'), [b.id, c.id], false));
    expect(view(list)).toEqual(['가', '  나', '  다']);
    list = apply(list, selShift(list, flatten(list, D, 'memo'), [b.id, c.id], true));
    expect(view(list)).toEqual(['가', '나', '다']);
  });
  it('복사 = v3 형식 · 붙여넣기가 그대로 되읽는다 (번호 · 깊이 · 체크)', () => {
    const h = B('제목', { type: 'h2' }), x = B('일', { type: 'num', start: 3 }), y = B('딸림', { parent: x.id, type: 'check', done: true });
    const list = [h, x, y];
    const text = selText(flatten(list, D, 'memo'), [h.id, x.id, y.id]);
    expect(text).toBe('## 제목\n3. 일\n  [x] 딸림');
    const cur = B('');
    let k = 0;
    const r = pasteLines([cur], cur, text, 'memo', () => `p${++k}`, 5);
    const after = [...apply([cur], r.patches), ...r.created];
    expect(view(after)).toEqual(['제목', '일', '  딸림']);
    expect(after.map((b) => b.type)).toEqual(['h2', 'num', 'check']);
    expect(after[1].start).toBe(3);
    expect(after[2].done).toBe(true);
  });
  it('서식 — 전부 걸려 있으면 풀고, 하나라도 아니면 전부에 (v3.1.256)', () => {
    const a = B('~~가~~'), b = B('나 다');
    const on = selMark([a, b], [a.id, b.id], 's');
    expect(on).toEqual([{ id: b.id, text: '~~나 다~~' }]);
    const both = apply([a, b], on);
    expect(selMark(both, [a.id, b.id], 's')).toEqual([{ id: a.id, text: '가' }, { id: b.id, text: '나 다' }]);
  });
});
