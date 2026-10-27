import { describe, expect, it } from 'vitest';
import type { Day } from './types';
import { dayParts, workMinutes } from './rules';
import { breakConflicts, overlapIds, resolveConflicts, slotOutside, splitRest, type Log } from './logs';

const D = '2026-10-21';
const t = (hm: string) => { const [h, m] = hm.split(':').map(Number); return new Date(2026, 9, 21, h, m).getTime(); };
const M = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const END = t('23:59');
const day = (x: Partial<Day> = {}): Day => ({ date: D, onAt: t('09:00'), offAt: t('18:00'), breaks: [], leave: '', ...x });

describe('시간 기록 — 근무시간 = ((출근~퇴근 − 비근무) ∪ 시간 기록) − 휴게 (LOGIC §5 · v3.1.223)', () => {
  it('출근 전 · 퇴근 뒤 기록도 센다 · 겹친 만큼은 한 번만', () => {
    const d = day({ slots: [{ s: M('08:00'), e: M('09:30') }, { s: M('17:00'), e: M('19:00') }] });
    expect(workMinutes(d, END)).toBe(9 * 60 + 60 + 60);
  });
  it('휴게와 겹친 기록은 그 부분을 안 센다 · 비근무와 겹친 기록은 센다', () => {
    const d = day({
      breaks: [{ s: t('12:00'), e: t('13:00'), kind: 'break' }, { s: t('14:00'), e: t('16:30'), kind: 'off' }],
      slots: [{ s: M('12:30'), e: M('13:30') }, { s: M('15:00'), e: M('16:00') }],
    });
    // 9h − 1h 휴게 − 2.5h 비근무 + 1h(비근무 안 기록)
    expect(workMinutes(d, END)).toBe(9 * 60 - 60 - 150 + 60);
    expect(dayParts(d, END).breakMs).toBe(60 * 60000);
  });
  it('출근 기록이 없는 날은 기록이 있어도 0 · 오늘은 «지금» 까지만', () => {
    expect(workMinutes(day({ onAt: null, offAt: null, slots: [{ s: M('10:00'), e: M('11:00') }] }), END)).toBe(0);
    const d = day({ offAt: null, slots: [{ s: M('07:00'), e: M('08:00') }, { s: M('20:00'), e: M('21:00') }] });
    expect(workMinutes(d, t('10:00'))).toBe(60 + 60);
  });
});

describe('근무 밖 · 근무 밖 휴게 (v3.1.225 · 239)', () => {
  it('밖 = 출근 전 · 퇴근 뒤 · 비근무 안. 출근 없는 날은 판정 안 함', () => {
    const d = day({ breaks: [{ s: t('14:00'), e: t('16:30'), kind: 'off' }] });
    expect([M('08:00'), M('10:00'), M('15:00'), M('18:00')].map((m) => slotOutside(d, m))).toEqual([true, false, true, true]);
    expect(slotOutside(day({ onAt: null, offAt: null }), M('10:00'))).toBe(false);
  });
  it('휴게로 그은 구간은 근무 안 몫(근태 휴게) · 밖 몫(근무 밖 휴게)으로 나뉜다 — 출퇴근은 안 바뀐다', () => {
    const d = day({ breaks: [{ s: t('14:00'), e: t('16:30'), kind: 'off' }] });
    expect(splitRest(d, M('17:30'), M('19:00'))).toEqual({ inside: [[M('17:30'), M('18:00')]], outside: [[M('18:00'), M('19:00')]] });
    expect(splitRest(d, M('08:00'), M('09:30'))).toEqual({ inside: [[M('09:00'), M('09:30')]], outside: [[M('08:00'), M('09:00')]] });
    expect(splitRest(d, M('13:00'), M('15:00'))).toEqual({ inside: [[M('13:00'), M('14:00')]], outside: [[M('14:00'), M('15:00')]] });
    expect(splitRest(day({ onAt: null, offAt: null }), M('10:00'), M('11:00'))).toEqual({ inside: [], outside: [[M('10:00'), M('11:00')]] });
  });
  it('겹치는 같은 종류는 새것이 이긴다 (v3 addSlot · addRest)', () => {
    const L = (id: string, kind: Log['kind'], s: string, e: string): Log => ({ id, date: D, kind, s: M(s), e: M(e), text: '', color: null, createdAt: 0 });
    const logs = [L('a', 'slot', '09:00', '10:00'), L('b', 'slot', '10:00', '11:00'), L('c', 'rest', '09:30', '10:30'), { ...L('d', 'slot', '09:00', '12:00'), deletedAt: 1 }];
    expect(overlapIds(logs, D, 'slot', M('09:50'), M('10:10'))).toEqual(['a', 'b']);
    expect(overlapIds(logs, D, 'slot', M('09:50'), M('10:10'), 'a')).toEqual(['b']);
    expect(overlapIds(logs, D, 'slot', M('10:00'), M('10:00'))).toEqual([]);
  });
});

describe('휴게 ↔ 시간 기록 겹침 (LOGIC §3 breakSlotConflicts · resolveBreakConflicts · v3.1.29 · 64 · 132)', () => {
  const brk = (a: string, z: string, kind: 'break' | 'off' = 'break') => ({ s: t(a), e: t(z), kind });
  it('겹친 구간을 휴게마다 돌려준다 — 맞닿은 기록은 한 덩어리 · 근무 밖 기록은 안 본다', () => {
    const d = day({ breaks: [brk('12:00', '13:00'), brk('14:00', '16:30', 'off')],
      slots: [{ s: M('12:30'), e: M('12:45') }, { s: M('12:45'), e: M('14:30') }, { s: M('08:00'), e: M('09:00') }] });
    const c = breakConflicts(d);
    expect(c.map((x) => [x.i, x.min, x.parts, x.kind])).toEqual([
      [0, 30, [[M('12:30'), M('13:00')]], 'break'],
      [1, 30, [[M('14:00'), M('14:30')]], 'off'],
    ]);
  });
  it('정리 = 빼기 — 한복판이면 두 조각 · 비근무는 사람이 누를 때만 · 바꾼 수를 센다', () => {
    const d = day({ breaks: [brk('12:00', '13:00'), brk('10:00', '11:30', 'off')], slots: [{ s: M('09:50'), e: M('10:45') }, { s: M('12:20'), e: M('12:40') }] });   // 비근무 «안» 에서 시작한 기록은 근무 밖이라 안 본다 (v3.1.132)
    const a = resolveConflicts(d, false);
    expect(a.n).toBe(1);
    expect(a.day.breaks.filter((b) => b.kind === 'break').map((b) => [b.s, b.e])).toEqual([[t('12:00'), t('12:20')], [t('12:40'), t('13:00')]]);
    expect(a.day.breaks.filter((b) => b.kind === 'off')).toHaveLength(1);
    const b = resolveConflicts(d, true);
    expect(b.n).toBe(2);
    expect(breakConflicts(b.day)).toEqual([]);
    expect(resolveConflicts(day(), true).n).toBe(0);
  });
});
