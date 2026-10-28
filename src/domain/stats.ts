/**
 * 활동 › 내 분석 (v3 renderAnalytics · WL.series · streak · restGrade · yearHeatHtml — PRD §2-8)
 *
 * ▣ 기간 = 주간 · 월간 · 연간 + 몇 칸 앞으로(off). 진행 중인 기간은 오늘까지
 * ▣ 하루 값은 재생한 하루(dayParts) 한 곳에서 — 표 · 그래프 · 요약이 같은 숫자를 쓴다
 * ▣ 할 일 달성률은 기간 전체의 체크 줄을 한 번씩 (보여주기 이월이라 같은 줄이 날마다 생기지 않는다 · v3.1.216)
 */
import type { Day, Leave } from './attendance/types';
import { dayGoalMin, dayParts, dayStartMs } from './attendance/rules';
import type { Log } from './attendance/logs';
import type { Block } from './todos/tree';
import { addDays, dateOf, keyOf, weekStart } from '../ui/v3fmt';

export type PeriodKind = 'week' | 'month' | 'year';

export interface Period { kind: PeriodKind; from: string; to: string; end: string; label: string; live: boolean }

/** [from, to] = 그릴 날 (진행 중이면 오늘까지) · end = 기간의 마지막 날 (v3 periodRange · periodSpan · periodLabel) */
export function period(kind: PeriodKind, off: number, today: string): Period {
  const t = dateOf(today);
  let f: Date, e: Date;
  if (kind === 'year') { f = new Date(t.getFullYear() - off, 0, 1); e = new Date(f.getFullYear(), 11, 31); }
  else if (kind === 'month') { f = new Date(t.getFullYear(), t.getMonth() - off, 1); e = new Date(f.getFullYear(), f.getMonth() + 1, 0); }
  else { f = addDays(weekStart(t), -7 * off); e = addDays(f, 6); }
  const live = off === 0;
  const label = kind === 'year' ? `${f.getFullYear()}년`
    : kind === 'month' ? `${f.getFullYear()}년 ${f.getMonth() + 1}월`
    : `${f.getMonth() + 1}월 ${f.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
  return { kind, from: keyOf(f), to: live ? today : keyOf(e), end: keyOf(e), label, live };
}

export interface DayRow { key: string; dow: number; work: number; rest: number; on: number | null; off: number | null; leave: Leave; goal: number; has: boolean }

/** 그 기간의 하루하루 (v3 series) — 기록 없는 날도 줄은 있다 (막대 · 히트맵의 빈 칸) */
export function series(days: Record<string, Day>, from: string, to: string, now: number, goalHours: number): DayRow[] {
  const out: DayRow[] = [];
  for (let d = dateOf(from); keyOf(d) <= to; d = addDays(d, 1)) {
    const key = keyOf(d);
    const day = days[key];
    const p = day ? dayParts(day, now) : { workMs: 0, breakMs: 0 };
    const base = dayStartMs(key);
    const work = Math.max(0, p.workMs / 60000);
    out.push({
      key, dow: d.getDay(), work, rest: p.breakMs / 60000,
      on: day?.onAt != null ? Math.round((day.onAt - base) / 60000) : null,
      off: day?.offAt != null ? Math.round((day.offAt - base) / 60000) : null,
      leave: day?.leave ?? '',
      goal: dayGoalMin(goalHours, { leave: day?.leave ?? '' }),
      has: work > 0,
    });
  }
  return out;
}

/** 연속 기록 — 평일에 쉬면 끊기고, 주말은 일했으면 +1 · 쉬었으면 그대로 (v3.1.161) */
export function streak(rows: DayRow[]): { current: number; best: number } {
  let best = 0, cur = 0;
  for (const r of rows) {
    if (r.has) { cur++; best = Math.max(best, cur); continue; }
    if (r.dow === 0 || r.dow === 6) continue;
    cur = 0;
  }
  return { current: cur, best };
}

/** 휴게 비율 등급 (v3 REST_GRADE) — 1시간 미만이면 판단 보류 */
export const REST_GRADE = [
  { max: 8, cls: 'warn', label: '주의', tip: '너무 적어요 — 쉬지 않고 붙어 있는 상태' },
  { max: 18, cls: 'good', label: '우수', tip: '이상적인 비율' },
  { max: 28, cls: 'ok', label: '양호', tip: '조금 넉넉하지만 무난해요' },
  { max: 40, cls: 'warn', label: '주의', tip: '자리를 비운 시간이 많아요' },
  { max: Infinity, cls: 'bad', label: '위험', tip: '기록 누락일 수도 있어요' },
] as const;
export const restGrade = (pct: number, spanMin: number) => (spanMin >= 60 ? REST_GRADE.find((g) => pct < g.max) ?? null : null);

export interface Summary {
  days: number; total: number; avg: number; rest: number; restPct: number;
  goalDays: number; hit: number; streak: number;
  avgOn: number | null; avgOff: number | null;
  todo: number; done: number;
  /** 요일별 평균 근무 — 월~일, 일한 날만으로 */
  dow: { dow: number; avg: number; n: number }[];
  leaves: Partial<Record<Exclude<Leave, ''>, number>>;
  cats: { color: string; min: number; count: number }[];
}

export function summarize(rows: DayRow[], blocks: Block[], logs: Log[], p: Period): Summary {
  const w = rows.filter((r) => r.has);
  const total = w.reduce((a, r) => a + r.work, 0);
  const rest = w.reduce((a, r) => a + r.rest, 0);
  const gd = w.filter((r) => r.goal > 0);
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const checks = blocks.filter((b) => !b.deletedAt && b.area === 'today' && b.parent == null && b.type === 'check'
    && b.text.trim() && b.date >= p.from && b.date <= p.end);
  const leaves: Summary['leaves'] = {};
  for (const r of rows) if (r.leave) leaves[r.leave] = (leaves[r.leave] ?? 0) + 1;
  const cm = new Map<string, { color: string; min: number; count: number }>();
  for (const l of logs) {
    if (l.deletedAt || l.kind !== 'slot' || l.date < p.from || l.date > p.to) continue;
    const k = (l.color ?? '').toLowerCase();
    const c = cm.get(k) ?? { color: k, min: 0, count: 0 };
    c.min += l.e - l.s; c.count++;
    cm.set(k, c);
  }
  return {
    days: w.length, total, avg: w.length ? total / w.length : 0, rest,
    restPct: total + rest ? Math.round((rest / (total + rest)) * 100) : 0,
    goalDays: gd.length, hit: gd.filter((r) => r.work >= r.goal).length,
    streak: streak(rows).current,
    avgOn: avgOf(w.filter((r) => r.on != null).map((r) => r.on as number)),
    avgOff: avgOf(w.filter((r) => r.off != null).map((r) => r.off as number)),
    todo: checks.length, done: checks.filter((b) => b.done).length,
    dow: [1, 2, 3, 4, 5, 6, 0].map((dow) => { const xs = w.filter((r) => r.dow === dow); return { dow, n: xs.length, avg: avgOf(xs.map((r) => r.work)) ?? 0 }; }),
    leaves,
    cats: [...cm.values()].sort((a, b) => b.min - a.min),
  };
}

/**
 * 연간 근무 히트맵 (v3 yearHeatHtml) — 월요일로 시작하는 주 × 7. 진하기 4단계는 그 해 기록의 분위수(25/50/75%).
 * 첫 기록 전 · 오늘 뒤 · 다른 해는 칠하지 않는다 (null). 0 = 그 날 일 안 함. 최장 하루 한 칸에 링
 */
export interface HeatCell { key: string; lv: number | null; work: number; leave: Leave; top: boolean; weekend: boolean }
export function yearHeat(year: number, rows: DayRow[], today: string): { weeks: HeatCell[][]; th: number[] } {
  const by = new Map(rows.map((r) => [r.key, r]));
  const vals = rows.filter((r) => r.has).map((r) => r.work).sort((a, b) => a - b);
  const q = (t: number) => { if (!vals.length) return 0; const x = (vals.length - 1) * t, lo = Math.floor(x), hi = Math.ceil(x); return vals[lo] + (vals[hi] - vals[lo]) * (x - lo); };
  const th = [q(0.25), q(0.5), q(0.75)];
  const maxV = vals[vals.length - 1];
  const topKey = rows.find((r) => r.has && r.work === maxV)?.key;
  const first = rows.find((r) => r.has)?.key ?? null;
  const mon = (d: Date) => (d.getDay() + 6) % 7;
  const s0 = addDays(new Date(year, 0, 1), -mon(new Date(year, 0, 1)));
  const e0 = new Date(year, 11, 31);
  const weeks: HeatCell[][] = [];
  for (let d = s0; d <= addDays(e0, 6 - mon(e0)); d = addDays(d, 1)) {
    if (mon(d) === 0) weeks.push([]);
    const key = keyOf(d), r = by.get(key);
    const out = d.getFullYear() !== year || key > today || !first || key < first;
    const lv = out ? null : !r?.has ? 0 : r.work <= th[0] ? 1 : r.work <= th[1] ? 2 : r.work <= th[2] ? 3 : 4;
    weeks[weeks.length - 1].push({ key, lv, work: r?.work ?? 0, leave: r?.leave ?? '', top: key === topKey, weekend: d.getDay() === 0 || d.getDay() === 6 });
  }
  return { weeks, th };
}
