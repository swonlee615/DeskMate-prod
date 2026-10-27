import { describe, expect, it } from 'vitest';
import { dialFace, dialSpan, dialWedge } from './dial';

describe('다이얼 타이머 (v3.1.244)', () => {
  it('눈금은 길이에 맞춘다 — 60 · 120 · 180', () => {
    expect([25, 60, 61, 120, 121, 180].map((m) => dialSpan(m * 60))).toEqual([60, 60, 120, 120, 180, 180]);
    expect(dialFace(60).nums.map((n) => n[0])).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(dialFace(120).nums).toHaveLength(12);
    expect(dialFace(60).dots).toHaveLength(48);
  });

  it('부채꼴 — 0분이면 없음 · 한 바퀴면 원 · 절반 넘으면 큰 호', () => {
    expect(dialWedge(0, 60)).toBe('');
    expect(dialWedge(60, 60)).toContain('0 1 1 93.99');
    expect(dialWedge(25, 60)).toMatch(/A66 66 0 0 1 /);
    expect(dialWedge(40, 60)).toMatch(/A66 66 0 1 1 /);
  });
});
