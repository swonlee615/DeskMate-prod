import { describe, expect, it } from 'vitest';
import { GoogleAuthProvider, OAuthCredential } from 'firebase/auth';
import { handoffUrl } from './desktopLogin';

describe('PC 앱 브라우저 로그인 — 자격을 주소에 실어 보낸다', () => {
  it('deskmate:// 주소로 보낸 자격을 앱에서 그대로 되살린다', () => {
    const c = GoogleAuthProvider.credential('id.tok+en/=', 'acc&ess');
    const q = new URL(handoffUrl('st-1', c)).searchParams;
    expect(q.get('state')).toBe('st-1');
    const back = OAuthCredential.fromJSON(q.get('c')!)!;
    expect(back.providerId).toBe('google.com');
    expect(back.idToken).toBe('id.tok+en/=');
    expect(back.accessToken).toBe('acc&ess');
  });
});
