/**
 * 툴팁 (v3 bindTips) — `data-tip` 을 앱 안의 상자(.tip)로 그린다. `title=` 은 OS 가 늦게 · 따로 그린다
 * ★ 같은 말이면 껐다 켜지 않고 자리만 옮긴다 (v2.9.34) · 아래가 좁으면 위로 · 화면 밖이면 안으로
 * ★ ⓘ 팝오버(.ihost .rtip)는 화면 기준으로 세운다 (v3.1.76)
 */
const TIP = { el: null as HTMLDivElement | null, timer: 0, hideT: 0, cur: null as Element | null, text: '' };

function tipEl() {
  if (!TIP.el) { TIP.el = document.createElement('div'); TIP.el.className = 'tip'; document.body.appendChild(TIP.el); }
  return TIP.el;
}
function tipHide() {
  clearTimeout(TIP.timer); clearTimeout(TIP.hideT); TIP.cur = null; TIP.text = '';
  TIP.el?.classList.remove('on');
}
function tipShow(t: Element) {
  const text = t.getAttribute('data-tip');
  if (!text) return;
  const el = tipEl();
  el.textContent = text;
  TIP.text = text;
  el.classList.add('on');
  const r = t.getBoundingClientRect(), b = el.getBoundingClientRect();
  let x = r.left + r.width / 2 - b.width / 2;
  let y = r.bottom + 7;
  if (y + b.height > window.innerHeight - 6) y = r.top - b.height - 7;
  x = Math.max(6, Math.min(x, window.innerWidth - b.width - 6));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(Math.max(6, y))}px`;
}
function placeRtip(host: Element) {
  const tip = host.querySelector<HTMLElement>('.rtip');
  if (!tip) return;
  const r = host.getBoundingClientRect();
  const w = tip.offsetWidth || 330, h = tip.offsetHeight || 0, M = 8;
  const x = Math.max(M, Math.min(r.left - 9, window.innerWidth - w - M));
  let y = r.bottom + 7;
  if (y + h > window.innerHeight - M) y = Math.max(M, r.top - h - 7);
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
  tip.style.setProperty('--rtip-ax', `${Math.round(Math.max(8, Math.min(r.left + r.width / 2 - x - 4, w - 16)))}px`);
  tip.classList.toggle('up', y < r.top);
}

/** 한 번만 건다 — 떼는 함수를 돌려준다 */
export function bindTips() {
  const over = (e: MouseEvent) => {
    const tg = e.target as Element;
    const ih = tg.closest?.('.ihost');
    if (ih) placeRtip(ih);
    const t = tg.closest?.('[data-tip]');
    if (!t || t === TIP.cur) return;
    if (TIP.el?.classList.contains('on') && TIP.text === t.getAttribute('data-tip')) {
      clearTimeout(TIP.hideT); clearTimeout(TIP.timer);
      TIP.cur = t; tipShow(t);
      return;
    }
    tipHide(); TIP.cur = t;
    TIP.timer = window.setTimeout(() => { if (TIP.cur === t && t.isConnected) tipShow(t); }, 260);
  };
  // 바로 끄지 않는다 — 옆 칸으로 넘어가는 중이면 mouseout 이 mouseover 보다 먼저 온다
  const out = (e: MouseEvent) => {
    const t = (e.target as Element).closest?.('[data-tip]');
    if (t && t === TIP.cur) { clearTimeout(TIP.hideT); TIP.hideT = window.setTimeout(tipHide, 70); }
  };
  const evs = ['scroll', 'mousedown', 'wheel', 'keydown'] as const;
  document.addEventListener('mouseover', over);
  document.addEventListener('mouseout', out);
  for (const ev of evs) window.addEventListener(ev, tipHide, true);
  return () => {
    document.removeEventListener('mouseover', over);
    document.removeEventListener('mouseout', out);
    for (const ev of evs) window.removeEventListener(ev, tipHide, true);
    tipHide();
  };
}
