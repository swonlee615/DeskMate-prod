import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: 화면 파일을 서비스 워커가 캐시해서 비행기 모드에서도 앱이 열린다.
// 데이터의 오프라인 저장은 Firestore 캐시(또는 로컬 저장소)가 따로 맡는다 — src/data
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Firebase 로그인 창(/__/auth/handler)은 앱 화면으로 바꿔치지 않는다.
      // 바꾸면 팝업에 «Google로 계속하기» 만 다시 떠서 로그인이 끝나지 않는다 (2026-11-10)
      workbox: { navigateFallbackDenylist: [/^\/__\//] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'DeskMate',
        short_name: 'DeskMate',
        description: '동료와 함께 출근하는 뽀모도로 업무 툴',
        lang: 'ko',
        theme_color: '#121835',
        background_color: '#1b1d21',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // LOGIC.md §4-9 — 타임스탬프는 반드시 KST 로 본다
    env: { TZ: 'Asia/Seoul' },
  },
});
