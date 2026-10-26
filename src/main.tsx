import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './v3/styles.css';
import './ui/shared.css';

// 화면 파일을 캐시해 두어 오프라인에서도 앱이 열린다. 새 버전이 있으면 자동으로 바뀐다
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
