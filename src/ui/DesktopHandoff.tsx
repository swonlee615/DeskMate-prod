import { useState } from 'react';
import { toAuthError, type AuthService } from '../data';
import type { BrowserProvider } from '../data/desktopLogin';

/**
 * 브라우저 쪽 «PC 앱 로그인» 페이지 — 앱이 `?desktop-login=…` 으로 연다 (data/desktopLogin.ts)
 * ★ 팝업은 버튼을 눌러야 열린다. 그래서 바로 띄우지 않고 버튼 하나를 둔다
 */
export function DesktopHandoff({ auth, state, p }: { auth: AuthService; state: string; p: BrowserProvider }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = p === 'apple' ? 'Apple로 계속하기' : 'Google로 계속하기';

  const go = async () => {
    setBusy(true); setError(null);
    try {
      const u = await auth.desktopHandoff?.(p, state);
      if (u) { setUrl(u); location.href = u; }
    } catch (err) { setError(toAuthError(err)?.message ?? null); }
    finally { setBusy(false); }
  };

  return (
    <div className="signin">
      <div className="w-card auth">
        <h1>DeskMate</h1>
        {!url ? <>
          <p className="auth-sub">PC 앱에 로그인해요. 로그인을 마치면 앱으로 돌아가요.</p>
          <div className="auth-providers">
            <button type="button" className={`w-btn w-provider w-${p}`} disabled={busy} onClick={go}>{label}</button>
          </div>
          {error && <p className="auth-msg err" role="alert">{error}</p>}
        </> : <>
          <p className="auth-sub">로그인했어요. 브라우저가 DeskMate를 열지 물으면 «열기»를 눌러 주세요.</p>
          <div className="auth-providers">
            <a className="w-btn w-provider" href={url}>DeskMate 앱 열기</a>
          </div>
          <p className="auth-msg ok" role="status">앱으로 돌아간 뒤에는 이 탭을 닫아도 돼요.</p>
        </>}
      </div>
    </div>
  );
}
