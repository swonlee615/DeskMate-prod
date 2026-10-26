/**
 * 앱 입구 — 로그인 → 메일 인증 → (PC 화면 | 모바일 화면)
 *
 * 구조 (2026-10-24 결정 — 노션처럼 «속은 하나, 화면은 따로»)
 *   src/domain   근태 규칙 · 재생            PC · 모바일 공통
 *   src/data     로그인 · 저장소 · 동기화      PC · 모바일 공통
 *   src/app      useWorkspace (버튼 동작 · 받아 둘 기간) · 어느 화면을 띄울지
 *   src/ui       로그인 · 계정 · 표기 함수 등 공통 화면 조각
 *   src/pc       PC 화면 — v3 그대로
 *   src/mobile   모바일 화면 — 따로 설계
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { createBackend, needsVerification, type Backend, type User } from './data';
import { AuthScreen } from './ui/AuthScreen';
import { VerifyScreen } from './ui/VerifyScreen';
import { useWorkspace } from './app/useWorkspace';
import { pickPlatform } from './app/platform';

// 한쪽 화면만 내려받는다 — 폰은 PC 화면 코드를 받지 않는다
const PcWorkspace = lazy(() => import('./pc/PcWorkspace').then((m) => ({ default: m.PcWorkspace })));
const MobileWorkspace = lazy(() => import('./mobile/MobileWorkspace').then((m) => ({ default: m.MobileWorkspace })));

const PLATFORM = pickPlatform();

/** v3 화면 모드 — 시스템 설정을 따라간다 (body[data-mode] 하나만 칠한다) */
function useBodyMode() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.body.dataset.mode = mq.matches ? 'dark' : 'light'; };
    document.body.dataset.theme = 'navy';
    document.body.dataset.platform = PLATFORM;
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  useBodyMode();

  useEffect(() => { createBackend().then(setBackend); }, []);
  useEffect(() => {
    if (!backend) return;
    backend.auth.redirectError().then((e) => setRedirectError(e?.message ?? null));
    return backend.auth.watch(setUser);
  }, [backend]);

  if (!backend || user === undefined) return <div className="boot" aria-busy="true" />;
  if (user === null) return <AuthScreen auth={backend.auth} initialError={redirectError} />;
  if (needsVerification(user)) return <VerifyScreen auth={backend.auth} user={user} />;
  return <Workspace key={user.uid} backend={backend} user={user} />;
}

function Workspace({ backend, user }: { backend: Backend; user: User }) {
  const ws = useWorkspace(backend, user);
  return (
    <Suspense fallback={<div className="boot" aria-busy="true" />}>
      {PLATFORM === 'mobile' ? <MobileWorkspace ws={ws} /> : <PcWorkspace ws={ws} />}
    </Suspense>
  );
}
