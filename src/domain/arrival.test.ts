import { describe, expect, it } from 'vitest';
import type { Day } from './attendance/types';
import { addWorkSpan } from './attendance/edit';
import { arrCancel, arrCreate, arrSnooze, arrTick, type ArrMode } from './arrival';

const H = 2 * 3600_000;
const run = (st = arrCreate()) => {
  let t = 0;
  const tick = (kind: 'work' | 'other' | null, idleSec = 0, mode: ArrMode = 'pre', dt = 10_000) => {
    t += dt;
    return arrTick(st, { now: t, mode, kind, idleSec, awaySec: 600, longMs: H, dayKey: 'd' });
  };
  return { st, tick, t: () => t };
};

describe('출근 감지 (v3 arrival.js · LOGIC §2-1)', () => {
  it('업무 앱 연속 3분이면 감지. 시각은 연속이 시작된 때', () => {
    const r = run();
    let ev = null;
    for (let i = 0; i < 19 && !ev; i++) ev = r.tick('work');
    expect(ev).toEqual({ type: 'hit', at: 10_000, mode: 'pre' });
  });

  it('다른 앱 30초 이내는 잇되 그 시간은 안 센다. 넘으면 끊긴다', () => {
    const r = run();
    for (let i = 0; i < 10; i++) r.tick('work');       // 90초 셈
    r.tick('other'); r.tick('other');                  // 20초 딴 데
    let ev = null;
    for (let i = 0; i < 9 && !ev; i++) ev = r.tick('work');
    expect(ev).toBeNull();                              // 다시 돌아온 첫 표본은 안 센다 → 아직 170초
    expect(r.tick('work')).toMatchObject({ type: 'hit', at: 10_000 });
    const q = run();
    for (let i = 0; i < 10; i++) q.tick('work');
    for (let i = 0; i < 4; i++) q.tick('other');       // 40초
    expect(q.st.run).toBeNull();
  });

  it('대답 전에 비운 구간을 기억하고, 2시간 넘으면 철회하며 놓친 기록을 남긴다', () => {
    const r = run();
    for (let i = 0; i < 19; i++) r.tick('work');
    r.tick(null, 700, 'pre', 1_000_000);               // 비움 시작 = 지금 - 700초
    r.tick('work', 0);
    expect(r.st.hit?.aways).toEqual([{ s: 490_000, e: 1_200_000 }]);
    r.tick(null, 700, 'pre', 1_000_000);
    const ev = r.tick(null, 700 + H / 1000, 'pre', H);
    expect(ev?.type).toBe('withdrawn');
    expect(r.st.missed).toHaveLength(1);
    expect(r.st.missed[0]).toEqual({ s: 10_000, e: 1_500_000, mode: 'pre' });
  });

  it('취소는 쿨다운 동안 안 센다 · 오늘은 묻지 않기 · 근무 중이 되면 걷힌다', () => {
    const r = run();
    for (let i = 0; i < 19; i++) r.tick('work');
    arrCancel(r.st, r.t(), 30 * 60_000);
    for (let i = 0; i < 30; i++) expect(r.tick('work')).toBeNull();
    arrSnooze(r.st, 'd');
    expect(r.tick('work', 0, 'pre', 31 * 60_000)).toBeNull();
    const q = run();
    for (let i = 0; i < 19; i++) q.tick('work');
    expect(q.tick('work', 0, 'none')).toEqual({ type: 'withdrawn' });
  });
});

describe('놓친 업무 기록을 근무로 (v3 addMissedSpan)', () => {
  const T = (h: number, m = 0) => new Date(2026, 10, 5, h, m).getTime();
  const day = (x: Partial<Day>): Day => ({ date: '2026-11-05', onAt: null, offAt: null, breaks: [], leave: '', ...x });
  it('출근 전이면 닫힌 하루, 첫 출근보다 앞이면 새 첫 차수', () => {
    expect(addWorkSpan(day({}), T(9), T(9, 30))).toMatchObject({ onAt: T(9), offAt: T(9, 30) });
    const d = addWorkSpan(day({ onAt: T(13) }), T(9), T(9, 30))!;
    expect(d.onAt).toBe(T(9));
    expect(d.breaks).toMatchObject([{ s: T(9, 30), e: T(13), kind: 'off' }]);
  });
  it('근무 중인 날의 비근무 안이면 둘로 가르고 지금 차수는 열어 둔다', () => {
    const d = addWorkSpan(day({ onAt: T(9), breaks: [{ s: T(18), e: T(22, 30), kind: 'off' }] }), T(19), T(19, 30))!;
    expect(d.offAt).toBeNull();
    expect(d.breaks.map((b) => [b.s, b.e])).toEqual([[T(18), T(19)], [T(19, 30), T(22, 30)]]);
  });
});
