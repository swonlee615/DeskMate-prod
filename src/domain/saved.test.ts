import { describe, expect, it } from 'vitest';
import { savedFromV3, savedMemos } from './saved';

describe('저장됨 정렬 (v3.1.262)', () => {
  const map = {
    'day:2026-10-01': { savedAt: 3 },
    'day:2026-10-20': { savedAt: 1 },
    'week:2026-10-12': { savedAt: 2, pinnedAt: 10 },
    'day:2026-09-01': { savedAt: 4, pinnedAt: 20 },
  };
  it('최근 저장순 — 고정이 위, 나중에 고정한 것이 먼저', () => {
    expect(savedMemos(map, 'saved').map((x) => x.id)).toEqual(['day:2026-09-01', 'week:2026-10-12', 'day:2026-10-01', 'day:2026-10-20']);
  });
  it('날짜순 — 고정은 그대로 위, 나머지는 최근 날짜가 위', () => {
    expect(savedMemos(map, 'date').map((x) => x.id)).toEqual(['day:2026-09-01', 'week:2026-10-12', 'day:2026-10-20', 'day:2026-10-01']);
  });
  it('v3 목록을 옮긴다 — 모르는 종류 · 빈 열쇠는 버린다', () => {
    expect(savedFromV3([{ kind: 'day', key: '2026-10-01', savedAt: 5, pinnedAt: 9 }, { kind: 'week', key: '2026-10-12', at: 7 }, { kind: 'x', key: 'a' }, { kind: 'day' }], 1))
      .toEqual({ 'day:2026-10-01': { savedAt: 5, pinnedAt: 9 }, 'week:2026-10-12': { savedAt: 7 } });
  });
});
