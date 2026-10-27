/**
 * 뽀모도로 엔진 — v3 `timer.js` 를 React 훅으로 옮긴 것
 *
 * ★ 돌고 있는 타이머는 «이 기기» 의 것이다. 기기마다 따로 돈다 (v3 도 앱 하나에 하나였다).
 *   새로고침해도 이어지도록 기기 저장소에 남긴다 — 「언제 시작했나」 를 적어 두고 남은 시간은 매번 계산한다.
 * ★ «집중을 끝까지 채운 횟수» 만 서버로 간다 (`pomoDone` 이벤트) — 그래야 폰에서도 오늘 몇 회인지 보인다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type PomoMode = 'focus' | 'short' | 'long';

export interface PomoCfg { focusMin: number; shortMin: number; longMin: number; longEvery: number; autoStart: boolean }

/** v3 store.js 기본값 */
const DEFAULTS: PomoCfg = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: true };
export const PRESETS = [15, 25, 40, 50];

interface Saved {
  mode: PomoMode;
  /** 멈춰 있을 때 남은 초 */
  remain: number;
  /** 돌고 있으면 «끝나는 시각» (epoch ms) */
  endsAt: number | null;
  cycle: number;
}

const KEY = 'dm.pomo.v1';
const CFG_KEY = 'dm.pomo.cfg';

function read<T>(k: string, fb: T): T {
  try { const v = localStorage.getItem(k); return v ? { ...fb, ...JSON.parse(v) } : fb; } catch { return fb; }
}
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 이번 화면에서만 유지 */ } }

export interface Pomodoro {
  cfg: PomoCfg;
  mode: PomoMode;
  running: boolean;
  /** 남은 초 (0 이상) */
  remain: number;
  /** 지금 세션 길이 (초) */
  total: number;
  /** 0~1 진행 */
  pct: number;
  label: string;
  clock: string;
  toggle: () => void;
  pause: () => void;
  skip: () => void;
  reset: () => void;
  setFocusMin: (n: number) => void;
}

/**
 * @param onFocusDone 집중 한 번을 끝까지 채웠을 때 (분)
 * @param onAutoStart 앱이 스스로 다음 세션을 시작했을 때 — v3 는 «켜 두되 말을 한다» (v3.1.127)
 */
export function usePomodoro(onFocusDone: (min: number) => void, onAutoStart: (mode: PomoMode) => void): Pomodoro {
  const [cfg, setCfg] = useState<PomoCfg>(() => read(CFG_KEY, DEFAULTS));
  const len = useCallback((m: PomoMode) => (m === 'focus' ? cfg.focusMin : m === 'short' ? cfg.shortMin : cfg.longMin) * 60, [cfg]);
  const [s, setS] = useState<Saved>(() => read<Saved>(KEY, { mode: 'focus', remain: cfg.focusMin * 60, endsAt: null, cycle: 0 }));
  const [, tick] = useState(0);
  const cb = useRef({ onFocusDone, onAutoStart });
  cb.current = { onFocusDone, onAutoStart };

  const save = useCallback((n: Saved) => { setS(n); write(KEY, n); }, []);
  const remainOf = (x: Saved) => (x.endsAt != null ? Math.max(0, (x.endsAt - Date.now()) / 1000) : x.remain);

  // 다음 세션으로 (v3 _advance) — 끝까지 채웠으면 completed
  const advance = useCallback((x: Saved, completed: boolean, noAuto: boolean) => {
    let cycle = x.cycle;
    let mode: PomoMode;
    if (x.mode === 'focus') {
      cycle++;
      mode = cycle % cfg.longEvery === 0 ? 'long' : 'short';
    } else mode = 'focus';
    if (completed && x.mode === 'focus') cb.current.onFocusDone(cfg.focusMin);
    const auto = !noAuto && cfg.autoStart && completed;
    const n: Saved = { mode, cycle, remain: len(mode), endsAt: auto ? Date.now() + len(mode) * 1000 : null };
    save(n);
    if (auto) cb.current.onAutoStart(mode);
  }, [cfg, len, save]);

  // 돌고 있을 때만 0.25초마다 들여다본다 (v3 _loop 와 같은 박자). 끝났으면 다음 세션으로
  useEffect(() => {
    if (s.endsAt == null) return;
    const id = setInterval(() => {
      if (s.endsAt != null && Date.now() >= s.endsAt) advance(s, true, false);
      else tick((t) => t + 1);
    }, 250);
    return () => clearInterval(id);
  }, [s, advance]);

  const remain = remainOf(s);
  const running = s.endsAt != null;
  const total = len(s.mode);
  const sec = Math.max(0, Math.ceil(remain));

  return {
    cfg, mode: s.mode, running, remain, total,
    pct: total ? 1 - Math.max(0, remain) / total : 0,
    label: s.mode === 'focus' ? '집중' : s.mode === 'short' ? '짧은 휴식' : '긴 휴식',
    clock: `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
    toggle: () => save(running
      ? { ...s, remain, endsAt: null }
      : { ...s, endsAt: Date.now() + remain * 1000 }),
    pause: () => { if (running) save({ ...s, remain, endsAt: null }); },
    skip: () => advance({ ...s, remain }, false, true),
    reset: () => save({ ...s, remain: len(s.mode), endsAt: null }),
    setFocusMin: (n: number) => {
      const c = { ...cfg, focusMin: n };
      setCfg(c); write(CFG_KEY, c);
      // v3 setFocusMin — 돌고 있지 않으면 집중으로 새로 맞춘다
      if (!running) save({ ...s, mode: 'focus', remain: n * 60, endsAt: null });
    },
  };
}
