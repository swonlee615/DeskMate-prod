import { useState } from 'react';
import { toAuthError, type AuthService, type User } from '../data';

const PROVIDER_LABEL: Record<string, string> = { password: '이메일', 'google.com': 'Google', 'apple.com': 'Apple' };
const CONFIRM_WORD = '삭제';

type Step = 'main' | 'delete' | 'reauth';

/** 계정 — 로그아웃 · 계정 삭제 (App Store 심사 요건: 앱 안에서 바로 삭제할 수 있어야 한다) */
export function AccountDialog({ auth, user, pending, onClose }: {
  auth: AuthService; user: User; pending: number; onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('main');
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPassword = user.providers.includes('password');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (err) {
      const e = toAuthError(err);
      if (e?.code === 'auth/requires-recent-login') setStep('reauth');
      else if (e) setError(e.message);
    } finally { setBusy(false); }
  };

  const signOut = () => {
    if (pending > 0 && !confirm(`아직 서버에 안 올라간 기록이 ${pending}건 있어요. 지금 로그아웃하면 이 기록은 사라집니다. 로그아웃할까요?`)) return;
    run(() => auth.signOut());
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="w-modal w-card" role="dialog" aria-modal="true" aria-labelledby="acct-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="acct-title">{step === 'main' ? '계정' : step === 'delete' ? '계정 삭제' : '다시 로그인'}</h2>
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>✕</button>
        </header>

        {step === 'main' && <>
          <dl className="acct">
            <div><dt>이름</dt><dd>{user.name ?? '—'}</dd></div>
            <div><dt>이메일</dt><dd>{user.email ?? '—'}</dd></div>
            <div><dt>로그인 방식</dt><dd>{user.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(' · ') || '—'}</dd></div>
          </dl>
          {error && <p className="auth-msg err" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="w-btn" disabled={busy} onClick={signOut}>로그아웃</button>
          </div>
          <div className="danger-zone">
            <button className="link danger" onClick={() => setStep('delete')}>계정 삭제</button>
          </div>
        </>}

        {step === 'delete' && <>
          <p className="modal-text">
            계정과 모든 기록이 서버와 모든 기기에서 지워집니다. <b>되돌릴 수 없어요.</b>
          </p>
          <label className="w-field">
            <span>확인을 위해 <b>{CONFIRM_WORD}</b> 를 입력해 주세요</span>
            <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="auth-msg err" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="w-btn" onClick={() => { setStep('main'); setWord(''); setError(null); }}>취소</button>
            <button className="w-btn w-danger-fill" disabled={busy || word.trim() !== CONFIRM_WORD}
              onClick={() => run(() => auth.deleteAccount())}>
              계정 삭제
            </button>
          </div>
        </>}

        {step === 'reauth' && <>
          <p className="modal-text">보안을 위해 다시 로그인한 뒤 계정을 삭제합니다.</p>
          {isPassword && (
            <label className="w-field">
              <span>비밀번호</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          )}
          {error && <p className="auth-msg err" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="w-btn" onClick={() => setStep('delete')}>뒤로</button>
            <button className="w-btn w-danger-fill" disabled={busy || (isPassword && !password)}
              onClick={() => run(async () => {
                await auth.reauth(isPassword ? password : undefined);
                await auth.deleteAccount();
              })}>
              {isPassword ? '확인하고 삭제' : `${PROVIDER_LABEL[user.providers[0]] ?? ''}로 다시 로그인하고 삭제`}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}
