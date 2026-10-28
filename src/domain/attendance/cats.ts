/**
 * 시간 기록 카테고리 = 이름 붙인 색 (v3 WL.cats · catName · PRD §2-3)
 *
 * ▣ 기록에는 **색만** 남는다. 이름은 이 목록 한 곳 — 이름을 바꿔도 지난 기록이 따라온다
 * ▣ 저장: 사람 하나에 문서 하나 (items/cats · `list`). 없으면 v3 처럼 12색 · 이름 없음
 * ▣ 「무엇을 했나요?」 고르기 목록 (v3 slotTodoItems) — 그 날 체크 줄 + 최근에 쓴 기록 이름
 */
import { carriedInto, type Block } from '../todos/tree';
import { SLOT_COLORS, type Log } from './logs';

export interface Cat { color: string; name: string }

/** 이름 칸 예시 — 칸마다 다르게. 같은 예시를 반복하면 배경 무늬로 읽힌다 (v3 CAT_EX) */
export const CAT_EX = ['개발', '회의', '기획 · 리서치', '문서 정리', '디자인', '잡무'];

export const catKey = (c: string | null | undefined) => String(c || '').trim().toLowerCase();

/** 저장된 목록 → 화면 목록. 없으면 12색 · 이름 없음 (v3 cats 첫 실행) */
export const catsOf = (list: Cat[] | null | undefined): Cat[] =>
  list?.length ? list : SLOT_COLORS.map((color) => ({ color, name: '' }));

export const catName = (list: Cat[], color: string | null | undefined) =>
  list.find((c) => c.color === catKey(color))?.name.trim() ?? '';

/** 고르는 상자에 띄울 칸 — 이름 붙인 것 + 지금 쓰는 색 (v2.9.59) */
export const catChoices = (list: Cat[], cur: string | null) =>
  list.filter((c) => c.name.trim() || (cur && c.color === catKey(cur)));

/** 목록 갈아끼우기 — 빈 색 · 같은 색은 버리고, 이름은 14자 (v3 setCats) */
export function cleanCats(list: Cat[]): Cat[] {
  const seen = new Set<string>();
  const out: Cat[] = [];
  for (const c of list) {
    const color = catKey(c.color);
    if (!/^#[0-9a-f]{6}$/.test(color) || seen.has(color)) continue;
    seen.add(color);
    out.push({ color, name: c.name.trim().slice(0, 14) });
  }
  return out;
}

/** 새 카테고리 색 — 아직 안 쓴 팔레트 색부터 (v3 nextCatColor) */
export function nextCatColor(list: Cat[]): string {
  const used = new Set(list.map((c) => c.color));
  return SLOT_COLORS.find((c) => !used.has(c)) ?? SLOT_COLORS[list.length % SLOT_COLORS.length];
}

export interface LabelPick { t: string; kind: '오늘 할 일' | '최근에 쓴 기록'; done: boolean }

const clean = (t: string) => t.replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~`#]/g, '').trim();

/**
 * 「무엇을 했나요?」 목록 (v3.1.19 slotTodoItems) — 그 날 할 일의 체크 줄(끝냈어도) → 다른 날 기록 이름(최근순). 같은 글은 한 번, 40개까지
 * 오늘이면 지난 날에서 넘어온 줄(D+N)도 «오늘 할 일» — v3 는 그 줄이 실제로 오늘로 옮겨져 있었다
 */
export function labelPicks(blocks: Block[], logs: Log[], date: string, today: string): LabelPick[] {
  const seen = new Set<string>();
  const out: LabelPick[] = [];
  const push = (raw: string, kind: LabelPick['kind'], done: boolean) => {
    const t = clean(raw);
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ t, kind, done });
  };
  for (const b of blocks) {
    if (b.deletedAt || b.area !== 'today' || b.date !== date || b.type !== 'check') continue;
    push(b.text, '오늘 할 일', !!b.done);
  }
  if (date === today) {
    for (const c of carriedInto(blocks, date)) {
      for (const { b } of [c.root, ...c.kids]) if (b.type === 'check') push(b.text, '오늘 할 일', !!b.done);
    }
  }
  const past = logs.filter((l) => !l.deletedAt && l.kind === 'slot' && l.date !== date)
    .sort((a, b) => (a.date === b.date ? b.s - a.s : a.date < b.date ? 1 : -1));
  for (const l of past) {
    if (out.length >= 40) break;
    push(l.text, '최근에 쓴 기록', false);
  }
  return out.slice(0, 40);
}

