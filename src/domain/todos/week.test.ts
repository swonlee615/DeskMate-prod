import { describe, expect, it } from 'vitest';
import { flatten, rangeRate, type Block, type Patch } from './tree';
import { addItem, cellGroups, listGroups, moveItem, weekItems } from './week';

let n = 0;
const B = (date: string, text: string, x: Partial<Block> = {}): Block => ({
  id: `w${++n}`, date, area: 'today', parent: null, pos: n, type: 'check', text, createdAt: 0, updatedAt: 0, ...x,
});
const ap = (list: Block[], c: { patches: Patch[]; created: Block[] } | null) =>
  c ? [...c.patches.reduce((l, p) => l.map((b) => (b.id === p.id ? { ...b, ...p } : b)), list), ...c.created] : list;
const WK = '2026-10-19', MON = '2026-10-19', TUE = '2026-10-20', WED = '2026-10-21', FRI = '2026-10-23';
const TODAY = WED;
const cell = (l: Block[], k: string) => cellGroups(weekItems(l, WK, TODAY), k).map((g) => `${g.title ?? '-'}: ${g.items.map((x) => x.b.text).join(',')}`);
const view = (l: Block[], d: string) => flatten(l, d, 'today').map((r) => `${'  '.repeat(r.depth)}${r.b.text}`);

describe('주간 — 어느 칸에 서나', () => {
  const base = () => {
    const r = B(MON, '보고서');
    return [
    B(MON, 'SQLD', { type: 'h2' }), B(MON, '기출 1회'), B(MON, '오답', { done: true, doneOn: MON }),
    r, B(MON, '자료', { parent: r.id }),
    B(TUE, '운동', { done: true, doneOn: WED }),
    B(FRI, '장보기'),
  ].map((b, i) => ({ ...b, pos: i })); };
  it('못 끝낸 지난 줄은 오늘 칸, 끝낸 줄은 끝낸 날 칸', () => {
    const l = base();
    expect(cell(l, MON)).toEqual(['SQLD: 오답']);
    expect(cell(l, TUE)).toEqual([]);
    expect(cell(l, WED)).toEqual(['SQLD: 기출 1회,보고서', '-: 운동']);
    expect(cell(l, FRI)).toEqual(['-: 장보기']);
  });
  it('오른쪽 목록 — 미정이 먼저, 그 다음 요일 순 · 완료는 따로', () => {
    let l = base();
    l = ap(l, addItem(l, WK, '', 'SQLD', { id: 's1', now: 0 }));
    l = l.map((b) => (b.id === 's1' ? { ...b, text: '모의고사' } : b));
    expect(listGroups(weekItems(l, WK, TODAY), false).map((g) => `${g.title}: ${g.items.map((x) => x.b.text).join(',')}`))
      .toEqual(['SQLD: 모의고사,기출 1회,보고서', 'null: 장보기']);   // 미분류는 맨 아래
    expect(listGroups(weekItems(l, WK, TODAY), true).map((g) => g.items.length)).toEqual([1, 1]);
  });
  it('주 달성 — 미정도 만든 주에 센다 (Q7)', () => {
    let l = base();
    l = ap(l, addItem(l, WK, '', null, { id: 's2', now: 0 }));
    l = l.map((b) => (b.id === 's2' ? { ...b, text: '책' } : b));
    expect(rangeRate(l, MON, '2026-10-25')).toEqual({ n: 6, done: 2 })   // 기출 · 오답 · 보고서 · 운동 · 장보기 · 책 (자료는 딸린 줄);
  });
  it('지난 주 못 끝낸 미정은 이번 주로 따라온다', () => {
    const s = B('2026-10-12', '이사 견적', { area: 'someday' });
    expect(weekItems([s], WK, TODAY).map((x) => x.b.text)).toEqual(['이사 견적']);
    expect(weekItems([s], '2026-10-12', TODAY)).toEqual([]);
  });
});

describe('주간 — 옮기기', () => {
  it('다른 날로 — 같은 이름 묶음 밑으로, 없으면 제목을 만든다 · 딸린 줄도 함께', () => {
    const h = B(MON, 'SQLD', { type: 'h2' }); const a = B(MON, '기출'); const k = B(MON, '1회', { parent: a.id }); const z = B(MON, '운동');
    let l = [h, a, k, z];
    const c = moveItem(l, a, { day: FRI }, WK, TODAY, { id: 'm1', now: 0 })!;
    l = ap(l, c);
    expect(view(l, FRI)).toEqual(['SQLD', '기출', '  1회']);
    expect(view(l, MON)).toEqual(['SQLD', '운동']);
    // 운동도 SQLD 제목 밑(같은 묶음)이라 그 묶음 끝으로
    l = ap(l, moveItem(l, l.find((b) => b.id === z.id)!, { day: FRI }, WK, TODAY, { id: 'm2', now: 0 }));
    expect(view(l, FRI)).toEqual(['SQLD', '기출', '  1회', '운동']);
    // 묶음 없는 줄은 어떤 제목보다도 앞
    const y = B(TUE, '청소'); l = [...l, y];
    l = ap(l, moveItem(l, y, { day: FRI }, WK, TODAY, { id: 'm7', now: 0 }));
    expect(view(l, FRI)).toEqual(['청소', 'SQLD', '기출', '  1회', '운동']);
  });
  it('미정으로 · 다시 날로 — 묶음 이름이 따라간다', () => {
    const h = B(TUE, 'DeskMate', { type: 'h3' }); const a = B(TUE, '배포');
    let l = [h, a];
    l = ap(l, moveItem(l, a, { day: '' }, WK, TODAY, { id: 'm3', now: 0 }));
    const s = l.find((b) => b.id === a.id)!;
    expect([s.area, s.date, s.group]).toEqual(['someday', WK, 'DeskMate']);
    l = ap(l, moveItem(l, s, { day: FRI }, WK, TODAY, { id: 'm4', now: 0 }));
    expect(view(l, FRI)).toEqual(['DeskMate', '배포']);
    expect(l.find((b) => b.id === 'm4h')!.type).toBe('h2');
  });
  it('묶음에서 빼기 · 다른 묶음으로', () => {
    const h = B(MON, 'A', { type: 'h2' }); const a = B(MON, '일'); const h2 = B(MON, 'B', { type: 'h2' }); const b = B(MON, '이');
    let l = [h, a, h2, b];
    l = ap(l, moveItem(l, a, { title: 'B' }, WK, MON, { id: 'm5', now: 0 }));
    expect(view(l, MON)).toEqual(['A', 'B', '이', '일']);
    l = ap(l, moveItem(l, l.find((x) => x.id === a.id)!, { title: null }, WK, MON, { id: 'm6', now: 0 }));
    expect(view(l, MON)).toEqual(['일', 'A', 'B', '이']);
  });
  it('지난 날로 옮기면 오늘 하루는 그 칸에, 다음 날부터 오늘로 이어진다', () => {
    const a = B(FRI, '장보기');
    const l = ap([a], moveItem([a], a, { day: MON }, WK, TODAY, { id: 'p1', now: 0 }));
    expect(cell(l, MON)).toEqual(['-: 장보기']);
    expect(cellGroups(weekItems(l, WK, FRI), FRI).length).toBe(1);   // 다음 날(금)에는 오늘로
  });
  it('그 자리 그대로면 아무것도 안 한다', () => {
    const a = B(MON, '일');
    expect(moveItem([a], a, { day: WED }, WK, TODAY, { id: 'x', now: 0 })).toBeNull();
  });
});
