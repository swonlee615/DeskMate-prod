/**
 * 시계 — «얼마나 자주 다시 그리나» 를 화면 조각마다 따로 정한다
 *
 * ★ 근태 계산(useWorkspace)은 분 단위만 본다 — 근무시간 표기가 분까지라서. 매초 앱 전체를 다시 그리지 않는다
 * ★ 초가 보이는 숫자(휴게 경과 · 타이머)는 그 조각 안에서만 `useTick` 으로 다시 그린다
 */
import { useCallback, useEffect, useState } from 'react';

/** ms 마다 다시 그린다 (켜져 있을 때만). 돌려주는 값은 그때의 Date.now() */
export function useTick(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, ms);
    // 숨겨진 탭은 브라우저가 박자를 늦춘다 — 다시 보이는 순간 바로 맞춘다
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, on]);
  return on ? now : Date.now();
}

/** 분이 바뀌는 순간마다 (정각에 맞춘다). bump — 버튼을 누른 직후처럼 지금 바로 다시 셀 때 */
export function useMinute(): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 60000 - (now % 60000) + 20);
    return () => clearTimeout(id);
  }, [now]);
  const bump = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') bump(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [bump]);
  return [now, bump];
}
