import { describe, expect, it } from 'vitest';
import { nextPomo, POMO_DEFAULT } from './usePomodoro';

const T = 1_700_000_000_000;
const running = { ...POMO_DEFAULT, endsAt: T };

describe('nextPomo — 여러 기기가 같이 넘겨도 같은 값', () => {
  it('집중이 끝나면 짧은 휴식을 «끝난 시각» 에 이어 시작한다', () => {
    const n = nextPomo(running, true, false, T + 300);
    expect(n).toMatchObject({ mode: 'short', cycle: 1, remain: 300, endsAt: T + 300_000 });
    // 다른 기기가 조금 늦게 계산해도 같다
    expect(nextPomo(running, true, false, T + 4000)).toEqual(n);
  });
  it('네 번째 집중 뒤에는 긴 휴식', () => {
    expect(nextPomo({ ...running, cycle: 3 }, true, false, T).mode).toBe('long');
  });
  it('이어 시작할 세션도 이미 지났으면 멈춰 둔다 (켜진 기기가 없던 사이)', () => {
    expect(nextPomo(running, true, false, T + 301_000)).toMatchObject({ mode: 'short', endsAt: null, remain: 300 });
  });
  it('건너뛰기는 자동 시작하지 않는다', () => {
    expect(nextPomo(running, false, true, T).endsAt).toBeNull();
  });
});
