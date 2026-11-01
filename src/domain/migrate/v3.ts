/**
 * v3(로컬 앱) 데이터 → 웹 (2026-11-02 소유자 — «로컬에서 쓰는 데이터를 하나도 빼먹지 말고»)
 *
 * 입력은 v3 `db.js load()` 가 만드는 상태 그대로 (설정 + days). 브라우저에서는 `v3Load.ts` 가 같은 모양을 만든다.
 * ▣ 근태 — 하루마다 «손으로 고친 하루»(override) 하나. 재생하면 v3 의 하루가 그대로 나온다
 * ▣ 할 일 · 메모 — v3 는 이월할 때 줄을 다음 날로 «옮기고» 지난 날에 «→ 넘김» 흔적을 남겼다(movedId · movedTo).
 *     웹은 줄을 옮기지 않고 보여 준다 — 그래서 흔적은 버리고 살아 있는 줄을 «처음 적은 날» 로 되돌린다 (딸린 줄과 함께).
 *     살아 있는 줄이 이미 지워진 사슬은 «지운 줄» 로 남긴다 (데이터는 남고 화면엔 안 보인다)
 * ▣ 시간 기록 · 근무 밖 휴게 · 뽀모도로 · D-Day · 습관(체크 포함) · 카테고리 · 설정 · 주 메모 · 그림
 * ▣ 옮기지 않는 것(웹에 기능이 없다)은 원본 파일째 보관한다 — 대화 · 동료 · 앱 사용 기록 · 저장됨 · 화면 설정
 * ▣ id 는 v3 것을 그대로 / 정해진 꼴로 — 다시 돌려도 덮어쓸 뿐 두 벌이 생기지 않는다
 */
import type { AttEvent, Day, DaySnapshot, Leave, Span } from '../attendance/types';
import type { Block, BlockArea, BlockType } from '../todos/tree';
import type { Log } from '../attendance/logs';
import type { DDay } from '../dday';
import type { Habit } from '../habits';

// ── v3 모양 (db.js load) — 쓰는 칸만
export interface V3Block { id: string; type: string; text?: string; done?: boolean; doneAt?: number | null; indent?: number; src?: string; movedId?: string; movedTo?: string; bornAt?: string; someday?: boolean; w?: number; nw?: number; name?: string }
export interface V3Brk { s: number; e: number | null; kind?: string; auto?: boolean; by?: string; note?: string; color?: string }
export interface V3Day {
  date: string; onAt: number | null; offAt: number | null; leave: string; sessions?: number; deletedAt?: number | null;
  breaks: V3Brk[]; today: V3Block[]; memo: V3Block[]; slots: { id: string; s: number; e: number; label: string; color?: string | null }[];
  pomos: { s: number; min: number }[]; rests?: { id: string; s: number; e: number; note?: string; color?: string | null }[];
  autoClosed?: string; carriedFrom?: string; habits?: Record<string, number>;
}
export interface V3State {
  days: Record<string, V3Day>;
  ddays?: Partial<DDay>[]; habits?: Partial<Habit>[]; cats?: { color: string; name: string }[];
  weeks?: Record<string, { memo?: V3Block[]; today?: V3Block[] }>;
  goalHours?: number; leaveGoal?: boolean; theme?: string; mode?: string; workspace?: string; timerColor?: string;
  focusMin?: number; shortMin?: number; longMin?: number; longEvery?: number; autoStart?: boolean;
  autoAway?: boolean; autoAwayMin?: number;
}

export interface V3Image { id: string; dataUrl: string; date: string; area: BlockArea; block: string }
export interface Converted {
  events: AttEvent[]; blocks: Block[]; logs: Log[]; ddays: DDay[]; habits: Habit[];
  cats: { color: string; name: string }[] | null;
  settings: Record<string, unknown>; pomo: Record<string, unknown>;
  images: V3Image[];
  /** 사람이 읽을 요약 — 무엇을 몇 개 옮겼고 무엇을 어떻게 바꿨나 */
  report: { days: number; breaks: number; lines: number; traces: number; relocated: number; goneChains: number; slots: number; rests: number; pomos: number; pomosAdded: number; images: number; weekLines: number; habitChecks: number };
}

const DEV = 'v3';
const at12 = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const TYPE: Record<string, BlockType> = { check: 'check', bullet: 'bullet', num: 'num', h1: 'h1', h2: 'h2', h3: 'h3', image: 'image', divider: 'divider' };

/** 근태 — v3 하루 → 손으로 고친 하루. «midnight»(v3.2.0 자정 마감)은 웹에 없어 «확정» 으로 */
function snapshot(d: V3Day): DaySnapshot {
  const breaks: Span[] = d.breaks.map((b) => ({
    s: b.s, e: b.e ?? null, kind: b.kind === 'off' ? 'off' : 'break',
    ...(b.auto ? { auto: true } : {}), ...(b.by ? { by: b.by as Span['by'] } : {}), ...(b.note ? { note: b.note } : {}),
  }));
  const ac = d.autoClosed === 'away' || d.autoClosed === 'break' ? d.autoClosed : d.autoClosed ? 'confirmed' : undefined;
  return { onAt: d.onAt ?? null, offAt: d.offAt ?? null, breaks, leave: (d.leave || '') as Leave, ...(ac ? { autoClosed: ac } : {}), ...(d.carriedFrom ? { carriedFrom: d.carriedFrom } : {}) };
}

/** 한 날 한 칸(today · memo)의 줄 → 웹 줄 (들여쓰기 → 부모). 흔적은 뺀다 */
function linesOf(list: V3Block[], date: string, area: BlockArea, now: number, out: { b: Block; src?: V3Block }[]) {
  const stack: { id: string; ind: number }[] = [];
  let n = 0;
  for (const v of list) {
    if (v.type === 'moved' || v.movedTo) continue;
    const ind = v.indent ?? 0;
    while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
    const type = TYPE[v.type] ?? 'bullet';
    const b: Block = {
      id: v.id, date, area: v.someday ? 'someday' : area, parent: v.someday ? null : stack[stack.length - 1]?.id ?? null, pos: ++n,
      type, text: type === 'image' || type === 'divider' ? '' : v.text ?? '', createdAt: at12(date), updatedAt: now,
      ...(v.done ? { done: true, doneOn: date, doneAt: v.doneAt ?? null } : {}),
      ...(type === 'image' ? { img: `v3img-${v.id}`, w: v.w ?? null, nw: v.nw ?? null } : {}),
    };
    out.push({ b, src: v });
    stack.push({ id: v.id, ind });
  }
}

export function convertV3(st: V3State, now: number): Converted {
  const days = Object.values(st.days).filter((d) => !d.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
  const events: AttEvent[] = [], logs: Log[] = [], images: V3Image[] = [];
  const rep: Converted['report'] = { days: 0, breaks: 0, lines: 0, traces: 0, relocated: 0, goneChains: 0, slots: 0, rests: 0, pomos: 0, pomosAdded: 0, images: 0, weekLines: 0, habitChecks: 0 };

  // ── 근태 · 시간 기록 · 휴게 · 뽀모도로
  for (const d of days) {
    rep.days++; rep.breaks += d.breaks.length;
    events.push({ id: `v3-day-${d.date}`, date: d.date, at: now, type: 'override', deviceId: DEV, deviceKind: 'desktop', day: snapshot(d), basedOn: [] });
    for (const p of d.pomos) { rep.pomos++; events.push({ id: `v3-pomo-${d.date}-${p.s}`, date: d.date, at: p.s + p.min * 60_000, type: 'pomoDone', min: p.min, deviceId: DEV, deviceKind: 'desktop' }); }
    // v3 의 «그 날 세션 수» 가 뽀모도로 표보다 많으면(표가 생기기 전 날들) 모자란 만큼 채운다 — 화면의 «N회» 가 같게
    for (let i = d.pomos.length; i < (d.sessions ?? 0); i++) { rep.pomosAdded++; events.push({ id: `v3-pomo-${d.date}-n${i}`, date: d.date, at: at12(d.date) + i, type: 'pomoDone', deviceId: DEV, deviceKind: 'desktop' }); }
    for (const s of d.slots) { rep.slots++; logs.push({ id: `v3-slot-${s.id}`, date: d.date, kind: 'slot', s: s.s, e: s.e, text: s.label ?? '', color: s.color ? s.color.toLowerCase() : null, createdAt: at12(d.date) }); }
    for (const r of d.rests ?? []) { rep.rests++; logs.push({ id: `v3-rest-${r.id}`, date: d.date, kind: 'rest', s: r.s, e: r.e, text: r.note ?? '', color: r.color ? r.color.toLowerCase() : null, createdAt: at12(d.date) }); }
  }

  // ── 할 일 · 메모 — 이월 사슬부터 본다: 살아 있는 줄 id → 처음 적은 날
  const origin = new Map<string, string>(), lastTrace = new Map<string, { v: V3Block; date: string }>();
  for (const d of days) for (const v of d.today) {
    if (!v.movedTo || !v.movedId) continue;
    rep.traces++;
    if (!origin.has(v.movedId) || d.date < origin.get(v.movedId)!) origin.set(v.movedId, d.date);
    const lt = lastTrace.get(v.movedId);
    if (!lt || d.date > lt.date) lastTrace.set(v.movedId, { v, date: d.date });
  }
  const rows: { b: Block; src?: V3Block }[] = [];
  for (const d of days) { linesOf(d.today, d.date, 'today', now, rows); linesOf(d.memo, d.date, 'memo', now, rows); }
  for (const { b, src } of rows) if (src?.type === 'image' && src.src) { rep.images++; images.push({ id: b.img!, dataUrl: src.src, date: b.date, area: b.area, block: b.id }); }

  // 살아 있는 줄 · 딸린 줄을 처음 적은 날로 (그 날 맨 끝 · 맨 바깥에)
  const byId = new Map(rows.map((r) => [r.b.id, r.b]));
  const kidsOf = (id: string): Block[] => rows.filter((r) => r.b.parent === id).flatMap((r) => [r.b, ...kidsOf(r.b.id)]);
  let tail = 1e6;
  for (const [live, from] of origin) {
    const b = byId.get(live);
    if (!b) continue;
    if (b.date === from) continue;
    rep.relocated++;
    const chunk = [b, ...kidsOf(b.id)];
    // 끝낸 날 = 체크한 화면의 날짜 (v3 에서 체크한 그 날) — 옮기기 전에 정해 둔다
    for (const x of chunk) { if (x.done) x.doneOn = x.doneOn ?? x.date; x.date = from; x.createdAt = at12(from); }
    b.parent = null; b.pos = tail++;
  }
  // 살아 있는 줄이 없는 사슬 — 마지막 흔적의 글로 «지운 줄» 하나를 처음 날에 남긴다
  for (const [live, from] of origin) {
    if (byId.has(live)) continue;
    const t = lastTrace.get(live)!;
    rep.goneChains++;
    rows.push({ b: { id: live, date: from, area: 'today', parent: null, pos: tail++, type: TYPE[t.v.type] ?? 'check', text: t.v.text ?? '', createdAt: at12(from), updatedAt: now, deletedAt: now } });
  }

  // ── 주 메모 · 주간 미정 (v3 settings.weeks — 주 월요일 날짜)
  for (const [wk, w] of Object.entries(st.weeks ?? {})) {
    const before = rows.length;
    linesOf(w.memo ?? [], wk, 'wmemo', now, rows);
    linesOf((w.today ?? []).map((v) => ({ ...v, someday: true })), wk, 'today', now, rows);
    rep.weekLines += rows.length - before;
  }

  // 같은 id 가 두 번 나오면 뒤엣것에 날짜를 붙인다 (v3 healId 와 같은 생각)
  const seen = new Set<string>();
  const blocks = rows.map(({ b }) => { if (seen.has(b.id)) b.id = `${b.id}~${b.date}`; seen.add(b.id); return b; });
  rep.lines = blocks.filter((b) => !b.deletedAt).length;

  // ── 습관 — 정의 + 날마다의 체크 (v3 day.habits)
  const habits: Habit[] = (st.habits ?? []).map((h) => ({ ...(h as Habit), kind: 'habit', done: {} }));
  for (const d of days) for (const [hid, t] of Object.entries(d.habits ?? {})) {
    const h = habits.find((x) => x.id === hid);
    if (h) { h.done![d.date] = t; rep.habitChecks++; }
  }
  const ddays: DDay[] = (st.ddays ?? []).map((x) => ({
    id: x.id!, kind: 'dday', emoji: x.emoji ?? '', title: x.title ?? '', note: x.note ?? '', date: x.date!,
    pinned: !!x.pinned, pinnedAt: x.pinnedAt ?? null, archivedAt: x.archivedAt ?? null, createdAt: x.createdAt ?? now,
  }));

  const settings: Record<string, unknown> = {};
  if (st.mode) settings.mode = st.mode;
  if (st.theme) settings.theme = st.theme;
  if (st.workspace) settings.wsName = st.workspace;
  if (typeof st.goalHours === 'number') settings.goalHours = st.goalHours;
  if (typeof st.leaveGoal === 'boolean') settings.leaveGoal = st.leaveGoal;
  if (st.timerColor) settings.timerColor = st.timerColor;
  if (typeof st.autoAway === 'boolean') settings.away = st.autoAway;
  if (typeof st.autoAwayMin === 'number') settings.awayMin = Math.max(3, Math.min(60, st.autoAwayMin));
  const pomo: Record<string, unknown> = {};
  for (const k of ['focusMin', 'shortMin', 'longMin', 'longEvery', 'autoStart'] as const) if (st[k] != null) pomo[k] = st[k];

  return { events, blocks, logs, ddays, habits, cats: st.cats?.length ? st.cats : null, settings, pomo, images, report: rep };
}

/** 확인용 — 웹이 재생한 하루와 v3 하루의 근무 · 휴게 분을 나란히 (스크립트 · 가져오기 화면이 같이 쓴다) */
export type DayCompare = { date: string; v3: number; web: number };
export const sameMinutes = (a: number, b: number) => Math.abs(a - b) < 1;
export type { Day };
