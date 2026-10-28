import { describe, expect, it } from 'vitest';
import { busyHours, tlLayout } from './tlLayout';

describe('폰 시간표 접기 (tlLayout)', () => {
  // 02:00 출근 ~ 21:00 근무 중, 03:25~03:55 기록 하나
  const busy = busyHours([{ kind: 'work', s: 120, e: 21 * 60 }, { kind: 'slot', s: 205, e: 235 }], 21 * 60);
  const L = tlLayout(1, 22, busy, 52, 28);

  it('볼 것 없는 2시간 이상만 한 줄로 — 1시간짜리 틈은 그대로', () => {
    expect([...busy].sort((a, b) => a - b)).toEqual([2, 3, 21]);
    expect(L.rows.map((r) => (r.kind === 'h' ? r.h : `${r.from}-${r.to}`))).toEqual([1, 2, 3, '4-21', 21]);
    expect(L.height).toBe(52 * 4 + 28);
  });
  it('시각 ↔ 높이가 서로 맞고, 접힌 줄 위는 null', () => {
    expect(L.y(3 * 60 + 25)).toBeCloseTo(52 * 2 + 25 * 52 / 60);
    expect(L.m(L.y(3 * 60 + 25))).toBeCloseTo(205);
    expect(L.m(52 * 3 + 5)).toBeNull();
    expect(L.y(12 * 60)).toBeCloseTo(52 * 3 + 28 * (8 / 17));
  });
  it('펼치면 접지 않는다', () => {
    expect(tlLayout(1, 22, busy, 52, 28, true).rows.every((r) => r.kind === 'h')).toBe(true);
  });
});
