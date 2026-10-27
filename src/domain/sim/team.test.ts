import { describe, expect, it } from 'vitest';
import { buildTeam, leaderboard, ROSTER, statusAt, workUntil } from './team';

describe('가상 동료 (v3 schedule · sim)', () => {
  it('같은 날짜면 늘 같은 하루 · 1on1 은 짝이 있다', () => {
    const a = buildTeam('2026-10-27'), b = buildTeam('2026-10-27');
    expect(a).toEqual(b);
    for (const [id, d] of Object.entries(a)) {
      for (const s of d.segments.filter((x) => x.topic === '1on1')) {
        expect(a[s.with as string].segments.some((x) => x.with === id && x.s === s.s)).toBe(true);
      }
    }
  });
  it('상태 · 일한 분 · 랭킹 — 나도 같은 줄에', () => {
    const team = buildTeam('2026-10-27');
    const m = ROSTER.find((x) => !team[x.id].off)!;
    const d = team[m.id];
    expect(statusAt(d, m, 0).key).toBe('offline');
    expect(statusAt(d, m, d.segments.find((s) => s.kind === 'lunch')!.s).key).toBe('lunch');
    expect(workUntil(d, 1440)).toBeGreaterThan(5 * 60);
    const lb = leaderboard(team, 1440, 9999, '나');
    expect(lb[0]).toMatchObject({ me: true, rank: 1 });
    expect(lb).toHaveLength(ROSTER.length + 1);
  });
});
