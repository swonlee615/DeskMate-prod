/**
 * 그림 — 한도 · 쓰는 양 · 비울 그림 (SYNC §14 · 2026-11-02 소유자)
 *
 * ▣ 그림 파일은 `images/{id}` 문서 하나씩. 목록(크기 · 날짜 · 줄)은 `items/images` 문서 하나의 map 에 — 설정에서 셀 때 그림을 안 받는다
 * ▣ 그림 줄을 지우면 gone 에 시각을 적고(되돌리면 지운다), 하루가 지나면 그림 파일을 실제로 지운다
 */
export const IMG_EDGE = 1200;               // 긴 변 (v3 와 같다)
export const IMG_MAX = 700 * 1024;          // 한 장 (Firestore 문서 1MiB 안)
export const IMG_QUOTA = 200 * 1024 * 1024; // 한 사람
export const IMG_GONE_MS = 24 * 3600e3;     // 지운 줄의 그림을 비우기까지

export interface ImgMeta { size: number; date: string; area: string; block: string; at: number; w: number; h: number; gone?: number | null }

/** 쓰는 양 — 지운 줄의 그림은 아직 파일이 있어도 세지 않는다 (곧 비워진다) */
export const imgUsed = (map: Record<string, ImgMeta>) => Object.values(map).reduce((a, m) => a + (m.gone ? 0 : m.size), 0);
/** 이 그림을 더 올릴 수 있나 */
export const imgFits = (map: Record<string, ImgMeta>, size: number) => imgUsed(map) + size <= IMG_QUOTA;
/** 비울 그림 — 줄을 지운 지 하루가 지난 것 */
export const imgToPurge = (map: Record<string, ImgMeta>, now: number) =>
  Object.entries(map).filter(([, m]) => m.gone && now - m.gone >= IMG_GONE_MS).map(([id]) => id);
/** 설정 목록 — 쓰는 그림만, 최근 날짜부터 */
export const imgList = (map: Record<string, ImgMeta>) =>
  Object.entries(map).filter(([, m]) => !m.gone).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
export const fmtMB = (n: number) => (n <= 0 ? '0MB' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
