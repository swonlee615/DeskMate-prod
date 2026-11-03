import { describe, expect, it } from 'vitest';
import type { Block } from './todos/tree';
import type { Log } from './attendance/logs';
import { hlParts, inRange, rangeOf, searchScan } from './search';

const blk = (id: string, date: string, text: string, o: Partial<Block> = {}): Block =>
  ({ id, date, area: 'today', parent: null, pos: Number(id.replace(/\D/g, '')) || 1, type: 'check', text, createdAt: 0, updatedAt: 0, ...o });
const log = (id: string, date: string, text: string): Log => ({ id, date, kind: 'slot', s: 540, e: 600, text, color: null, createdAt: 0 });

describe('통합검색 (v3 searchScan)', () => {
  const blocks = [
    blk('b1', '2026-11-01', 'SQLD', { type: 'h2' }),
    blk('b2', '2026-11-01', '기출 풀기'),
    blk('b3', '2026-11-02', 'sqld 오답 정리'),
    blk('b4', '2026-11-02', '점심 sqld', { area: 'memo', type: 'bullet' }),
    blk('b5', '2026-11-03', 'SQLD 지운 줄', { deletedAt: 1 }),
    blk('b6', '2026-10-26', '이번 주 SQLD 목표', { area: 'wmemo', type: 'bullet' }),
    blk('b7', '2026-10-26', 'SQLD 언젠가', { area: 'someday' }),
    blk('b8', '2026-10-20', 'SQLD 휴지통에 간 날'),
  ];
  const rows = searchScan('sqld', blocks, [log('l1', '2026-11-01', 'SQLD 공부')], new Set(['2026-10-20']));

  it('제목은 줄이 아니다 — 아래 줄의 경로로 붙고, 경로로만 걸린 줄은 맨 뒤', () => {
    expect(rows.find((r) => r.id === 'b1')).toBeUndefined();
    expect(rows.at(-1)).toMatchObject({ id: 'b2', crumb: 'SQLD', weak: true });
  });
  it('할 일 · 메모 · 시간 기록 · 주간 메모 · 날짜 미정, 지운 줄과 휴지통의 날은 뺀다', () => {
    expect(rows.map((r) => `${r.k}:${r.id}`).sort()).toEqual(['memo:b4', 'slot:l1', 'todo:b2', 'todo:b3', 'todo:b7', 'week:b6'].sort());
    expect(rows.find((r) => r.id === 'b7')?.undated).toBe(true);
  });
  it('최신 날짜순, 날짜 미정은 본문이 맞은 것 가운데 맨 뒤', () => {
    expect(rows.filter((r) => !r.weak).map((r) => r.id)).toEqual(['b3', 'b4', 'l1', 'b6', 'b7']);
  });
  it('기간 — 주간 메모는 겹치기만 하면, 날짜 미정은 빠진다, 시작 > 끝이면 뒤집는다', () => {
    const rg = rangeOf({ mode: 'custom', from: '2026-11-01', to: '2026-10-28' }, '2026-11-04')!;
    expect(rg).toEqual({ from: '2026-10-28', to: '2026-11-01' });
    expect(rows.filter((r) => inRange(r, rg)).map((r) => r.id).sort()).toEqual(['b2', 'b6', 'l1']);
    expect(rangeOf({ mode: '7d', from: '', to: '' }, '2026-11-04')).toEqual({ from: '2026-10-29', to: '2026-11-04' });
    expect(rangeOf({ mode: 'all', from: '', to: '' }, '2026-11-04')).toBeNull();
  });
  it('강조 조각 — 대소문자 무시, 원문 글자 그대로', () => {
    expect(hlParts('a SQLD b sqld', 'sqld')).toEqual(['a ', 'SQLD', ' b ', 'sqld', '']);
  });
});
