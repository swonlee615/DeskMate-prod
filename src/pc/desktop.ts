/**
 * PC 앱(Tauri) 창 — 브라우저에서는 아무것도 하지 않는다
 * ★ 맥: 제목 줄을 숨기고 신호등을 화면 위에 얹는다 (v3 Electron hiddenInset 과 같게). 위 띠(--top-strip)를 다시 켠다 → pc.css
 * ★ 창 끌기: WKWebView 는 v3 CSS 의 `-webkit-app-region: drag` 를 모른다. 같은 자리를 여기서 잡아 창을 옮긴다
 */
import { getCurrentWindow } from '@tauri-apps/api/window';
import { deviceKind } from '../data/device';

// v3 styles.css 에서 drag 인 곳 · 그 안에서 no-drag 인 곳
const DRAG = '.top-strip, .rail, .sb-head, .main-head, .panel-head';
const NO_DRAG = 'button, a, input, textarea, select, [contenteditable="true"], .rail > *, .main-head > *, .panel-head > *';

export function initDesktopWindow() {
  if (deviceKind() !== 'desktop') return;
  if (/Mac/.test(navigator.userAgent)) document.documentElement.dataset.mac = '';
  document.addEventListener('mousedown', (e) => {
    const t = e.target as Element;
    if (e.button !== 0 || !t.closest?.(DRAG) || t.closest(NO_DRAG)) return;
    const w = getCurrentWindow();
    void (e.detail === 2 ? w.toggleMaximize() : w.startDragging());
  });
}
