/**
 * PC 앱 로그인 — 노션처럼 기본 브라우저에서 로그인하고 앱으로 돌아온다 (2026-11-05 소유자)
 * ★ 앱 창(WKWebView · WebView2)에서는 Google 이 로그인을 막는다. 팝업 · 리디렉트도 안 된다
 *
 * 1) 앱: state 를 만들어 기본 브라우저로 `사이트/?desktop-login=state&p=google` 을 연다
 * 2) 브라우저: 그 페이지(ui/DesktopHandoff)에서 팝업으로 로그인 → 자격을 `deskmate://auth?state=…&c=…` 로 넘긴다
 * 3) 앱: 내가 만든 state 일 때만 그 자격으로 로그인한다
 *
 * ponytail: 자격(Google id 토큰, 1시간짜리)을 주소에 실어 보낸다. 서버가 생기면 한 번 쓰는 코드 교환으로
 */
import { OAuthCredential } from 'firebase/auth';

export type BrowserProvider = 'google' | 'apple';

export const HANDOFF_PARAM = 'desktop-login';
const SCHEME = 'deskmate://auth';

/** 브라우저에서 열 사이트 — 개발 실행은 지금 화면 주소, 설치한 앱은 Firebase 호스팅 */
function site(authDomain: string): string {
  return location.protocol.startsWith('http') ? location.origin : `https://${authDomain}`;
}

const pending = new Set<string>();

/** 앱: 브라우저를 연다. 로그인은 돌아왔을 때 listenBrowserLogin 이 마저 한다 */
export async function openBrowserLogin(p: BrowserProvider, authDomain: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  const state = crypto.randomUUID();
  pending.add(state);
  await openUrl(`${site(authDomain)}/?${HANDOFF_PARAM}=${state}&p=${p}`);
}

/** 앱: deskmate://auth 로 돌아온 자격을 받는다. 앱이 켜질 때 한 번 */
export async function listenBrowserLogin(signIn: (c: OAuthCredential) => Promise<unknown>): Promise<void> {
  const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  await onOpenUrl((urls) => {
    for (const u of urls) {
      if (!u.startsWith(SCHEME)) continue;
      const q = new URL(u).searchParams;
      const state = q.get('state') ?? '';
      if (!pending.delete(state)) continue; // 내가 연 로그인이 아니다
      const c = OAuthCredential.fromJSON(q.get('c') ?? '');
      if (c) signIn(c).catch((e) => console.error('브라우저 로그인 실패', e));
    }
  });
}

/** 브라우저: 로그인한 자격을 앱으로 넘길 주소 */
export function handoffUrl(state: string, c: OAuthCredential): string {
  return `${SCHEME}?state=${encodeURIComponent(state)}&c=${encodeURIComponent(JSON.stringify(c.toJSON()))}`;
}

/** 브라우저: 이 페이지가 앱 로그인용으로 열렸나 */
export function handoffRequest(): { state: string; p: BrowserProvider } | null {
  const q = new URLSearchParams(location.search);
  const state = q.get(HANDOFF_PARAM);
  if (!state) return null;
  return { state, p: q.get('p') === 'apple' ? 'apple' : 'google' };
}
