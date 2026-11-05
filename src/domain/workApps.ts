/**
 * 업무 앱 기준 자리비움 (v3 app.js appList · appMatches · appBucket · pushSample · windowStats — PC 앱 전용)
 *
 * ★ 10초마다 «맨 앞에 있고 실제로 손대는 앱» 하나를 표본으로 쌓는다. 90초 넘게 입력이 없으면 표본은 null
 * ★ 최근 winMs 동안 딴짓 앱만 기준 시간 넘게 쓰고 업무 앱은 그 15% 이하면 → 첫 딴짓 표본 시각부터 자리비움(by 'app')
 */

/** 목록 한 줄 — 번들 ID 가 있으면 그것으로만, 없으면 이름(실행 파일 이름)으로 맞춘다 */
export interface AppEntry { id: string | null; name: string; exec?: string | null }
/** 지금 맨 앞 앱 (src-tauri/src/front.rs) */
export interface FrontApp { id?: string | null; name?: string | null; exec?: string | null }
export type UnknownApp = 'away' | 'work';
export interface WorkAppsCfg { workApps: AppEntry[]; nonWorkApps: AppEntry[]; unknownApp: UnknownApp }

export type SampleKind = 'work' | 'distract' | null;
export interface Sample { t: number; k: SampleKind }

export const SAMPLE_MS = 10_000;
/** 이보다 오래 입력이 없으면 맨 앞 앱을 «쓰고 있다» 고 보지 않는다 */
export const ACTIVE_SEC = 90;
/** 딴짓으로 볼 때 같은 시간 업무 앱 허용 비율 */
export const WORK_TOLERANCE = 0.15;
const SPAN_CAP = SAMPLE_MS * 3;

export const appKey = (e: { id?: string | null; name?: string | null }) => (e.id || e.name || '').toLowerCase();
export const appLabel = (e: { id?: string | null; name?: string | null }) => e.name || e.id || '';

/** 저장된 값 → 목록 (v2.7.1 이하의 쉼표 문자열도 받는다) */
export function appList(v: unknown): AppEntry[] {
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ id: null, name }));
  if (!Array.isArray(v)) return [];
  return v.filter((e) => e && (e.id || e.name)).map((e) => ({ id: e.id || null, name: e.name || e.id, exec: e.exec || null }));
}

export function appMatches(entry: AppEntry, front: FrontApp): boolean {
  const fid = (front.id || '').toLowerCase(), eid = (entry.id || '').toLowerCase();
  if (eid && fid) return eid === fid;
  const fn = (front.name || '').toLowerCase();
  if (!fn) return false;
  return [entry.exec, entry.name].some((n) => !!n && n.toLowerCase() === fn);
}

/** 이 앱 자신 — 설정을 만지는 동안 늘 맨 앞이라 근무로 보고, 최근 감지 목록에도 안 담는다 */
export const isSelf = (f: FrontApp) => /deskmate/i.test(`${f.id || ''} ${f.name || ''}`);

/** 맨 앞 앱 → 'work' | 'away' | null(판단 불가) */
export function appBucket(front: FrontApp | null, c: WorkAppsCfg): 'work' | 'away' | null {
  if (!front || (!front.name && !front.id)) return null;
  if (isSelf(front)) return 'work';
  if (c.workApps.some((e) => appMatches(e, front))) return 'work';
  if (c.nonWorkApps.some((e) => appMatches(e, front))) return 'away';
  return c.unknownApp === 'work' ? 'work' : 'away';
}

/** 모아 보는 시간 — 기준 시간의 두 배, 적어도 15분 */
export const winMs = (min: number) => Math.max(15, Math.max(3, min) * 2) * 60_000;

export function pushSample(list: Sample[], s: Sample, win: number): Sample[] {
  return [...list, s].filter((x) => x.t >= s.t - win);
}

export function windowStats(list: Sample[]) {
  let d = 0, w = 0, firstD: number | null = null, prev: number | null = null;
  for (const x of list) {
    const span = prev == null ? SAMPLE_MS : Math.min(SPAN_CAP, Math.max(0, x.t - prev));
    prev = x.t;
    if (x.k === 'distract') { d += span; firstD ??= x.t; } else if (x.k === 'work') w += span;
  }
  return { distractMs: d, workMs: w, firstD };
}

/** 딴짓 앱만 기준 시간 넘게 썼나 */
export function distracted(st: ReturnType<typeof windowStats>, min: number): boolean {
  const lim = Math.max(3, min) * 60_000;
  return st.distractMs >= lim && st.workMs <= lim * WORK_TOLERANCE;
}

/** 최근 감지된 앱 — 같은 앱은 맨 앞으로, 10개까지 (저장하지 않는다) */
export function rememberApp(seen: FrontApp[], f: FrontApp): FrontApp[] {
  if ((!f.name && !f.id) || isSelf(f)) return seen;
  const k = appKey(f);
  return [f, ...seen.filter((x) => appKey(x) !== k)].slice(0, 10);
}

/** 목록에 넣기 — 반대 목록에서는 뺀다 (한 앱이 양쪽에 있을 수 없다) */
export function putApp(c: WorkAppsCfg, kind: 'work' | 'away', e: AppEntry): Pick<WorkAppsCfg, 'workApps' | 'nonWorkApps'> {
  const k = appKey(e);
  const mine = kind === 'work' ? c.workApps : c.nonWorkApps, other = kind === 'work' ? c.nonWorkApps : c.workApps;
  const nextMine = mine.some((x) => appKey(x) === k) ? mine : [...mine, e];
  const nextOther = other.filter((x) => appKey(x) !== k);
  return kind === 'work' ? { workApps: nextMine, nonWorkApps: nextOther } : { workApps: nextOther, nonWorkApps: nextMine };
}
