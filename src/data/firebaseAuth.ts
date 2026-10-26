/**
 * Firebase 로그인
 *
 * - 팝업이 기본. 홈 화면 PWA(iOS)는 팝업이 막히는 경우가 있어 리디렉트로 연다
 * - 이메일 가입 → 인증 메일 발송. 인증 전에는 앱을 못 쓴다 (서버 규칙도 같이 막는다 — firestore.rules)
 * - 계정 삭제는 서버 데이터를 먼저 지우고 계정을 지운다
 */
import {
  GoogleAuthProvider, OAuthProvider, EmailAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  sendEmailVerification, sendPasswordResetEmail,
  reauthenticateWithCredential, reauthenticateWithPopup, reauthenticateWithRedirect,
  onAuthStateChanged, deleteUser, signOut as fbSignOut,
  type AuthProvider, type User as FbUser,
} from 'firebase/auth';
import { clearIndexedDbPersistence, collection, getDocs, terminate, writeBatch } from 'firebase/firestore';
import type { Fb } from './firebase';
import { AuthError, toAuthError, validateSignUp, type AuthService, type ProviderId, type User } from './auth';
import { isStandalone } from './device';

function toUser(u: FbUser): User {
  return {
    uid: u.uid,
    name: u.displayName,
    email: u.email,
    emailVerified: u.emailVerified,
    providers: u.providerData.map((p) => p.providerId as ProviderId),
  };
}

function google(): AuthProvider {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

function apple(): AuthProvider {
  const p = new OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  p.setCustomParameters({ locale: 'ko_KR' });
  return p;
}

/** Firebase 오류를 한국어 AuthError 로. 사람이 창을 닫은 경우는 조용히 끝낸다 */
async function wrap<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const e = toAuthError(err);
    if (e) throw e;
    return undefined;
  }
}

export function createFirebaseAuth({ auth, db }: Fb): AuthService {
  const listeners = new Set<(u: User | null) => void>();
  const emit = () => {
    const u = auth.currentUser ? toUser(auth.currentUser) : null;
    listeners.forEach((cb) => cb(u));
  };
  onAuthStateChanged(auth, emit);

  // 리디렉트로 돌아온 경우의 오류를 놓치지 않는다 (iOS 홈 화면 PWA)
  const redirectP = getRedirectResult(auth).then(() => null, (err) => toAuthError(err));

  const viaProvider = (provider: AuthProvider) => wrap(async () => {
    if (isStandalone()) { await signInWithRedirect(auth, provider); return; }
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, provider);
      else throw err;
    }
  });

  const current = () => {
    if (!auth.currentUser) throw new AuthError('auth/no-user', '로그인이 필요해요.');
    return auth.currentUser;
  };

  return {
    mode: 'cloud',

    watch(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },

    redirectError: () => redirectP,

    async google() { await viaProvider(google()); },
    async apple() { await viaProvider(apple()); },

    async emailSignUp(name, email, password) {
      const msg = validateSignUp(name, email, password);
      if (msg) throw new AuthError('auth/validation', msg);
      await wrap(async () => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        await sendEmailVerification(cred.user);
        emit(); // displayName 반영
      });
    },

    async emailSignIn(email, password) {
      await wrap(() => signInWithEmailAndPassword(auth, email.trim(), password));
    },

    async resetPassword(email) {
      // 가입 여부와 상관없이 같은 안내를 한다 — 가입된 이메일을 알아내는 데 쓰이지 않게
      await wrap(() => sendPasswordResetEmail(auth, email.trim()));
    },

    async resendVerification() {
      await wrap(() => sendEmailVerification(current()));
    },

    async refresh() {
      await wrap(async () => {
        await current().reload();
        await current().getIdToken(true); // 서버 규칙이 email_verified 를 새 값으로 보게
        emit();
      });
    },

    async signOut() {
      await fbSignOut(auth);
      // 이 기기에 남은 복사본을 지운다 — 같은 기기를 다른 사람이 쓸 수 있으므로.
      // 아직 안 올라간 기록이 있으면 화면이 먼저 확인을 받는다 (AccountDialog)
      try { await terminate(db); await clearIndexedDbPersistence(db); } catch { /* 다른 탭이 열려 있으면 실패 — 다음 실행 때 서버 기준으로 다시 맞춰진다 */ }
      location.reload();
    },

    async reauth(password) {
      const u = current();
      const providers = u.providerData.map((p) => p.providerId);
      await wrap(async () => {
        if (providers.includes('password') && password != null) {
          await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', password));
          return;
        }
        const p = providers.includes('apple.com') ? apple() : google();
        if (isStandalone()) await reauthenticateWithRedirect(u, p);
        else await reauthenticateWithPopup(u, p);
      });
    },

    async deleteAccount() {
      const u = current();
      if (!navigator.onLine) throw new AuthError('auth/network-request-failed', '계정 삭제는 온라인에서만 할 수 있어요.');
      // 데이터를 지운 뒤 계정 삭제가 «최근 로그인 아님» 으로 막히면 반쪽만 지워진다 → 먼저 확인한다.
      // Firebase 는 대략 5분이 지나면 다시 로그인을 요구한다. 여유를 두고 4분
      const last = Date.parse(u.metadata.lastSignInTime ?? '');
      if (!(Date.now() - last < 4 * 60_000)) {
        throw new AuthError('auth/requires-recent-login', '보안을 위해 다시 로그인한 뒤 진행해 주세요.');
      }
      await wrap(async () => {
        // 1) 서버 데이터 — 500건씩 나눠 지운다 (한 번에 쓸 수 있는 최대치)
        const snap = await getDocs(collection(db, 'users', u.uid, 'events'));
        for (let i = 0; i < snap.docs.length; i += 500) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        // 2) 계정 — 최근 로그인이 아니면 여기서 auth/requires-recent-login
        await deleteUser(u);
        try { await terminate(db); await clearIndexedDbPersistence(db); } catch { /* 위와 같음 */ }
        location.reload();
      });
    },
  };
}
