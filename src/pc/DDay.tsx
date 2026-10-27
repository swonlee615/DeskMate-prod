/**
 * D-Day — 세 자리 (v3 app.js ddRowHtml · ddFullHtml · ddDayHtml · openDDay, v3.1.149 ~ 3.1.227)
 *   전체 뷰 캘린더 아래 · 주간 플래너 오른쪽(.wp-ddc) · 일간 상세 오른쪽 열
 * 줄을 누르면 창 하나(DDayModal)가 열린다 — 여는 길이 셋이어도 창은 하나. 스타일은 v3 styles.css
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { DD_MAX_NOTE, DD_MAX_TITLE, DD_PIN_MAX, ddDateLabel, ddDiff, ddLabel, ddLive, ddOfDay, ddPinned, type DDay } from '../domain/dday';
import { DOW, dateOf, keyOf } from '../ui/v3fmt';
import { CHEV } from './Worklog';

/** 창을 여는 손잡이 — null = 새로 만들기 */
export type OpenDDay = (it: DDay | null) => void;

const sub = (it: DDay) => {
  const d = dateOf(it.date);
  return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})${it.note ? ` · ${it.note}` : ''}`;
};

/** 줄 하나 — 여러 자리가 같은 함수로 그린다 */
function DDayRow({ it, today, onOpen }: { it: DDay; today: string; onOpen: () => void }) {
  const n = ddDiff(it.date, today);
  const cls = 'dd-row' + (n === 0 ? ' today' : n > 0 && n <= 3 ? ' near' : n < 0 ? ' past' : '') + (it.pinned ? ' pinned' : '');
  return (
    <button className={cls} data-ddedit={it.id} title={`${it.title}\n${sub(it)}${it.pinned ? '\n고정 — 날마다 맨 위에 뜹니다' : ''}`} onClick={onOpen}>
      {it.emoji && <span className="dd-em">{it.emoji}</span>}
      <span className="dd-b"><span className="dd-t">{it.title}</span><span className="dd-s">{sub(it)}</span></span>
      <span className="dd-n">{ddLabel(it.date, today)}</span>
    </button>
  );
}

const DD_PER = 6;

/** 전체 뷰 · 주간 — 6개씩 한 쪽, 넘치면 점 · 휠 · 끌기로 넘긴다 */
export function DDayBox({ ws, onOpen }: { ws: Workspace; onOpen: OpenDDay }) {
  const all = ddLive(ws.ddays, ws.today);
  const pages: DDay[][] = [];
  for (let i = 0; i < all.length; i += DD_PER) pages.push(all.slice(i, i + DD_PER));
  if (!pages.length) pages.push([]);
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pages.length - 1);
  const ref = useRef<HTMLDivElement>(null);
  const panAt = usePan(ref, setPage);
  const go = (i: number) => { setPage(i); const el = ref.current; if (el) el.scrollLeft = i * el.clientWidth; };
  const open = (it: DDay) => { if (Date.now() - panAt.current < 260) return; onOpen(it); };   // 끌고 난 직후의 클릭은 여는 게 아니다
  return (
    <div className="dd" id="ddFull">
      <div className="dd-h">
        <div className="seg dd-seg" id="ddSeg" role="tablist">
          <button type="button" role="tab" className="on" data-ddtab="dday" aria-selected="true">D-Day</button>
        </div>
        <span className="sp" />
        <button className="dd-mini" data-ddnew="1" title="D-Day 추가" onClick={() => onOpen(null)}>＋</button>
      </div>
      <div className="dd-pages" id="ddPages" ref={ref}>
        {pages.map((p, i) => (
          <div key={i} className="dd-page">
            {p.length ? p.map((it) => <DDayRow key={it.id} it={it} today={ws.today} onOpen={() => open(it)} />)
              : <p className="dd-empty">다가오는 날을 하나 적어 두면 여기서 며칠 남았는지 보여드려요.</p>}
          </div>
        ))}
      </div>
      {/* 쪽이 하나여도 점 줄의 «자리» 는 둔다 — 탭을 바꿀 때 상자 높이가 출렁이지 않게 (v3.1.238) */}
      {pages.length > 1
        ? <div className="dd-ind" id="ddInd">{pages.map((_, i) => (
            <button key={i} data-ddpage={i} className={i === cur ? 'on' : undefined} aria-label={`${i + 1}쪽`} onClick={() => go(i)} />
          ))}<span className="cnt">{all.length}개</span></div>
        : <div className="dd-ind ph" aria-hidden="true"><span className="cnt">&nbsp;</span></div>}
    </div>
  );
}

/** 쪽 넘기기 — 휠(세로 → 가로) · 4px 넘게 끌기 · 스크롤 위치로 점 맞추기. 끌기를 끝낸 시각을 돌려준다 */
function usePan(ref: React.RefObject<HTMLDivElement | null>, setPage: (i: number) => void) {
  const at = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let p: { x: number; left: number; moved: boolean } | null = null;
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const down = (e: PointerEvent) => { if (!e.button) p = { x: e.clientX, left: el.scrollLeft, moved: false }; };
    const move = (e: PointerEvent) => {
      if (!p) return;
      const dx = e.clientX - p.x;
      if (!p.moved && Math.abs(dx) < 4) return;
      p.moved = true;
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = p.left - dx;
    };
    const end = () => {
      if (!p) return;
      const moved = p.moved;
      p = null;
      if (!moved) return;
      at.current = Date.now();
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      el.style.scrollBehavior = 'smooth';
      el.scrollLeft = i * w;
      setPage(i);
      setTimeout(() => { el.style.scrollSnapType = 'x mandatory'; }, 260);
    };
    const scroll = () => { const w = el.clientWidth; if (w) setPage(Math.round(el.scrollLeft / w)); };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(k, end);
    el.addEventListener('scroll', scroll);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      for (const k of ['pointerup', 'pointercancel', 'pointerleave']) el.removeEventListener(k, end);
      el.removeEventListener('scroll', scroll);
    };
  }, [ref, setPage]);
  return at;
}

/** 일간 상세 — 고정한 것 + 그 날의 것. 셈은 언제나 오늘 기준. 둘 다 없으면 구분선도 없다 */
export function DDayLines({ ws, date, onOpen }: { ws: Workspace; date: string; onOpen: OpenDDay }) {
  const list = ddOfDay(ws.ddays, date);
  if (!list.length) return null;
  return (
    <>
      <div className="dv"><span>D-Day</span></div>
      {list.map((it) => {
        const isToday = it.date === ws.today;
        return (
          <button key={it.id} type="button" className={`dday-line${isToday ? ' today' : ''}${it.pinned ? ' pin' : ''}`} data-ddedit={it.id} onClick={() => onOpen(it)}>
            {it.emoji && <span className="dl-em">{it.emoji}</span>}
            <span className="dl-b"><b>{it.title}</b><span className="dl-s">{sub(it)}</span></span>
            <em>{isToday ? '오늘' : ddLabel(it.date, ws.today)}</em>
          </button>
        );
      })}
    </>
  );
}

// ───────────────────────────────────────────── 창 (v3 #ddModal)

const DD_EMO = ['🚀', '📚', '💯', '🎂', '✈️', '📦', '🏁', '💍', '🩺', '🏠', '🎓', '📝', '⭐️'];
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

/**
 * @param it 고칠 것. null 이면 새로 만든다
 * @param date 새로 만들 때 처음 날짜 (열어 둔 날 · 없으면 오늘)
 */
export function DDayModal({ ws, it, date, onClose }: { ws: Workspace; it: DDay | null; date: string; onClose: () => void }) {
  // 고정 · 아카이브는 바로 저장된다 — 열어 둔 사이에 바뀐 값을 읽는다
  const live = it ? ws.ddays.find((x) => x.id === it.id) ?? it : null;
  const [emoji, setEmoji] = useState(it ? it.emoji : DD_EMO[0]);
  const [title, setTitle] = useState(it?.title ?? '');
  const [note, setNote] = useState(it?.note ?? '');
  const [day, setDay] = useState(it?.date ?? date);
  const [more, setMore] = useState(false);
  const [cal, setCal] = useState(false);
  const [msg, setMsg] = useState('');
  // 아카이브하면 고정이 풀린다. 같은 창에서 다시 끄면 풀렸던 고정을 되살린다 (v3.1.227)
  const pinBefore = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateBtn = useRef<HTMLButtonElement>(null);
  const snap = useRef(`${emoji}|${title}|${note}|${day}`);
  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 30); }, []);

  const archived = !!live?.archivedAt;
  const pinned = !!live?.pinned;
  const nPin = ddPinned(ws.ddays).length;
  const pinFull = !pinned && nPin >= DD_PIN_MAX;

  // 적던 것이 있으면 바깥을 눌러도 닫지 않고 알린다 (v3.1.158)
  const tryClose = () => {
    if (`${emoji}|${title}|${note}|${day}` === snap.current) { onClose(); return; }
    const m = boxRef.current;
    if (m) { m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); setTimeout(() => m.classList.remove('shake'), 420); }
    ws.warn('적던 내용이 있어요 — 닫으려면 «취소» 를 눌러 주세요');
  };
  const save = () => {
    if (!title.trim()) { nameRef.current?.focus(); setMsg('무엇을 기다리는 날인지 적어 주세요.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { setCal(true); setMsg('날짜를 골라 주세요.'); return; }
    if (!ws.saveDDay(it?.id ?? null, { emoji, title, note, date: day })) { setMsg('저장하지 못했어요.'); return; }
    onClose();
  };
  const togglePin = () => { if (live && !pinFull) ws.pinDDay(live.id, !pinned); };
  const toggleArch = () => {
    if (!live) return;
    if (archived) {
      ws.archiveDDay(live.id, false);
      if (pinBefore.current) ws.pinDDay(live.id, true);
      pinBefore.current = false;
    } else {
      pinBefore.current = pinned;
      ws.archiveDDay(live.id, true);
    }
  };
  const pickEmo = (v: string) => setEmoji((e) => (e === v ? '' : v));   // 같은 것을 다시 누르면 «안 쓰기»
  const row = DD_EMO.includes(emoji) || !emoji ? DD_EMO : [emoji, ...DD_EMO];   // 고른 것이 열세 개 밖이면 그 자리도 만든다

  return (
    <div className="modal-bg open" id="ddModal" onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (cal) setCal(false); else onClose(); }
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLElement).id !== 'ddEmoIn') { e.preventDefault(); save(); }
      }}>
      <div className="modal" ref={boxRef} style={{ width: 'min(384px,92vw)' }}>
        <h3 id="ddTitle">{it ? 'D-Day 수정' : 'D-Day 추가'}</h3>
        <div className="modal-body">
          <div className="field">
            <label>이모지</label>
            <div className="dd-emo" id="ddEmo">
              {row.map((e) => <button key={e} type="button" data-ddemo={e} className={e === emoji ? 'on' : undefined} onClick={() => pickEmo(e)}>{e}</button>)}
              <button type="button" className={`dd-emo-add${more ? ' on' : ''}`} id="ddEmoPlus" aria-label="이모지 더 고르기" title="더 고르기" onClick={() => setMore((v) => !v)}>＋</button>
            </div>
            {more && (
              <div className="dd-emo-more" id="ddEmoMore">
                <input id="ddEmoIn" placeholder="이모지를 직접 넣어도 돼요" maxLength={8} autoComplete="off" autoFocus
                  onChange={(e) => { const v = e.target.value.trim(); if (v) { setEmoji(firstGrapheme(v)); setMore(false); } }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMore(false); } }} />
                <div className="dd-emo-grid" id="ddEmoGrid">
                  {DD_EMO_MORE.map((e) => <button key={e} type="button" data-ddemo={e} className={e === emoji ? 'on' : undefined} onClick={() => { pickEmo(e); setMore(false); }}>{e}</button>)}
                </div>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="ddName">타이틀</label>
            <input id="ddName" ref={nameRef} placeholder="예 · 제품 릴리스" maxLength={DD_MAX_TITLE} autoComplete="off" value={title} onChange={(e) => { setTitle(e.target.value); setMsg(''); }} />
          </div>
          <div className="field">
            <label htmlFor="ddNote">설명</label>
            <input id="ddNote" placeholder="간단한 설명을 입력하세요" maxLength={DD_MAX_NOTE} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label>기준 날짜</label>
            <button className={`dd-date${cal ? ' on' : ''}`} id="ddDateBtn" type="button" ref={dateBtn} onClick={() => setCal((v) => !v)}>
              <span id="ddDateTx">{ddDateLabel(day, ws.today)}</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2.2" /><path d="M3 8.4h14M7 3v3M13 3v3" /></svg>
            </button>
            <div className={`ses-msg${msg ? ' bad' : ''}`} id="ddMsg">{msg}</div>
          </div>
          {live && !archived && (
            <div className={`dd-arch dd-pinrow${pinned ? ' on' : ''}${pinFull ? ' full' : ''}`} id="ddPinRow" onClick={(e) => { if (!(e.target as HTMLElement).closest('#ddPin')) togglePin(); }}>
              <span className="dd-pinmk" aria-hidden="true">📌</span>
              <div className="tx"><b>날마다 보이게 고정</b><span id="ddPinNote">{pinFull ? `이미 ${DD_PIN_MAX}개를 고정했어요 — 하나를 풀어야 켤 수 있어요` : `${nPin}/${DD_PIN_MAX} 사용 중`}</span></div>
              <button className="tgl" id="ddPin" type="button" role="switch" aria-checked={pinned} aria-label="날마다 보이게 고정" disabled={pinFull} onClick={togglePin} />
            </div>
          )}
          {live && (
            <div className={`dd-arch${archived ? ' on' : ''}`} id="ddArchRow" onClick={(e) => { if (!(e.target as HTMLElement).closest('#ddArch')) toggleArch(); }}>
              <div className="tx"><b id="ddArchT">아카이브로 이동</b>
                <span id="ddArchS">{archived ? '「저장됨」 에 보관 중이에요 — 끄면 D-Day 목록으로 돌아와요.' : '목록에서 숨기고, 「저장됨」 메뉴로 이동합니다.'}</span></div>
              <button className="tgl" id="ddArch" type="button" role="switch" aria-checked={archived} aria-label="아카이브로 이동" onClick={toggleArch} />
            </div>
          )}
        </div>
        <div className="modal-foot">
          {live && <button className="btn ghost" id="ddDel" style={{ marginRight: 'auto' }} onClick={() => { ws.deleteDDay(live.id); onClose(); }}>삭제</button>}
          <button className="btn ghost" id="ddCancel" onClick={onClose}>취소</button>
          <button className="btn primary" id="ddSave" onClick={save}>완료</button>
        </div>
      </div>
      {cal && <DatePick value={day} today={ws.today} anchor={dateBtn} onPick={(k) => { setDay(k); setCal(false); setMsg(''); }} onClose={() => setCal(false)} />}
    </div>
  );
}

/** 앱의 달력(.dpick · 240px) 을 단추 아래에 띄운다 — <input type="date"> 는 크로미움이 그려서 앱과 다르다 (v3.1.151 · 156) */
function DatePick({ value, today, anchor, onPick, onClose }: {
  value: string; today: string; anchor: React.RefObject<HTMLButtonElement | null>; onPick: (k: string) => void; onClose: () => void;
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
    <div className="dpick dd-pick" id="ddCal" ref={ref}>
      <div className="dpk-h">
        <button type="button" className="dpk-nav" aria-label="이전 달" onClick={() => setYm(new Date(y, m - 1, 1))}>{CHEV(-1)}</button>
        <b>{y}년 {m + 1}월</b>
        <button type="button" className="dpk-nav" aria-label="다음 달" onClick={() => setYm(new Date(y, m + 1, 1))}>{CHEV(1)}</button>
      </div>
      <div className="dpk-w">{DOW.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="dpk-g">
        {cells.map((d) => {
          const k = keyOf(d);
          return <button key={k} type="button" className={`dpk-d${d.getMonth() === m ? '' : ' out'}${k === value ? ' on' : ''}${k === today ? ' today' : ''}`} onClick={() => onPick(k)}>{d.getDate()}</button>;
        })}
      </div>
      <div className="dpk-q"><button type="button" className="dpk-lnk" onClick={() => onPick(today)}>오늘로</button></div>
    </div>
  );
}
