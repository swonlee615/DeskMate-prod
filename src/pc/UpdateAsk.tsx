/**
 * 새 버전 카드 (v3 에는 없다 · 2026-11-06 소유자 «알리고 고르게») — PC 앱에서만. 켤 때 한 번 묻는다
 * ★ 모양은 v3 resume-ask 카드를 다시 쓴다. 출근 감지 카드가 떠 있으면 같은 자리라 그동안은 숨긴다
 * ★ ✕ = 이번에는 넘기기. 다음에 앱을 켜면 다시 묻는다
 */
import { useEffect, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { deviceKind } from '../data/device';

export function UpdateAsk({ ws }: { ws: Workspace }) {
  const [ver, setVer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (deviceKind() !== 'desktop') return;
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke<string | null>('update_check')).then(setVer, () => {});
  }, []);
  if (!ver || ws.arrival.hit || ws.arrival.missed) return null;

  const install = async () => {
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_install');
    } catch {
      setBusy(false);
      ws.warn('새 버전을 받지 못했어요. 잠시 뒤 다시 해 주세요');
    }
  };
  return (
    <div className="resume-ask" role="alertdialog" aria-label="새 버전">
      <button className="rz-x" aria-label="나중에" title="나중에" onClick={() => setVer(null)}>✕</button>
      <div className="rz-t">새 버전 {ver}이 나왔어요</div>
      <div className="rz-s">설치하면 DeskMate가 다시 켜져요. 기록은 그대로 남아요</div>
      <div className="rz-a"><button className="btn primary sm" disabled={busy} onClick={install}>{busy ? '받는 중…' : '지금 설치'}</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => setVer(null)}>나중에</button></div>
    </div>
  );
}
