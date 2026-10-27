/**
 * 습관 — 반복하는 일을 날마다 체크 (v3 worklog.js `hb*` · LOGIC §11 `cfg.habits` · PRD §2-1-3)
 *
 * ▣ 저장: 습관 하나 = 문서 하나 (users/{uid}/items/{id}, kind 'habit').
 *   «그 날 했다» 는 같은 문서의 `done.{날짜} = 체크한 시각` 필드 하나 — 바뀐 필드만 보내므로 기기끼리 안 덮는다
 * ▣ 「오늘 해당하나」 · 달성률 · 연속은 저장하지 않고 그때그때 센다. 주의 기준은 월~일
 * ▣ 쉬는 날 = 그 날 근태가 연차 · 병가 (반차는 아니다). 판정은 부르는 쪽이 `offDay` 로 넘긴다
 */
import { addDays, dateOf, keyOf, weekStart } from '../ui/v3fmt';

export type HbType = 'daily' | 'days' | 'perWeek';

export interface Habit {
  id: string;
  kind: 'habit';
  emoji: string;
  title: string;
  note: string;
  type: HbType;
  /** 요일 지정 — 월 1 … 일 7 */
  days: number[];
  /** 주 N회 (1~6) */
  n: number;
  /** 쉬는 날 제외 (기본 켬) */
  skipOff: boolean;
  start: string;
  end: string | null;
  createdAt: number;
  archivedAt: number | null;
  deletedAt?: number | null;
  /** 날짜 → 체크한 시각. 안 했으면 키가 없다 */
  done?: Record<string, number>;
}

/** 그 날이 쉬는 날(연차 · 병가)인가 */
export type OffDay = (key: string) => boolean;

/** 오늘 패널 고리가 두 줄(한 줄 5개)을 넘지 않는 선 */
export const HB_MAX = 8;
export const HB_MAX_TITLE = 40, HB_MAX_NOTE = 80;

const plus = (key: string, n: number) => keyOf(addDays(dateOf(key), n));
const monday = (key: string) => keyOf(weekStart(dateOf(key)));
/** 월 1 … 일 7 */
export const hbDow = (key: string) => { const g = dateOf(key).getDay(); return g === 0 ? 7 : g; };
const inRange = (h: Habit, key: string) => key >= h.start && (!h.end || key <= h.end);

/** 해당일 — 기간 안 · 쉬는 날 아님 · 요일 지정이면 그 요일. 매일 · 주 N회는 모든 날 */
export function hbApplies(h: Habit, key: string, offDay: OffDay) {
  if (!inRange(h, key) || (h.skipOff && offDay(key))) return false;
  return h.type !== 'days' || h.days.includes(hbDow(key));
}
export const hbDoneAt = (h: Habit, key: string) => h.done?.[key] ?? null;

/** 주 N회 — 그 주(월~일)에 한 횟수 */
export function hbWeekCount(h: Habit, key: string) {
  const ws = monday(key);
  let c = 0;
  for (let i = 0; i < 7; i++) { const k = plus(ws, i); if (inRange(h, k) && hbDoneAt(h, k)) c++; }
  return c;
}

/** 끝나는 날이 오늘보다 앞이면 끝났다 */
export const hbEnded = (h: Habit, today: string) => !!h.end && h.end < today;

const alive = (h: Habit) => !h.deletedAt;

/** 목록 — 보관 안 한 것. 진행 중 먼저(만든 순), 끝난 것은 뒤로 */
export function hbLive(all: Habit[], today: string) {
  const list = all.filter((h) => alive(h) && !h.archivedAt).sort((a, b) => a.createdAt - b.createdAt);
  return list.filter((h) => !hbEnded(h, today)).concat(list.filter((h) => hbEnded(h, today)));
}

export interface HbOfDay { h: Habit; at: number | null; week: { c: number; n: number } | null }

/** 그 날 체크할 것. 주 N회는 그 주에 N회를 채우면 빠진다 (그 날 한 것은 남는다) */
export function hbOfDay(all: Habit[], key: string, offDay: OffDay): HbOfDay[] {
  const out: HbOfDay[] = [];
  for (const h of all.filter(alive).sort((a, b) => a.createdAt - b.createdAt)) {
    if (h.archivedAt || !hbApplies(h, key, offDay)) continue;
    const at = hbDoneAt(h, key);
    if (h.type === 'perWeek') {
      const c = hbWeekCount(h, key);
      if (!at && c >= h.n) continue;
      out.push({ h, at, week: { c, n: h.n } });
    } else out.push({ h, at, week: null });
  }
  return out;
}

export type HbInput = Pick<Habit, 'emoji' | 'title' | 'note' | 'type' | 'days' | 'n' | 'skipOff' | 'start' | 'end'>;

/** 입력 다듬기 — 타이틀이 없거나 요일 지정인데 요일이 없으면 null */
export function hbClean(v: HbInput): HbInput | null {
  const o: HbInput = {
    emoji: v.emoji.slice(0, 8),
    title: v.title.trim().slice(0, HB_MAX_TITLE),
    note: v.note.trim().slice(0, HB_MAX_NOTE),
    type: v.type,
    days: [...new Set(v.days.filter((x) => x >= 1 && x <= 7))].sort(),
    n: Math.max(1, Math.min(6, Math.round(v.n || 1))),
    skipOff: v.skipOff,
    start: v.start,
    end: v.end && v.end < v.start ? v.start : v.end,
  };
  return !o.title || (o.type === 'days' && !o.days.length) ? null : o;
}

/**
 * 기간 달성 — 매일 · 요일: 한 날 ÷ 해당일 / 주 N회: 채운 주 ÷ 끝난 주.
 * 안 끝난 오늘(안 했으면) · 안 끝난 주는 분모에서 뺀다
 */
export function hbRatio(h: Habit, from: string, to: string, today: string, offDay: OffDay) {
  let ok = 0, tot = 0;
  if (h.type === 'perWeek') {
    for (let ws = monday(from); ws <= to; ws = plus(ws, 7)) {
      const we = plus(ws, 6);
      if (we >= today || we < h.start || (h.end && ws > h.end)) continue;
      tot++; if (hbWeekCount(h, ws) >= h.n) ok++;
    }
  } else {
    for (let k = from; k <= to && k <= today; k = plus(k, 1)) {
      if (!hbApplies(h, k, offDay)) continue;
      const done = !!hbDoneAt(h, k);
      if (k === today && !done) continue;
      tot++; if (done) ok++;
    }
  }
  return { ok, tot, v: tot ? ok / tot : null };
}

/** 연속 — 해당일을 이어서(해당 없는 날은 건너뜀) · 주 N회는 채운 주를 이어서. 오늘(이번 주)은 했으면 세고 아직이면 끊지 않는다 */
export function hbStreak(h: Habit, today: string, offDay: OffDay) {
  let n = 0;
  if (h.type === 'perWeek') {
    let ws = monday(today);
    if (hbWeekCount(h, ws) >= h.n) n++;
    for (ws = plus(ws, -7); plus(ws, 6) >= h.start && n <= 520; ws = plus(ws, -7)) {
      if (hbWeekCount(h, ws) >= h.n) n++; else break;
    }
    return { n, unit: '주' };
  }
  if (hbApplies(h, today, offDay) && hbDoneAt(h, today)) n++;
  for (let k = plus(today, -1); k >= h.start && n <= 3660; k = plus(k, -1)) {
    if (!hbApplies(h, k, offDay)) continue;
    if (hbDoneAt(h, k)) n++; else break;
  }
  return { n, unit: '일' };
}

/** 최장 연속 — 수정 창 요약용 */
export function hbBest(h: Habit, today: string, offDay: OffDay) {
  let best = 0, run = 0;
  if (h.type === 'perWeek') {
    for (let ws = monday(h.start); ws <= today; ws = plus(ws, 7)) {
      if (hbWeekCount(h, ws) >= h.n) { run++; best = Math.max(best, run); } else if (plus(ws, 6) < today) run = 0;
    }
    return { n: best, unit: '주' };
  }
  for (let k = h.start; k <= today; k = plus(k, 1)) {
    if (!hbApplies(h, k, offDay)) continue;
    if (hbDoneAt(h, k)) { run++; best = Math.max(best, run); } else if (k < today) run = 0;
  }
  return { n: best, unit: '일' };
}

/** 「매일」 「평일」 「주말」 「월·수·금」 「주 3회」 */
export function hbFreqLabel(h: Pick<Habit, 'type' | 'days' | 'n'>) {
  if (h.type === 'perWeek') return `주 ${h.n}회`;
  if (h.type !== 'days') return '매일';
  const d = [...h.days].sort();
  const s = d.join(',');
  if (s === '1,2,3,4,5') return '평일';
  if (s === '6,7') return '주말';
  if (s === '1,2,3,4,5,6,7') return '매일';
  return d.map((x) => '월화수목금토일'[x - 1]).join('·');
}

export const HB_SPANS = [['2w', '2주'], ['1m', '한 달'], ['3m', '3개월'], ['6m', '6개월'], ['1y', '1년'], ['custom', '직접 입력']] as const;
export type HbSpan = (typeof HB_SPANS)[number][0];

/** 끝나는 날 — 시작일 포함 (2주 = 14일째 · 한 달 = 다음 달 같은 날 하루 전) */
export function hbSpanEnd(start: string, span: HbSpan): string | null {
  const d = dateOf(start);
  if (span === '2w') d.setDate(d.getDate() + 13);
  else {
    const m = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[span as '1m'];
    if (!m) return null;
    d.setMonth(d.getMonth() + m); d.setDate(d.getDate() - 1);
  }
  return keyOf(d);
}
export const hbSpanOf = (start: string, end: string): HbSpan =>
  (HB_SPANS.find(([k]) => k !== 'custom' && hbSpanEnd(start, k) === end) ?? ['custom'])[0];
