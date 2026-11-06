import { describe, expect, it } from 'vitest';
import { addAppSample, appSlotOf, appsIn, appTerms, cellApps, cellKind, mergeAppDocs } from './appUse';

describe('앱 사용 기록 (v3 day.apps)', () => {
  it('10분 칸에 앱별 횟수 · 업무/딴짓 횟수 · 이름을 쌓는다', () => {
    expect(appSlotOf(9 * 60 + 47)).toBe(9 * 60 + 40);
    let c = addAppSample(undefined, { id: 'com.tinyspeck.slackmacgap', name: 'Slack' }, false, 'work');
    c = addAppSample(c, { id: 'com.tinyspeck.slackmacgap', name: 'Slack' }, false, 'work');
    c = addAppSample(c, { name: 'YouTube' }, false, 'distract');
    c = addAppSample(c, { id: 'io.github.swonlee615.deskmate', name: 'DeskMate' }, true, 'work');
    expect(c.n).toEqual({ 'com.tinyspeck.slackmacgap': 2, YouTube: 1, dm: 1 });
    expect(cellApps(c)).toEqual(['Slack', 'YouTube', 'DM']);
    expect(cellKind(c)).toBe('work');
  });

  it('PC 두 대의 같은 칸은 더한다', () => {
    const a = { cells: { 600: { n: { x: 2 }, k: { distract: 2 }, l: { x: 'X' } } } };
    const b = { cells: { 600: { n: { x: 1, y: 3 }, k: { work: 3, distract: 1 }, l: { x: 'X', y: 'Y' } } } };
    const m = mergeAppDocs([a, b]);
    expect(m[600].n).toEqual({ x: 3, y: 3 });
    expect(m[600].k).toEqual({ work: 3, distract: 3 });
    expect(cellKind(m[600])).toBe('work');
    expect(cellKind({ n: {}, k: {}, l: {} })).toBeNull();
    expect(mergeAppDocs([{ cells: { 610: { n: {}, k: {}, l: {} } } }])).toEqual({});
  });
});

describe('앱 사용 초안 줄 (v3 appTerms)', () => {
  const cell = (k: string, n = 6) => ({ n: { [k]: n }, k: { work: n }, l: { [k]: k.toUpperCase() } });
  it('같은 앱 20분 이상이면 한 텀, 10분 조각은 앞 텀에 흡수, 기록 · 휴게가 덮은 칸은 뺀다', () => {
    const cells = { 540: cell('a'), 550: cell('a'), 560: cell('b'), 570: cell('c'), 580: cell('c'), 600: cell('a'), 610: cell('a') };
    const t = appTerms(cells, { covered: [[600, 620]] });
    expect(t.map((x) => [x.s, x.e])).toEqual([[540, 570], [570, 590]]);
    expect(t[0].apps).toEqual(['A', 'B']);
    expect(appTerms(cells, { covered: [], cap: 555 }).map((x) => [x.s, x.e])).toEqual([[540, 555]]);
  });
  it('구간에 쓴 앱 이름 — 많이 쓴 순서', () => {
    const cells = { 540: cell('a', 2), 550: cell('b', 5) };
    expect(appsIn(cells, 540, 560)).toEqual(['B', 'A']);
    expect(appsIn(cells, 545, 550)).toEqual(['A']);
  });
});
