/**
 * 모바일 화면 — PC(v3) 와 따로 설계하는 레이아웃
 *
 * ★ 데이터 · 동기화 · 버튼 동작은 PC 와 같은 것(`useWorkspace`)을 쓴다. 여기서 다시 만들지 않는다.
 *   그래서 폰에서 누른 것(출퇴근 · 타이머 · 할 일 · 시간 기록)이 PC 에 그대로 보이고, 그 반대도 같다.
 * ★ 메뉴는 PC 레일과 같다 (2026-10-28 소유자): 홈 · 활동 · 팀 · 저장됨 · 설정 (설정은 PC 처럼 맨 끝).
 *   홈 안은 PC 처럼 «전체 · 주간», 날을 누르면 그 날 상세가 위로 열린다. 닫기는 하단 «홈» (따로 뒤로 단추를 두지 않는다)
 * ★ 머리의 타이머 알약은 PC 머리의 미니 타이머와 같다 — 늘 보이고, 누르면 집중 타이머로
 * ★ 모양만 다르다 — 한 손으로 누르기 좋게. 클래스는 전부 `m-` 로 시작해 PC(v3)와 안 섞인다. 색 · 글꼴은 v3 토큰
 */
import { avStyle, avText } from '../ui/avatar';
import { PomoClock } from '../ui/Live';
import { useLayoutEffect, useRef, useState } from 'react';
import { daysLeft, type Workspace } from '../app/useWorkspace';
import { AccountDialog } from '../ui/AccountDialog';
import { SyncBadge } from '../ui/SyncBadge';
import { fmtDur } from '../ui/v3fmt';
import { MobileWeek } from './MobileWeek';
import { MToday, STATE_LABEL } from './MToday';
import { MActivity } from './MActivity';
import { MDay } from './MDay';
import { CloseX, HabitChips } from './parts';
import { IMG_HINT, imgDay, Thumb, useImageList } from '../ui/ImageList';
import { fmtMB } from '../domain/images';
import { AWAY_HINT, LEAVE_GOAL_HINT, MODES, SET_NAV, SLOT_HINT, systemIsDark, THEMES, TIMER_COLORS } from '../ui/settingsNav';
import { CAT_EX, nextCatColor, type Cat } from '../domain/attendance/cats';
import { catVar, SLOT_COLORS } from '../domain/attendance/logs';
import './mobile.css';

type Tab = 'att' | 'dash' | 'team' | 'later' | 'set';
const TITLE: Record<Tab, string> = { att: '홈', dash: '활동', team: '팀', later: '저장됨', set: '설정' };

export function MobileWorkspace({ ws }: { ws: Workspace }) {
  const [tab, setTab] = useState<Tab>('att');
  const [view, setView] = useState<'all' | 'week'>('all');
  const [day, setDay] = useState<{ date: string; edit: boolean } | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  // 설정 › 한 칸 (PC 설정 창의 오른쪽 칸을 폰에서는 한 단계 안으로)
  const [setSub, setSetSub] = useState<string | null>(null);
  // 탭 · 보기(전체/주간)를 바꾸면 늘 맨 위에서 — 스크롤 칸 하나를 함께 써서 앞 탭의 위치가 남았다
  const body = useRef<HTMLElement>(null);
  useLayoutEffect(() => { body.current?.scrollTo(0, 0); }, [tab, view, setSub]);
  const goDay = (date: string, edit = false) => setDay({ date, edit });
  const t = ws.timer;
  const toTimer = () => {
    setDay(null); setTab('att'); setView('all');
    setTimeout(() => document.getElementById('m-timer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="m-app">
      <header className="m-head">
        {tab === 'set' && setSub
          ? <button className="m-back" onClick={() => setSetSub(null)} aria-label="설정으로"><i aria-hidden="true">‹</i><h1>{SET_NAV.find((n) => n.k === setSub)?.nm}</h1></button>
          : <h1>{TITLE[tab]}</h1>}
        <span className="m-sp" />
        <SyncBadge s={ws.sync} />
        <button className={`m-pill timer${t.running ? ' on' : ''}${t.mode === 'focus' ? '' : ' rest'}`} onClick={toTimer} aria-label={`집중 타이머 · ${t.label}${t.running ? ' 중' : ' 대기'}`}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 5.8v4.4l2.9 1.7" /></svg><PomoClock t={t} />
        </button>
      </header>

      <main className="m-body" ref={body}>
        {tab === 'att' && <>
          <div className="m-seg" role="tablist" aria-label="홈 보기">
            <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>전체</button>
            <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>주간</button>
          </div>
          {view === 'all' ? <MToday ws={ws} goDay={goDay} /> : <MobileWeek ws={ws} goDay={goDay} />}
        </>}
        {tab === 'dash' && <>
          <MActivity ws={ws} onDay={goDay} />
          <HabitChips ws={ws} date={ws.today} />
        </>}
        {tab === 'team' && <TeamTab ws={ws} />}
        {tab === 'later' && <Soon what="저장됨" items="보관한 D-Day · 습관 · 저장한 메모" />}
        {tab === 'set' && (setSub ? <SetPanel ws={ws} k={setSub} goDay={goDay} /> : <Settings ws={ws} onAccount={() => setAcctOpen(true)} onOpen={setSetSub} />)}
      </main>

      {day && (
        <div className="m-page" role="dialog" aria-label="하루 상세">
          <div className="m-body">
            <MDay ws={ws} date={day.date} setDate={(k) => setDay({ date: k, edit: false })} editOpen={day.edit} />
          </div>
        </div>
      )}

      <nav className="m-tabs" aria-label="메뉴">
        <TabBtn on={tab === 'att'} onClick={() => { setTab('att'); setDay(null); }} label="홈"
          icon={<path d="M3.2 8.6 10 3.2l6.8 5.4V16a1.2 1.2 0 0 1-1.2 1.2h-3.3v-4.8H7.7v4.8H4.4A1.2 1.2 0 0 1 3.2 16V8.6Z" />} />
        <TabBtn on={tab === 'dash'} onClick={() => { setTab('dash'); setDay(null); }} label="활동"
          icon={<path d="M4 16.2V9.4M10 16.2V3.8M16 16.2v-4.6" />} />
        <TabBtn on={tab === 'team'} onClick={() => { setTab('team'); setDay(null); }} label="팀"
          icon={<><circle cx="8" cy="7.4" r="2.9" /><path d="M2.9 16.2c0-2.6 2.3-4.2 5.1-4.2s5.1 1.6 5.1 4.2" /><path d="M13.6 5.1a2.6 2.6 0 0 1 0 4.9M15.2 12.4c1.4.5 2.4 1.7 2.4 3.4" /></>} />
        <TabBtn on={tab === 'later'} onClick={() => { setTab('later'); setDay(null); }} label="저장됨"
          icon={<path d="M5.6 3.6h8.8v13.1L10 13.2l-4.4 3.5V3.6Z" />} />
        <TabBtn on={tab === 'set'} onClick={() => { setTab('set'); setDay(null); setSetSub(null); }} label="설정"
          icon={<><path d="M8.6 3.1h2.8l.28 1.72c.46.18.89.43 1.28.73l1.63-.62 1.4 2.42-1.32 1.14c.04.27.06.55.06.84s-.02.57-.06.84l1.32 1.14-1.4 2.42-1.63-.62c-.39.3-.82.55-1.28.73l-.28 1.72H8.6l-.28-1.72a5.3 5.3 0 0 1-1.28-.73l-1.63.62-1.4-2.42 1.32-1.14a5.5 5.5 0 0 1 0-1.68L4.01 7.35l1.4-2.42 1.63.62c.39-.3.82-.55 1.28-.73L8.6 3.1Z" /><circle cx="10" cy="10" r="2.3" /></>} />
      </nav>

      <div className={`m-toast${ws.toast ? ' show' : ''}${ws.toast?.bad ? ' bad' : ''}`} role="status">
        {ws.toast?.text}
        {ws.toast?.action && <button className="m-toast-act" onClick={ws.toast.action.run}>{ws.toast.action.label}</button>}
      </div>

      {acctOpen && <AccountDialog auth={ws.backend.auth} user={ws.user} pending={ws.sync?.pending ?? 0} onClose={() => setAcctOpen(false)} />}
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

/** 설정 — PC 레일 맨 아래 «설정» 과 같은 자리. 지금은 계정만 (나머지 설정은 PC 설정 화면을 옮길 때 같이) */
const SEP = SET_NAV.findIndex((n) => n.sep);

function Settings({ ws, onAccount, onOpen }: { ws: Workspace; onAccount: () => void; onOpen: (k: string) => void }) {
  const cloud = ws.backend.mode === 'cloud';
  return (
    <>
    <ul className="m-card m-list">
      <li className="m-row" onClick={cloud ? onAccount : undefined}>
        <span className="m-av" style={avStyle(ws.settings.color, ws.settings.avatar)}>{avText(ws.initial, ws.settings.avatar)}</span>
        <div className="m-row-l"><b>{ws.nick}</b><span>{ws.user.email ?? (cloud ? '' : '개발 모드 · 이 기기에만 저장돼요')}</span></div>
        {cloud && <i className="m-chev" aria-hidden="true">›</i>}
      </li>
    </ul>
    {/* PC 설정 창의 칸 목록 그대로 (SET_NAV) — 누르면 한 단계 안으로 */}
    {[SET_NAV.slice(0, SEP), SET_NAV.slice(SEP)].map((grp, gi) => (
      <ul className="m-card m-list m-setl" key={gi}>
        {grp.map((n) => (
          <li key={n.k} className={`m-row${n.on ? '' : ' soon'}`} aria-disabled={!n.on}
            onClick={() => (n.on ? onOpen(n.k) : ws.say(`${n.nm} 설정은 준비 중이에요`))}>
            <span className="m-set-ni" aria-hidden="true">{n.ni}</span>
            <div className="m-row-l"><b>{n.nm}</b>{!n.on && <span>준비 중</span>}</div>
            {n.on && <i className="m-chev" aria-hidden="true">›</i>}
          </li>
        ))}
      </ul>
    ))}
    </>
  );
}

/** 설정 › 한 칸 — PC SettingsModal 의 set-panel 과 같은 내용 */
function SetPanel({ ws, k, goDay }: { ws: Workspace; k: string; goDay: (date: string) => void }) {
  const st = ws.settings, c = ws.timer.cfg;
  // 폰은 고르는 즉시 저장한다 (저장 단추가 없는 설정 화면) — 숫자는 칸을 떠날 때 범위 안으로
  const num = (label: string, v: number, min: number, max: number, on: (n: number) => void) => (
    <li className="m-set-f"><span>{label}</span>
      <input type="number" inputMode="numeric" min={min} max={max} defaultValue={v} key={v} aria-label={label}
        onBlur={(e) => { const n = Math.max(min, Math.min(max, Math.round(+e.target.value || v))); e.target.value = String(n); if (n !== v) on(n); }} /></li>
  );
  const tgl = (label: string, v: boolean, on: (b: boolean) => void) => (
    <li className="m-set-f"><span>{label}</span>
      <button className={`m-tgl${v ? ' on' : ''}`} role="switch" aria-checked={v} aria-label={label} onClick={() => on(!v)}><i /></button></li>
  );
  if (k === 'general') return <>
    <h3 className="m-set-h">화면 모드</h3>
    <div className="m-seg">{MODES.map(([m, , b]) => (
      <button key={m} className={st.mode === m ? 'on' : ''} onClick={() => ws.saveSettings({ mode: m })}>{b}</button>))}</div>
    {st.mode === 'system' && <p className="m-set-hint">기기 설정을 따라가요. 지금은 {systemIsDark() ? '다크' : '라이트'}예요</p>}
    <h3 className="m-set-h">색상 테마</h3>
    <div className="m-card m-themes">{THEMES.map(([t, name, rail, side]) => (
      <button key={t} className={st.theme === t ? 'on' : ''} onClick={() => ws.saveSettings({ theme: t })} aria-pressed={st.theme === t}>
        <span><i style={{ background: rail }} /><i style={{ background: side }} /></span>{name}</button>))}</div>
    <p className="m-set-hint">PC의 레일과 사이드바 색이에요. 라이트 모드에서는 바탕도 같은 계열 색으로 바뀌어요.</p>
  </>;
  if (k === 'ws') return <>
    <ul className="m-card m-list">
      <li className="m-set-f"><span>워크스페이스 이름</span>
        <input defaultValue={st.wsName} key={st.wsName} maxLength={40} aria-label="워크스페이스 이름"
          onBlur={(e) => { const v = e.target.value.trim() || 'DeskMate'; if (v !== st.wsName) ws.saveSettings({ wsName: v }); }} /></li>
      {num('하루 목표 (시간)', st.goalHours, 1, 14, (n) => ws.saveSettings({ goalHours: n }))}
      {tgl('근태만큼 목표 줄이기', st.leaveGoal, (b) => { ws.saveSettings({ leaveGoal: b }); ws.say(b ? '근태만큼 목표를 줄여서 계산해요' : '근태와 상관없이 목표를 그대로 계산해요'); })}
    </ul>
    <p className="m-set-hint">{LEAVE_GOAL_HINT}</p>
  </>;
  if (k === 'pomo') return <>
    <ul className="m-card m-list">
      {num('집중 (분)', c.focusMin, 5, 90, (n) => ws.timer.setCfg({ focusMin: n }))}
      {num('짧은 휴식 (분)', c.shortMin, 1, 30, (n) => ws.timer.setCfg({ shortMin: n }))}
      {num('긴 휴식 (분)', c.longMin, 5, 60, (n) => ws.timer.setCfg({ longMin: n }))}
      {tgl('자동 다음 세션', c.autoStart, (b) => ws.timer.setCfg({ autoStart: b }))}
    </ul>
    <h3 className="m-set-h">타이머 색</h3>
    <div className="m-card m-tcs" role="radiogroup" aria-label="타이머 색">{TIMER_COLORS.map(([col, n]) => (
      <button key={col} role="radio" aria-checked={st.timerColor === col} aria-label={n} className={st.timerColor === col ? 'on' : ''}
        style={{ '--c': col } as React.CSSProperties} onClick={() => ws.saveSettings({ timerColor: col })} />))}</div>
    <p className="m-set-hint">다이얼의 남은 시간에 쓰여요. 휴식 중에는 같은 색이 옅게 칠해져요. 초록은 근태 색이라 뺐어요.</p>
  </>;
  if (k === 'away') return <>
    <ul className="m-card m-list">
      {tgl('자리비움 자동 감지', st.away, (b) => ws.saveSettings({ away: b }))}
      {num('기준 (분)', st.awayMin, 3, 60, (n) => ws.saveSettings({ awayMin: n }))}
    </ul>
    <p className="m-set-hint">{AWAY_HINT} 감지는 PC의 Chrome이나 Edge에서 해요. 폰은 손에 들고 다녀서 감지하지 않아요.</p>
  </>;
  if (k === 'data') return <DataImages ws={ws} goDay={goDay} />;
  if (k === 'slot') return <>
    <h3 className="m-set-h">시간 기록 카테고리</h3>
    <p className="m-set-hint">{SLOT_HINT}</p>
    <CatList ws={ws} />
  </>;
  return null;
}

/** PC 설정 › 시간 기록의 CatList 와 같은 일 — 색 점을 누르면 아래에 팔레트, 이름은 칸을 떠날 때 저장 */
function CatList({ ws }: { ws: Workspace }) {
  const list = ws.cats;
  const [pal, setPal] = useState<number | null>(null);
  const put = (i: number, c: Partial<Cat>) => list.map((x, j) => (j === i ? { ...x, ...c } : x));
  return (
    <ul className="m-card m-list m-catl">
      {list.map((c, i) => (
        <li key={c.color}>
          <button className="m-sw" style={{ background: catVar(c.color) }} aria-label="색 고르기" aria-expanded={pal === i} onClick={() => setPal(pal === i ? null : i)} />
          <input maxLength={14} placeholder={`예) ${CAT_EX[i % CAT_EX.length]}`} defaultValue={c.name} aria-label="카테고리 이름"
            onBlur={(e) => { if (e.target.value.trim() !== c.name) ws.setCats(put(i, { name: e.target.value })); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />
          <CloseX onClick={() => ws.setCats(list.filter((_, j) => j !== i))} />
          {pal === i && (
            <div className="m-pal">
              {SLOT_COLORS.map((col) => {
                const mine = col === c.color;
                return <button key={col} className={mine ? 'on' : ''} style={{ background: catVar(col) }} aria-label="이 색으로"
                  disabled={!mine && list.some((x) => x.color === col)}
                  onClick={() => { setPal(null); if (!mine) ws.setCats(put(i, { color: col }), [c.color, col]); }} />;
              })}
            </div>
          )}
        </li>
      ))}
      <li className="m-add-cat" onClick={() => ws.setCats([...list, { color: nextCatColor(list), name: '' }])}>＋ 카테고리 추가</li>
    </ul>
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
            <span className="m-av" style={r.m ? avStyle(r.m.color, r.m.avatar) : avStyle(ws.settings.color, ws.settings.avatar)}>{r.m ? avText(r.m.emoji || r.m.nick.slice(0, 1), r.m.avatar) : avText(ws.initial, ws.settings.avatar)}<i className={`m-dot ${p}`} /></span>
            <div className="m-row-l"><b>{r.nick}{r.me && <small> (나)</small>}</b>
              <span>{r.me ? STATE_LABEL[ws.state] : st ? `${st.emoji ? st.emoji + ' ' : ''}${st.topic || st.label}` : ''}</span></div>
            <div className="m-row-r"><b>{fmtDur(r.min)}</b></div>
          </li>
        );
      })}
    </ul>
  );
}

/** 설정 › 데이터 › 이미지 — PC 와 같은 숫자 · 같은 목록. 지우기는 한 번 더 묻는다 */
function DataImages({ ws, goDay }: { ws: Workspace; goDay: (date: string) => void }) {
  const { list, usedTxt, pct } = useImageList(ws);
  const [ask, setAsk] = useState<string | null>(null);
  return <>
    <h3 className="m-set-h">이미지</h3>
    <div className="m-card m-img-use">
      <div><b>{usedTxt}</b><span>{list.length}장</span></div>
      <div className="m-an-track"><i style={{ width: `${pct}%` }} /></div>
    </div>
    <p className="m-set-hint">{IMG_HINT}</p>
    {list.length > 0 && (
      <ul className="m-card m-list m-imgl">
        {list.map((m) => (
          <li key={m.id} className="m-row" onClick={() => goDay(m.date)}>
            <Thumb ws={ws} id={m.id} className="m-img-th" />
            <div className="m-row-l"><b>{imgDay(m.date)}</b><span>{m.area === 'memo' || m.area === 'wmemo' ? 'Memo' : 'Today'} · {fmtMB(m.size)}</span></div>
            <button className={`m-img-del${ask === m.id ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); if (ask === m.id) { ws.removeImage(m.id); setAsk(null); } else setAsk(m.id); }}>
              {ask === m.id ? '정말 삭제' : '삭제'}</button>
          </li>
        ))}
      </ul>
    )}
    <h3 className="m-set-h">휴지통</h3>
    {!ws.trash.length
      ? <p className="m-set-hint">휴지통이 비어 있어요.</p>
      : <>
        <ul className="m-card m-list">
          {ws.trash.map((t) => (
            <li key={t.id} className="m-row">
              <div className="m-row-l"><b>{t.label}</b><span>{daysLeft(t.at)}일 뒤 삭제</span></div>
              <button className="m-img-del" onClick={() => ws.restoreTrash(t.id)}>복원</button>
              <button className={`m-img-del${ask === t.id ? ' on' : ''}`} onClick={() => { if (ask === t.id) { ws.purgeTrash(t.id); setAsk(null); } else setAsk(t.id); }}>
                {ask === t.id ? '정말 삭제' : '영구 삭제'}</button>
            </li>
          ))}
        </ul>
        <p className="m-set-hint">지운 하루 기록은 30일 동안 여기 남고, 그 뒤에 사라져요.</p>
      </>}
  </>;
}
