/**
 * 이 기기에만 저장 — Firebase 설정(.env.local)이 없을 때 쓴다.
 * 같은 브라우저의 다른 탭끼리는 storage 이벤트로 맞춘다.
 */
import type { AttEvent } from '../domain/attendance/types';
import type { Block } from '../domain/todos/tree';
import type { DayEvents, Item, Repo, SyncStatus } from './repo';

const KEY = 'dm.local.events.v1';
const BKEY = 'dm.local.blocks.v1';
const IKEY = 'dm.local.items.v1';

function load(): AttEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AttEvent[]) : [];
  } catch {
    return [];
  }
}

function save(list: AttEvent[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 저장 공간이 막힌 환경 — 이번 세션 동안만 유지 */ }
}

function loadB(): Block[] {
  try { const raw = localStorage.getItem(BKEY); return raw ? (JSON.parse(raw) as Block[]) : []; } catch { return []; }
}
function saveB(list: Block[]) { try { localStorage.setItem(BKEY, JSON.stringify(list)); } catch { /* 이번 세션만 */ } }
function loadI(): Item[] {
  try { const raw = localStorage.getItem(IKEY); return raw ? (JSON.parse(raw) as Item[]) : []; } catch { return []; }
}
function saveI(list: Item[]) { try { localStorage.setItem(IKEY, JSON.stringify(list)); } catch { /* 이번 세션만 */ } }

/** Firestore updateDoc 과 같은 뜻 — 점은 맵 안으로, null 은 지우기 */
export function applyPatch<T extends object>(o: T, fields: Record<string, unknown>): T {
  const n = structuredClone(o) as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) {
    const ks = k.split('.');
    let t = n;
    for (const p of ks.slice(0, -1)) t = (t[p] ??= {}) as Record<string, unknown>;
    if (v === null) delete t[ks[ks.length - 1]]; else t[ks[ks.length - 1]] = v;
  }
  return n as T;
}

export function createLocalRepo(): Repo {
  let all = load();
  let blocks = loadB();
  let items = loadI();
  const iw = new Set<(items: Item[]) => void>();
  const emitI = () => { for (const cb of iw) cb(items); };
  const bw = new Set<{ from: string; to: string; cb: (d: { blocks: Block[]; unavailable: boolean }) => void }>();
  const emitB = () => { for (const w of bw) w.cb({ blocks: blocks.filter((b) => b.date >= w.from && b.date <= w.to), unavailable: false }); };
  const watchers = new Set<{ from: string; to: string; cb: (d: DayEvents) => void }>();
  const pick = (from: string, to: string) => all.filter((e) => e.date >= from && e.date <= to);

  const emit = () => {
    for (const w of watchers) w.cb({ events: pick(w.from, w.to), unavailable: false });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) { all = load(); emit(); }
      if (e.key === BKEY) { blocks = loadB(); emitB(); }
      if (e.key === IKEY) { items = loadI(); emitI(); }
    });
  }

  return {
    mode: 'local',
    dispose() {},

    watchDay(date, cb) { return this.watchRange(date, date, cb); },

    watchRange(from, to, cb) {
      const w = { from, to, cb };
      watchers.add(w);
      cb({ events: pick(from, to), unavailable: false });
      return () => { watchers.delete(w); };
    },

    addEvent(e) {
      all = [...all.filter((x) => x.id !== e.id), e];
      save(all);
      emit();
    },

    deleteEvent(e) {
      all = all.map((x) => (x.id === e.id ? { ...x, deletedAt: Date.now() } : x));
      save(all);
      emit();
    },

    watchBlocks(from, to, cb) {
      const w = { from, to, cb };
      bw.add(w);
      cb({ blocks: blocks.filter((b) => b.date >= from && b.date <= to), unavailable: false });
      return () => { bw.delete(w); };
    },
    addBlock(b) { blocks = [...blocks.filter((x) => x.id !== b.id), b]; saveB(blocks); emitB(); },
    patchBlocks(patches) {
      const now = Date.now();
      const m = new Map(patches.map((p) => [p.id, p]));
      blocks = blocks.map((b) => { const p = m.get(b.id); return p ? { ...b, ...p, updatedAt: now } : b; });
      saveB(blocks); emitB();
    },

    watchItems(cb) { iw.add(cb); cb(items); return () => { iw.delete(cb); }; },
    addItem(it) { items = [...items.filter((x) => x.id !== it.id), it]; saveI(items); emitI(); },
    patchItem(id, fields) {
      items = items.map((x) => (x.id === id ? applyPatch(x, fields) : x));
      saveI(items); emitI();
    },

    watchSync(cb) {
      const s = (): SyncStatus => ({ mode: 'local', online: navigator.onLine, pending: 0, fromCache: false });
      cb(s());
      const on = () => cb(s());
      window.addEventListener('online', on);
      window.addEventListener('offline', on);
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
    },
  };
}
