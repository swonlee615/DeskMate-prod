import { describe, expect, it } from 'vitest';
import { convertV3, type V3Day } from './v3';

const D = (date: string, x: Partial<V3Day> = {}): V3Day => ({ date, onAt: null, offAt: null, leave: '', breaks: [], today: [], memo: [], slots: [], pomos: [], ...x });

describe('v3 → 웹 옮기기', () => {
  it('이월 사슬 — 흔적은 버리고 살아 있는 줄을 딸린 줄과 함께 처음 적은 날로 · 끝낸 날은 체크한 날', () => {
    const st = { days: {
      '2026-10-01': D('2026-10-01', { today: [{ id: 't1', type: 'check', text: '보고서', movedId: 'L', movedTo: '2026-10-02' }] }),
      '2026-10-02': D('2026-10-02', { today: [
        { id: 'L', type: 'check', text: '보고서', done: true, doneAt: 5, bornAt: '2026-10-01' },
        { id: 'k', type: 'check', text: '표', indent: 1 },
        { id: 'z', type: 'bullet', text: '그날 줄' },
      ] }),
    } };
    const c = convertV3(st, 100);
    const by = Object.fromEntries(c.blocks.map((b) => [b.id, b]));
    expect(c.blocks.map((b) => b.id).sort()).toEqual(['L', 'k', 'z']);
    expect(by.L).toMatchObject({ date: '2026-10-01', parent: null, done: true, doneOn: '2026-10-02', doneAt: 5 });
    expect(by.k).toMatchObject({ date: '2026-10-01', parent: 'L' });
    expect(by.z).toMatchObject({ date: '2026-10-02', parent: null });
    expect(c.report).toMatchObject({ traces: 1, relocated: 1, goneChains: 0, lines: 3 });
  });
  it('살아 있는 줄이 지워진 사슬은 «지운 줄» 로 남긴다 (데이터는 남고 화면엔 안 보인다)', () => {
    const c = convertV3({ days: { '2026-10-01': D('2026-10-01', { today: [{ id: 't1', type: 'check', text: '그만둔 일', movedId: 'G', movedTo: '2026-10-02' }] }) } }, 100);
    expect(c.blocks).toEqual([expect.objectContaining({ id: 'G', date: '2026-10-01', text: '그만둔 일', deletedAt: 100 })]);
    expect(c.report.lines).toBe(0);
  });
  it('근태 — 하루가 손으로 고친 하루 하나로 · v3.2.0 자정 마감은 «확정» · 휴게 종류 · 메모', () => {
    const c = convertV3({ days: { '2026-10-01': D('2026-10-01', {
      onAt: 1, offAt: 9, autoClosed: 'midnight', carriedFrom: '2026-09-30', sessions: 2, pomos: [{ s: 3, min: 25 }],
      breaks: [{ s: 2, e: 3, kind: 'off' }, { s: 4, e: 5, auto: true, by: 'idle', note: '점심' }],
    }) } }, 100);
    const ov = c.events.find((e) => e.type === 'override')!;
    expect(ov.day).toEqual({ onAt: 1, offAt: 9, leave: '', autoClosed: 'confirmed', carriedFrom: '2026-09-30',
      breaks: [{ s: 2, e: 3, kind: 'off' }, { s: 4, e: 5, kind: 'break', auto: true, by: 'idle', note: '점심' }] });
    expect(c.events.filter((e) => e.type === 'pomoDone')).toHaveLength(2);   // 세션 수 2 — 표 1 + 채움 1
  });
});
