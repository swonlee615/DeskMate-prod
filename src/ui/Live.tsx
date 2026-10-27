/**
 * 초가 보이는 숫자 — 이 조각만 다시 그린다 (앱 전체는 분 단위. src/app/clock.ts)
 */
import { usePomoClock, type Pomodoro } from '../app/usePomodoro';
import { useTick } from '../app/clock';
import { mmss } from './v3fmt';

/** 타이머 남은 시간 «24:10» — PC 머리 미니 타이머 · 모바일 머리 알약 */
export function PomoClock({ t }: { t: Pomodoro }) {
  return <>{usePomoClock(t).clock}</>;
}

/** 그때부터 지금까지 «03:12» — 휴게 경과 */
export function Since({ at }: { at: number }) {
  const now = useTick(1000);
  return <>{mmss(Math.max(0, now - at) / 1000)}</>;
}
