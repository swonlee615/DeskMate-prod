/**
 * 저장됨 — 메모 담기 · 고정 · 정렬 (v3.1.206 · v3.1.262 svGroups)
 * ★ 메모는 사본이 아니라 원본을 가리킨다 — `${kind}:${날짜}` 하나. 여기서 고친 줄이 곧 그 날 · 그 주의 메모다
 * ★ 고정한 것은 묶음 맨 위 (정렬과 상관없이). 고정끼리는 나중에 고정한 것이 위
 */
export type SavedKind = 'day' | 'week';
export interface SavedMemo { savedAt: number; pinnedAt?: number | null }
export type SavedMap = Record<string, SavedMemo>;
export type SavedSort = 'saved' | 'date';

export const savedId = (kind: SavedKind, key: string) => `${kind}:${key}`;
export const parseSavedId = (id: string) => { const i = id.indexOf(':'); return { kind: id.slice(0, i) as SavedKind, key: id.slice(i + 1) }; };

/** 줄 정렬 — 고정 먼저, 그다음 고른 기준 (날짜순은 최근 날짜가 위, 같으면 최근 저장이 위) */
export function bySaved<T extends { date: string; savedAt: number; pinnedAt?: number | null }>(sort: SavedSort) {
  return (a: T, b: T) => {
    const pa = a.pinnedAt || 0, pb = b.pinnedAt || 0;
    if (pa || pb) return pa && pb ? pb - pa : pb ? 1 : -1;
    return sort === 'date' ? b.date.localeCompare(a.date) || b.savedAt - a.savedAt : b.savedAt - a.savedAt;
  };
}

export function savedMemos(map: SavedMap, sort: SavedSort) {
  return Object.entries(map).filter(([, v]) => v && v.savedAt)
    .map(([id, v]) => ({ id, ...parseSavedId(id), date: parseSavedId(id).key, savedAt: v.savedAt, pinnedAt: v.pinnedAt ?? null }))
    .sort(bySaved(sort));
}

/** v3 `cfg.savedMemos = [{ kind, key, savedAt, pinnedAt }]` → 웹 지도 */
export function savedFromV3(list: unknown, now: number): SavedMap {
  const out: SavedMap = {};
  if (!Array.isArray(list)) return out;
  for (const x of list as { kind?: string; key?: string; savedAt?: number; at?: number; pinnedAt?: number }[]) {
    if (!x || !x.key || (x.kind !== 'day' && x.kind !== 'week')) continue;
    out[savedId(x.kind, x.key)] = { savedAt: x.savedAt || x.at || now, ...(x.pinnedAt ? { pinnedAt: x.pinnedAt } : {}) };
  }
  return out;
}
