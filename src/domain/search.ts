/**
 * 통합검색 — 내가 적은 것 (v3 searchScan · PRD §2-10 · v3.1.12 · v3.1.13)
 *
 * ▣ 찾는 것: 할 일(today) · 메모(memo) · 시간 기록 이름(slot) · 주간 메모(wmemo). 날짜 미정(someday)은 할 일로, «날짜 미정» 이라 적는다
 * ▣ 나와의 대화는 웹에 없다 (대화는 옮기지 않는다 · 2026-10-27 소유자)
 * ▣ 제목(h1~h3)은 결과 줄로 만들지 않는다 — 그 아래 줄의 «경로» 로 붙이고, 경로도 매칭에 넣는다. 본문이 맞은 것이 먼저
 * ▣ 휴지통에 있는 날은 안 찾는다 · 인덱스 없음 (훑어도 빠르다. 인덱스는 «고쳤는데 옛 글이 나온다» 를 만든다)
 * ▣ 기간 — 기본은 전체. 주간 메모는 한 주라 기간과 겹치기만 하면 걸린다. 날짜 미정은 어느 기간에도 안 속한다
 */
import { plainText } from './todos/inline';
import { flatten, isHead, type Block, type BlockArea } from './todos/tree';
import type { Log } from './attendance/logs';

export type ScKind = 'todo' | 'memo' | 'slot' | 'week';
export const SC_GROUPS: [ScKind, string, string][] = [['todo', '할 일', '☑'], ['memo', '메모', '✎'], ['slot', '시간 기록', '◷'], ['week', '주간 메모', '▤']];
export const SEARCH_MIN = 2;
export const SEARCH_TOP = 5;

export interface ScRow {
  k: ScKind; key: string; id: string; text: string;
  undated?: boolean; crumb?: string; weak?: boolean; done?: boolean;
  /** 시간 기록 — 시작 · 끝 (분) */
  s?: number; e?: number;
}

const AREA: [BlockArea, ScKind][] = [['today', 'todo'], ['memo', 'memo'], ['wmemo', 'week'], ['someday', 'todo']];

export function searchScan(q: string, blocks: Block[], logs: Log[], gone: Set<string>): ScRow[] {
  const nq = q.trim().toLowerCase();
  if (!nq) return [];
  const has = (s: string) => !!s && s.toLowerCase().includes(nq);
  const out: ScRow[] = [];
  // 날 · 칸마다 한 번씩 화면 순서로 편다 — 경로(바로 위 제목)를 읽으려면 순서가 있어야 한다
  const lists = new Map<string, Block[]>();
  for (const b of blocks) if (!b.deletedAt) { const dk = `${b.date}|${b.area}`; (lists.get(dk) ?? lists.set(dk, []).get(dk)!).push(b); }
  for (const [dk, mine] of lists) {
    const [date, area] = dk.split('|') as [string, BlockArea];
    const k = AREA.find((x) => x[0] === area)?.[1];
    if (!k || ((area === 'today' || area === 'memo') && gone.has(date))) continue;
    let crumb = '';
    for (const { b, depth } of flatten(mine, date, area)) {
      if (area === 'someday') crumb = b.group ?? '';   // 미정의 경로 = 묶음 이름
      const t = plainText(b.text).trim();
      if (isHead(b)) { if (depth === 0) crumb = t; continue; }
      if (!t) continue;
      const inBody = has(t), inCrumb = has(crumb);
      if (!inBody && !inCrumb) continue;
      out.push({ k, key: date, id: b.id, text: t, crumb: crumb || undefined, weak: !inBody, done: !!b.done, undated: area === 'someday' || undefined });
    }
  }
  for (const l of logs) {
    if (l.deletedAt || l.kind !== 'slot' || gone.has(l.date) || !has(l.text)) continue;
    out.push({ k: 'slot', key: l.date, id: l.id, text: l.text.trim(), s: l.s, e: l.e });
  }
  // 본문이 맞은 것이 먼저, 그다음 최신 날짜순 (날짜 미정은 맨 뒤)
  const sk = (r: ScRow) => (r.undated ? '' : r.key);
  return out.sort((a, b) => Number(!!a.weak) - Number(!!b.weak) || sk(b).localeCompare(sk(a)));
}

export type ScMode = 'all' | '7d' | '1m' | '3m' | 'year' | 'custom';
export const SC_QUICK: [ScMode, string, number][] = [['7d', '최근 1주', 7], ['1m', '최근 1개월', 30], ['3m', '최근 3개월', 90], ['year', '올해', 0]];
export interface ScRange { mode: ScMode; from: string; to: string }
export const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOf = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const plus = (k: string, n: number) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };

/** 걸린 기간을 날짜 두 개로 편다. 전체 기간이면 null */
export function rangeOf(r: ScRange, today: string): { from: string; to: string } | null {
  if (r.mode === 'all') return null;
  if (r.mode === 'custom') return dateOk(r.from) && dateOk(r.to) ? (r.from <= r.to ? { from: r.from, to: r.to } : { from: r.to, to: r.from }) : null;
  if (r.mode === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const q = SC_QUICK.find((x) => x[0] === r.mode);
  return q ? { from: plus(today, -q[2] + 1), to: today } : null;
}

export function inRange(r: ScRow, rg: { from: string; to: string } | null): boolean {
  if (!rg) return true;
  if (r.undated) return false;
  if (r.k === 'week') return r.key <= rg.to && plus(r.key, 6) >= rg.from;
  return r.key >= rg.from && r.key <= rg.to;
}

export const daysBetween = (a: string, b: string) => Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / 86400000) + 1;

/** 버튼에 적을 말 — 빠른 선택은 이름으로, 직접 지정은 날짜로 */
export function rangeLabel(r: ScRange, today: string): string {
  const q = SC_QUICK.find((x) => x[0] === r.mode);
  if (q) return q[1];
  const rg = rangeOf(r, today);
  return rg ? `${rg.from.slice(5)} ~ ${rg.to.slice(5)}` : '전체';
}

/** 매치 강조 조각 — [앞, 맞은 곳, 뒤, 맞은 곳, …]. 화면이 홀수 칸을 <mark> 로 */
export function hlParts(text: string, q: string): string[] {
  const nq = q.trim().toLowerCase();
  if (!nq) return [text];
  const ls = text.toLowerCase(), out: string[] = [];
  let i = 0, j = ls.indexOf(nq);
  while (j >= 0) { out.push(text.slice(i, j), text.slice(j, j + nq.length)); i = j + nq.length; j = ls.indexOf(nq, i); }
  out.push(text.slice(i));
  return out;
}
