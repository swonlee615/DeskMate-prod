import type { SyncStatus } from '../data';

/** 노션처럼 지금 저장 상태를 한 줄로 */
export function SyncBadge({ s }: { s: SyncStatus | null }) {
  if (!s) return null;
  let cls = 'ok';
  let text = '동기화됨';
  if (s.mode === 'local') { cls = 'local'; text = '이 기기에만 저장'; }
  else if (!s.online) { cls = 'off'; text = s.pending > 0 ? `오프라인 · 저장 대기 ${s.pending}건` : '오프라인'; }
  else if (s.pending > 0) { cls = 'busy'; text = '저장 중…'; }
  // 브라우저는 온라인인데 서버 응답은 아직 캐시뿐 — 연결이 막 바뀌었거나 서버에 못 닿는 중
  else if (s.fromCache) { cls = 'busy'; text = '연결 중…'; }
  return (
    <span className={`sync sync-${cls}`} role="status" aria-live="polite">
      <i aria-hidden /> {text}
    </span>
  );
}
