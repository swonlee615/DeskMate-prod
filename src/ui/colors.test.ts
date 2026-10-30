/**
 * 색은 v3 토큰만 — 화면 CSS 에 손으로 고른 색(#hex · rgb())이 들어오면 실패한다 (2026-10-30 소유자: 「용도에 맞는 색이 정해져 있고 함부로 바꾸지 않게」)
 * 토큰의 값은 v3 원본(src/v3/styles.css)에만 있다. 꼭 고정색이어야 하는 줄(브랜드 규정 등)은 같은 줄에 `color-ok:` 와 이유를 적는다
 */
import { describe, expect, it } from 'vitest';
import mobile from '../mobile/mobile.css?raw';
import pc from '../pc/pc.css?raw';
import shared from './shared.css?raw';

const FILES: Record<string, string> = { 'src/mobile/mobile.css': mobile, 'src/pc/pc.css': pc, 'src/ui/shared.css': shared };
const RAW = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;

describe('화면 CSS 는 v3 색 토큰만 쓴다', () => {
  for (const [f, css] of Object.entries(FILES)) {
    it(f, () => {
      const bad = css.split('\n')
        .map((l, i) => ({ l: l.trim(), n: i + 1 }))
        .filter(({ l }) => RAW.test(l) && !l.includes('color-ok:') && !l.startsWith('/*') && !l.startsWith('*'));
      expect(bad.map((x) => `${f}:${x.n}  ${x.l}`)).toEqual([]);
    });
  }
});
