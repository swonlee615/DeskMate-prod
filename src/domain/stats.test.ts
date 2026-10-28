import { describe, expect, it } from 'vitest';
import type { DayRow } from './stats';
import { period, restGrade, streak, yearHeat } from './stats';

const row = (key: string, dow: number, work: number): DayRow => ({ key, dow, work, rest: 0, on: null, off: null, leave: '', goal: 480, has: work > 0 });

describe('활동 기간 (v3 periodRange · periodLabel)', () => {
  it('진행 중인 주는 오늘까지 · 지난 주는 일요일까지 · 월요일 시작', () => {
    expect(period('week', 0, '2026-10-28')).toMatchObject({ from: '2026-10-26', to: '2026-10-28', end: '2026-11-01', live: true });
    expect(period('week', 1, '2026-10-28')).toMatchObject({ from: '2026-10-19', to: '2026-10-25', label: '10월 19일 – 10월 25일' });
    expect(period('month', 10, '2026-10-28')).toMatchObject({ from: '2025-12-01', to: '2025-12-31', label: '2025년 12월' });
    expect(period('year', 0, '2026-10-28')).toMatchObject({ from: '2026-01-01', to: '2026-10-28', end: '2026-12-31' });
  });
});

describe('연속 기록 (v3.1.161)', () => {
  it('평일에 쉬면 끊긴다 · 주말에 쉬어도 안 끊긴다 · 주말에 일하면 +1', () => {
    // 목 금 토(쉼) 일(일함) 월
    expect(streak([row('a', 4, 60), row('b', 5, 60), row('c', 6, 0), row('d', 0, 60), row('e', 1, 60)]).current).toBe(4);
    expect(streak([row('a', 4, 60), row('b', 5, 0), row('c', 1, 60)])).toEqual({ current: 1, best: 1 });
  });
});

describe('휴게 비율 등급 · 히트맵', () => {
  it('1시간 미만은 판단 보류 · 8% 미만 주의 · 8~18 우수', () => {
    expect(restGrade(5, 30)).toBeNull();
    expect(restGrade(5, 600)?.label).toBe('주의');
    expect(restGrade(12, 600)?.label).toBe('우수');
  });
  it('첫 기록 전 · 오늘 뒤는 칠하지 않고, 최장 하루 한 칸에 링', () => {
    const rows = [row('2026-01-05', 1, 0), row('2026-01-06', 2, 300), row('2026-01-07', 3, 600), row('2026-01-08', 4, 0)];
    const { weeks } = yearHeat(2026, rows, '2026-01-08');
    const cells = weeks.flat();
    expect(weeks[0][0].key).toBe('2025-12-29');
    const by = Object.fromEntries(cells.map((c) => [c.key, c]));
    expect(by['2026-01-05'].lv).toBeNull();
    expect(by['2026-01-07']).toMatchObject({ lv: 4, top: true });
    expect(by['2026-01-08'].lv).toBe(0);
    expect(by['2026-01-09'].lv).toBeNull();
  });
});
