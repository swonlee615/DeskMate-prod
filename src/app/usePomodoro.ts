/**
 * 뽀모도로 엔진 — v3 `timer.js` 를 React 훅으로 옮긴 것
 *
 * ★ 타이머는 «사람 하나에 하나» 다 (2026-10-27 소유자 — 폰에서 시작하면 PC 에도 그대로 돌아야 한다. SYNC §9).
 *   상태는 문서 하나(`items/pomo`)에 두고, 고칠 때는 바뀐 필드만 보낸다. 남은 시간은 «끝나는 시각» 으로 매번 계산한다.
 * ★ 끝나는 순간은 열려 있는 기기가 모두 알아챈다. 그래서 다음 상태를 «끝난 시각» 에서만 계산한다
 *   (Date.now() 를 쓰지 않는다) — 어느 기기가 몇 번 써도 같은 값이고, 완료 이벤트 id 도 같아서 한 번만 센다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [, tick] = useState(0);
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

  // 돌고 있을 때만 0.25초마다 들여다본다 (v3 _loop 와 같은 박자). 끝났으면 다음 세션으로
  useEffect(() => {
    if (s.endsAt == null) return;
    const id = setInterval(() => {
      if (s.endsAt != null && Date.now() >= s.endsAt) {
        if (done.current === s.endsAt) return;
        done.current = s.endsAt;
        const n = nextPomo(s, true, false, Date.now());
        if (s.mode === 'focus') cb.current.onFocusDone(s.endsAt, s.focusMin);
        save(n);
        if (n.endsAt != null) cb.current.onAutoStart(n.mode);
      } else tick((t) => t + 1);
    }, 250);
    return () => clearInterval(id);
  }, [s, save]);

  const remain = remainOf(s);
  const running = s.endsAt != null;
  const total = lenOf(s, s.mode);
  const sec = Math.max(0, Math.ceil(remain));
  const { focusMin, shortMin, longMin, longEvery, autoStart } = s;

  return {
    cfg: { focusMin, shortMin, longMin, longEvery, autoStart },
    mode: s.mode, running, remain, total,
    pct: total ? 1 - Math.max(0, remain) / total : 0,
    label: s.mode === 'focus' ? '집중' : s.mode === 'short' ? '짧은 휴식' : '긴 휴식',
    clock: `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
    toggle: () => save(running
      ? { ...s, remain, endsAt: null }
      : { ...s, endsAt: Date.now() + remain * 1000 }),
    pause: () => { if (running) save({ ...s, remain, endsAt: null }); },
    skip: () => save(nextPomo({ ...s, remain }, false, true, Date.now())),
    reset: () => save({ ...s, remain: total, endsAt: null }),
    // v3 setFocusMin — 돌고 있지 않으면 집중으로 새로 맞춘다
    setFocusMin: (n: number) => save(running ? { ...s, focusMin: n } : { ...s, focusMin: n, mode: 'focus', remain: n * 60, endsAt: null }),
  };
}
