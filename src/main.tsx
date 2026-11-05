import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { deviceKind } from './data/device';
import { initDesktopWindow } from './pc/desktop';
import './v3/styles.css';
import './ui/shared.css';

// 화면 파일을 캐시해 두어 오프라인에서도 앱이 열린다. 새 버전이 있으면 자동으로 바뀐다
// PC 앱은 화면 파일이 앱 안에 들어 있어서 필요 없다 (업데이트는 앱 업데이트로)
if (deviceKind() !== 'desktop') registerSW({ immediate: true });
initDesktopWindow();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
