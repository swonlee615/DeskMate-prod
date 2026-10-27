import type { AuthService, User } from './auth';
import type { Repo } from './repo';
import { createLocalRepo } from './localRepo';

export type { Repo, SyncStatus, DayEvents, Item } from './repo';
export type { AuthService, User } from './auth';
export { needsVerification, toAuthError, AuthError, MIN_PASSWORD } from './auth';

export interface Backend {
  mode: 'cloud' | 'local';
  auth: AuthService;
  /** 로그인한 사용자의 저장소 */
  repoFor(u: User): Repo;
}

const env = import.meta.env;

/** .env.local 에 Firebase 값이 있으면 cloud, 없으면 개발용(로그인 없이 이 기기에만 저장) */
let once: Promise<Backend> | null = null;
/** 한 번만 만든다 — 개발 모드(StrictMode)는 effect 를 두 번 돌리는데, Firestore 는 두 번 초기화하면 오류가 난다 */
export function createBackend(): Promise<Backend> {
  return (once ??= makeBackend());
}

async function makeBackend(): Promise<Backend> {
  if (env.VITE_FB_API_KEY && env.VITE_FB_PROJECT_ID) {
    const [{ initFirebase }, { createFirebaseAuth }, { createFirestoreRepo }] = await Promise.all([
      import('./firebase'), import('./firebaseAuth'), import('./firestoreRepo'),
    ]);
    const fb = initFirebase({
      apiKey: env.VITE_FB_API_KEY,
      authDomain: env.VITE_FB_AUTH_DOMAIN,
      projectId: env.VITE_FB_PROJECT_ID,
      appId: env.VITE_FB_APP_ID,
    }, env.VITE_FB_EMULATOR === '1');
    return { mode: 'cloud', auth: createFirebaseAuth(fb), repoFor: (u) => createFirestoreRepo(fb.db, u.uid) };
  }
  return { mode: 'local', auth: devAuth(), repoFor: () => createLocalRepo() };
}

/** 개발용 — 로그인 없이 바로 들어간다. 출시 빌드에는 Firebase 설정이 반드시 있어야 한다 */
function devAuth(): AuthService {
  const user: User = { uid: 'local', name: null, email: null, emailVerified: true, providers: [] };
  const noop = async () => {};
  return {
    mode: 'local',
    watch(cb) { cb(user); return () => {}; },
    redirectError: async () => null,
    google: noop, apple: noop, emailSignUp: noop, emailSignIn: noop, resetPassword: noop,
    resendVerification: noop, refresh: noop, signOut: noop, reauth: noop,
    async deleteAccount() { localStorage.clear(); location.reload(); },
  };
}
