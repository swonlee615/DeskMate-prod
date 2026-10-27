/**
 * 모바일 화면 — PC(v3) 와 따로 설계하는 레이아웃
 *
 * ★ 데이터 · 동기화 · 버튼 동작은 PC 와 같은 것(`useWorkspace`)을 쓴다. 여기서 다시 만들지 않는다.
 *   그래서 폰에서 누른 것(출퇴근 · 타이머 · 할 일 · 시간 기록)이 PC 에 그대로 보이고, 그 반대도 같다.
 * ★ 메뉴는 PC 레일과 같다 (2026-10-28 소유자): 근태 · 활동 · 팀 · 저장됨 + 설정(머리 오른쪽).
 *   근태 안은 PC 처럼 «전체 · 주간», 날을 누르면 그 날 상세(시간표)가 PC 옆 창처럼 위로 열린다.
 * ★ 머리의 타이머 알약은 PC 머리의 미니 타이머와 같다 — 늘 보이고, 누르면 집중 타이머로
 * ★ 모양만 다르다 — 한 손으로 누르기 좋게. 클래스는 전부 `m-` 로 시작해 PC(v3)와 안 섞인다. 색 · 글꼴은 v3 토큰
 */
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { AccountDialog } from '../ui/AccountDialog';
import { SyncBadge } from '../ui/SyncBadge';
import { fmtDur } from '../ui/v3fmt';
import { MobileWeek } from './MobileWeek';
import { MToday, STATE_LABEL } from './MToday';
import { MDay } from './MDay';
import './mobile.css';

type Tab = 'att' | 'dash' | 'team' | 'later';
const TITLE: Record<Tab, string> = { att: '근태', dash: '활동', team: '팀', later: '저장됨' };

export function MobileWorkspace({ ws }: { ws: Workspace }) {
  const [tab, setTab] = useState<Tab>('att');
  const [view, setView] = useState<'all' | 'week'>('all');
  const [day, setDay] = useState<{ date: string; edit: boolean } | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const goDay = (date: string, edit = false) => setDay({ date, edit });
  const t = ws.timer;
  const toTimer = () => {
    setDay(null); setTab('att'); setView('all');
    setTimeout(() => document.getElementById('m-timer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="m-app">
      <header className="m-head">
        <h1>{TITLE[tab]}</h1>
        <span className="m-sp" />
        <SyncBadge s={ws.sync} />
        <button className={`m-pill timer${t.running ? ' on' : ''}${t.mode === 'focus' ? '' : ' rest'}`} onClick={toTimer} aria-label={`집중 타이머 ${t.label} ${t.clock}`}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 5.8v4.4l2.9 1.7" /></svg>{t.clock}
        </button>
        <button className="m-x m-gear" onClick={() => setAcctOpen(true)} aria-label="설정">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.6 3.1h2.8l.28 1.72c.46.18.89.43 1.28.73l1.63-.62 1.4 2.42-1.32 1.14c.04.27.06.55.06.84s-.02.57-.06.84l1.32 1.14-1.4 2.42-1.63-.62c-.39.3-.82.55-1.28.73l-.28 1.72H8.6l-.28-1.72a5.3 5.3 0 0 1-1.28-.73l-1.63.62-1.4-2.42 1.32-1.14a5.5 5.5 0 0 1 0-1.68L4.01 7.35l1.4-2.42 1.63.62c.39-.3.82-.55 1.28-.73L8.6 3.1Z" /><circle cx="10" cy="10" r="2.3" /></svg>
        </button>
      </header>

      <main className="m-body">
        {tab === 'att' && <>
          <div className="m-seg" role="tablist" aria-label="근태 보기">
            <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>전체</button>
            <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>주간</button>
          </div>
          {view === 'all' ? <MToday ws={ws} goDay={goDay} /> : <MobileWeek ws={ws} />}
        </>}
        {tab === 'dash' && <Soon what="활동" items="근무 히트맵 · 근태 카드 · 순위 이력 · 습관 달성" />}
        {tab === 'team' && <TeamTab ws={ws} />}
        {tab === 'later' && <Soon what="저장됨" items="보관한 D-Day · 습관 · 저장한 메모" />}
      </main>

      {day && (
        <div className="m-page" role="dialog" aria-label="하루 상세">
          <header className="m-page-h">
            <button className="m-link" onClick={() => setDay(null)}>‹ 근태</button>
          </header>
          <div className="m-body">
            <MDay ws={ws} date={day.date} setDate={(k) => setDay({ date: k, edit: false })} editOpen={day.edit} />
          </div>
        </div>
      )}

      <nav className="m-tabs" aria-label="메뉴">
        <TabBtn on={tab === 'att'} onClick={() => { setTab('att'); setDay(null); }} label="근태"
          icon={<><circle cx="10" cy="10" r="7.1" /><path d="M10 5.7v4.5l3 1.8" /></>} />
        <TabBtn on={tab === 'dash'} onClick={() => { setTab('dash'); setDay(null); }} label="활동"
          icon={<path d="M4 16.2V9.4M10 16.2V3.8M16 16.2v-4.6" />} />
        <TabBtn on={tab === 'team'} onClick={() => { setTab('team'); setDay(null); }} label="팀"
          icon={<><circle cx="8" cy="7.4" r="2.9" /><path d="M2.9 16.2c0-2.6 2.3-4.2 5.1-4.2s5.1 1.6 5.1 4.2" /><path d="M13.6 5.1a2.6 2.6 0 0 1 0 4.9M15.2 12.4c1.4.5 2.4 1.7 2.4 3.4" /></>} />
        <TabBtn on={tab === 'later'} onClick={() => { setTab('later'); setDay(null); }} label="저장됨"
          icon={<path d="M5.6 3.6h8.8v13.1L10 13.2l-4.4 3.5V3.6Z" />} />
      </nav>

      <div className={`m-toast${ws.toast ? ' show' : ''}${ws.toast?.bad ? ' bad' : ''}`} role="status">
        {ws.toast?.text}
        {ws.toast?.action && <button className="m-toast-act" onClick={ws.toast.action.run}>{ws.toast.action.label}</button>}
      </div>

      {acctOpen && (ws.backend.mode === 'cloud'
        ? <AccountDialog auth={ws.backend.auth} user={ws.user} pending={ws.sync?.pending ?? 0} onClose={() => setAcctOpen(false)} />
        : <div className="m-sheet-bg" onClick={() => setAcctOpen(false)}><div className="m-sheet"><b>{ws.nick}</b><p className="m-hint">개발 모드 · 이 기기에만 저장돼요</p></div></div>)}
    </div>
  );
}

function TabBtn({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button className={on ? 'on' : ''} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <svg viewBox="0 0 20 20" aria-hidden="true">{icon}</svg>{label}
    </button>
  );
}

/** 아직 PC 에도 안 옮긴 메뉴 — PC 와 같은 자리를 먼저 잡아 둔다 */
function Soon({ what, items }: { what: string; items: string }) {
  return (
    <div className="m-soon">
      <b>{what}은 준비 중이에요</b>
      <p>{items}이 여기에 생겨요. PC 와 같은 때 함께 열려요.</p>
    </div>
  );
}

/** 팀 — 오늘 근무 랭킹 (PC 와 같은 ws.ranking · 상태는 ws.mateStatus) */
function TeamTab({ ws }: { ws: Workspace }) {
  return (
    <ul className="m-card m-list">
      {ws.ranking.map((r) => {
        const st = r.me ? null : ws.mateStatus(r.id);
        const p = r.me ? (ws.state === 'work' ? 'work' : ws.state === 'break' ? 'break' : 'none') : st?.presence === 'active' || st?.presence === 'dnd' ? 'work' : st?.presence === 'break' ? 'break' : 'none';
        return (
          <li key={r.id} className="m-row">
            <span className="m-rank">{r.rank}</span>
            <span className="m-av" style={r.m ? { background: r.m.color } : undefined}>{r.m ? r.m.emoji || r.m.nick.slice(0, 1) : ws.initial}<i className={`m-dot ${p}`} /></span>
            <div className="m-row-l"><b>{r.nick}{r.me && <small> (나)</small>}</b>
              <span>{r.me ? STATE_LABEL[ws.state] : st ? `${st.emoji ? st.emoji + ' ' : ''}${st.topic || st.label}` : ''}</span></div>
            <div className="m-row-r"><b>{fmtDur(r.min)}</b></div>
          </li>
        );
      })}
    </ul>
  );
}
