/**
 * 어느 화면(PC / 모바일)을 띄울지 — **처음 열 때 한 번만** 정한다
 *
 * ★ 창 폭으로 정하지 않는다. PC 창을 좁혀도 모바일 화면이 되면 안 된다 (2026-10-23 결정 — PC 는 레일이 핵심).
 *   «손가락으로 쓰는 기기» 이면서 «화면이 폰 크기» 일 때만 모바일이다.
 * ★ 태블릿(iPad)은 아직 PC 화면 (iPad 내비게이션은 미정)
 * ★ 시험용: 주소 뒤에 `?ui=mobile` · `?ui=pc` — 이 브라우저에 기억된다. `?ui=auto` 로 되돌린다
 */
export type Platform = 'pc' | 'mobile';

const KEY = 'dm.ui';

export function pickPlatform(): Platform {
  try {
    const q = new URLSearchParams(location.search).get('ui');
    if (q === 'pc' || q === 'mobile') localStorage.setItem(KEY, q);
    if (q === 'auto') localStorage.removeItem(KEY);
    const saved = localStorage.getItem(KEY);
    if (saved === 'pc' || saved === 'mobile') return saved;
  } catch { /* 저장소가 막힌 환경 — 자동으로 */ }
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const phoneSized = Math.min(screen.width, screen.height) < 768;
  return touch && phoneSized ? 'mobile' : 'pc';
}
