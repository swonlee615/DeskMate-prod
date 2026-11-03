/**
 * 저장됨 목록 — PC · 폰이 같이 쓴다 (v3 renderLater · svGroups)
 * ★ 메모 줄의 제목 · 첫 줄 · «휴지통에 있음» 과 보관한 D-Day · 습관 줄을 같은 정렬로 만든다
 * ★ 보고 있는 동안만 가장 오래된 메모의 날까지 받아 둔다 (활동 화면과 같은 손잡이)
 */
import { useEffect, useMemo } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { bySaved, savedMemos, type SavedKind } from '../domain/saved';
import { plainText } from '../domain/todos/inline';
import { dateOf, DOW, weekTag } from './v3fmt';

export const dayTitle = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };
export const weekTitle = (k: string) => { const t = weekTag(dateOf(k)); return `${t.month}월 ${t.no}주`; };

export interface MemoRow { id: string; kind: SavedKind; key: string; title: string; sub: string; gone: boolean; pinnedAt: number | null }

export function useSaved(ws: Workspace, hidden: boolean) {
  const sort = ws.savedSort, by = bySaved(sort);
  const memoKeys = savedMemos(ws.saved, sort);
  const oldest = memoKeys.map((x) => x.key).sort()[0];
  const { setDashSpan, today } = ws;
  useEffect(() => {
    if (hidden || !oldest) return;
    setDashSpan([oldest, today]);
    return () => setDashSpan(null);
  }, [hidden, oldest, today, setDashSpan]);

  const memos: MemoRow[] = useMemo(() => memoKeys.map((x) => {
    const gone = x.kind === 'day' && ws.trash.some((t) => t.date === x.key);
    const area = x.kind === 'week' ? 'wmemo' : 'memo';
    const first = ws.blocks.filter((b) => b.date === x.key && b.area === area && !b.deletedAt).sort((a, b) => a.pos - b.pos)
      .map((b) => plainText(b.text).trim()).find(Boolean) ?? '';
    return { id: x.id, kind: x.kind, key: x.key, title: x.kind === 'week' ? weekTitle(x.key) : dayTitle(x.key),
      sub: gone ? '원본 하루가 휴지통에 있어요' : first || '비어 있음', gone, pinnedAt: x.pinnedAt };
  }), [memoKeys, ws.blocks, ws.trash]); // eslint-disable-line react-hooks/exhaustive-deps
  const dds = ws.ddays.filter((d) => d.archivedAt).map((it) => ({ it, date: it.date, savedAt: it.archivedAt ?? 0 })).sort(by);
  const hbs = ws.habits.filter((h) => h.archivedAt).map((h) => ({ h, date: h.start, savedAt: h.archivedAt ?? 0 })).sort(by);
  return { sort, memos, dds, hbs, empty: !memos.length && !dds.length && !hbs.length };
}
