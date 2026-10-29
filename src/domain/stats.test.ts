import { describe, expect, it } from 'vitest';
import type { DayRow } from './stats';
import { rankSeries, rankToFix, catSplit, dowRhythm, labelSplit, leaveSummary, weekGoal, period, rankStat, restGrade, streak, yearHeat } from './stats';
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

describe('근태 카드 (v3.1.242)', () => {
  it('미근무 = 첫 기록 이후 어제까지 근무도 근태도 없는 날 · 오늘은 안 센다 · 반차는 0.5일', () => {
    // 월(첫 기록 전) 화(일함) 수(빈 날) 목(오전 반차) 금(오늘 · 빈) 토(빈)
    const rows = [row('2026-10-26', 1, 0), row('2026-10-27', 2, 300), row('2026-10-28', 3, 0),
      { ...row('2026-10-29', 4, 200), leave: '오전 반차' as const }, row('2026-10-30', 5, 0), row('2026-10-25', 0, 0)];
    const s = leaveSummary(rows, '2026-10-27', '2026-10-30');
    expect(s).toMatchObject({ worked: 2, leaveDays: 0.5, miss: { wd: 1, we: 0 }, chips: { '': 1, '오전 반차': 1 } });
  });
});

describe('목표까지 · 카테고리별', () => {
  it('주 목표 = 평일 목표 합 (금 연차면 32시간) · 하루 몫은 오늘 한 것을 더해 남은 날로', () => {
    const days = { '2026-10-30': { leave: '연차' } } as never;
    const p = period('week', 0, '2026-10-28');
    const rows = [row('2026-10-26', 1, 600), row('2026-10-27', 2, 600), row('2026-10-28', 3, 120)];
    const g = weekGoal(days, rows, p, '2026-10-28', { hours: 8, leave: true });
    expect(g).toMatchObject({ goal: 32 * 60, left: 2, halfN: 0, rest7: 4 });
    // 남은 시간 32h − 22h = 10h, 오늘 2h 를 더해 수 · 목 둘로 → 6h
    expect(g.per).toBe(360);
  });
  it('미분류 = 근무시간 − 시간 기록 · 색 없는 휴게 · 맨 뒤', () => {
    const r = { ...row('2026-10-05', 1, 300), brks: [{ s: 720, e: 750, note: '' }] };
    const log = { id: '1', date: '2026-10-05', kind: 'slot', s: 540, e: 660, text: 'Job', color: '#5B97CF', createdAt: 0 } as Log;
    const out = catSplit([r], [log], [{ color: '#5b97cf', name: '개발' }]);
    expect(out).toEqual([
      { color: '#5b97cf', name: '개발', known: true, none: false, work: 120, rest: 0 },
      { color: '', name: '', known: false, none: true, work: 180, rest: 30 },
    ]);
  });
});

describe('순위 고정 (SYNC §11)', () => {
  it('끝난 날만 · 일한 날만 · 확인 기다리는 날은 빼고 고정한다', () => {
    const on = new Date(2026, 9, 27, 9).getTime();
    const day = (date: string, extra = {}) => ({ date, onAt: on + (Number(date.slice(-2)) - 27) * 864e5, offAt: on + (Number(date.slice(-2)) - 27) * 864e5 + 8 * 36e5, leave: '', breaks: [], ...extra });
    const days = { '2026-10-27': day('2026-10-27'), '2026-10-28': day('2026-10-28', { pending: { guessOff: 0 } }), '2026-10-29': day('2026-10-29') } as never;
    const fix = rankToFix(days, {}, '2026-10-29', on + 3 * 864e5, '나');
    expect(Object.keys(fix)).toEqual(['2026-10-27']);
    expect(fix['2026-10-27'].my).toBe(480);
  });
  it('고정값이 있으면 다시 세지 않는다 — 기록을 고쳐도 그대로', () => {
    const r = { ...row('2026-10-27', 2, 600) };
    const pts = rankSeries([r], '2026-10-29', null, '나', { '2026-10-27': { pos: 5, n: 13, my: 300 } });
    expect(pts).toEqual([{ key: '2026-10-27', pos: 5, n: 13, my: 300, live: false }]);
  });
});
