import { describe, expect, it } from 'vitest';
import type { DayRow } from './stats';
import { dowRhythm, labelSplit, period, rankStat, restGrade, streak, yearHeat } from './stats';
import type { Log } from './attendance/logs';

const row = (key: string, dow: number, work: number): DayRow => ({ key, dow, work, rest: 0, on: null, off: null, leave: '', goal: 480, has: work > 0, segs: [], brks: [], nonwork: 0 });

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

describe('요일 리듬 · 라벨별 · 순위 요약', () => {
  it('요일 리듬은 일한 날만 · 평균 휴게 · 비근무', () => {
    const a = { ...row('2026-10-05', 1, 400), on: 540, rest: 30, nonwork: 60 };
    const b = { ...row('2026-10-12', 1, 400), on: 600, rest: 60, nonwork: 0 };
    const mon = dowRhythm([a, b, row('2026-10-19', 1, 0)])[0];
    expect(mon).toMatchObject({ dow: 1, n: 2, avgRest: 45, avgIdle: 30 });
  });
  it('라벨별 — 대소문자 · 공백을 하나로, 메모 없는 휴게는 미분류(빈 이름) · 안 일한 날의 기록은 빼고', () => {
    const r = { ...row('2026-10-05', 1, 400), brks: [{ s: 720, e: 780, note: '' }] };
    const log = (id: string, date: string, text: string, s: number, e: number): Log => ({ id, date, kind: 'slot', s, e, text, color: '#5B97CF', createdAt: 0 } as Log);
    const out = labelSplit([r, row('2026-10-06', 2, 0)], [log('1', '2026-10-05', 'Job', 540, 600), log('2', '2026-10-05', ' job ', 600, 630), log('3', '2026-10-06', 'Job', 0, 60)]);
    expect(out).toEqual([{ kind: 'slot', label: 'Job', color: '#5b97cf', min: 90 }, { kind: 'rest', label: '', color: null, min: 60 }]);
  });
  it('순위 — 오늘 · 혼자인 날은 요약에서 뺀다', () => {
    const st = rankStat([
      { key: 'a', pos: 1, n: 13, my: 1, live: false },
      { key: 'b', pos: 13, n: 13, my: 1, live: false },
      { key: 'c', pos: 1, n: 13, my: 1, live: true },
      { key: 'd', pos: 1, n: 1, my: 1, live: false },
    ], 13);
    expect(st).toMatchObject({ days: 2, best: 1, pct: 50 });
    expect(st.avg).toBeCloseTo(7);
  });
});
