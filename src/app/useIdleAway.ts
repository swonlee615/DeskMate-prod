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
 * ★ 업무 앱 기준(PC 앱): 같은 틱에 맨 앞 앱을 표본으로 쌓고, 딴짓 앱만 기준 시간 넘게 쓰면 자리비움(by 'app') — domain/workApps
 *   ponytail: v3 의 «손으로 켠 휴게를 업무 앱으로 닫기» 는 아직 없다
 * ★ 출근 감지(PC 앱 · v3.2.0): 출근 전 · 퇴근 뒤에도 같은 10초 틱이 돈다. 맨 앞 앱이 업무 앱인지만 넘기고 판정은 domain/arrival
 */
import { useEffect, useRef, useState } from 'react';
import { deviceKind } from '../data/device';
import { ACTIVE_SEC, appBucket, isSelf, distracted, pushSample, rememberApp, windowStats, winMs, type FrontApp, type Sample, type WorkAppsCfg } from '../domain/workApps';

/** 업무 앱 기준 — 설정 화면이 보여 줄 지금 상태 (저장하지 않는다) */
export interface AppsLive { on: boolean; seen: FrontApp[]; distractMs: number; workMs: number; winMs: number }

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

export function useIdleAway(o: {
  on: boolean; min: number; working: boolean; apps: WorkAppsCfg & { on: boolean };
  onAway: (at: number, by: 'idle' | 'power' | 'app', mins: number) => void; onBack: (at: number) => void;
  /** 근무 중 표본 하나 — 앱 사용 기록 (domain/appUse) */
  onSample?: (f: FrontApp, self: boolean, kind: Sample['k'], at: number) => void;
  /** 출근 감지 — 근무 중이 아닐 때도 돈다. arrive 가 false 면 맨 앞 앱을 안 읽는다 */
  arrOn?: boolean; arrive?: () => boolean;
  onArrTick?: (i: { sec: number; kind: 'work' | 'other' | null; name: string | null; at: number }) => void;
}) {
  const [live, setLive] = useState<AppsLive | null>(null);
  const [perm, setPerm] = useState<IdlePerm>('prompt');
  useEffect(() => { void permOf().then(setPerm); }, []);
  const cb = useRef(o);
  cb.current = o;
  const sent = useRef(false);
  useEffect(() => {
    if (!(o.on || o.arrOn) || perm !== 'app') return;
    const th = Math.max(3, o.min) * 60_000;
    let last = Date.now(), backAt: number | null = null, samples: Sample[] = [], seen: FrontApp[] = [], by: 'idle' | 'power' | 'app' = 'idle';
    const win = winMs(o.min);
    const tick = async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const sec = await invoke<number | null>('system_idle_secs');
      const c = cb.current, appMode = c.apps.on, arr = !c.working && !!c.arrive?.();
      // 표본 한 개 — 맨 앞에 있고 90초 안에 손댄 앱만. 출근 감지는 자리비움 기준 안이면 읽는다 (v3 arrivalTick)
      let kind: Sample['k'] = null, af: FrontApp | null = null;
      if (appMode && sec != null && (sec <= ACTIVE_SEC || (arr && sec * 1000 < th))) {
        af = await invoke<FrontApp | null>('front_app_now').catch(() => null);
        if (af) {
          seen = rememberApp(seen, af); const b = appBucket(af, c.apps);
          if (sec <= ACTIVE_SEC) kind = b === 'away' ? 'distract' : b;
          if (c.working && !sent.current) c.onSample?.(af, isSelf(af), kind, Date.now());
        }
      }
      if (arr && sec != null) c.onArrTick?.({ sec, kind: af ? (appBucket(af, c.apps) === 'work' ? 'work' : 'other') : null, name: af ? af.name || af.id || null : null, at: Date.now() });
      samples = pushSample(samples, { t: Date.now(), k: kind }, win);
      const st = windowStats(samples);
      setLive(appMode ? { on: true, seen, distractMs: st.distractMs, workMs: st.workMs, winMs: win } : null);
      // ponytail: 10초 틱이 기준 시간보다 늦으면 «잠들었다» 로 본다. 맥 App Nap 이 틱을 그만큼 미루면 오탐 — 그때는 Rust 쪽 잠자기 알림으로
      const now = Date.now(), slept = now - last > th, from = last;
      last = now;
      if (sec == null || !c.on) return;
      if (!c.working) samples = [];
      const byApp = appMode && distracted(st, o.min);
      if (!sent.current && c.working && (slept || sec * 1000 >= th || byApp)) {
        sent.current = true;
        by = slept ? 'power' : sec * 1000 >= th ? 'idle' : 'app';
        const at = by === 'power' ? from : by === 'idle' ? now - sec * 1000 : st.firstD ?? now;
        c.onAway(at, by, Math.round((now - at) / 60_000));
        samples = [];
      }
      if (!sent.current) return;
      // 돌아옴 — 스치는 입력 하나로 닫지 않는다. 30초 넘게 계속 손을 대면 처음 손 댄 시각으로 닫는다 (v3 RESUME_CONFIRM_MS)
      if (sec >= TOUCH_SEC) { backAt = null; return; }
      // 딴짓으로 연 건 업무 앱 표본이 두 번 연달아 나와야 돌아온 것 (v3)
      if (by === 'app' && appMode && !(samples.length >= 2 && samples.slice(-2).every((x) => x.k === 'work'))) return;
      backAt ??= now - sec * 1000;
      if (now - backAt >= RESUME_MS) { sent.current = false; c.onBack(backAt); backAt = null; }
    };
    const t = setInterval(() => void tick().catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, [o.on, o.arrOn, o.min, perm]);
  useEffect(() => { if (!o.on || !o.apps.on) setLive(null); }, [o.on, o.apps.on]);
  useEffect(() => {
    const D = Detector();
    if (!o.on || perm !== 'granted' || !D) return;
    const th = Math.max(3, o.min) * 60_000;
    const ac = new AbortController();
    const det = new D();
    det.addEventListener('change', () => {
      const locked = det.screenState === 'locked', away = locked || det.userState === 'idle', now = Date.now();
      if (away && !sent.current && cb.current.working) { sent.current = true; cb.current.onAway(locked ? now : now - th, locked ? 'power' : 'idle', Math.round(th / 60_000)); }
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
  return { perm, ask, live };
}
