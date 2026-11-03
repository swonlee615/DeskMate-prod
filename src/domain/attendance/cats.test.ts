import { describe, expect, it } from 'vitest';
import type { Block } from '../todos/tree';
import { catChoices, catName, catsOf, catUsage, cleanCats, labelPicks, nextCatColor } from './cats';
import { SLOT_COLORS, type Log } from './logs';

const blk = (id: string, date: string, text: string, o: Partial<Block> = {}): Block =>
  ({ id, date, area: 'today', parent: null, pos: 1, type: 'check', text, createdAt: 0, updatedAt: 0, ...o });
const log = (id: string, date: string, s: number, text: string): Log =>
  ({ id, date, kind: 'slot', s, e: s + 30, text, color: SLOT_COLORS[0], createdAt: 0 });

describe('카테고리 = 이름 붙인 색', () => {
  it('저장된 목록이 없으면 12색 · 이름 없음, 고르는 칸에는 지금 쓰는 색만', () => {
    const list = catsOf(null);
    expect(list).toHaveLength(12);
    expect(catChoices(list, SLOT_COLORS[2]).map((c) => c.color)).toEqual([SLOT_COLORS[2]]);
  });
  it('이름은 색으로 찾는다 — 대문자 색도 같은 카테고리', () => {
    const list = cleanCats([{ color: '#5B97CF', name: ' 개발 ' }, { color: '#5b97cf', name: '중복' }, { color: 'red', name: 'x' }]);
    expect(list).toEqual([{ color: '#5b97cf', name: '개발' }]);
    expect(catName(list, '#5B97CF')).toBe('개발');
    expect(nextCatColor(list)).toBe(SLOT_COLORS[1]);
  });
});

describe('「무엇을 했나요?」 고르기 목록 (v3 slotTodoItems)', () => {
  it('그 날 체크 줄(끝낸 것도) → 다른 날 기록 이름 최근순, 같은 글은 한 번', () => {
    const blocks = [
      blk('a', '2026-10-28', '**기획서** 쓰기', { done: true }),
      blk('b', '2026-10-28', '메모 줄', { type: 'bullet' }),
      blk('c', '2026-10-28', '회의', { area: 'memo' }),
    ];
    const logs = [log('1', '2026-10-26', 60, '리뷰'), log('2', '2026-10-27', 60, '기획서 쓰기'), log('3', '2026-10-27', 120, '배포'), log('4', '2026-10-28', 60, '오늘 것')];
    expect(labelPicks(blocks, logs, '2026-10-28', '2026-10-29').map((x) => [x.t, x.kind, x.done])).toEqual([
      ['기획서 쓰기', '오늘 할 일', true],
      ['배포', '최근에 쓴 기록', false],
      ['리뷰', '최근에 쓴 기록', false],
    ]);
  });
  it('오늘이면 지난 날에서 넘어온 못 끝낸 줄도 «오늘 할 일»', () => {
    const blocks = [blk('a', '2026-10-27', '어제 못 한 일', { createdAt: new Date(2026, 9, 27, 9).getTime() })];
    expect(labelPicks(blocks, [], '2026-10-28', '2026-10-28').map((x) => x.t)).toEqual(['어제 못 한 일']);
    expect(labelPicks(blocks, [], '2026-10-26', '2026-10-28')).toEqual([]);
  });
});

describe('설정 › 시간 기록 «N건 · 시간»', () => {
  it('색마다 건수 · 분을 센다. 지운 기록 · 휴게는 빼고, 대소문자는 같은 색', () => {
    const a = log('a', '2026-11-01', 540, 'x');
    const b = { ...log('b', '2026-11-02', 600, 'y'), color: SLOT_COLORS[0].toUpperCase(), e: 660 };
    const gone = { ...log('c', '2026-11-02', 700, 'z'), deletedAt: 1 };
    const rest = { ...log('d', '2026-11-02', 800, ''), kind: 'rest' as const };
    const u = catUsage([a, b, gone, rest]);
    expect(u.get(SLOT_COLORS[0])).toEqual({ count: 2, min: 90 });
    expect(u.size).toBe(1);
  });
});
