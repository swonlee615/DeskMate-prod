/**
 * PC 화면 — v3 「ONnOFF」 를 그대로 (레일 · 사이드바 · 근태 · 우측 패널)
 * ★ 레일 첫 메뉴 이름은 «홈» (2026-10-28 소유자 — v3 의 «근태» 자리. v3 의 홈(대화)은 옮기지 않는다)
 *
 * ★ 모양의 원본은 v3 다. v3 styles.css 를 그대로 쓰고 마크업 · 클래스 · id 를 v3 와 같게 둔다.
 *   PC 창을 아무리 좁혀도 모바일 화면으로 바뀌지 않는다 — v3 의 3단 · 2단 · 1단(서랍) 으로만 바뀐다.
 */
import { ArrivalAsk } from './ArrivalAsk';
import { UpdateAsk } from './UpdateAsk';
import { useTray } from '../app/useTray';
import { PomoClock } from '../ui/Live';
import { avStyle, avText } from '../ui/avatar';
import { useEffect, useState } from 'react';
import { SettingsModal } from './Settings';
import type { Workspace } from '../app/useWorkspace';
import { AccountDialog } from '../ui/AccountDialog';
import { SyncBadge } from '../ui/SyncBadge';
import { Worklog } from './Worklog';
import { PcActivity } from './Activity';
import { bindTips } from './tips';
import { TodayPanelBody } from './TodayPanel';
import { TimerCard } from './TimerCard';
import { DayPage } from './DayPage';
import { rangeRate } from '../domain/todos/tree';
import { addDays, dateOf, keyOf, weekStart } from '../ui/v3fmt';
import { PendBanner } from './PendBanner';
import { WeekPlanner } from './WeekPlanner';
import { DDayBox, DDayModal, type DDTab } from './DDay';
import { HabitModal, HabitRings } from './Habits';
import { MateRows, Ranking } from './Team';
import type { DDay } from '../domain/dday';
import type { Habit } from '../domain/habits';
import { RowMenu, TrashView } from './Trash';
import { SearchView } from './Search';
import { SavedView } from './Saved';
import './pc.css';

/** v3 applyLayout 과 같은 기준 — 3단 ≥840 · 2단 ≥600 · 1단. 우측 패널은 1360(사이드바 접으면 1180)부터 열로 붙는다 */
function useLayout(sbOff: boolean) {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const mode = w >= 840 ? '3' : w >= 600 ? '2' : '1';
  return { mode, docked: mode === '3' && w >= (sbOff ? 1180 : 1360) };
}

const SB_ICON = (
  <svg viewBox="0 0 20 20"><rect x="2.8" y="4" width="14.4" height="12" rx="2.2" /><path d="M8 4v12" /></svg>
);

/** 검색 결과로 간 줄을 가운데로 굴리고 잠깐 밝힌다 (v3 scFlash · .sc-hit) */
function scFlash(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`.main [data-id="${CSS.escape(id)}"], .main [data-edit="${CSS.escape(id)}"], .main [data-slot="${CSS.escape(id)}"].tg-item`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('sc-hit');
    setTimeout(() => el.classList.remove('sc-hit'), 3200);
  }, 250);
}
const TITLE = { worklog: 'ONnOFF', dash: '활동', later: '저장됨', trash: '휴지통', search: '검색' } as const;

export function PcWorkspace({ ws }: { ws: Workspace }) {
  const { backend, user, now, today, sync, days, day, nick, initial, presence } = ws;
  const [panelOpen, setPanelOpen] = useState(false);
  const [preDraft, setPreDraft] = useState(false);
  // D-Day 창 — 여는 길이 셋이어도 창은 하나, 일간 상세 «밖» 에 둔다 (v3 #ddModal)
  const [dd, setDd] = useState<{ it: DDay | null; date: string } | null>(null);
  const openDD = (date: string) => (it: DDay | null) => setDd({ it, date });
  const [hb, setHb] = useState<{ h: Habit | null } | null>(null);
  const openHb = (h: Habit | null) => setHb({ h });
  // 「D-Day · 습관」 탭 — 전체 뷰와 주간이 같은 탭을 본다 (v3 S.ddTab)
  const [ddTab, setDdTab] = useState<DDTab>('dday');
  const ddBox = <DDayBox ws={ws} tab={ddTab} setTab={setDdTab} onOpen={openDD(today)} onHabit={openHb} />;
  const [sbOff, setSbOff] = useState(false);
  // ⌘Z · ⌘⇧Z — 글 칸 밖(체크를 누른 뒤 등)에서는 이 기기의 마지막 줄 동작을 되돌리고 다시 한다. 글 칸 안은 NoteEditor 가 맡는다
  const undoRef = ws.undoBlocks, redoRef = ws.redoBlocks;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      if (e.shiftKey ? redoRef() : undoRef()) e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [undoRef, redoRef]);
  useEffect(bindTips, []);
  // 레일 — 홈(근태) · 활동. 화면을 바꾸면 열어 둔 일간 상세는 닫는다
  const [view, setView] = useState<'worklog' | 'dash' | 'later' | 'trash' | 'search'>('worklog');
  const go = (v: typeof view) => { setView(v); setDayKey(null); setDayFull(false); setDrawer(false); setSvOpen(false); };
  // 저장됨 — 고른 메모 · 좁을 때 상세를 연 상태 (머리줄 «뒤로» 가 닫는다)
  const [svSel, setSvSel] = useState('');
  const [svOpen, setSvOpen] = useState(false);
  const [weekReq, setWeekReq] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  // 일간 상세 — 목록 위 «레이어» (넓은 화면) 또는 전체 페이지 (v3 openDay · dayPeekFull)
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [dayFull, setDayFull] = useState(false);
  const [focusOff, setFocusOff] = useState(false);
  const openDay = (k: string, off = false) => { setDayKey(k); setFocusOff(off); };
  useTray(ws, { openSettings: () => { setDrawer(false); setSetOpen(true); }, openDay: (k) => { setView('worklog'); openDay(k, true); } });
  const [rowMenu, setRowMenu] = useState<{ k: string; x: number; y: number } | null>(null);
  const noteDates = new Set(ws.blocks.filter((b) => !b.deletedAt && b.text.trim() && (b.area === 'today' || b.area === 'memo')).map((b) => b.date));
  const closeDay = () => { setDayKey(null); setDayFull(false); setFocusOff(false); };
  const { mode, docked } = useLayout(sbOff);
  const openAccount = () => { setDrawer(false); if (backend.mode === 'cloud') setAcctOpen(true); };

  // 좁은 창(1단)에서는 레이어 대신 전체 페이지로 연다 (v3 dayLayerOn)
  const asLayer = !!dayKey && !dayFull && mode !== '1';
  const cls = ['app', 'wide-main', panelOpen ? 'panel-open' : '', docked ? 'panel-docked' : '',
    sbOff ? 'sb-off' : '', drawer ? 'drawer-open' : '', asLayer ? 'day-layer' : ''].filter(Boolean).join(' ');
  const pend = ws.pendingDays;

  return (
    <>
      <div className="top-strip" />
      <div className={cls} id="app" data-layout={mode}>
        <aside className="rail">
          <div className={`ws-badge${ws.settings.wsLogo ? ' img' : ''}`} id="wsBadge"
            style={ws.settings.wsLogo ? { backgroundImage: `url("${ws.settings.wsLogo}")`, backgroundColor: 'transparent' } : { backgroundColor: ws.settings.wsColor }}>
            {ws.settings.wsLogo ? '' : ws.settings.wsName.trim().slice(0, 1).toUpperCase() || 'D'}</div>
          <button className={`rail-btn${view === 'worklog' ? ' on' : ''}`} data-view="worklog" onClick={() => go('worklog')}>
            <span className="ri"><svg viewBox="0 0 20 20"><path d="M3.2 8.6 10 3.2l6.8 5.4V16a1.2 1.2 0 0 1-1.2 1.2h-3.3v-4.8H7.7v4.8H4.4A1.2 1.2 0 0 1 3.2 16V8.6Z" /></svg></span>
            <small>홈</small>
          </button>
          <button className={`rail-btn${view === 'dash' ? ' on' : ''}`} data-view="dash" onClick={() => go('dash')}>
            <span className="ri"><svg viewBox="0 0 20 20"><path d="M4 16.2V9.4M10 16.2V3.8M16 16.2v-4.6" /></svg></span>
            <small>활동</small>
          </button>
          <button className={`rail-btn${view === 'later' ? ' on' : ''}`} data-view="later" onClick={() => go('later')}>
            <span className="ri"><svg viewBox="0 0 20 20"><path d="M5.6 3.6h8.8v13.1L10 13.2l-4.4 3.5V3.6Z" /></svg></span>
            <small>저장됨</small>
          </button>
          <div className="rail-spacer" />
          <button className="rail-btn" id="btnSettings" onClick={() => { setDrawer(false); setSetOpen(true); }}>
            <span className="ri"><svg viewBox="0 0 20 20"><path d="M8.6 3.1h2.8l.28 1.72c.46.18.89.43 1.28.73l1.63-.62 1.4 2.42-1.32 1.14c.04.27.06.55.06.84s-.02.57-.06.84l1.32 1.14-1.4 2.42-1.63-.62c-.39.3-.82.55-1.28.73l-.28 1.72H8.6l-.28-1.72a5.3 5.3 0 0 1-1.28-.73l-1.63.62-1.4-2.42 1.32-1.14a5.5 5.5 0 0 1 0-1.68L4.01 7.35l1.4-2.42 1.63.62c.39-.3.82-.55 1.28-.73L8.6 3.1Z" /><circle cx="10" cy="10" r="2.3" /></svg></span>
            <small>설정</small>
          </button>
        </aside>

        <div className="scrim" id="scrim" onClick={() => setDrawer(false)} />
        <div className="panel-scrim" id="panelScrim" onClick={() => setPanelOpen(false)} />

        <nav className="sidebar">
          <div className="sb-head">
            <div className="sb-title"><span id="wsName">{ws.settings.wsName}</span></div>
            <button className="icon-btn sb-toggle" id="sbToggleIn" title="사이드바 접기" onClick={() => setSbOff(true)}>{SB_ICON}</button>
          </div>
          <button className={`sb-search${view === 'search' ? ' sel' : ''}`} id="btnSearch" onClick={() => go('search')}>
            <svg viewBox="0 0 20 20" className="si"><circle cx="9" cy="9" r="5.3" /><path d="m13.1 13.1 3.1 3.1" /></svg><span>찾기...</span></button>
          <div className="sb-scroll" id="sbScroll">
            <button className="sb-section" aria-expanded="true"><span className="sb-caret">▾</span><span className="nm">멤버</span></button>
            <MateRows ws={ws} />
            {backend.mode === 'local' && <p className="hint" style={{ padding: '2px 18px' }}>개발 모드 · 이 기기에만 저장</p>}
          </div>
          <div className="sb-foot">
            <button className="sb-row" id="rowMe" onClick={openAccount} title={user.email ?? nick}>
              <span className="av haspd"><span className="avi" style={avStyle(ws.settings.color, ws.settings.avatar)}>{avText(initial, ws.settings.avatar)}</span><span className="pdot" data-p={presence} /></span>
              <span className="nm"><span className="sb-me-nick">{nick}</span>
                {user.name && user.name !== nick && <> <span className="tag">({user.name})</span></>}</span>
              <span className="tag">나</span>
            </button>
            <button className={`sb-row${view === 'trash' ? ' sel' : ''}`} id="rowTrash" onClick={() => go('trash')}>
              <span className="glyph">🗑</span><span className="nm">휴지통</span>
              {ws.trash.length > 0 && <span className="badge" id="trashBadge">{ws.trash.length}</span>}</button>
          </div>
        </nav>

        <section className="main">
          <header className="main-head">
            <button className="icon-btn" id="btnDrawer" style={{ display: mode === '1' ? '' : 'none' }}
              title="사이드바 열기" aria-label="사이드바 열기" onClick={() => setDrawer(true)}>{SB_ICON}</button>
            <button className="icon-btn" id="btnSbToggle" title="사이드바 펼치기" aria-pressed={sbOff}
              style={{ display: sbOff && mode !== '1' ? '' : 'none' }} onClick={() => setSbOff(false)}>{SB_ICON}</button>
            {/* 앞/뒤 — v3 와 같은 자리. 화면이 근태 하나뿐인 동안은 갈 곳이 없어 꺼 둔다 */}
            <button className="icon-btn" id="btnBack" style={{ display: (dayKey && !asLayer) || (view === 'later' && svOpen) ? '' : 'none' }}
              onClick={() => (dayKey ? closeDay() : setSvOpen(false))}>
              <svg className="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 5 7.5 10 12.5 15" /></svg><span>{TITLE[view]}</span></button>
            <div className="nav-ab" id="navAb">
              <button className="icon-btn" id="navBack" title="뒤로 (⌥←)" disabled>
                <svg viewBox="0 0 20 20"><path d="M12 4.5 6.5 10 12 15.5" /></svg></button>
              <button className="icon-btn" id="navFwd" title="앞으로 (⌥→)" disabled>
                <svg viewBox="0 0 20 20"><path d="M8 4.5 13.5 10 8 15.5" /></svg></button>
            </div>
            <div className="ch-title"><span id="chTitle">{TITLE[view]}</span></div>
            <div className="hspace" />
            <SyncBadge s={sync} />
            <button className="mini-pill" id="miniTimer" title="집중 타이머 열기" onClick={() => setPanelOpen((v) => !v)}>
              <svg viewBox="0 0 20 20" className="si"><circle cx="10" cy="10" r="7" /><path d="M10 5.8v4.4l2.9 1.7" /></svg>
              <b id="miniClock"><PomoClock t={ws.timer} /></b>
            </button>
          </header>

          <Worklog weeks={ws.tblWeeks} all={ws.tblAll} onMore={ws.moreWeeks} days={days} today={today} now={now} goal={ws.goal}
            calMonth={ws.calMonth} setCalMonth={ws.setCalMonth} onLeave={ws.onLeave} weekReq={weekReq} unavailable={ws.unavailable}
            onOpenDay={openDay} hidden={view !== 'worklog' || (!!dayKey && !asLayer)}
            week={<WeekPlanner ws={ws} onOpenDay={(k) => openDay(k)} dday={ddBox} />}
            dday={ddBox}
            noteDates={noteDates} onRowMenu={(k, x, y) => setRowMenu({ k, x, y })}
            todo={rangeRate(ws.blocks, keyOf(weekStart(dateOf(today))), keyOf(addDays(weekStart(dateOf(today)), 6)))}
            // 상세를 레이어로 열면 목록 오른쪽이 가려져 이 띠가 반쯤 잘린다 — 상세가 같은 띠를 보여 주므로 뒤의 것은 걷는다
            banner={pend.length > 0 && !asLayer && <PendBanner ws={ws} date={pend[0]} more={pend.length - 1} onEdit={() => openDay(pend[0], true)} />} />
          <TrashView ws={ws} hidden={view !== 'trash'} />
          <SearchView ws={ws} hidden={view !== 'search' || (!!dayKey && !asLayer)} onJump={(r) => {
            // 상세는 검색 위에 뜨고, 닫으면 결과 목록으로 (v3.1.13). 주간 메모 · 날짜 미정은 그 주의 주간 화면으로
            if (r.k === 'week' || r.undated) { ws.setWpWeek(r.key); go('worklog'); setWeekReq((n) => n + 1); } else openDay(r.key);
            scFlash(r.id);
          }} />
          <SavedView ws={ws} hidden={view !== 'later' || (!!dayKey && !asLayer)} sel={svSel} setSel={setSvSel} open={svOpen} setOpen={setSvOpen}
            onDay={(k) => openDay(k)} onWeek={(k) => { ws.setWpWeek(k); go('worklog'); setWeekReq((n) => n + 1); }}
            onDD={(it) => openDD(it.date)(it)} onHb={(h) => openHb(h)} onTrash={() => go('trash')} />
          {view === 'dash' && <PcActivity ws={ws} hidden={!!dayKey && !asLayer} onOpenDay={(k) => openDay(k)} />}
          <div className="peek-scrim" id="peekScrim" onClick={closeDay} />
          {dayKey && (
            <DayPage ws={ws} date={dayKey} full={!asLayer} focusOff={focusOff}
              onClose={closeDay} onFull={() => setDayFull((v) => !v)} onGo={(k) => openDay(k)} onDD={openDD(dayKey)} />
          )}
        </section>

        <aside className="panel">
          <div className="panel-head"><b id="panelTitle">집중 타이머</b><div className="hspace" />
            <button className="icon-btn" id="btnPanelClose" onClick={() => setPanelOpen(false)}>✕</button></div>
          <div className={`panel-body${preDraft ? ' pre-draft' : ''}`} id="panelTimer">
            <TimerCard t={ws.timer} tc={ws.settings.timerColor} onSet={(m) => ws.say(m)} onDraft={setPreDraft} />
            <TodayPanelBody day={day} now={now} goal={ws.goal} onOn={ws.onOn} onOff={ws.onOff} onRest={ws.onRest} />
            <HabitRings ws={ws} />
            <Ranking ws={ws} />
          </div>
        </aside>
      </div>

      {dd && <DDayModal ws={ws} it={dd.it} date={dd.date} onClose={() => setDd(null)} />}
      {hb && <HabitModal ws={ws} h={hb.h} onClose={() => setHb(null)} onSaved={() => setDdTab('habit')} />}

      <ArrivalAsk ws={ws} />
      <UpdateAsk ws={ws} />
      <div className={`toast${ws.toast ? ' show' : ''}${ws.toast?.action ? ' has-undo' : ''}${ws.toast?.bad ? ' bad' : ''}`} id="toast" role="status">
        <span className="tm">{ws.toast?.text}</span>
        {ws.toast?.action && <button className="tu" onClick={ws.toast.action.run}>{ws.toast.action.label}</button>}
      </div>

      {rowMenu && <RowMenu x={rowMenu.x} y={rowMenu.y} can={!!days[rowMenu.k] || noteDates.has(rowMenu.k)}
        onOpen={() => openDay(rowMenu.k)} onDelete={() => ws.deleteDay(rowMenu.k)} onClose={() => setRowMenu(null)} />}
      {setOpen && <SettingsModal ws={ws} onClose={() => setSetOpen(false)} onDay={(k) => { setSetOpen(false); setView('worklog'); openDay(k); }} />}
      {acctOpen && (
        <AccountDialog auth={backend.auth} user={user} pending={sync?.pending ?? 0} onClose={() => setAcctOpen(false)} />
      )}
    </>
  );
}
