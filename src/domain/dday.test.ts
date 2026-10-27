import { describe, expect, it } from 'vitest';
import { ddCanPin, ddClean, ddDiff, ddLabel, ddLive, ddOfDay, DD_PIN_MAX, type DDay } from './dday';

const T = '2026-10-27';
let n = 0;
const dd = (date: string, extra: Partial<DDay> = {}): DDay => ({
  id: `d${++n}`, kind: 'dday', emoji: '', title: date, note: '', date,
  pinned: false, pinnedAt: null, archivedAt: null, createdAt: n, ...extra,
});

describe('D-Day (v3 dd*)', () => {
  it('남은 날 — 오늘은 D-DAY, 지난 날은 D+N, 서머타임에도 정수', () => {
    expect(ddLabel(T, T)).toBe('D-DAY');
    expect(ddLabel('2026-11-05', T)).toBe('D-9');
    expect(ddLabel('2026-10-20', T)).toBe('D+7');
    expect(ddDiff('2027-03-30', '2027-03-20')).toBe(10);
  });

  it('목록 — 다가오는 것 가까운 순, 지난 것은 뒤에 최근 순 · 아카이브 · 지운 것은 빠진다', () => {
    const list = [dd('2026-12-01'), dd('2026-10-01'), dd(T), dd('2026-10-20'),
      dd('2026-11-01', { archivedAt: 1 }), dd('2026-11-02', { deletedAt: 1 })];
    expect(ddLive(list, T).map((x) => x.date)).toEqual([T, '2026-12-01', '2026-10-20', '2026-10-01']);
  });

  it('일간 상세 — 고정한 것 + 그 날의 것, 겹치면 한 번만', () => {
    const a = dd('2026-12-01', { pinned: true, pinnedAt: 2 });
    const b = dd('2026-11-11', { pinned: true, pinnedAt: 1 });
    const c = dd('2026-11-11');
    expect(ddOfDay([a, b, c], '2026-11-11').map((x) => x.id)).toEqual([b.id, a.id, c.id]);
    expect(ddOfDay([a, b, c], '2026-11-12').map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it(`고정은 ${DD_PIN_MAX}개까지 — 이미 고정한 것은 그대로`, () => {
    const list = Array.from({ length: DD_PIN_MAX }, (_, i) => dd('2026-12-01', { pinned: true, pinnedAt: i }));
    const free = dd('2026-12-02');
    expect(ddCanPin([...list, free], free.id)).toBe(false);
    expect(ddCanPin([...list, free], list[0].id)).toBe(true);
  });

  it('타이틀 · 날짜가 없으면 안 만든다', () => {
    expect(ddClean({ emoji: '', title: '  ', note: '', date: T })).toBeNull();
    expect(ddClean({ emoji: '', title: 'x', note: '', date: '' })).toBeNull();
    expect(ddClean({ emoji: '🚀', title: ' 릴리스 ', note: '', date: T })?.title).toBe('릴리스');
  });
});
