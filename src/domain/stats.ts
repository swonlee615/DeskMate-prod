/**
 * 활동 › 내 분석 (v3 renderAnalytics · WL.series · streak · restGrade · yearHeatHtml — PRD §2-8)
 *
 * ▣ 기간 = 주간 · 월간 · 연간 + 몇 칸 앞으로(off). 진행 중인 기간은 오늘까지
 * ▣ 하루 값은 재생한 하루(dayParts) 한 곳에서 — 표 · 그래프 · 요약이 같은 숫자를 쓴다
 * ▣ 할 일 달성률은 기간 전체의 체크 줄을 한 번씩 (보여주기 이월이라 같은 줄이 날마다 생기지 않는다 · v3.1.216)
 */
import type { Day, Leave } from './attendance/types';
import { dayGoalMin, dayParts, dayStartMs, LEAVE_SHARE } from './attendance/rules';
import { timeline, type Log } from './attendance/logs';
import type { Block } from './todos/tree';
import { catKey, catName, catsOf, type Cat } from './attendance/cats';
import { hbApplies, hbDoneAt, hbRatio, hbWeekCount, type Habit, type OffDay } from './habits';
import { buildTeam, leaderboard, ROSTER } from './sim/team';
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

export interface MIv { s: number; e: number }
export interface DayRow {
  key: string; dow: number; work: number; rest: number; on: number | null; off: number | null; leave: Leave; goal: number; has: boolean;
  /** 출퇴근 리듬 — 근무 차수 · 근태 휴게(메모 함께) · 비근무 합 (분 · 00:00 기준). 그림이 다시 계산하지 않게 여기서 싣는다 (v2.9.84) */
  segs: MIv[]; brks: (MIv & { note: string })[]; nonwork: number;
}

/** 그 기간의 하루하루 (v3 series) — 기록 없는 날도 줄은 있다 (막대 · 히트맵의 빈 칸) */
export function series(days: Record<string, Day>, from: string, to: string, now: number, goalHours: number): DayRow[] {
  const out: DayRow[] = [];
  for (let d = dateOf(from); keyOf(d) <= to; d = addDays(d, 1)) {
    const key = keyOf(d);
    const day = days[key];
    const p = day ? dayParts(day, now) : { workMs: 0, breakMs: 0, offMs: 0 };
    const tl = day ? timeline(day, [], now) : [];
    const base = dayStartMs(key);
    const work = Math.max(0, p.workMs / 60000);
    out.push({
      key, dow: d.getDay(), work, rest: p.breakMs / 60000,
      on: day?.onAt != null ? Math.round((day.onAt - base) / 60000) : null,
      off: day?.offAt != null ? Math.round((day.offAt - base) / 60000) : null,
      leave: day?.leave ?? '',
      goal: dayGoalMin(goalHours, { leave: day?.leave ?? '' }),
      has: work > 0,
      segs: tl.filter((x) => x.kind === 'work').map(({ s, e }) => ({ s, e })),
      brks: tl.filter((x) => x.kind === 'break').map(({ s, e, text }) => ({ s, e, note: text.trim() })),
      nonwork: p.offMs / 60000,
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
}

export function summarize(rows: DayRow[], blocks: Block[], p: Period): Summary {
  const w = rows.filter((r) => r.has);
  const total = w.reduce((a, r) => a + r.work, 0);
  const rest = w.reduce((a, r) => a + r.rest, 0);
  const gd = w.filter((r) => r.goal > 0);
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const checks = blocks.filter((b) => !b.deletedAt && b.area === 'today' && b.parent == null && b.type === 'check'
    && b.text.trim() && b.date >= p.from && b.date <= p.end);
  return {
    days: w.length, total, avg: w.length ? total / w.length : 0, rest,
    restPct: total + rest ? Math.round((rest / (total + rest)) * 100) : 0,
    goalDays: gd.length, hit: gd.filter((r) => r.work >= r.goal).length,
    streak: streak(rows).current,
    avgOn: avgOf(w.filter((r) => r.on != null).map((r) => r.on as number)),
    avgOff: avgOf(w.filter((r) => r.off != null).map((r) => r.off as number)),
    todo: checks.length, done: checks.filter((b) => b.done).length,
    dow: [1, 2, 3, 4, 5, 6, 0].map((dow) => { const xs = w.filter((r) => r.dow === dow); return { dow, n: xs.length, avg: avgOf(xs.map((r) => r.work)) ?? 0 }; }),
  };
}

/**
 * 연간 근무 히트맵 (v3 yearHeatHtml) — 월요일로 시작하는 주 × 7. 진하기 4단계는 그 해 기록의 분위수(25/50/75%) · hit = 그 날 목표를 채움.
 * 첫 기록 전 · 오늘 뒤 · 다른 해는 칠하지 않는다 (null). 0 = 그 날 일 안 함. 일 안 한 근태 날은 lv 'leave' (잔디가 아니라 테두리 · v3.1.221).
 * 최장 하루 한 칸에 링
 */
export interface HeatCell { key: string; lv: number | 'leave' | null; work: number; goal: number; leave: Leave; hit: boolean; top: boolean; weekend: boolean }
export function yearHeat(year: number, rows: DayRow[], today: string): { weeks: HeatCell[][]; th: number[]; max: number; total: number; days: number } {
  const by = new Map(rows.map((r) => [r.key, r]));
  const vals = rows.filter((r) => r.has).map((r) => r.work).sort((a, b) => a - b);
  const q = (t: number) => { if (!vals.length) return 0; const x = (vals.length - 1) * t, lo = Math.floor(x), hi = Math.ceil(x); return vals[lo] + (vals[hi] - vals[lo]) * (x - lo); };
  const th = [q(0.25), q(0.5), q(0.75)];
  const maxV = vals[vals.length - 1] ?? 0;
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
    const v = r?.work ?? 0;
    const lv = out ? null : r?.leave && !r.has ? 'leave' : !r?.has ? 0 : v < th[0] ? 1 : v < th[1] ? 2 : v < th[2] ? 3 : 4;
    weeks[weeks.length - 1].push({
      key, lv, work: v, goal: r?.goal ?? 0, leave: r?.leave ?? '', hit: !!r?.has && v >= r.goal,
      top: key === topKey, weekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return { weeks, th, max: maxV, total: vals.reduce((a, b) => a + b, 0), days: vals.length };
}

// ─────────────────────────────────────────────────────────── 근태 카드 (v3.1.222 · 3.1.242)

/**
 * 칩 «근무» = 일했고 근태가 안 찍힌 날 · 근태 칩은 종류별 날 수 (서로 안 겹친다)
 * worked = 근태와 상관없이 일한 날 · leaveDays = 반차는 0.5일
 * miss = 첫 기록(first) 이후 어제까지 근무도 근태도 없는 날 — 평일 · 주말 따로 (공휴일은 아직 평일로 센다)
 */
export function leaveSummary(rows: DayRow[], first: string | null, today: string) {
  const chips: Record<string, number> = { '': rows.filter((r) => r.has && !r.leave).length };
  for (const r of rows) if (r.leave) chips[r.leave] = (chips[r.leave] ?? 0) + 1;
  const miss = { wd: 0, we: 0 };
  for (const r of rows) {
    if (!first || r.key < first || r.key >= today || r.has || r.leave) continue;
    if (r.dow === 0 || r.dow === 6) miss.we++; else miss.wd++;
  }
  return {
    chips, miss,
    worked: rows.filter((r) => r.has).length,
    leaveDays: rows.reduce((a, r) => a + (LEAVE_SHARE[r.leave] ?? 0), 0),
  };
}

// ─────────────────────────────────────────────────────────── 주간 — 목표까지 (v3.1.71 · 146 · 155 · 209 · 220)

/**
 * 주 목표 = 그 주 평일 목표의 합 (연차 날 0 · 반차 절반). pct 는 100 에서 자르지 않는다 (v3.1.220).
 * 하루 몫 per = (남은 시간 + 오늘 한 것) ÷ 남은 평일 몫의 합 (반차 = 0.5) — «그 날의 총 근무» (v3.1.146)
 * rest7 · per7 = 주말까지 일한다면 (v3.1.155 — 본문은 주 5일, 묻는 자리만)
 */
export function weekGoal(days: Record<string, Day>, rows: DayRow[], p: Period, today: string, goalHours: number) {
  const ks = Array.from({ length: 7 }, (_, i) => keyOf(addDays(dateOf(p.from), i)));
  const lv = (k: string) => days[k]?.leave ?? '';
  const unit = (k: string) => 1 - (LEAVE_SHARE[lv(k)] ?? 0);
  const goal = ks.slice(0, 5).reduce((a, k) => a + dayGoalMin(goalHours, { leave: lv(k) }), 0);
  const restBiz = ks.slice(0, 5).filter((k) => k >= today && unit(k) > 0);
  const units = restBiz.reduce((a, k) => a + unit(k), 0);
  const total = rows.reduce((a, r) => a + (r.has ? r.work : 0), 0);
  const gap = goal - total;
  const todayWork = unit(today) > 0 ? rows.find((r) => r.key === today)?.work ?? 0 : 0;
  const rest7 = ks.filter((k) => k >= today && unit(k) > 0);
  const units7 = rest7.reduce((a, k) => a + unit(k), 0);
  return {
    goal, gap, pct: goal ? Math.round((total / goal) * 100) : 0,
    left: restBiz.length, halfN: restBiz.filter((k) => unit(k) < 1).length,
    per: (gap + todayWork) / Math.max(0.5, units),
    rest7: rest7.length, per7: units7 ? (gap + todayWork) / units7 : 0,
  };
}

// ─────────────────────────────────────────────────────────── 카테고리별 (v3 catSplit · v3.1.249)

/**
 * 근무 = 시간 기록(색별) + 미분류(그 날 근무시간 − 시간 기록 합) · 휴게 = 근태 휴게(색 없음 → 미분류) + 근무 밖 휴게(색별).
 * 일한 날만. 순서: 이름 붙은 색 → 이름 없는 색 → 팔레트에 없는 색 → 미분류, 같은 무리는 많은 순
 */
export interface CatRow { color: string; name: string; known: boolean; none: boolean; work: number; rest: number }
export function catSplit(rows: DayRow[], logs: Log[], cats: Cat[]): CatRow[] {
  const known = new Set(catsOf(cats).map((c) => c.color));
  const map = new Map<string, CatRow>();
  const get = (c: string | null) => {
    const k = catKey(c);
    if (!map.has(k)) map.set(k, { color: k, name: k ? catName(cats, k) : '', known: !!k && known.has(k), none: !k, work: 0, rest: 0 });
    return map.get(k)!;
  };
  const worked = new Map(rows.filter((r) => r.has).map((r) => [r.key, r]));
  const slotMin = new Map<string, number>();
  for (const l of logs) {
    if (l.deletedAt || !worked.has(l.date)) continue;
    if (l.kind === 'slot') { get(l.color).work += l.e - l.s; slotMin.set(l.date, (slotMin.get(l.date) ?? 0) + l.e - l.s); }
    else get(l.color).rest += l.e - l.s;
  }
  for (const r of worked.values()) {
    const rest0 = r.work - (slotMin.get(r.key) ?? 0);
    if (rest0 > 0.5) get('').work += rest0;
    for (const b of r.brks) get('').rest += b.e - b.s;
  }
  const rank = (c: CatRow) => (c.none ? 3 : !c.known ? 2 : !c.name ? 1 : 0);
  return [...map.values()].filter((c) => c.work + c.rest > 0.5).sort((a, b) => rank(a) - rank(b) || b.work + b.rest - (a.work + a.rest));
}

// ─────────────────────────────────────────────────────────── 월간 — 주간 히스토리 · 요일 리듬

/**
 * 주간 히스토리 (v3.1.194) — 그 달에 걸친 주를 월~일 «통째로» 센다 (주간 탭과 같은 숫자 · v3.1.116).
 * 주 목표 = 그 주 평일 목표의 합 (연차가 낀 주는 줄어든다 · v3.1.209). out = 다른 달의 날 수
 */
export interface WeekRow { key: string; end: string; work: number; goal: number; days: number; hit: number; out: number }
export function weekHistory(days: Record<string, Day>, p: Period, now: number, goalHours: number): WeekRow[] {
  const out: WeekRow[] = [];
  const mon = dateOf(p.from).getMonth();
  for (let ws = weekStart(dateOf(p.from)); keyOf(ws) <= p.to; ws = addDays(ws, 7)) {
    const key = keyOf(ws), end = keyOf(addDays(ws, 6));
    const rs = series(days, key, end, now, goalHours);
    const gd = rs.filter((r) => r.has && r.goal > 0);
    out.push({
      key, end,
      work: rs.reduce((a, r) => a + (r.has ? r.work : 0), 0),
      goal: rs.filter((r) => r.dow >= 1 && r.dow <= 5).reduce((a, r) => a + r.goal, 0),
      days: gd.length, hit: gd.filter((r) => r.work >= r.goal).length,
      out: rs.filter((r) => dateOf(r.key).getMonth() !== mon).length,
    });
  }
  return out;
}

/** 요일 리듬 (v3.1.171 · 3.1.266) — 그 요일에 일한 날들 + 평균 휴게 · 비근무. 월~일 */
export function dowRhythm(rows: DayRow[]) {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const rs = rows.filter((r) => r.has && r.on != null && r.dow === dow);
    return { dow, rs, n: rs.length, avgRest: avg(rs.map((r) => r.rest)), avgIdle: avg(rs.map((r) => r.nonwork)) };
  });
}

// ─────────────────────────────────────────────────────────── 라벨별 (v3 labelSplit · v3.1.249)

export interface LabelRow { kind: 'slot' | 'rest'; label: string; color: string | null; min: number }
/** 시간 기록(이름) · 휴게(메모)를 따로 센다. 일한 날만. 메모 없는 휴게는 label '' (= 미분류) */
export function labelSplit(rows: DayRow[], logs: Log[]): LabelRow[] {
  const map = new Map<string, LabelRow>();
  const add = (kind: LabelRow['kind'], label: string, color: string | null, min: number) => {
    const k = `${kind}|${label.toLowerCase()}`;
    const cur = map.get(k) ?? { kind, label, color: null, min: 0 };
    cur.min += min;
    if (!cur.color && color) cur.color = color.toLowerCase();
    map.set(k, cur);
  };
  const worked = new Set(rows.filter((r) => r.has).map((r) => r.key));
  for (const r of rows) if (worked.has(r.key)) for (const b of r.brks) add('rest', b.note.replace(/\s+/g, ' '), null, b.e - b.s);
  for (const l of logs) {
    if (l.deletedAt || !worked.has(l.date)) continue;
    const t = l.text.trim().replace(/\s+/g, ' ');
    add(l.kind, l.kind === 'slot' ? t || '(내용 없음)' : t, l.color, l.e - l.s);
  }
  return [...map.values()].filter((x) => x.min > 0.5).sort((a, b) => b.min - a.min);
}

// ─────────────────────────────────────────────────────────── 내 순위 이력 (v3.1.106 · 저장하지 않고 다시 센다)

export interface RankPt { key: string; pos: number; n: number; my: number; live: boolean }
/** 지난 날 내 등수 — 동료는 날짜 씨앗이라 언제 세도 같다. 안 나온 날은 null (v3 computeRank) */
export function rankOn(key: string, myMin: number, nick: string): { pos: number; n: number } | null {
  if (!myMin) return null;
  const lb = leaderboard(buildTeam(key), 1440, myMin, nick);
  return { pos: lb.find((r) => r.me)!.rank, n: lb.length };
}
/** 기간의 점들 — 오늘은 «진행 중» (todayRank = 지금 랭킹 · 패널과 같은 값 · D5) */
export function rankSeries(rows: DayRow[], today: string, todayRank: { pos: number; n: number } | null, nick: string): RankPt[] {
  return rows.flatMap((r): RankPt[] => {
    const v = r.key === today ? (r.has ? todayRank : null) : r.key < today ? rankOn(r.key, Math.round(r.work), nick) : null;
    return v ? [{ key: r.key, ...v, my: r.work, live: r.key === today }] : [];
  });
}
/** 앞선 사람 수로 센다 (D3) — 상위% = 1 − Σ(n−pos)/Σ(n−1) · N명 환산 등수 = 1 + 상위%×(N−1). 오늘 · 혼자인 날은 뺀다 */
export function rankStat(pts: RankPt[], N = ROSTER.length + 1) {
  const done = pts.filter((x) => !x.live && x.n >= 2);
  let win = 0, bouts = 0, best = Infinity;
  for (const r of done) { win += r.n - r.pos; bouts += r.n - 1; best = Math.min(best, r.pos); }
  const pct = bouts ? 1 - win / bouts : 0.5;
  return { days: done.length, best: done.length ? best : null, avg: 1 + pct * (Math.max(2, N) - 1), pct: Math.round(pct * 100) };
}

// ─────────────────────────────────────────────────────────── 습관 표 (v3 hbCardHtml · 주간 = 날 · 월간 = 주 · 연간 = 달)

export type HbTone = 'ok' | 'p2' | 'p1' | 'miss' | 'wait' | 'na' | 'fut' | 'pre';
export interface HbCell { c: HbTone; t: string; now: boolean }
export interface HbTable { heads: { t: string; s: string; now: boolean; fut: boolean }[]; rows: { h: Habit; cells: HbCell[]; rate: string }[]; note: string; rateLabel: string }
const tone = (v: number): HbTone => (v >= 1 ? 'ok' : v <= 0 ? 'miss' : v < 0.5 ? 'p1' : 'p2');
const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const DOW1 = '일월화수목금토';

export function hbTable(all: Habit[], p: Period, today: string, offDay: OffDay): HbTable | null {
  const list = all.filter((h) => h.start <= p.end);
  if (!list.length) return null;
  const inRange = (h: Habit, a: string, b: string) => !(b < h.start || (h.end && a > h.end));
  const plus = (k: string, n: number) => keyOf(addDays(dateOf(k), n));
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  if (p.kind === 'week') {
    const ks = Array.from({ length: 7 }, (_, i) => plus(p.from, i));
    return {
      note: '', rateLabel: p.live ? '이번 주' : '그 주',
      heads: ks.map((k) => ({ t: String(dateOf(k).getDate()), s: DOW1[dateOf(k).getDay()], now: k === today, fut: k > today })),
      rows: list.map((h) => ({
        h,
        cells: ks.map((k): HbCell => {
          const now = k === today;
          if (k > today || !inRange(h, k, k)) return { c: 'fut', t: '', now };
          const at = hbDoneAt(h, k);
          if (h.type === 'perWeek') return at ? { c: hbWeekCount(h, k) >= h.n ? 'ok' : 'p2', t: '', now } : { c: 'fut', t: '', now };
          if (!hbApplies(h, k, offDay)) return { c: 'na', t: '·', now };
          return { c: at ? 'ok' : now ? 'wait' : 'miss', t: '', now };
        }),
        rate: h.type === 'perWeek' ? `${hbWeekCount(h, ks[0])}/${h.n}회` : (() => { const q = hbRatio(h, ks[0], ks[6], today, offDay); return `${q.ok}/${q.tot}일`; })(),
      })),
    };
  }
  if (p.kind === 'month') {
    const wks: string[] = [];
    for (let w = weekStart(dateOf(p.from)); keyOf(w) <= p.end; w = addDays(w, 7)) wks.push(keyOf(w));
    return {
      note: '한 칸 = 한 주 · 칸 안 숫자 = 한 날 / 해당일 (주 N회는 횟수 / N)', rateLabel: p.live ? '이번 달' : '그 달',
      heads: wks.map((ws, i) => ({ t: `${i + 1}주`, s: `${md(ws)} – ${md(plus(ws, 6))}`, now: ws <= today && today <= plus(ws, 6), fut: ws > today })),
      rows: list.map((h) => ({
        h,
        cells: wks.map((ws): HbCell => {
          const we = plus(ws, 6), now = ws <= today && today <= we;
          if (ws > today) return { c: 'fut', t: '', now };
          if (!inRange(h, ws, we)) return { c: 'pre', t: '', now };
          let a = 0, b = 0;
          if (h.type === 'perWeek') { a = hbWeekCount(h, ws); b = h.n; }
          else for (let i = 0; i < 7; i++) {
            const k = plus(ws, i);
            if (k < p.from || k > p.end || k > today || !hbApplies(h, k, offDay)) continue;
            const at = hbDoneAt(h, k);
            if (k === today && !at) continue;
            b++; if (at) a++;
          }
          return b ? { c: tone(Math.min(1, a / b)), t: `${a}/${b}`, now } : { c: 'na', t: '', now };
        }),
        rate: pct(hbRatio(h, p.from, p.end, today, offDay).v),
      })),
    };
  }
  const y = dateOf(p.from).getFullYear();
  const ms = Array.from({ length: 12 }, (_, m) => ({ a: keyOf(new Date(y, m, 1)), b: keyOf(new Date(y, m + 1, 0)) }));
  return {
    note: '칸 안 숫자 = 그 달 달성률(%)', rateLabel: p.live ? '올해' : '그 해',
    heads: ms.map((x, m) => ({ t: `${m + 1}월`, s: '', now: x.a <= today && today <= x.b, fut: x.a > today })),
    rows: list.map((h) => ({
      h,
      cells: ms.map((x): HbCell => {
        const now = x.a <= today && today <= x.b;
        if (x.a > today) return { c: 'fut', t: '', now };
        if (!inRange(h, x.a, x.b)) return { c: 'pre', t: '', now };
        const q = hbRatio(h, x.a, x.b, today, offDay);
        return q.v == null ? { c: 'na', t: '', now } : { c: tone(q.v), t: String(Math.round(q.v * 100)), now };
      }),
      rate: pct(hbRatio(h, ms[0].a, ms[11].b, today, offDay).v),
    })),
  };
}
