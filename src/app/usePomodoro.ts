/**
 * 뽀모도로 엔진 — v3 `timer.js` 를 React 훅으로 옮긴 것
 *
 * ★ 타이머는 «사람 하나에 하나» 다 (2026-10-27 소유자 — 폰에서 시작하면 PC 에도 그대로 돌아야 한다. SYNC §9).
 *   상태는 문서 하나(`items/pomo`)에 두고, 고칠 때는 바뀐 필드만 보낸다. 남은 시간은 «끝나는 시각» 으로 매번 계산한다.
 * ★ 끝나는 순간은 열려 있는 기기가 모두 알아챈다. 그래서 다음 상태를 «끝난 시각» 에서만 계산한다
 *   (Date.now() 를 쓰지 않는다) — 어느 기기가 몇 번 써도 같은 값이고, 완료 이벤트 id 도 같아서 한 번만 센다.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useTick } from './clock';

export type PomoMode = 'focus' | 'short' | 'long';

export interface PomoCfg { focusMin: number; shortMin: number; longMin: number; longEvery: number; autoStart: boolean }

/** v3 store.js 기본값 */
const DEFAULTS: PomoCfg = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: true };
export const PRESETS = [15, 25, 40, 50];

/** 저장하는 모양 — `items/pomo` 문서의 필드 그대로 */
export interface PomoDoc extends PomoCfg {
  mode: PomoMode;
  /** 멈춰 있을 때 남은 초 */
  remain: number;
  /** 돌고 있으면 «끝나는 시각» (epoch ms) */
  endsAt: number | null;
  cycle: number;
}

export const POMO_DEFAULT: PomoDoc = { ...DEFAULTS, mode: 'focus', remain: DEFAULTS.focusMin * 60, endsAt: null, cycle: 0 };

const lenOf = (x: PomoDoc, m: PomoMode) => (m === 'focus' ? x.focusMin : m === 'short' ? x.shortMin : x.longMin) * 60;

/**
 * 다음 세션 (v3 _advance) — 순수 함수. `completed` 면 «끝난 시각» 에 이어서 시작한다
 * ponytail: 아무 기기도 안 켜져 있던 사이 끝난 세션은 하나만 센다 — 이어 시작할 세션마저 이미 지났으면 멈춰 둔다
 */
export function nextPomo(x: PomoDoc, completed: boolean, noAuto: boolean, now: number): PomoDoc {
  let cycle = x.cycle;
  let mode: PomoMode;
  if (x.mode === 'focus') {
    cycle++;
    mode = cycle % x.longEvery === 0 ? 'long' : 'short';
  } else mode = 'focus';
  const len = lenOf(x, mode);
  const endsAt = !noAuto && x.autoStart && completed && x.endsAt != null && x.endsAt + len * 1000 > now
    ? x.endsAt + len * 1000 : null;
  return { ...x, mode, cycle, remain: len, endsAt };
}

/**
 * 앱 전체가 들고 다니는 타이머 — 남은 시간 숫자는 들고 있지 않다 (그걸 매 0.25초 바꾸면 앱 전체가 다시 그려진다).
 * 숫자가 필요한 조각은 `usePomoClock(t)` 로 그 자리에서 센다
 */
export interface Pomodoro {
  cfg: PomoCfg;
  mode: PomoMode;
  running: boolean;
  /** 그 시각의 남은 초 (0 이상) */
  remainAt: (now: number) => number;
  /** 지금 세션 길이 (초) */
  total: number;
  label: string;
  toggle: () => void;
  pause: () => void;
  skip: () => void;
  reset: () => void;
  setFocusMin: (n: number) => void;
  /** 설정 › 뽀모도로 — 멈춰 있고 아직 안 줄어든 세션이면 새 길이로 맞춘다 (v3 applyCfg) */
  setCfg: (c: Partial<PomoCfg>) => void;
}

/**
 * @param doc 저장된 타이머 (아직 없으면 null)
 * @param write 바뀐 필드만 저장
 * @param onFocusDone 집중 한 번을 끝까지 채웠을 때 — 끝난 시각 · 분
 * @param onAutoStart 앱이 스스로 다음 세션을 시작했을 때 — v3 는 «켜 두되 말을 한다» (v3.1.127)
 */
export function usePomodoro(
  doc: PomoDoc | null,
  write: (fields: Partial<PomoDoc>, full: PomoDoc) => void,
  onFocusDone: (endedAt: number, min: number) => void,
  onAutoStart: (mode: PomoMode) => void,
): Pomodoro {
  const s = doc ?? POMO_DEFAULT;
  const cb = useRef({ onFocusDone, onAutoStart, write });
  /** 이 기기가 이미 넘긴 세션 (끝나는 시각) — 저장이 화면에 돌아오기 전에 또 넘기지 않게 */
  const done = useRef<number | null>(null);
  cb.current = { onFocusDone, onAutoStart, write };

  const save = useCallback((n: PomoDoc) => {
    const f: Partial<PomoDoc> = {};
    for (const k of Object.keys(n) as (keyof PomoDoc)[]) if (n[k] !== s[k]) (f as Record<string, unknown>)[k] = n[k];
    if (Object.keys(f).length) cb.current.write(f, n);
  }, [s]);

  const remainOf = (x: PomoDoc) => (x.endsAt != null ? Math.max(0, (x.endsAt - Date.now()) / 1000) : x.remain);

  // 끝나는 순간에 한 번만 깨어난다 (예전엔 0.25초마다 들여다봤다 — 그때마다 앱 전체가 다시 그려졌다)
  useEffect(() => {
    if (s.endsAt == null) return;
    const fire = () => {
      if (s.endsAt == null || done.current === s.endsAt) return;
      done.current = s.endsAt;
      const n = nextPomo(s, true, false, Date.now());
      if (s.mode === 'focus') cb.current.onFocusDone(s.endsAt, s.focusMin);
      save(n);
      if (n.endsAt != null) cb.current.onAutoStart(n.mode);
    };
    // 잠든 탭은 타이머가 늦게 깨므로, 돌아왔을 때도 한 번 본다
    const id = setTimeout(fire, Math.max(0, s.endsAt - Date.now()));
    const onVis = () => { if (document.visibilityState === 'visible' && s.endsAt != null && Date.now() >= s.endsAt) fire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(id); document.removeEventListener('visibilitychange', onVis); };
  }, [s, save]);

  const running = s.endsAt != null;
  const total = lenOf(s, s.mode);
  const { focusMin, shortMin, longMin, longEvery, autoStart } = s;
  // 누르는 순간의 남은 시간 — 화면에 그려 둔 숫자가 아니라 지금 시각으로
  const remain = () => remainOf(s);

  return {
    cfg: { focusMin, shortMin, longMin, longEvery, autoStart },
    mode: s.mode, running, total,
    remainAt: (now: number) => (s.endsAt != null ? Math.max(0, (s.endsAt - now) / 1000) : s.remain),
    label: s.mode === 'focus' ? '집중' : s.mode === 'short' ? '짧은 휴식' : '긴 휴식',
    toggle: () => save(running
      ? { ...s, remain: remain(), endsAt: null }
      : { ...s, endsAt: Date.now() + remain() * 1000 }),
    pause: () => { if (running) save({ ...s, remain: remain(), endsAt: null }); },
    skip: () => save(nextPomo({ ...s, remain: remain() }, false, true, Date.now())),
    reset: () => save({ ...s, remain: total, endsAt: null }),
    // v3 setFocusMin — 돌고 있지 않으면 집중으로 새로 맞춘다
    setFocusMin: (n: number) => save(running ? { ...s, focusMin: n } : { ...s, focusMin: n, mode: 'focus', remain: n * 60, endsAt: null }),
    setCfg: (c) => { const n = { ...s, ...c }; save(running || s.remain !== total ? n : { ...n, remain: lenOf(n, s.mode) }); },
  };
}

/** 남은 시간 숫자 — 보여 주는 조각 안에서만 센다. 돌고 있을 때만 0.25초마다 (v3 _loop 박자) */
export function usePomoClock(t: Pomodoro) {
  const now = useTick(250, t.running);
  const remain = t.remainAt(now);
  const sec = Math.max(0, Math.ceil(remain));
  return {
    remain,
    pct: t.total ? 1 - remain / t.total : 0,
    clock: `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
  };
}
