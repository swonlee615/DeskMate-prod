/**
 * Firestore 저장소 — 노션 방식 오프라인 (docs/SYNC.md §1)
 *
 * - 화면은 늘 기기 캐시를 먼저 읽는다. 온라인이면 서버 변경이 곧바로 따라 들어온다
 * - 오프라인에서 쓴 것은 기기(IndexedDB)에 쌓였다가 온라인이 되면 자동으로 올라간다.
 *   앱을 껐다 켜도 남아 있다
 * - 기기에 남는 것은 «열어 본 것» 뿐이다. 상한(CACHE_BYTES)을 넘으면 오래 안 본 것부터 기기에서 지운다.
 *   서버 원본은 그대로이고, 아직 안 올라간 편집은 지우지 않는다
 *
 * 경로: users/{uid}/events/{eventId}   — 이벤트 한 건 = 문서 하나 → 기기끼리 충돌이 없다
 *       users/{uid}/items/{id}        — D-Day · 습관 정의 하나 = 문서 하나
 */
import { collection, deleteField, doc, setDoc, updateDoc, query, where, onSnapshot, writeBatch, type Firestore } from 'firebase/firestore';
import type { Repo, SyncStatus } from './repo';

export function createFirestoreRepo(db: Firestore, uid: string): Repo {
  let pending = 0;
  // 구독마다 «아직 안 올라간 쓰기» 가 있는지 따로 센다 (근태 · 줄)
  const snapPend = new Map<string, boolean>();
  const snapPending = () => [...snapPend.values()].some(Boolean);
  let nextSub = 0;
  let fromCache = false;
  const syncWatchers = new Set<(s: SyncStatus) => void>();

  const status = (): SyncStatus => ({
    mode: 'cloud',
    online: navigator.onLine,
    pending: Math.max(pending, snapPending() ? 1 : 0),
    fromCache,
  });
  const emitSync = () => { const s = status(); syncWatchers.forEach((cb) => cb(s)); };
  window.addEventListener('online', emitSync);
  window.addEventListener('offline', emitSync);

  const col = collection(db, 'users', uid, 'events');
  const bcol = collection(db, 'users', uid, 'blocks');
  const icol = collection(db, 'users', uid, 'items');
  const lcol = collection(db, 'users', uid, 'logs');

  /** 서버 확인을 기다리지 않는다 — 오프라인이면 promise 는 온라인이 될 때까지 안 끝난다 */
  const track = (p: Promise<unknown>) => {
    pending++;
    emitSync();
    p.catch((err) => console.error('[sync] 쓰기 실패', err)).finally(() => { pending--; emitSync(); });
  };

  return {
    mode: 'cloud',

    watchDay(date, cb) {
      return this.watchRange(date, date, cb);
    },

    watchRange(from, to, cb) {
      // 필드 하나(date)에만 범위를 거는 질의라 따로 색인을 만들 필요가 없다
      const q = query(col, where('date', '>=', from), where('date', '<=', to));
      const key = `e${nextSub++}`;
      const off = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        fromCache = snap.metadata.fromCache;
        snapPend.set(key, snap.metadata.hasPendingWrites);
        emitSync();
        cb({
          events: snap.docs.map((d) => d.data() as never),
          // 캐시에도 없고 서버에도 못 닿는다 = 이 기기에서 열어 본 적 없는 기간
          unavailable: snap.empty && snap.metadata.fromCache && !navigator.onLine,
        });
      });
      return () => { off(); snapPend.delete(key); emitSync(); };
    },

    addEvent(e) { track(setDoc(doc(col, e.id), e)); },

    deleteEvent(e) {
      // 필드 하나만 보낸다 → 다른 기기가 같은 문서를 고쳐도 덮이지 않는다
      track(updateDoc(doc(col, e.id), { deletedAt: Date.now() }));
    },

    watchBlocks(from, to, cb) {
      const q = query(bcol, where('date', '>=', from), where('date', '<=', to));
      const key = `b${nextSub++}`;
      const off = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        fromCache = snap.metadata.fromCache;
        snapPend.set(key, snap.metadata.hasPendingWrites);
        emitSync();
        cb({ blocks: snap.docs.map((d) => d.data() as never), unavailable: snap.empty && snap.metadata.fromCache && !navigator.onLine });
      });
      return () => { off(); snapPend.delete(key); emitSync(); };
    },

    addBlock(b) { track(setDoc(doc(bcol, b.id), b)); },

    patchBlocks(patches) {
      if (!patches.length) return;
      // 한 덩어리로 — 덩어리 이동이 반만 저장되면 줄이 엉뚱한 부모 밑에 남는다
      const batch = writeBatch(db);
      const now = Date.now();
      for (const { id, ...f } of patches) batch.update(doc(bcol, id), { ...f, updatedAt: now });
      track(batch.commit());
    },

    watchLogs(from, to, cb) {
      const q = query(lcol, where('date', '>=', from), where('date', '<=', to));
      const key = `l${nextSub++}`;
      const off = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        snapPend.set(key, snap.metadata.hasPendingWrites);
        emitSync();
        cb(snap.docs.map((d) => d.data() as never));
      });
      return () => { off(); snapPend.delete(key); emitSync(); };
    },
    addLog(l) { track(setDoc(doc(lcol, l.id), l)); },
    patchLog(id, f) { track(updateDoc(doc(lcol, id), { ...f, updatedAt: Date.now() })); },

    watchItems(cb) {
      const key = `i${nextSub++}`;
      const off = onSnapshot(icol, { includeMetadataChanges: true }, (snap) => {
        snapPend.set(key, snap.metadata.hasPendingWrites);
        emitSync();
        cb(snap.docs.map((d) => d.data() as never));
      });
      return () => { off(); snapPend.delete(key); emitSync(); };
    },

    addItem(it) { track(setDoc(doc(icol, it.id), it)); },

    patchItem(id, fields) {
      const f: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) f[k] = v === null ? deleteField() : v;
      track(updateDoc(doc(icol, id), f));
    },

    watchSync(cb) {
      syncWatchers.add(cb);
      cb(status());
      return () => { syncWatchers.delete(cb); };
    },

    dispose() {
      window.removeEventListener('online', emitSync);
      window.removeEventListener('offline', emitSync);
      syncWatchers.clear();
    },
  };
}
