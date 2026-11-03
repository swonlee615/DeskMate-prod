import type { SyncStatus } from '../data';

/** 연결 끊김 — 와이파이 부채꼴에 빗금 */
const OFF_IC = (
  <svg className="sync-ic" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M2.6 7.6a11 11 0 0 1 4-2.4M10 4.7a11 11 0 0 1 7.4 2.9M5.1 10.4a7 7 0 0 1 3-1.6M12.6 9.2a7 7 0 0 1 2.3 1.2M7.7 13.1a3.4 3.4 0 0 1 4.6 0" />
    <circle cx="10" cy="15.9" r="1" fill="currentColor" stroke="none" />
    <path d="M3.4 3.4l13.2 13.2" />
  </svg>
);

/** 노션처럼 지금 저장 상태를 한 줄로. 서버에 안 닿는 상태(이 기기 저장 · 연결 끊김)는 모두 «오프라인» (2026-10-28 소유자) */
export function SyncBadge({ s }: { s: SyncStatus | null }) {
  if (!s) return null;
  let cls = 'ok';
  let text = '동기화됨';
  if (s.mode === 'local' || !s.online) {
    cls = 'off';
    text = s.mode === 'cloud' && s.pending > 0 ? `오프라인 · 저장 대기 ${s.pending}건` : '오프라인';
  }
  else if (s.pending > 0) { cls = 'busy'; text = '저장 중…'; }
  // 브라우저는 온라인인데 서버 응답은 아직 캐시뿐 — 연결이 막 바뀌었거나 서버에 못 닿는 중
  else if (s.fromCache) { cls = 'busy'; text = '연결 중…'; }
  return (
    <span className={`sync sync-${cls}`} role="status" aria-live="polite"
      title={s.mode === 'local' ? '개발 모드예요. 서버에 연결하지 않고 이 기기에만 저장해요' : undefined}>
      {cls === 'off' ? OFF_IC : <i aria-hidden />} {text}
    </span>
  );
}
