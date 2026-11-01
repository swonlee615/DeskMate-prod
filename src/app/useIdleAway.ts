/**
 * PC 브라우저 자리비움 감지 (2026-11-02 소유자 — PC 앱 전까지) — Chrome · Edge 의 «유휴 감지»(IdleDetector)
 *
 * ★ 이 맥 전체의 입력을 본다 (다른 앱 · 다른 탭을 보고 있어도). 기준 시간 넘게 키보드 · 마우스가 멈추면
 *   «멈춘 그 시각» 부터, 화면이 잠기면 «잠근 그 시각» 부터 자리비움(awayStart). 다시 만지면 복귀(awayEnd)
 * ★ 근무 중일 때만 보낸다. 판정(여러 PC 가 다 비었나 · 사람이 연 휴게 우선)은 재생이 한다 (SYNC §3)
 * ★ 권한은 브라우저마다 한 번 — 사람이 누른 순간에만 물을 수 있다 (설정 › 자리비움)
 * ★ Safari · Firefox 에는 이 기능이 없다 — 그때는 조용히 꺼져 있다
 */
import { useEffect, useRef, useState } from 'react';
import { deviceKind } from '../data/device';

interface IdleDet extends EventTarget {
  userState: 'active' | 'idle' | null;
  screenState: 'locked' | 'unlocked' | null;
  start(o: { threshold: number; signal: AbortSignal }): Promise<void>;
}
type IdleCtor = { new (): IdleDet; requestPermission(): Promise<'granted' | 'denied'> };
const Detector = () => (typeof window !== 'undefined' ? (window as unknown as { IdleDetector?: IdleCtor }).IdleDetector : undefined);

export type IdlePerm = 'unsupported' | 'granted' | 'denied' | 'prompt';
async function permOf(): Promise<IdlePerm> {
  if (!Detector() || deviceKind() !== 'browser') return 'unsupported';
  try { return (await navigator.permissions.query({ name: 'idle-detection' as PermissionName })).state as IdlePerm; } catch { return 'prompt'; }
}

export function useIdleAway(o: { on: boolean; min: number; working: boolean; onAway: (at: number, by: 'idle' | 'power') => void; onBack: (at: number) => void }) {
  const [perm, setPerm] = useState<IdlePerm>('prompt');
  useEffect(() => { void permOf().then(setPerm); }, []);
  const cb = useRef(o);
  cb.current = o;
  const sent = useRef(false);
  useEffect(() => {
    const D = Detector();
    if (!o.on || perm !== 'granted' || !D) return;
    const th = Math.max(3, o.min) * 60_000;
    const ac = new AbortController();
    const det = new D();
    det.addEventListener('change', () => {
      const locked = det.screenState === 'locked', away = locked || det.userState === 'idle', now = Date.now();
      if (away && !sent.current && cb.current.working) { sent.current = true; cb.current.onAway(locked ? now : now - th, locked ? 'power' : 'idle'); }
      else if (!away && sent.current) { sent.current = false; cb.current.onBack(now); }
    });
    det.start({ threshold: th, signal: ac.signal }).catch(() => setPerm('denied'));
    return () => ac.abort();
  }, [o.on, o.min, perm]);
  /** 설정에서 «켜기» 를 누른 그 순간에 묻는다 (브라우저 규칙) */
  const ask = async () => {
    const D = Detector();
    if (!D) { setPerm('unsupported'); return; }
    try { setPerm(await D.requestPermission()); } catch { setPerm('denied'); }
  };
  return { perm, ask };
}
