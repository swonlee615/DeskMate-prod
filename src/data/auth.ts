/**
 * 로그인 계약 — 화면은 이 인터페이스만 안다
 *
 * 방식: Google · Apple · 이메일(비밀번호)
 * 이메일 가입은 인증 메일을 확인해야 앱을 쓸 수 있다 (needsVerification)
 *
 * 이메일 «링크» 로그인(비밀번호 없이)은 쓰지 않는다 — iOS 에서 홈 화면 PWA 로 쓰는 사람이
 * 메일의 링크를 누르면 PWA 가 아니라 Safari 가 열려서, 로그인이 PWA 에 안 남는다.
 */

export type ProviderId = 'password' | 'google.com' | 'apple.com';

export interface User {
  uid: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  providers: ProviderId[];
}

export interface AuthService {
  readonly mode: 'cloud' | 'local';
  watch(cb: (u: User | null) => void): () => void;
  /** 리디렉트 로그인에서 돌아왔을 때 생긴 오류 (없으면 null) */
  redirectError(): Promise<AuthError | null>;

  google(): Promise<void>;
  apple(): Promise<void>;
  emailSignUp(name: string, email: string, password: string): Promise<void>;
  emailSignIn(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;

  resendVerification(): Promise<void>;
  /** 인증 메일을 눌렀는지 서버에서 다시 확인한다 */
  refresh(): Promise<void>;

  signOut(): Promise<void>;
  /** 다시 로그인 (계정 삭제처럼 최근 로그인이 필요한 작업 전). 비밀번호 계정은 password 를 준다 */
  reauth(password?: string): Promise<void>;
  /** 계정과 서버의 모든 데이터를 지운다. 되돌릴 수 없다 */
  deleteAccount(): Promise<void>;
}

/** 이메일 가입인데 아직 인증 메일을 안 눌렀다 */
export function needsVerification(u: User): boolean {
  return !u.emailVerified && u.providers.length > 0 && u.providers.every((p) => p === 'password');
}

export const MIN_PASSWORD = 8;

/** 화면에 그대로 보여 줄 수 있는 오류 */
export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': '이메일 형식이 맞지 않아요.',
  'auth/missing-email': '이메일을 입력해 주세요.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/weak-password': `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`,
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/user-disabled': '사용이 중지된 계정이에요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.',
  'auth/network-request-failed': '인터넷에 연결되어 있지 않아요. 로그인은 온라인에서 해 주세요.',
  'auth/popup-blocked': '팝업이 막혀 있어요. 브라우저에서 팝업을 허용해 주세요.',
  'auth/account-exists-with-different-credential':
    '이 이메일은 다른 방법으로 가입되어 있어요. 처음 가입한 방법으로 로그인해 주세요.',
  'auth/credential-already-in-use': '이 계정은 이미 다른 DeskMate 계정에 연결되어 있어요.',
  'auth/requires-recent-login': '보안을 위해 다시 로그인한 뒤 진행해 주세요.',
  'auth/operation-not-allowed': '이 로그인 방식이 아직 켜져 있지 않아요. (Firebase 콘솔 → Authentication 에서 사용 설정)',
  'auth/unauthorized-domain': '이 주소에서는 로그인할 수 없어요. (Firebase 콘솔 → 승인된 도메인에 추가)',
};

/** 사람이 창을 닫은 경우 — 오류로 보여 주지 않는다 */
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

export function toAuthError(err: unknown): AuthError | null {
  const code = (err as { code?: string })?.code ?? 'unknown';
  if (SILENT.has(code)) return null;
  if (err instanceof AuthError) return err;
  return new AuthError(code, MESSAGES[code] ?? '로그인 중에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.');
}

export function validateSignUp(name: string, email: string, password: string): string | null {
  if (!name.trim()) return '이름을 입력해 주세요.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return MESSAGES['auth/invalid-email'];
  if (password.length < MIN_PASSWORD) return MESSAGES['auth/weak-password'];
  return null;
}
