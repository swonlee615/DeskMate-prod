/**
 * 이 기기에만 저장 — Firebase 설정(.env.local)이 없을 때 쓴다.
 * 같은 브라우저의 다른 탭끼리는 storage 이벤트로 맞춘다.
 */
import type { AttEvent } from '../domain/attendance/types';
import type { Block } from '../domain/todos/tree';
import type { DayEvents, Repo, SyncStatus } from './repo';

const KEY = 'dm.local.events.v1';
const BKEY = 'dm.local.blocks.v1';

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

export function createLocalRepo(): Repo {
  let all = load();
  let blocks = loadB();
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
