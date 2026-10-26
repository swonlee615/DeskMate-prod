import { useEffect, useState } from 'react';
import { toAuthError, type AuthService, type User } from '../data';

const COOLDOWN = 60;

/** 이메일 가입 직후 — 인증 메일을 누를 때까지 앱을 못 쓴다 */
export function VerifyScreen({ auth, user }: { auth: AuthService; user: User }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wait, setWait] = useState(COOLDOWN); // 가입할 때 한 통 보냈으므로 바로 다시 못 보낸다

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  // 다른 탭이나 폰에서 인증 링크를 누르고 돌아온 경우
  useEffect(() => {
    const onFocus = () => { auth.refresh().catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [auth]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (err) { const e = toAuthError(err); if (e) setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="signin">
      <div className="w-card auth">
        <h1>메일을 확인해 주세요</h1>
        <p className="auth-sub">
          <b>{user.email}</b> 로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 아래 버튼을 눌러 주세요.
          메일이 안 보이면 스팸함도 확인해 주세요.
        </p>
        {msg && <p className={`auth-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>}
        <button className="w-btn w-primary w-wide" disabled={busy} onClick={() => run(async () => {
          await auth.refresh();
          setMsg({ ok: false, text: '아직 인증이 확인되지 않았어요. 메일의 링크를 먼저 눌러 주세요.' });
        })}>
          인증했어요
        </button>
        <div className="auth-links">
          <button className="link" disabled={busy || wait > 0} onClick={() => run(async () => {
            await auth.resendVerification();
            setWait(COOLDOWN);
            setMsg({ ok: true, text: '인증 메일을 다시 보냈어요.' });
          })}>
            {wait > 0 ? `메일 다시 보내기 (${wait}초)` : '메일 다시 보내기'}
          </button>
          <button className="link" onClick={() => auth.signOut()}>다른 계정으로 로그인</button>
        </div>
      </div>
    </div>
  );
}
