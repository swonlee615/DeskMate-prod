/**
 * 근태 손으로 고치기 — v3 app.js / worklog.js 의 편집 함수 이식 (LOGIC §4 · §6-2 · §7)
 *
 * ★ 전부 «하루(Day) 를 받아 고친 하루를 돌려주는» 순수 함수다. 원본은 건드리지 않는다.
 *   저장은 부르는 쪽(useWorkspace)이 고친 하루를 override 이벤트 하나로 남긴다 (replay.ts).
 * ★ 시각은 분이 아니라 epoch ms 로 받는다 (화면에서 HH:MM → ms 로 바꿔 넘긴다).
 */
import type { Day, Span } from './types';
import { MIN_BREAK_MS, MIN_MS } from './types';
import { dayEndMs, dayStartMs, normalizeBreaks, offSpans } from './rules';

const clone = (d: Day): Day => ({ ...d, breaks: d.breaks.map((b) => ({ ...b })), pending: undefined });
const isOffSpan = (b: Span) => b.kind === 'off';

// ─────────────────────────────────────────────────────────── 차수 줄 (v3 sessionRows)

export interface SessionRow {
  on: number | null;
  off: number | null;
  /** 이 차수의 출근을 만든 비근무 구간 (없으면 하루의 onAt) */
  onBrk: number | null;
  /** 이 차수의 퇴근을 만든 비근무 구간 (없으면 하루의 offAt) */
  offBrk: number | null;
}

export function sessionRows(d: Day): SessionRow[] {
  if (d.onAt == null) return [];
  const offs = d.breaks.map((b, i) => ({ b, i }))
    .filter((x) => isOffSpan(x.b) && x.b.e != null).sort((a, b) => a.b.s - b.b.s);
  const rows: SessionRow[] = [];
  let curOn: number | null = d.onAt;
  let curBrk: number | null = null;
  for (const { b, i } of offs) {
    if (curOn == null || (b.e as number) <= curOn) continue;
    if (b.s > curOn) rows.push({ on: curOn, onBrk: curBrk, off: b.s, offBrk: i });
    curOn = b.e as number; curBrk = i;
  }
  rows.push({ on: curOn, onBrk: curBrk, off: d.offAt, offBrk: null });
  return rows;
}

// ─────────────────────────────────────────────────────────── 차수 시각 (§4 «사람이 적은 값이 우선»)

export interface Window { lo: number | null; hi: number | null }
export type SetResult = { ok: true; day: Day; cut: number } | { ok: false; w: Window | null; i: number; which: 'on' | 'off' };

/** 앞 차수 퇴근 < 내 출근 < 내 퇴근 < 다음 차수 출근 */
export function sessionWindow(rows: SessionRow[], i: number, which: 'on' | 'off'): Window | null {
  const r = rows[i], prev = rows[i - 1], next = rows[i + 1];
  if (!r) return null;
  return which === 'on' ? { lo: prev ? prev.off : null, hi: r.off } : { lo: r.on, hi: next ? next.on : null };
}

/** v3 setSessionTime — 범위 밖이면 고치지 않고 «어디까지 되는지» 를 돌려준다 */
export function setSessionTime(d0: Day, i: number, which: 'on' | 'off', ms: number): SetResult {
  const rows = sessionRows(d0);
  const r = rows[i];
  const w = sessionWindow(rows, i, which);
  if (!r || !w) return { ok: false, w: null, i, which };
  if ((w.lo != null && ms <= w.lo) || (w.hi != null && ms >= w.hi)) return { ok: false, w, i, which };
  // §4-9 — 그 날 창 안의 사실이다
  if (ms < dayStartMs(d0.date) || ms >= dayEndMs(d0.date)) return { ok: false, w, i, which };
  const d = clone(d0);
  if (which === 'on') {
    if (r.onBrk == null) d.onAt = ms; else d.breaks[r.onBrk].e = ms;
  } else if (r.offBrk == null) {
    d.offAt = ms;
  } else d.breaks[r.offBrk].s = ms;
  d.autoClosed = d.offAt != null ? 'confirmed' : undefined;
  d.breaks.sort((a, b) => a.s - b.s);
  const cut = clipBreaks(d);
  return { ok: true, day: normalizeBreaks(d), cut };
}

/** 왜 안 되는지 사람 말로 (v3 sessionWhy) */
export function sessionWhy(res: { w: Window | null; i: number; which: 'on' | 'off' }, hhmm: (ms: number) => string): string {
  const what = `${res.i + 1}차 ${res.which === 'on' ? '출근' : '퇴근'}`;
  const w = res.w ?? { lo: null, hi: null };
  if (w.lo != null && w.hi != null) return `${what} 시간은 ${hhmm(w.lo)}과 ${hhmm(w.hi)} 사이여야 해요`;
  if (w.lo != null) return `${what} 시간은 ${hhmm(w.lo)}보다 늦어야 해요`;
  if (w.hi != null) return `${what} 시간은 ${hhmm(w.hi)}보다 일러야 해요`;
  return '시간을 확인해 주세요';
}

/**
 * v3 clipBreaks — 경계를 옮긴 뒤 근무가 아닌 자리에 걸친 휴게는 잘라내고, 통째로 들어간 건 지운다.
 * (비근무 구간은 경계 그 자체이므로 안 건드리고, 진행 중인 구간도 그대로 둔다) — 고친 수를 돌려준다
 */
function clipBreaks(d: Day): number {
  const offs = offSpans(d);
  const on = d.onAt, off = d.offAt;
  const out: Span[] = [];
  let cut = 0;
  for (const b of d.breaks) {
    if (isOffSpan(b) || b.e == null) { out.push(b); continue; }
    let s0: number | null = b.s, e0: number | null = b.e;
    if (on != null && s0 < on) s0 = on;
    if (off != null && e0 > off) e0 = off;
    for (const o of offs) {
      if (s0 == null || e0 == null) break;
      const oe = o.e as number;
      if (e0 <= o.s || s0 >= oe) continue;
      if (s0 >= o.s && e0 <= oe) { s0 = e0 = null; break; }
      if (s0 < o.s && e0 > oe) { e0 = o.s; break; }
      if (s0 < o.s) e0 = o.s; else s0 = oe;
    }
    if (s0 == null || e0 == null || e0 - s0 < MIN_BREAK_MS) { cut++; continue; }
    if (s0 !== b.s || e0 !== b.e) cut++;
    out.push({ ...b, s: s0, e: e0 });
  }
  d.breaks = out.sort((a, b) => a.s - b.s);
  return cut;
}

// ─────────────────────────────────────────────────────────── 차수 지우기 · 합치기 (§4 v3.1.10)

/** 그 차수를 없앤다 — 그 시간이 통째로 빠진다 (근무시간 ↓) */
export function dropSession(d0: Day, i: number): Day | null {
  const rows = sessionRows(d0);
  const r = rows[i];
  if (!r) return null;
  const d = clone(d0);
  const brks = d.breaks;
  if (rows.length === 1) return { ...d, onAt: null, offAt: null, breaks: [], autoClosed: undefined };
  if (r.onBrk == null) {                      // 1차 — 다음 차수가 하루의 시작이 된다
    const nx = brks[r.offBrk as number];
    if (!nx) return null;
    d.onAt = nx.e; brks.splice(r.offBrk as number, 1);
  } else if (r.offBrk == null) {              // 마지막 차수 — 앞 차수가 끝나는 자리에서 하루가 끝난다
    const pv = brks[r.onBrk];
    if (!pv) return null;
    d.offAt = pv.s; d.autoClosed = 'confirmed'; brks.splice(r.onBrk, 1);
  } else {                                    // 가운데 — 앞뒤 비근무 구간을 하나로 잇는다
    const pv = brks[r.onBrk], nx = brks[r.offBrk];
    if (!pv || !nx) return null;
    pv.e = nx.e; brks.splice(r.offBrk, 1);
  }
  return normalizeBreaks(d);
}

/** 앞 차수와 잇는다 — 사이의 비근무를 지운다 (근무시간 ↑). 1차는 앞이 없다 */
export function mergeSession(d0: Day, i: number): Day | null {
  const r = sessionRows(d0)[i];
  if (!r || r.onBrk == null) return null;
  const d = clone(d0);
  if (!d.breaks[r.onBrk]) return null;
  d.breaks.splice(r.onBrk, 1);
  return normalizeBreaks(d);
}

// ─────────────────────────────────────────────────────────── 차수 추가 (§4 v3.1.10 · v3.1.82)

const SES_GAP_MS = 3600000;

/** 새 차수를 놓을 추천 자리 — placeholder 로만 쓴다. 남은 시간이 없으면 null (v3 sessionSlot) */
export function sessionSlot(d: Day, now: number): { on: number; off: number } | null {
  if (d.offAt == null) return null;
  let cap = dayEndMs(d.date) - MIN_MS;
  if (now < dayEndMs(d.date)) cap = Math.min(cap, now);
  if (cap - d.offAt < 20 * MIN_MS) return null;
  const on = Math.min(d.offAt + SES_GAP_MS, cap - 10 * MIN_MS);
  return { on, off: Math.min(on + SES_GAP_MS, cap) };
}

export function canAddSession(d: Day, now: number): boolean {
  if (d.onAt == null) return false;
  if (d.offAt == null) return true;
  return sessionSlot(d, now) != null;
}

/**
 * `on` 에서 새 차수를 연다 (v3 planSession + addSessionAt)
 * 겹쳐 적어도 막지 않는다 — 이미 있던 경계는 새 차수 «안» 으로 편입된다 (비근무 → 휴게)
 * `off` 를 비우면 새 차수가 근무 중으로 열린다
 */
export function addSessionAt(d0: Day, on: number, off: number | null): Day | null {
  if (d0.onAt == null || on <= d0.onAt) return null;
  if (off != null && !(off > on)) return null;
  if (on >= dayEndMs(d0.date) || (off != null && off > dayEndMs(d0.date))) return null;
  const d = clone(d0);
  const nb: Span[] = [];
  let cut = false;
  for (const b of d.breaks) {
    if (!isOffSpan(b) || b.e == null) { nb.push(b); continue; }
    if (b.e <= on) { nb.push(b); continue; }
    if (b.s <= on) { nb.push({ ...b, e: on }); cut = true; continue; }
    nb.push({ ...b, kind: 'break' });
  }
  if (d.offAt != null && on >= d.offAt) { nb.push({ s: d.offAt, e: on, kind: 'off' }); cut = true; }
  if (!cut) nb.push({ s: on, e: on, kind: 'off' });
  d.breaks = nb.sort((a, b) => a.s - b.s);
  d.offAt = off;
  d.autoClosed = off != null ? 'confirmed' : undefined;
  // 근무 중에 «지금 이 자리에서» 연 경우 길이 0 경계가 남는데, 재생 뒤 정리(1분 미만 삭제)에서 사라진다.
  // 근무시간은 같으므로 잃는 것이 없다
  return d;
}

// ─────────────────────────────────────────────────────────── 휴게 (§4 «휴게는 줄을 눌러 고친다»)

/** 휴게 시각 고치기 (v3 setBreakAt) — 뒤집히면 false */
export function setBreakAt(d0: Day, idx: number, field: 's' | 'e', ms: number): Day | null {
  const b0 = d0.breaks[idx];
  if (!b0) return null;
  const d = clone(d0);
  const b = d.breaks[idx];
  b[field] = ms;
  if (b.e != null && b.e <= b.s) return null;
  if (b.e != null && b.e - b.s < MIN_BREAK_MS) return null;
  b.auto = false; delete b.by; // 사람이 고쳤다 — 더는 자동 감지가 아니다
  d.breaks.sort((a, c) => a.s - c.s);
  return normalizeBreaks(d);
}

/** 휴게 상자에서 저장 — 시작 · 끝 · 메모를 한 번에 (v3 slotModal 의 휴게) */
export function editBreak(d0: Day, idx: number, s: number, e: number, note: string): Day | null {
  const b0 = d0.breaks[idx];
  if (!b0 || !(e > s) || e - s < MIN_BREAK_MS) return null;
  const d = clone(d0);
  const b = d.breaks[idx];
  b.s = s; b.e = e;
  if (note.trim()) b.note = note.trim(); else delete b.note;
  b.auto = false; delete b.by;
  d.breaks.sort((a, c) => a.s - c.s);
  return normalizeBreaks(d);
}

export function removeBreak(d0: Day, idx: number): Day | null {
  if (!d0.breaks[idx]) return null;
  const d = clone(d0);
  d.breaks.splice(idx, 1);
  return normalizeBreaks(d);
}

// ─────────────────────────────────────────────────────────── 자정을 넘긴 날 (§7)

/** 다음날로 이어붙일 수 있나 — 다음날에 이미 자기 출근이 있으면 안 된다 (00:00 정각이면 같은 값이라 된다) */
export function canCarry(next: Day | undefined, key: string): boolean {
  if (!next || next.onAt == null) return true;
  if (next.carriedFrom) return true;
  return next.onAt === dayEndMs(key);
}

/** 「그 시각에 퇴근했어요」 — 사람이 정했으므로 confirmed */
export function resolveAt(d0: Day): Day | null {
  if (!d0.pending) return null;
  const d = clone(d0);
  d.offAt = d0.pending.guessOff;
  d.autoClosed = 'confirmed';
  return d;
}

/** 「계속 일했어요」 — 그 날은 23:59 로 닫는다. 다음날 00:00 출근은 부르는 쪽이 이벤트로 남긴다 */
export function resolveCarry(d0: Day): Day | null {
  if (!d0.pending) return null;
  const d = clone(d0);
  d.offAt = dayEndMs(d.date) - MIN_MS;
  d.autoClosed = 'confirmed';
  return d;
}
