import type { DeviceKind } from '../domain/attendance/types';

const KEY = 'dm.deviceId';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 기기 고유 ID. 처음 열 때 한 번 만들고 그 기기에 남긴다 */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = uuid(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return 'volatile-' + uuid();
  }
}

/**
 * 기기 종류
 * - desktop : PC 앱(Tauri) 안에서 열렸다 → 자동 감지 플러그인을 켠다
 * - mobile  : 폰 · 태블릿 브라우저 / 홈 화면 PWA
 * - browser : PC 브라우저
 */
export function deviceKind(): DeviceKind {
  if (typeof window === 'undefined') return 'browser';
  if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) return 'desktop';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua) || (coarse && /Macintosh/.test(ua))) return 'mobile';
  return 'browser';
}

/** 홈 화면에 추가해서 열었나 (iOS 는 이래야 알림 · 오프라인 저장이 안정적이다) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function newId(): string {
  return uuid();
}
