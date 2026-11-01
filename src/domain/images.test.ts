import { describe, expect, it } from 'vitest';
import { fmtMB, IMG_GONE_MS, IMG_QUOTA, imgFits, imgList, imgToPurge, imgUsed, type ImgMeta } from './images';

const M = (size: number, date: string, gone: number | null = null): ImgMeta => ({ size, date, area: 'memo', block: 'b', at: 0, w: 1, h: 1, gone });

describe('그림 한도 · 비우기 (SYNC §14)', () => {
  it('쓰는 양은 지운 줄의 그림을 빼고 센다 · 200MB 를 넘으면 못 올린다', () => {
    const map = { a: M(300_000, '2026-11-01'), b: M(200_000, '2026-11-02', 5) };
    expect(imgUsed(map)).toBe(300_000);
    expect(imgFits(map, IMG_QUOTA - 300_000)).toBe(true);
    expect(imgFits(map, IMG_QUOTA - 299_999)).toBe(false);
  });
  it('줄을 지운 지 하루가 지난 그림만 비운다 · 목록엔 쓰는 그림만 최근부터', () => {
    const map = { a: M(1, '2026-11-01'), b: M(1, '2026-11-02', 1000), c: M(1, '2026-11-03') };
    expect(imgToPurge(map, 1000 + IMG_GONE_MS - 1)).toEqual([]);
    expect(imgToPurge(map, 1000 + IMG_GONE_MS)).toEqual(['b']);
    expect(imgList(map).map((x) => x.id)).toEqual(['c', 'a']);
    expect(fmtMB(86 * 1024 * 1024)).toBe('86.0MB');
    expect(fmtMB(300_000)).toBe('293KB');
    expect(fmtMB(0)).toBe('0MB');
  });
});
