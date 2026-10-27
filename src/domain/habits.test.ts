import { describe, expect, it } from 'vitest';
import { hbBest, hbClean, hbFreqLabel, hbLive, hbOfDay, hbRatio, hbSpanEnd, hbSpanOf, hbStreak, type Habit } from './habits';

// 2026-10-26 월 · 27 화 · 28 수 …
const T = '2026-10-28';
const none = () => false;
let n = 0;
const hb = (extra: Partial<Habit> = {}): Habit => ({
  id: `h${++n}`, kind: 'habit', emoji: '', title: 't', note: '', type: 'daily', days: [1, 2, 3, 4, 5], n: 3,
  skipOff: true, start: '2026-10-01', end: null, createdAt: n, archivedAt: null, ...extra,
});
const done = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, 1]));

describe('습관 (v3 hb*)', () => {
  it('오늘 할 것 — 요일 지정은 그 요일만 · 쉬는 날은 빠진다 · 주 N회는 채우면 빠진다', () => {
    const wd = hb({ type: 'days', days: [1, 3] });
    const daily = hb();
    const pw = hb({ type: 'perWeek', n: 2, done: done('2026-10-26', '2026-10-27') });
    expect(hbOfDay([wd, daily, pw], T, none).map((x) => x.h.id)).toEqual([wd.id, daily.id]);
    expect(hbOfDay([wd, daily, pw], '2026-10-29', none).map((x) => x.h.id)).toEqual([daily.id]);
    // 연차인 날 — 쉬는 날 제외를 끈 습관만 남는다
    const keep = hb({ skipOff: false });
    expect(hbOfDay([daily, keep], T, (k) => k === T).map((x) => x.h.id)).toEqual([keep.id]);
    // 그 날 한 것은 남는다
    expect(hbOfDay([pw], '2026-10-27', none)[0].week).toEqual({ c: 2, n: 2 });
  });

  it('달성률 — 안 끝난 오늘(안 했으면) · 안 끝난 주는 분모에서 뺀다', () => {
    const h = hb({ start: '2026-10-26', done: done('2026-10-26') });
    expect(hbRatio(h, '2026-10-26', T, T, none)).toEqual({ ok: 1, tot: 2, v: 0.5 });
    const pw = hb({ type: 'perWeek', n: 1, start: '2026-10-12', done: done('2026-10-13', '2026-10-27') });
    expect(hbRatio(pw, '2026-10-12', T, T, none)).toEqual({ ok: 1, tot: 2, v: 0.5 });
  });

  it('연속 — 해당 없는 날은 건너뛰고, 오늘 아직이면 끊지 않는다', () => {
    const wd = hb({ type: 'days', days: [1, 3], done: done('2026-10-19', '2026-10-21', '2026-10-26') });
    expect(hbStreak(wd, T, none)).toEqual({ n: 3, unit: '일' });
    const d = hb({ start: '2026-10-20', done: done('2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24', '2026-10-25') });
    expect(hbBest(d, T, none).n).toBe(3);
  });

  it('목록 — 끝난 것은 뒤로 · 보관 · 지운 것은 빠진다', () => {
    const a = hb({ end: '2026-10-20' }), b = hb(), c = hb({ archivedAt: 1 }), e = hb({ deletedAt: 1 });
    expect(hbLive([a, b, c, e], T).map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('입력 · 주기 이름 · 끝나는 날', () => {
    expect(hbClean({ ...hb(), type: 'days', days: [] })).toBeNull();
    expect(hbClean({ ...hb(), start: T, end: '2026-10-01' })?.end).toBe(T);
    expect(hbFreqLabel({ type: 'days', days: [5, 1, 3], n: 1 })).toBe('월·수·금');
    expect(hbFreqLabel({ type: 'days', days: [1, 2, 3, 4, 5], n: 1 })).toBe('평일');
    expect(hbSpanEnd('2026-10-28', '2w')).toBe('2026-11-10');
    expect(hbSpanEnd('2026-01-31', '1m')).toBe('2026-03-02');
    expect(hbSpanOf('2026-10-28', '2026-11-27')).toBe('1m');
  });
});
