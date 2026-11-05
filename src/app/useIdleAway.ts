/**
 * PC 브라우저 자리비움 감지 (2026-11-02 소유자 — PC 앱 전까지) — Chrome · Edge 의 «유휴 감지»(IdleDetector)
 *
 * ★ 이 맥 전체의 입력을 본다 (다른 앱 · 다른 탭을 보고 있어도). 기준 시간 넘게 키보드 · 마우스가 멈추면
 *   «멈춘 그 시각» 부터, 화면이 잠기면 «잠근 그 시각» 부터 자리비움(awayStart). 다시 만지면 복귀(awayEnd)
 * ★ 근무 중일 때만 보낸다. 판정(여러 PC 가 다 비었나 · 사람이 연 휴게 우선)은 재생이 한다 (SYNC §3)
 * ★ 권한은 브라우저마다 한 번 — 사람이 누른 순간에만 물을 수 있다 (설정 › 자리비움)
 * ★ Safari · Firefox 에는 이 기능이 없다 — 그때는 조용히 꺼져 있다
 * ★ PC 앱은 권한 없이 OS 에서 «마지막 입력 뒤 지난 초» 를 읽는다 (src-tauri/src/idle.rs · v3 getSystemIdleTime).
 *   10초마다 본다. 그 사이가 기준 시간보다 길게 비었으면(맥이 잠들었다 깸) 마지막으로 본 시각부터 자리비움
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

export type IdlePerm = 'unsupported' | 'granted' | 'denied' | 'prompt' | 'app';
async function permOf(): Promise<IdlePerm> {
  if (deviceKind() === 'desktop') return 'app';
  if (!Detector() || deviceKind() !== 'browser') return 'unsupported';
  try { return (await navigator.permissions.query({ name: 'idle-detection' as PermissionName })).state as IdlePerm; } catch { return 'prompt'; }
}

/** 이보다 오래 입력이 없으면 아직 손을 안 댄 것 (v3 idle >= 20) · 이만큼 계속 손을 대야 돌아온 것 */
const TOUCH_SEC = 20, RESUME_MS = 30_000;

export function useIdleAway(o: { on: boolean; min: number; working: boolean; onAway: (at: number, by: 'idle' | 'power') => void; onBack: (at: number) => void }) {
  const [perm, setPerm] = useState<IdlePerm>('prompt');
  useEffect(() => { void permOf().then(setPerm); }, []);
  const cb = useRef(o);
  cb.current = o;
  const sent = useRef(false);
  useEffect(() => {
    if (!o.on || perm !== 'app') return;
    const th = Math.max(3, o.min) * 60_000;
    let last = Date.now(), backAt: number | null = null;
    const tick = async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const sec = await invoke<number | null>('system_idle_secs');
      // ponytail: 10초 틱이 기준 시간보다 늦으면 «잠들었다» 로 본다. 맥 App Nap 이 틱을 그만큼 미루면 오탐 — 그때는 Rust 쪽 잠자기 알림으로
      const now = Date.now(), slept = now - last > th, from = last;
      last = now;
      if (sec == null) return;
      const c = cb.current;
      if (!sent.current && c.working && (slept || sec * 1000 >= th)) {
        sent.current = true;
        c.onAway(slept ? from : now - sec * 1000, slept ? 'power' : 'idle');
      }
      if (!sent.current) return;
      // 돌아옴 — 스치는 입력 하나로 닫지 않는다. 30초 넘게 계속 손을 대면 처음 손 댄 시각으로 닫는다 (v3 RESUME_CONFIRM_MS)
      if (sec >= TOUCH_SEC) { backAt = null; return; }
      backAt ??= now - sec * 1000;
      if (now - backAt >= RESUME_MS) { sent.current = false; c.onBack(backAt); backAt = null; }
    };
    const t = setInterval(() => void tick().catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, [o.on, o.min, perm]);
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
