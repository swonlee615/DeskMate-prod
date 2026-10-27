/**
 * PC 화면 — v3 「ONnOFF」 를 그대로 (레일 · 사이드바 · 근태 · 우측 패널)
 *
 * ★ 모양의 원본은 v3 다. v3 styles.css 를 그대로 쓰고 마크업 · 클래스 · id 를 v3 와 같게 둔다.
 *   PC 창을 아무리 좁혀도 모바일 화면으로 바뀌지 않는다 — v3 의 3단 · 2단 · 1단(서랍) 으로만 바뀐다.
 */
import { useEffect, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { GOAL_HOURS } from '../app/useWorkspace';
import { AccountDialog } from '../ui/AccountDialog';
import { SyncBadge } from '../ui/SyncBadge';
import { Worklog } from './Worklog';
import { TodayPanelBody } from './TodayPanel';
import { TimerCard } from './TimerCard';
import { DayPage } from './DayPage';
import { rangeRate } from '../domain/todos/tree';
import { addDays, dateOf, keyOf, weekStart } from '../ui/v3fmt';
import { PendBanner } from './PendBanner';
import { WeekPlanner } from './WeekPlanner';
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

export function PcWorkspace({ ws }: { ws: Workspace }) {
  const { backend, user, now, today, sync, days, day, nick, initial, presence } = ws;
  const [panelOpen, setPanelOpen] = useState(false);
  const [preDraft, setPreDraft] = useState(false);
  const [sbOff, setSbOff] = useState(false);
  // ⌘Z — 글 칸 밖(체크를 누른 뒤 등)에서는 이 기기의 마지막 줄 동작을 되돌린다. 글 칸 안은 NoteEditor 가 맡는다
  const undoRef = ws.undoBlocks;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      if (undoRef()) e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [undoRef]);
  const [drawer, setDrawer] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  // 일간 상세 — 목록 위 «레이어» (넓은 화면) 또는 전체 페이지 (v3 openDay · dayPeekFull)
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [dayFull, setDayFull] = useState(false);
  const [focusOff, setFocusOff] = useState(false);
  const openDay = (k: string, off = false) => { setDayKey(k); setFocusOff(off); };
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
          <div className="ws-badge" id="wsBadge">D</div>
          <button className="rail-btn on" data-view="worklog">
            <span className="ri"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.1" /><path d="M10 5.7v4.5l3 1.8" /></svg></span>
            <small>근태</small>
          </button>
          <div className="rail-spacer" />
          <button className="rail-btn" id="btnSettings" onClick={openAccount}>
            <span className="ri"><svg viewBox="0 0 20 20"><path d="M8.6 3.1h2.8l.28 1.72c.46.18.89.43 1.28.73l1.63-.62 1.4 2.42-1.32 1.14c.04.27.06.55.06.84s-.02.57-.06.84l1.32 1.14-1.4 2.42-1.63-.62c-.39.3-.82.55-1.28.73l-.28 1.72H8.6l-.28-1.72a5.3 5.3 0 0 1-1.28-.73l-1.63.62-1.4-2.42 1.32-1.14a5.5 5.5 0 0 1 0-1.68L4.01 7.35l1.4-2.42 1.63.62c.39-.3.82-.55 1.28-.73L8.6 3.1Z" /><circle cx="10" cy="10" r="2.3" /></svg></span>
            <small>설정</small>
          </button>
        </aside>

        <div className="scrim" id="scrim" onClick={() => setDrawer(false)} />
        <div className="panel-scrim" id="panelScrim" onClick={() => setPanelOpen(false)} />

        <nav className="sidebar">
          <div className="sb-head">
            <div className="sb-title"><span id="wsName">DeskMate</span></div>
            <button className="icon-btn sb-toggle" id="sbToggleIn" title="사이드바 접기" onClick={() => setSbOff(true)}>{SB_ICON}</button>
          </div>
          <div className="sb-scroll" id="sbScroll">
            <button className="sb-section" aria-expanded="true"><span className="sb-caret">▾</span><span className="nm">팀원</span></button>
            <p className="hint" style={{ padding: '2px 18px 8px' }}>아직 팀원이 없어요</p>
            {backend.mode === 'local' && <p className="hint" style={{ padding: '2px 18px' }}>개발 모드 · 이 기기에만 저장</p>}
          </div>
          <div className="sb-foot">
            <button className="sb-row" id="rowMe" onClick={openAccount} title={user.email ?? nick}>
              <span className="av haspd"><span className="avi" style={{ backgroundColor: '#1264a3' }}>{initial}</span><span className="pdot" data-p={presence} /></span>
              <span className="nm"><span className="sb-me-nick">{nick}</span></span>
              <span className="tag">나</span>
            </button>
          </div>
        </nav>

        <section className="main">
          <header className="main-head">
            <button className="icon-btn" id="btnDrawer" style={{ display: mode === '1' ? '' : 'none' }}
              title="사이드바 열기" aria-label="사이드바 열기" onClick={() => setDrawer(true)}>{SB_ICON}</button>
            <button className="icon-btn" id="btnSbToggle" title="사이드바 펼치기" aria-pressed={sbOff}
              style={{ display: sbOff && mode !== '1' ? '' : 'none' }} onClick={() => setSbOff(false)}>{SB_ICON}</button>
            {/* 앞/뒤 — v3 와 같은 자리. 화면이 근태 하나뿐인 동안은 갈 곳이 없어 꺼 둔다 */}
            <button className="icon-btn" id="btnBack" style={{ display: dayKey && !asLayer ? '' : 'none' }} onClick={closeDay}>
              <svg className="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 5 7.5 10 12.5 15" /></svg><span>ONnOFF</span></button>
            <div className="nav-ab" id="navAb">
              <button className="icon-btn" id="navBack" title="뒤로 (⌥←)" disabled>
                <svg viewBox="0 0 20 20"><path d="M12 4.5 6.5 10 12 15.5" /></svg></button>
              <button className="icon-btn" id="navFwd" title="앞으로 (⌥→)" disabled>
                <svg viewBox="0 0 20 20"><path d="M8 4.5 13.5 10 8 15.5" /></svg></button>
            </div>
            <div className="ch-title"><span id="chTitle">ONnOFF</span></div>
            <div className="hspace" />
            <SyncBadge s={sync} />
            <button className="mini-pill" id="miniTimer" title="집중 타이머 열기" onClick={() => setPanelOpen((v) => !v)}>
              <svg viewBox="0 0 20 20" className="si"><circle cx="10" cy="10" r="7" /><path d="M10 5.8v4.4l2.9 1.7" /></svg>
              <b id="miniClock">{ws.timer.clock}</b>
            </button>
          </header>

          <Worklog days={days} today={today} now={now} goalHours={GOAL_HOURS}
            calMonth={ws.calMonth} setCalMonth={ws.setCalMonth} onLeave={ws.onLeave} unavailable={ws.unavailable}
            onOpenDay={openDay} hidden={!!dayKey && !asLayer}
            week={<WeekPlanner ws={ws} onOpenDay={(k) => openDay(k)} />}
            noteDates={new Set(ws.blocks.filter((b) => !b.deletedAt && b.text.trim() && (b.area === 'today' || b.area === 'memo')).map((b) => b.date))}
            todo={rangeRate(ws.blocks, keyOf(weekStart(dateOf(today))), keyOf(addDays(weekStart(dateOf(today)), 6)))}
            banner={pend.length > 0 && <PendBanner ws={ws} date={pend[0]} more={pend.length - 1} onEdit={() => openDay(pend[0], true)} />} />
          <div className="peek-scrim" id="peekScrim" onClick={closeDay} />
          {dayKey && (
            <DayPage ws={ws} date={dayKey} full={!asLayer} focusOff={focusOff}
              onClose={closeDay} onFull={() => setDayFull((v) => !v)} onGo={(k) => openDay(k)} />
          )}
        </section>

        <aside className="panel">
          <div className="panel-head"><b id="panelTitle">집중 타이머</b><div className="hspace" />
            <button className="icon-btn" id="btnPanelClose" onClick={() => setPanelOpen(false)}>✕</button></div>
          <div className={`panel-body${preDraft ? ' pre-draft' : ''}`} id="panelTimer">
            <TimerCard t={ws.timer} onSet={(m) => ws.say(m)} onDraft={setPreDraft} />
            <TodayPanelBody day={day} now={now} goalHours={GOAL_HOURS} onOn={ws.onOn} onOff={ws.onOff} onRest={ws.onRest} />
          </div>
        </aside>
      </div>

      <div className={`toast${ws.toast ? ' show' : ''}${ws.toast?.action ? ' has-undo' : ''}`} id="toast" role="status">
        <span className="tm">{ws.toast?.text}</span>
        {ws.toast?.action && <button className="tu" onClick={ws.toast.action.run}>{ws.toast.action.label}</button>}
      </div>

      {acctOpen && (
        <AccountDialog auth={backend.auth} user={user} pending={sync?.pending ?? 0} onClose={() => setAcctOpen(false)} />
      )}
    </>
  );
}
