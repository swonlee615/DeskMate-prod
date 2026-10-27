/**
 * D-Day · 습관 창이 함께 쓰는 부품 — 이모지 고르기 · 앱 달력 (v3 ddEmoHtml · ddDrawCal · hbDrawCal)
 * 앱 안에 달력이 두 벌이면 «어느 쪽이 우리 것인가» 가 생긴다 — 한 벌만 둔다
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DOW, dateOf, keyOf } from '../ui/v3fmt';
import { CHEV } from './Worklog';

export const DD_EMO = ['🚀', '📚', '💯', '🎂', '✈️', '📦', '🏁', '💍', '🩺', '🏠', '🎓', '📝', '⭐️'];
const DD_EMO_MORE = [
  '🚀','📚','💯','🎂','✈️','📦','🏁','💍','🩺','🏠','🎓','📝','⭐️','🔥','🎯','🏆',
  '💼','📈','📉','🧾','🗓','⏰','⌛️','🔔','📌','🔖','✅','☑️','❗️','❓','💡','🔧',
  '🧪','🧠','💻','🖥','⌨️','🖱','📱','☎️','📮','📬','🗂','📁','📊','🧮','🔍','🗝',
  '🎉','🎈','🎁','🍰','🍱','🍜','☕️','🍺','🥂','🍎','🥗','🏃','🚴','🏋️','🧘','🛌',
  '🌱','🌷','🌊','⛰','🌙','☀️','❄️','🌈','🐣','🐶','🐱','🦔','🚗','🚌','🚄','🛫',
  '🏥','🏦','🏫','🏢','🛒','💰','💳','🧳','🎫','🪪','⚖️','🤝','👋','🙌','🙏','💬',
];

/** 여러 코드가 붙은 이모지(국기 · 가족)를 반쪽으로 자르지 않는다 — 글자 묶음 하나만 */
const firstGrapheme = (raw: string) => {
  const one = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(raw)][0];
  return (one?.segment ?? raw).slice(0, 8);
};

/** 자주 쓰는 13개 + ＋ 로 여는 판 + 직접 입력. 같은 것을 다시 누르면 «안 쓰기» (v3.1.153) */
export function EmojiField({ id, value, onChange }: { id: 'dd' | 'hb'; value: string; onChange: (v: string) => void }) {
  const [more, setMore] = useState(false);
  const pick = (v: string) => onChange(value === v ? '' : v);
  const row = DD_EMO.includes(value) || !value ? DD_EMO : [value, ...DD_EMO];   // 고른 것이 13개 밖이면 그 자리도 만든다
  return (
    <div className="field">
      <label>이모지</label>
      <div className="dd-emo" id={`${id}Emo`}>
        {row.map((e) => <button key={e} type="button" data-ddemo={e} className={e === value ? 'on' : undefined} onClick={() => pick(e)}>{e}</button>)}
        <button type="button" className={`dd-emo-add${more ? ' on' : ''}`} id={`${id}EmoPlus`} aria-label="이모지 더 고르기" title="더 고르기" onClick={() => setMore((v) => !v)}>＋</button>
      </div>
      {more && (
        <div className="dd-emo-more" id={`${id}EmoMore`}>
          <input id={`${id}EmoIn`} data-emoin placeholder="이모지를 직접 넣어도 돼요" maxLength={8} autoComplete="off" autoFocus
            onChange={(e) => { const v = e.target.value.trim(); if (v) { onChange(firstGrapheme(v)); setMore(false); } }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMore(false); } }} />
          <div className="dd-emo-grid" id={`${id}EmoGrid`}>
            {DD_EMO_MORE.map((e) => <button key={e} type="button" data-ddemo={e} className={e === value ? 'on' : undefined} onClick={() => { pick(e); setMore(false); }}>{e}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** 앱의 달력(.dpick · 240px) 을 단추 아래에 띄운다 — <input type="date"> 는 크로미움이 그려서 앱과 다르다 (v3.1.151 · 156) */
export function DatePick({ id, value, today, min, anchor, onPick, onClose }: {
  id: string; value: string; today: string; min?: string;
  anchor: React.RefObject<HTMLButtonElement | null>; onPick: (k: string) => void; onClose: () => void;
}) {
  const [ym, setYm] = useState(() => { const d = dateOf(value || today); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const ref = useRef<HTMLDivElement>(null);
  const place = () => {
    const box = ref.current, btn = anchor.current;
    if (!box || !btn) return;
    const r = btn.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left))}px`;
    const below = r.bottom + 6;
    box.style.top = `${below + box.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - box.offsetHeight - 6) : below}px`;
  };
  useLayoutEffect(place);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', away, true);
    window.addEventListener('resize', place);
    return () => { document.removeEventListener('mousedown', away, true); window.removeEventListener('resize', place); };
  });
  const y = ym.getFullYear(), m = ym.getMonth();
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="dpick dd-pick" id={id} ref={ref}>
      <div className="dpk-h">
        <button type="button" className="dpk-nav" aria-label="이전 달" onClick={() => setYm(new Date(y, m - 1, 1))}>{CHEV(-1)}</button>
        <b>{y}년 {m + 1}월</b>
        <button type="button" className="dpk-nav" aria-label="다음 달" onClick={() => setYm(new Date(y, m + 1, 1))}>{CHEV(1)}</button>
      </div>
      <div className="dpk-w">{DOW.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="dpk-g">
        {cells.map((d) => {
          const k = keyOf(d);
          return <button key={k} type="button" disabled={!!min && k < min}
            className={`dpk-d${d.getMonth() === m ? '' : ' out'}${k === value ? ' on' : ''}${k === today ? ' today' : ''}`} onClick={() => onPick(k)}>{d.getDate()}</button>;
        })}
      </div>
      <div className="dpk-q"><button type="button" className="dpk-lnk" onClick={() => onPick(today)}>오늘로</button></div>
    </div>
  );
}

/** 적던 것이 있으면 바깥을 눌러도 닫지 않고 알린다 — 흔들림 한 번 (v3.1.158 guardBlock) */
export function shake(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 420);
}
