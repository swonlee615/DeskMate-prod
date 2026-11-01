import { useEffect, useRef } from 'react';

/**
 * 목록 끝이 보이면 더 받는다 — 끝에 둘 빈 칸의 ref 를 돌려준다. on 이 false 면 멈춘다 (다 받았다)
 * 화면에 들어오는지(IntersectionObserver)와 굴릴 때마다의 위치를 둘 다 본다 — 한쪽이 안 와도 받는다
 */
export function useMoreOnView(more: () => void, on: boolean, deps: unknown = null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    const near = () => { if (el.getBoundingClientRect().top < window.innerHeight + 600) more(); };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) more(); }, { rootMargin: '600px' }) : null;
    io?.observe(el);
    near();
    window.addEventListener('scroll', near, { capture: true, passive: true });
    return () => { io?.disconnect(); window.removeEventListener('scroll', near, { capture: true }); };
  }, [more, on, deps]);
  return ref;
}
