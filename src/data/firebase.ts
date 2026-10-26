/**
 * Firebase 초기화 — 앱 · 로그인 · Firestore 를 한 번만 만든다
 *
 * VITE_FB_EMULATOR=1 이면 로컬 에뮬레이터에 붙는다 (개발 · 시험용)
 */
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore';

/** 기기에 남겨 두는 복사본의 상한. 사용자 데이터 총량의 상한이 아니다 (docs/SYNC.md §1) */
export const CACHE_BYTES = 40 * 1024 * 1024;

export interface Fb { auth: Auth; db: Firestore }

export function initFirebase(options: FirebaseOptions, emulator: boolean): Fb {
  const app = initializeApp(options);
  const auth = getAuth(app);
  auth.languageCode = 'ko'; // 인증 메일 · 비밀번호 재설정 메일을 한국어로
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_BYTES,
    }),
    ignoreUndefinedProperties: true,
  });
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { auth, db };
}
