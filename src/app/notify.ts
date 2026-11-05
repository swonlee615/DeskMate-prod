/**
 * 시스템 알림 (v3 bridge.notify — PC 앱 전용). 설정 › 뽀모도로 › 시스템 알림 이 꺼져 있으면 부르는 쪽에서 안 부른다
 * ★ v3 와 다른 점: Tauri 알림은 단추를 못 단다 (2026-11-06 소유자 — 누르면 앱이 열리는 것으로).
 *   그래서 출근 감지의 답은 앱 안 카드 · 메뉴바에서 한다
 */
import { deviceKind } from '../data/device';

export async function notify(title: string, body: string): Promise<boolean> {
  if (deviceKind() !== 'desktop') return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('notify', { title, body });
    return true;
  } catch {
    return false;
  }
}
