/**
 * 앱 사용 기록 (v3 day.apps · noteAppUse · appOfCell — LOGIC §1 «10분 칸마다 그때 쓰던 앱»)
 *
 * ★ 기록이 아니라 바탕이다. 시간 기록을 만들지 않고, 하루 상세의 빈 칸에 옅게 깔린다
 * ★ 근무 중 · 휴게가 안 열려 있을 때만 쌓는다 (v3.1.227). 10초 표본 하나 = 그 칸 그 앱 1회
 * ★ 저장: 하루 × PC 마다 문서 하나 (apps/{date}_{device}). 앱 이름까지 내 계정에 둔다 (2026-11-05 소유자 · SYNC §3)
 *   PC 가 둘이면 화면에서 칸끼리 더한다 — 서로 덮어쓰지 않는다
 */

/** 10분 칸 하나 — n: 앱별 표본 수 · k: 업무/딴짓 표본 수 · l: 앱별 이름 */
export interface AppCell { n: Record<string, number>; k: { work?: number; distract?: number }; l: Record<string, string> }
/** 칸 열쇠 = 그날 0시부터 분(10분 단위, 0~1430) */
export type AppCells = Record<string, AppCell>;
export interface AppDoc { id: string; date: string; device: string; cells: AppCells; updatedAt?: number }

export const APP_SLOT_MIN = 10;
export const appSlotOf = (min: number) => Math.floor(min / APP_SLOT_MIN) * APP_SLOT_MIN;
export const appDocId = (date: string, device: string) => `${date}_${device}`;

/** 표본 하나를 칸에 더한다 (v3 noteAppUse — DeskMate 자신은 'DM') */
export function addAppSample(cell: AppCell | undefined, f: { id?: string | null; name?: string | null }, self: boolean, kind: 'work' | 'distract' | null): AppCell {
  const c: AppCell = cell ? { n: { ...cell.n }, k: { ...cell.k }, l: { ...cell.l } } : { n: {}, k: {}, l: {} };
  // ponytail: v3 는 DeskMate 탭마다(DM/Work · DM/Activity) 나눈다. 웹은 'DM' 하나 — 탭별로 볼 일이 생기면 열쇠에 화면 이름을
  const key = self ? 'dm' : (f.id || f.name || '?');
  c.n[key] = (c.n[key] ?? 0) + 1;
  if (kind) c.k[kind] = (c.k[kind] ?? 0) + 1;
  c.l[key] = self ? 'DM' : (f.name || key);
  return c;
}

/** PC 여러 대의 칸을 더한다 */
export function mergeAppDocs(docs: Pick<AppDoc, 'cells'>[]): AppCells {
  const out: AppCells = {};
  for (const d of docs) {
    for (const [g, c] of Object.entries(d.cells ?? {})) {
      const o = (out[g] ??= { n: {}, k: {}, l: {} });
      for (const [k, v] of Object.entries(c.n ?? {})) o.n[k] = (o.n[k] ?? 0) + v;
      for (const k of ['work', 'distract'] as const) if (c.k?.[k]) o.k[k] = (o.k[k] ?? 0) + c.k[k]!;
      Object.assign(o.l, c.l);
    }
  }
  return out;
}

/** 칸에 쓴 앱 이름 — 많이 쓴 순서 */
export function cellApps(c: AppCell): string[] {
  return Object.entries(c.n).sort((a, b) => b[1] - a[1]).map(([k]) => c.l[k] || k);
}

/** 칸의 성격 (v3 appOfCell) — 업무가 딴짓보다 같거나 많으면 업무 */
export function cellKind(c: AppCell): 'work' | 'distract' | null {
  const w = c.k.work ?? 0, d = c.k.distract ?? 0;
  return w > 0 && w >= d ? 'work' : d > w ? 'distract' : null;
}

/** 구간 [m0, m1) 분에 걸친 칸들에서 쓴 앱 이름 — 많이 쓴 순서 (v3 appsInGrid · appsInRange) */
export function appsIn(cells: AppCells, m0: number, m1: number): string[] {
  const tally: Record<string, { n: number; label: string }> = {};
  for (const [gs, c] of Object.entries(cells)) {
    const g = +gs;
    if (g + APP_SLOT_MIN <= m0 || g >= m1) continue;
    for (const [k, v] of Object.entries(c.n)) (tally[k] ??= { n: 0, label: c.l[k] || k }).n += v;
  }
  return Object.values(tally).sort((a, b) => b.n - a.n).map((x) => x.label);
}

export interface AppTerm { s: number; e: number; apps: string[] }

/**
 * 앱 사용 → 시간 기록 초안 (v3 appTerms · v2.9.25) — 화면에서만 그리는 줄이다. 누르면 시간 기록 만들기로 열린다
 * ★ 같은 대표 앱이 20분(두 칸) 이상 이어지면 한 텀. 10분 조각은 바로 앞 텀에 흡수해 이름을 나열한다
 * ★ 시간 기록 · 휴게가 덮은 칸은 뺀다 (covered = [시작분, 끝분) 목록). 오늘이면 cap(지금 분)에서 자른다
 */
export function appTerms(cells: AppCells, o: { covered: [number, number][]; cap?: number }): AppTerm[] {
  const top = (c: AppCell) => Object.entries(c.n).sort((a, b) => b[1] - a[1])[0]?.[0];
  const runs: { id: string; s: number; e: number }[] = [];
  for (const g of Object.keys(cells).map(Number).sort((a, b) => a - b)) {
    if (o.covered.some(([a, b]) => a < g + APP_SLOT_MIN && g < b)) continue;
    const id = top(cells[g]);
    if (!id) continue;
    const last = runs[runs.length - 1];
    if (last && last.id === id && last.e === g) last.e += APP_SLOT_MIN;
    else runs.push({ id, s: g, e: g + APP_SLOT_MIN });
  }
  const terms: { s: number; e: number }[] = [];
  for (const r of runs) {
    const last = terms[terms.length - 1];
    if (r.e - r.s < APP_SLOT_MIN * 2 && last && last.e === r.s) last.e = r.e;
    else terms.push({ s: r.s, e: r.e });
  }
  const cap = o.cap ?? Infinity;
  return terms.map((t) => ({ s: t.s, e: Math.min(t.e, cap), apps: appsIn(cells, t.s, t.e) })).filter((t) => t.e > t.s);
}
