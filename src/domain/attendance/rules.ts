/**
 * 근태 판정 규칙 — v3 LOGIC.md 이식본
 *
 * 판정은 이 파일 한 곳에서만 한다 (LOGIC.md §0 «판정 규칙을 한 곳에만 둔다»).
 * 화면 코드는 day.breaks 를 직접 뒤지지 않고 여기 함수를 부른다 (LOGIC.md §8-1, §10).
 */
import {
  type Day, type Span, type SpanKind, type AttState,
  LONG_BREAK_MS, MIN_BREAK_MS, JOIN_GAP_MS, MIN_MS,
} from './types';

// ─────────────────────────────────────────────────────────── 하루의 창 (§4-9)

/** 'YYYY-MM-DD' 의 기기 현지 00:00 */
export function dayStartMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** 다음 날 00:00. 하루 창은 [dayStartMs, dayEndMs) */
export function dayEndMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + 1).getTime();
}

/** epoch ms → 그 시각이 속한 날 키 (기기 현지) */
export function dateKey(ms: number): string {
  const t = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// ─────────────────────────────────────────────────────────── 구간 판정 (§3)

/**
 * 그 구간을 «어디까지» 로 볼지 정하는 유일한 함수 (§3).
 * `b.e ?? now` 를 직접 쓰지 말 것 — 퇴근을 모른다 (§8-2)
 */
export function spanEnd(day: Day, b: Span, now: number): number {
  if (b.e != null) return day.offAt != null ? Math.min(b.e, day.offAt) : b.e;
  return day.offAt ?? now;
}

/** 이 구간은 휴게인가 비근무인가 — 최종 결정권 (§3) */
export function effKind(day: Day, b: Span, now: number): SpanKind {
  if (b.kind === 'off') return 'off';
  return spanEnd(day, b, now) - b.s >= LONG_BREAK_MS ? 'off' : 'break';
}

/**
 * 정리 (§3 normalizeBreaks)
 * 1. 1분 미만 삭제
 * 2. 2분 이내로 붙은 같은 종류는 하나로
 * 3. 종류가 다른 구간이 겹치면 앞엣것을 살리고 뒤엣것을 자른다 (이중 차감 방지)
 * 4. 닫힌 구간 중 2시간을 넘긴 것은 off 로 승격
 * 5. 진행 중인 구간은 건드리지 않는다
 */
export function normalizeBreaks(day: Day): Day {
  const open = day.breaks.filter((b) => b.e == null);
  let closed = day.breaks
    .filter((b) => b.e != null)
    .map((b) => ({ ...b }))
    .filter((b) => (b.e as number) - b.s >= MIN_BREAK_MS)
    .sort((a, b) => a.s - b.s);

  // 순서는 LOGIC 원문 그대로 — 합친 «뒤에» 길이로 승격한다.
  // 먼저 승격하면 85분 + 130분 조각이 «휴게 + 비근무» 로 갈라진다 (§2 v2.9.66 과 같은 사고)
  const out: Span[] = [];
  for (const b of closed) {
    const prev = out[out.length - 1];
    if (!prev) { out.push(b); continue; }
    const pe = prev.e as number;
    if (prev.kind === b.kind && b.s - pe <= JOIN_GAP_MS) {
      // 2. 합치기 (겹친 것도 여기서 합쳐진다)
      prev.e = Math.max(pe, b.e as number);
      // 하나라도 사람이 누른 구간이면 합친 구간도 사람이 누른 것이다
      prev.auto = !!(prev.auto && b.auto);
      if (!prev.note && b.note) prev.note = b.note; // 합쳐도 메모는 남긴다
      if (prev.kind === 'break' && (prev.e as number) - prev.s >= LONG_BREAK_MS) prev.kind = 'off';
      continue;
    }
    if (b.s < pe) {
      // 3. 다른 종류가 겹침 → 뒤엣것을 자른다
      if ((b.e as number) <= pe) continue;
      b.s = pe;
      if ((b.e as number) - b.s < MIN_BREAK_MS) continue;
    }
    out.push(b);
  }
  for (const b of out) {
    if (b.kind === 'break' && (b.e as number) - b.s >= LONG_BREAK_MS) b.kind = 'off';
  }
  closed = out;
  return { ...day, breaks: [...closed, ...open].sort((a, b) => a.s - b.s) };
}

/**
 * 2시간을 넘긴 «열린» 구간은 그 자리에서 퇴근으로 확정한다 (§3, v3.1.8)
 * 이벤트 재생 구조에서는 저장하지 않고 계산할 때마다 적용한다 — 결과가 늘 같다.
 */
export function closeIfLongAway(day: Day, until: number): Day {
  if (day.onAt == null || day.offAt != null) return day;
  const i = day.breaks.findIndex((b) => b.e == null && b.s > (day.onAt as number));
  if (i < 0) return day;
  const b = day.breaks[i];
  if (until - b.s < LONG_BREAK_MS) return day;
  return {
    ...day,
    offAt: b.s,
    autoClosed: 'away',
    breaks: day.breaks.filter((_, j) => j !== i),
  };
}

// ─────────────────────────────────────────────────────────── 차수 (§4)

/** 차수 경계 = kind 'off' «그리고» e != null (§4, v2.9.94) */
export function offSpans(day: Day): Span[] {
  return day.breaks.filter((b) => b.kind === 'off' && b.e != null).sort((a, b) => a.s - b.s);
}

export interface Session { on: number; off: number | null }

export function sessions(day: Day): Session[] {
  if (day.onAt == null) return [];
  const out: Session[] = [];
  let on = day.onAt;
  for (const b of offSpans(day)) {
    out.push({ on, off: b.s });
    on = b.e as number;
  }
  out.push({ on, off: day.offAt });
  return out;
}

// ─────────────────────────────────────────────────────────── 계산 (§5)

type Iv = [number, number];

function mergeIv(list: Iv[]): Iv[] {
  const s = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Iv[] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function totalIv(list: Iv[]): number {
  return mergeIv(list).reduce((t, [a, b]) => t + (b - a), 0);
}

function clip([a, b]: Iv, [lo, hi]: Iv): Iv {
  return [Math.max(a, lo), Math.min(b, hi)];
}

export interface DayParts {
  workMs: number;
  breakMs: number;
  offMs: number;
}

/**
 * 근무시간 = (출근~퇴근 − 비근무 − 휴게), 모두 그 날 창 [00:00, 다음 날 00:00) 과
 * [출근, 퇴근] 안으로 자른 뒤 합집합으로 잰다 (§4-9, §5).
 * 오늘은 «지금» 까지만 센다.
 * (시간 기록 slots 의 합집합은 시간 기록 그리드를 옮길 때 추가한다)
 */
export function dayParts(day: Day, now: number): DayParts {
  if (day.onAt == null) return { workMs: 0, breakMs: 0, offMs: 0 };
  const win: Iv = [dayStartMs(day.date), dayEndMs(day.date)];
  // 확인을 기다리는 지난 날은 23:59 까지로 센다 (v3 effectiveOff — pending.guessOff)
  const end = day.offAt ?? (day.pending ? day.pending.guessOff : Math.min(now, win[1]));
  const base = clip([day.onAt, end], win);
  if (base[1] <= base[0]) return { workMs: 0, breakMs: 0, offMs: 0 };

  const brk: Iv[] = [];
  const off: Iv[] = [];
  for (const b of day.breaks) {
    const iv = clip([b.s, spanEnd(day, b, now)], base);
    (effKind(day, b, now) === 'off' ? off : brk).push(iv);
  }
  const offMs = totalIv(off);
  // 휴게가 비근무와 겹친 부분은 두 번 빼지 않는다
  const awayMs = totalIv([...off, ...brk]);
  return {
    workMs: base[1] - base[0] - awayMs,
    breakMs: awayMs - offMs,
    offMs,
  };
}

export function workMinutes(day: Day, now: number): number {
  return Math.floor(dayParts(day, now).workMs / MIN_MS);
}

// ─────────────────────────────────────────────────────────── 상태

export function stateOf(day: Day): AttState {
  if (day.onAt == null) return 'none';
  if (day.pending) return 'off'; // 확인 대기인 지난 날은 «근무 중» 이 아니다 (v3 isWorking)
  if (day.offAt != null) return 'off';
  return day.breaks.some((b) => b.e == null) ? 'break' : 'work';
}

/** 열린 휴게 (화면의 「휴게 중 · N분째」) */
export function openBreak(day: Day): Span | null {
  return day.breaks.find((b) => b.e == null) ?? null;
}

// ─────────────────────────────────────────────────────────── 목표 (§4 v3.1.209)

const LEAVE_SHARE: Record<string, number> = { '연차': 1, '병가': 1, '오전 반차': 0.5, '오후 반차': 0.5 };

/** 그 날 목표(분) = 하루 목표 × (1 − 근태 몫). 목표를 읽는 곳은 전부 이 함수를 거친다 */
export function dayGoalMin(goalHours: number, day: Pick<Day, 'leave'>, leaveGoal = true): number {
  const share = leaveGoal ? LEAVE_SHARE[day.leave] ?? 0 : 0;
  return Math.round(goalHours * 60 * (1 - share));
}
