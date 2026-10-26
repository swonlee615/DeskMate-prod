import { useState, type FormEvent } from 'react';
import { MIN_PASSWORD, toAuthError, type AuthService } from '../data';

type Mode = 'login' | 'signup' | 'reset';

/**
 * 화면에 보일 로그인 방식. 코드는 셋 다 있고, 여기서 켜고 끈다 (.env.local 의 VITE_AUTH_PROVIDERS)
 * 2026-10-23 소유자: 우선 Google 만 — Apple 은 개발자 계정이 생기면, 이메일은 약관 · 동의 화면과 함께
 */
const PROVIDERS = new Set(String(import.meta.env.VITE_AUTH_PROVIDERS || 'google').split(',').map((x) => x.trim()));
const SHOW_EMAIL = PROVIDERS.has('email');

/**
 * 로그인 · 가입 · 비밀번호 재설정
 *
 * ⚠️ Apple · Google 버튼은 출시 전에 각 회사가 배포하는 공식 버튼 이미지로 바꿔야 한다
 *    (Apple HIG «Sign in with Apple», Google «Sign-in branding guidelines»). docs/RELEASE.md
 */
export function AuthScreen({ auth, initialError }: { auth: AuthService; initialError?: string | null }) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (err) { setError(toAuthError(err)?.message ?? null); }
    finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'login') run(() => auth.emailSignIn(email, password));
    else if (mode === 'signup') run(() => auth.emailSignUp(name, email, password));
    else run(async () => {
      await auth.resetPassword(email);
      setInfo('가입된 이메일이면 비밀번호 재설정 메일이 갔어요. 메일함을 확인해 주세요.');
    });
  };

  const go = (m: Mode) => { setMode(m); setError(null); setInfo(null); };

  return (
    <div className="signin">
      <div className="w-card auth">
        <h1>DeskMate</h1>
        <p className="auth-sub">
          {mode === 'login' && !SHOW_EMAIL && 'Google 계정으로 시작합니다. PC와 폰에서 같은 기록을 씁니다.'}
          {mode === 'login' && SHOW_EMAIL && '로그인하면 PC와 폰에서 같은 기록을 씁니다.'}
          {mode === 'signup' && '계정을 만들면 PC와 폰에서 같은 기록을 씁니다.'}
          {mode === 'reset' && '가입한 이메일로 비밀번호 재설정 링크를 보내 드려요.'}
        </p>

        {mode !== 'reset' && <>
          <div className="auth-providers">
            {PROVIDERS.has('apple') && (
              <button type="button" className="w-btn w-provider w-apple" disabled={busy} onClick={() => run(() => auth.apple())}>
                Apple로 계속하기
              </button>
            )}
            {PROVIDERS.has('google') && (
              <button type="button" className="w-btn w-provider w-google" disabled={busy} onClick={() => run(() => auth.google())}>
                Google로 계속하기
              </button>
            )}
          </div>
          {SHOW_EMAIL && <div className="auth-or"><span>또는 이메일로</span></div>}
        </>}
        {!SHOW_EMAIL && error && <p className="auth-msg err" role="alert">{error}</p>}
        {SHOW_EMAIL && <>

        <form onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <label className="w-field">
              <span>이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="w-field">
            <span>이메일</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" inputMode="email" autoCapitalize="off" required />
          </label>
          {mode !== 'reset' && (
            <label className="w-field">
              <span>비밀번호{mode === 'signup' && <em> · {MIN_PASSWORD}자 이상</em>}</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? MIN_PASSWORD : undefined} required />
            </label>
          )}

          {error && <p className="auth-msg err" role="alert">{error}</p>}
          {info && <p className="auth-msg ok" role="status">{info}</p>}

          <button className="w-btn w-primary w-wide" disabled={busy}>
            {mode === 'login' && '로그인'}
            {mode === 'signup' && '가입하기'}
            {mode === 'reset' && '재설정 메일 보내기'}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'login' && <>
            <button className="link" onClick={() => go('reset')}>비밀번호를 잊으셨나요?</button>
            <span>계정이 없으신가요? <button className="link" onClick={() => go('signup')}>가입하기</button></span>
          </>}
          {mode === 'signup' && <span>이미 계정이 있으신가요? <button className="link" onClick={() => go('login')}>로그인</button></span>}
          {mode === 'reset' && <button className="link" onClick={() => go('login')}>로그인으로 돌아가기</button>}
        </div>
        </>}
      </div>
    </div>
  );
}
