/**
 * 시간 기록 · 근무 밖 휴게 (v3 day.slots · day.rests — LOGIC §5 · §6)
 *
 * ▣ 저장: 기록 하나 = 문서 하나 (users/{uid}/logs/{id}). s · e 는 그 날 00:00 기준 «분».
 *   근태 이벤트가 아니다 — 근태를 고쳐도 기록은 남는다 (v3 도 slots 와 breaks 가 별개 배열)
 * ▣ 시간 기록(slot)은 근무시간에 들어간다 (dayParts 가 day.slots 로 받는다)
 * ▣ 근무 밖 휴게(rest)는 근무시간 · 휴게 합계 · 퇴근 어디에도 안 들어간다 — 시간표에 무늬와 메모로만
 */
import type { Day } from './types';
import { dayStartMs, offSpans, sessions } from './rules';

export type LogKind = 'slot' | 'rest';

export interface Log {
  id: string;
  date: string;
  kind: LogKind;
  s: number;
  e: number;
  /** 시간 기록은 «무엇을 했나» (필수) · 휴게는 메모 (선택) */
  text: string;
  /** 카테고리 색 — 시간 기록은 늘 하나, 휴게는 없어도 된다 (v3.1.249) */
  color: string | null;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number | null;
}

/** v3 SLOT_COLORS — 카테고리 색. 화면은 `var(--cN)` 으로 그린다 (catVar) */
export const SLOT_COLORS = ['#5b97cf', '#529e72', '#9d68d3', '#ca9849', '#d15796', '#9b9b9b', '#c77d48', '#ba856f', '#df5452', '#4bb3a4', '#6c7cd4', '#9bb055'];
export const catVar = (color: string) => {
  const i = SLOT_COLORS.indexOf(color.toLowerCase());
  return i < 0 ? color : `var(--c${i + 1}, ${color})`;
};

export const logsOf = (logs: Log[], date: string, kind?: LogKind) =>
  logs.filter((l) => !l.deletedAt && l.date === date && (!kind || l.kind === kind)).sort((a, b) => a.s - b.s);

/** 새 기록이 덮는 같은 종류의 기록 — 겹치면 새것이 이긴다 (v3 addSlot · addRest) */
export const overlapIds = (logs: Log[], date: string, kind: LogKind, s: number, e: number, skip?: string) =>
  logsOf(logs, date, kind).filter((l) => l.id !== skip && l.s < e && s < l.e).map((l) => l.id);

/** 차례 색 — 그 날 몇 번째 기록인지로 (v3 SLOT_COLORS[d.slots.length % n]) */
export const nextColor = (n: number) => SLOT_COLORS[n % SLOT_COLORS.length];

/**
 * 그 시각이 «근무 밖» 인가 — 출근 전 · 퇴근 뒤 · 비근무 안 (v3 slotOutside · v3.1.45).
 * 저장하는 값이 아니다. 출근 기록이 없는 날은 판정하지 않는다 (기준선이 없으면 밖도 없다)
 */
export function slotOutside(day: Day, sMin: number): boolean {
  if (day.onAt == null) return false;
  const at = dayStartMs(day.date) + sMin * 60000;
  if (at < day.onAt) return true;
  const off = day.offAt ?? day.pending?.guessOff ?? null;
  if (off != null && at >= off) return true;
  return offSpans(day).some((b) => at >= b.s && at < (b.e as number));
}

type MIv = [number, number];

/**
 * 휴게로 그은 구간 나누기 (v3.1.239) — 근무 안 몫은 근태 휴게(breaks), 밖 몫은 근무 밖 휴게(rests).
 * 휴게로 그은 시간이 근무로 남지 않고, 출퇴근 시각도 안 바뀐다. 출근 기록이 없으면 전부 밖
 */
export function splitRest(day: Day, s: number, e: number): { inside: MIv[]; outside: MIv[] } {
  const base = dayStartMs(day.date);
  const m = (ms: number) => Math.round((ms - base) / 60000);
  const inside: MIv[] = [];
  for (const x of sessions(day)) {
    const a = Math.max(s, m(x.on)), z = Math.min(e, x.off != null ? m(x.off) : day.pending ? m(day.pending.guessOff) : 1440);
    if (z > a) inside.push([a, z]);
  }
  const outside: MIv[] = [];
  let cur = s;
  for (const [a, z] of inside) { if (a > cur) outside.push([cur, a]); cur = z; }
  if (cur < e) outside.push([cur, e]);
  return { inside, outside };
}

/** 시간표 상자가 연 것 — 시간 기록 · 근무 밖 휴게는 id, 근태 휴게는 자리 */
export type SpanRef = { type: 'slot' | 'rest'; id: string } | { type: 'brk'; idx: number };
/** 상자에서 고른 것 — 종류 · 구간(분) · 이름(메모) · 카테고리 */
export interface SpanInput { kind: 'slot' | 'break'; s: number; e: number; text: string; color: string | null }
