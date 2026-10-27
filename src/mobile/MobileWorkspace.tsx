/**
 * 모바일 화면 — PC(v3) 와 따로 설계하는 레이아웃
 *
 * ★ 데이터 · 동기화 · 버튼 동작은 PC 와 같은 것(`useWorkspace`)을 쓴다. 여기서 다시 만들지 않는다.
 *   그래서 폰에서 누른 것(출퇴근 · 타이머 · 할 일 · 시간 기록)이 PC 에 그대로 보이고, 그 반대도 같다.
 * ★ 모양만 다르다 — 한 손으로 누르기 좋게. 클래스는 전부 `m-` 로 시작해 PC(v3)와 안 섞인다. 색 · 글꼴은 v3 토큰
 * 하단 탭: 오늘(PC 전체 탭 + 우측 패널) · 시간표(일간 상세 + 캘린더) · 주간 · 팀 · 더보기(D-Day · 습관 · 계정)
 * 머리의 알약(근무 상태 · 돌고 있는 타이머)은 어느 탭에서든 보인다
 */
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { AccountDialog } from '../ui/AccountDialog';
import { SyncBadge } from '../ui/SyncBadge';
import { fmtDur } from '../ui/v3fmt';
import { MobileWeek } from './MobileWeek';
import { MToday, STATE_LABEL } from './MToday';
import { MDay } from './MDay';
import { MMore } from './MMore';
import './mobile.css';

type Tab = 'today' | 'day' | 'week' | 'team' | 'more';
const TITLE: Record<Tab, string> = { today: '오늘', day: '시간표', week: '주간', team: '팀', more: '더보기' };

export function MobileWorkspace({ ws }: { ws: Workspace }) {
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(ws.today);
  const [editOpen, setEditOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const goDay = (k: string, edit = false) => { setDate(k); setEditOpen(edit); setTab('day'); };
  const t = ws.timer;

  return (
    <div className="m-app">
      <header className="m-head">
        <h1>{TITLE[tab]}</h1>
        <span className="m-sp" />
        {tab !== 'today' && (
          <button className="m-pill" onClick={() => setTab('today')} aria-label="오늘로">
            <i className={`m-dot ${ws.state}`} aria-hidden="true" />{STATE_LABEL[ws.state]}
          </button>
        )}
        {t.running && (
          <button className={`m-pill timer${t.mode === 'focus' ? '' : ' rest'}`} onClick={() => setTab('today')} aria-label={`${t.label} ${t.clock}`}>
            ⏱ {t.clock}
          </button>
        )}
        <SyncBadge s={ws.sync} />
      </header>

      <main className="m-body">
        {tab === 'today' && <MToday ws={ws} goDay={goDay} />}
        {tab === 'day' && <MDay ws={ws} date={date} setDate={(k) => { setDate(k); setEditOpen(false); }} editOpen={editOpen} />}
        {tab === 'week' && <MobileWeek ws={ws} />}
        {tab === 'team' && <TeamTab ws={ws} />}
        {tab === 'more' && <MMore ws={ws} onAccount={() => setAcctOpen(true)} />}
      </main>

      <nav className="m-tabs" aria-label="하단 탭">
        <TabBtn on={tab === 'today'} onClick={() => setTab('today')} label="오늘"
          icon={<><circle cx="10" cy="10" r="7.1" /><path d="M10 5.7v4.5l3 1.8" /></>} />
        <TabBtn on={tab === 'day'} onClick={() => { if (tab !== 'day') goDay(ws.today); }} label="시간표"
          icon={<><rect x="3.5" y="3" width="13" height="14" rx="2.2" /><path d="M7 7h6M7 10.2h6M7 13.4h3.5" /></>} />
        <TabBtn on={tab === 'week'} onClick={() => setTab('week')} label="주간"
          icon={<><rect x="3" y="4.2" width="14" height="12.6" rx="2.2" /><path d="M3 8.2h14M7 2.8v2.6M13 2.8v2.6M6.6 11.4h1.6M9.2 11.4h1.6M11.8 11.4h1.6M6.6 14h1.6" /></>} />
        <TabBtn on={tab === 'team'} onClick={() => setTab('team')} label="팀"
          icon={<><circle cx="8" cy="7.4" r="2.9" /><path d="M2.9 16.2c0-2.6 2.3-4.2 5.1-4.2s5.1 1.6 5.1 4.2" /><path d="M13.6 5.1a2.6 2.6 0 0 1 0 4.9M15.2 12.4c1.4.5 2.4 1.7 2.4 3.4" /></>} />
        <TabBtn on={tab === 'more'} onClick={() => setTab('more')} label="더보기"
          icon={<><circle cx="4.6" cy="10" r="1.3" /><circle cx="10" cy="10" r="1.3" /><circle cx="15.4" cy="10" r="1.3" /></>} />
      </nav>

      <div className={`m-toast${ws.toast ? ' show' : ''}${ws.toast?.bad ? ' bad' : ''}`} role="status">
        {ws.toast?.text}
        {ws.toast?.action && <button className="m-toast-act" onClick={ws.toast.action.run}>{ws.toast.action.label}</button>}
      </div>

      {acctOpen && (
        <AccountDialog auth={ws.backend.auth} user={ws.user} pending={ws.sync?.pending ?? 0} onClose={() => setAcctOpen(false)} />
      )}
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
