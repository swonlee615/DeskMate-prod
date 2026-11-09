/**
 * 설정 (v3 #settings · `.set-modal`) — 옮긴 칸만 연다. 나머지는 레일처럼 «준비 중»
 * 옮긴 것: 일반(화면 모드 · 색상 테마) · 워크스페이스(이름 · 하루 목표 · 근태만큼 목표 줄이기) · 뽀모도로 · 시간 기록
 *
 * ★ v3 처럼 «저장» 을 눌러야 반영된다. 화면 모드 · 테마는 고르는 즉시 미리 보이고, «근태만큼 목표 줄이기» 는
 *   누르는 순간 앱 전체에 반영된다 (v3.1.209) — 둘 다 «취소» 하면 원래대로 돌아간다
 * ★ 시간 기록 카테고리는 v3 처럼 바로 저장한다 (칸을 떠날 때)
 */
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { catVar, SLOT_COLORS } from '../domain/attendance/logs';
import { CAT_EX, nextCatColor, type Cat } from '../domain/attendance/cats';
import { applyLook, LEAVE_GOAL_HINT, MODES, SET_NAV, systemIsDark, THEMES, TIMER_COLORS, type Settings } from '../ui/settingsNav';
import type { PomoCfg } from '../app/usePomodoro';
import { IMG_HINT, imgDay, Thumb, useImageList } from '../ui/ImageList';
import { AWAY_HINT, idleText, useCatSum } from '../ui/settingsNav';
import { fmtMB } from '../domain/images';
import type { V3Pick } from '../app/useWorkspace';
import { WorkAppsCard } from './WorkApps';
import { deviceKind } from '../data/device';
import { notify } from '../app/notify';
import { PERSONAS, PERSONA_SLIDERS, toneLabel, type Member } from '../domain/sim/team';
import { avStyle, avText } from '../ui/avatar';

type Draft = Settings & PomoCfg;
const clamp = (v: number, a: number, b: number, d: number) => (Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : d);

export function SettingsModal({ ws, onClose, onDay }: { ws: Workspace; onClose: () => void; onDay: (k: string) => void }) {
  const orig = useRef(ws.settings);
  const [pane, setPane] = useState('general');
  const [d, setD] = useState<Draft>({ ...ws.settings, ...ws.timer.cfg });
  const put = (x: Partial<Draft>) => setD((v) => ({ ...v, ...x }));
  const [mem, setMem] = useState<Member[]>(ws.members);
  useEffect(() => { applyLook(d.mode, d.theme); }, [d.mode, d.theme]);

  const cancel = () => {
    const o = orig.current;
    applyLook(o.mode, o.theme);
    if (ws.settings.leaveGoal !== o.leaveGoal) ws.saveSettings({ leaveGoal: o.leaveGoal });
    onClose();
  };
  const save = () => {
    const goalHours = clamp(d.goalHours, 1, 14, orig.current.goalHours);
    ws.saveSettings({ mode: d.mode, theme: d.theme, wsName: d.wsName.trim() || 'DeskMate', goalHours, leaveGoal: d.leaveGoal, timerColor: d.timerColor, notify: d.notify, trayPomo: d.trayPomo, away: d.away, awayMin: clamp(d.awayMin, 3, 60, orig.current.awayMin) });
    const c = ws.timer.cfg;
    const pomo: PomoCfg = { ...c, focusMin: clamp(d.focusMin, 5, 90, c.focusMin), shortMin: clamp(d.shortMin, 1, 30, c.shortMin), longMin: clamp(d.longMin, 5, 60, c.longMin), autoStart: d.autoStart };
    if ((Object.keys(pomo) as (keyof PomoCfg)[]).some((k) => pomo[k] !== c[k])) ws.timer.setCfg(pomo);
    if (mem !== ws.members) ws.saveMembers(mem);
    ws.say('설정을 저장했어요');
    onClose();
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const num = (k: keyof Draft, min: number, max: number) => (
    <input id={`set-${k}`} type="number" min={min} max={max} value={Number.isFinite(d[k]) ? String(d[k]) : ''} onChange={(e) => put({ [k]: e.target.valueAsNumber } as Partial<Draft>)} />
  );
  const tgl = (v: boolean, on: (b: boolean) => void, label: string) => (
    <select data-tgl aria-label={label} value={v ? '1' : '0'} onChange={(e) => on(e.target.value === '1')}>
      <option value="1">켜기</option><option value="0">끄기</option></select>
  );

  return (
    <div className="modal-bg open" id="settings" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="modal set-modal">
        <div className="set-wrap">
          <nav className="set-nav">
            <div className="set-nav-t">설정</div>
            {SET_NAV.map((n) => [
              n.sep && <div key={`${n.k}-sep`} className="set-nav-sep" />,
              <button key={n.k} className={`set-nav-i${!n.on ? ' soon' : pane === n.k ? ' on' : ''}`} data-set-nav={n.k} aria-disabled={!n.on}
                onClick={() => (n.on ? setPane(n.k) : ws.say(`${n.nm} 설정은 준비 중이에요`))}>
                <span className="ni">{n.ni}</span><span className="nm">{n.nm}</span></button>,
            ])}
          </nav>
          <div className="modal-body set-body">
            {pane === 'general' && (
              <section className="set-panel on" data-set-panel="general">
                <h4>일반</h4>
                <h4 className="set-sub" style={{ marginTop: 0 }}>보기</h4>
                <div className="field">
                  <label>화면 모드</label>
                  <div className="mode-pick" id="setMode">
                    {MODES.map(([k, mi, b, i]) => (
                      <button key={k} type="button" data-mode-k={k} className={d.mode === k ? 'on' : ''} onClick={() => put({ mode: k })}>
                        <span className="mi">{mi}</span><b>{b}</b><i>{k === 'system' && d.mode === 'system' ? `${i} (지금은 ${systemIsDark() ? '다크' : '라이트'})` : i}</i></button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>색상 테마</label>
                  <div className="themes" id="setThemes">
                    {THEMES.map(([k, name, rail, side]) => (
                      <button key={k} className={`theme-sw${d.theme === k ? ' on' : ''}`} data-theme-k={k} onClick={() => put({ theme: k })}>
                        <span className="tw"><i style={{ background: rail }} /><i style={{ background: side }} /></span><span>{name}</span></button>
                    ))}
                  </div>
                  <p className="hint">레일과 사이드바 색을 바꿔요.
                    라이트 모드에서는 <b>본문 바탕까지 같은 색 계열</b>로 바뀌어요.
                    포레스트를 고르면 카드도 아주 옅은 초록빛이 돼요.</p>
                </div>
                {deviceKind() === 'desktop' ? <>
                  <h4 className="set-sub">메뉴바</h4>
                  <div className="field row2">
                    <div><label>메뉴바에 뽀모도로 두기</label><select id="setTrayPomo" data-tgl aria-label="메뉴바에 뽀모도로 두기" value={d.trayPomo ? '1' : '0'} onChange={(e) => put({ trayPomo: e.target.value === '1' })}>
                      <option value="1">둔다</option><option value="0">안 둔다</option></select></div>
                    <div />
                  </div>
                  <p className="hint">메뉴바 메뉴의 본체는 <b>출근 · 휴게 · 퇴근</b>이에요. 집중 타이머는 곁이라 끄고 켤 수 있게 뒀어요.<br />
                    <b>끄면</b> «집중 시작»과 시간 목록 두 줄만 사라지고, 메뉴바 글자도 <b>근무 상태</b>만 보여줘요.</p>
                </> : <p className="hint">앱 아이콘, 메뉴바, 시스템 알림은 PC 앱에서 쓸 수 있어요.</p>}
              </section>
            )}
            {pane === 'ws' && (
              <section className="set-panel on" data-set-panel="ws">
                <h4>워크스페이스</h4>
                <div className="field row2">
                  <div><label htmlFor="setWs">워크스페이스 이름</label><input id="setWs" value={d.wsName} maxLength={40} onChange={(e) => put({ wsName: e.target.value })} /></div>
                  <div><label htmlFor="set-goalHours">하루 목표 (시간)</label>{num('goalHours', 1, 14)}</div>
                </div>
                <div className="field row2">
                  <div><label>근태만큼 목표 줄이기</label>{tgl(d.leaveGoal, (b) => {
                    put({ leaveGoal: b });
                    ws.saveSettings({ leaveGoal: b });
                    ws.say(b ? '근태만큼 목표를 줄여서 계산해요' : '근태와 상관없이 목표를 그대로 계산해요');
                  }, '근태만큼 목표 줄이기')}</div>
                </div>
                <p className="hint">{LEAVE_GOAL_HINT}</p>
              </section>
            )}
            {pane === 'pomo' && (
              <section className="set-panel on" data-set-panel="pomo">
                <h4>뽀모도로</h4>
                <div className="field row2">
                  <div><label htmlFor="set-focusMin">집중 (분)</label>{num('focusMin', 5, 90)}</div>
                  <div><label htmlFor="set-shortMin">짧은 휴식 (분)</label>{num('shortMin', 1, 30)}</div>
                </div>
                <div className="field row2">
                  <div><label htmlFor="set-longMin">긴 휴식 (분)</label>{num('longMin', 5, 60)}</div>
                  <div><label>자동 다음 세션</label>{tgl(d.autoStart, (b) => put({ autoStart: b }), '자동 다음 세션')}</div>
                </div>
                {deviceKind() === 'desktop' && (
                  <div className="field">
                    <label>시스템 알림</label>
                    <span className="nt-test">{tgl(d.notify, (b) => put({ notify: b }), '시스템 알림')}
                      <button className="mini-btn" id="btnNotifyTest" type="button" onClick={async () => {
                        if (!d.notify) { ws.say('위 «시스템 알림»이 꺼져 있어요'); return; }
                        ws.say(await notify('DeskMate 알림 테스트', '이 알림이 보이면 정상이에요.')
                          ? '보냈어요. 안 보이면 macOS 시스템 설정 › 알림에서 DeskMate를 확인해 주세요'
                          : '알림을 보내지 못했어요. macOS 시스템 설정 › 알림에서 DeskMate를 켜 주세요');
                      }}>테스트</button></span>
                    <p className="hint">집중 · 휴식이 끝날 때와 출근 감지가 물을 때 알려요. 알림을 누르면 DeskMate가 열려요.</p>
                  </div>
                )}
                <div className="field">
                  <label>타이머 색</label>
                  <div className="tc-row" id="tcPick" role="radiogroup" aria-label="타이머 색">
                    {TIMER_COLORS.map(([c, n]) => (
                      <button key={c} type="button" className={`tc-sw${d.timerColor === c ? ' on' : ''}`} role="radio" aria-checked={d.timerColor === c}
                        aria-label={n} data-tip={n} style={{ '--c': c } as React.CSSProperties} onClick={() => put({ timerColor: c })} />
                    ))}
                  </div>
                  <p className="hint">다이얼의 남은 시간과 가운데 버튼에 쓰여요. 휴식 중에는 같은 색이 옅게 칠해집니다. 초록은 근태(출근 · 근무 중) 색이라 뺐어요.</p>
                </div>
              </section>
            )}
            {pane === 'away' && (
              <section className="set-panel on" data-set-panel="away">
                <h4>자리비움 · 업무 앱</h4>
                <p className="hint" style={{ marginTop: 0 }}>{AWAY_HINT}</p>
                <div className="field row2">
                  <div><label>자리비움 자동 감지</label>{tgl(d.away, (b) => put({ away: b }), '자리비움 자동 감지')}</div>
                  <div><label htmlFor="set-awayMin">기준 (분)</label>{num('awayMin', 3, 60)}</div>
                </div>
                <div className="sec-t">{ws.idle.perm === 'app' ? '이 PC 앱' : '이 브라우저'}</div>
                <p className="hint">{idleText(ws.idle.perm)}</p>
                {ws.idle.perm === 'prompt' && <button className="btn primary sm" onClick={() => void ws.idle.ask()}>이 브라우저에서 감지 허용</button>}
                <div className="sec-t">업무 앱 기준</div>
                {ws.idle.perm === 'app' ? <WorkAppsCard ws={ws} />
                  : <p className="hint">어떤 앱을 쓰고 있는지는 브라우저가 볼 수 없어요. 업무 앱 기준 감지와 출근 감지는 PC 앱에서 쓸 수 있어요.</p>}
              </section>
            )}
            {pane === 'data' && <DataPane ws={ws} onDay={(k) => { cancel(); onDay(k); }} />}
            {pane === 'members' && (
              <section className="set-panel on" data-set-panel="members">
                <h4>멤버 설정</h4>
                <div className="sec-t" style={{ marginTop: 0 }}>동료 멤버</div>
                <p className="hint">성향은 근무 패턴(출퇴근 시각 · 집중 길이 · 휴가 빈도)을 결정해요.</p>
                <MemberList list={mem} onChange={setMem} />
              </section>
            )}
            {pane === 'slot' && (
              <section className="set-panel on" data-set-panel="slot">
                <h4>시간 기록 카테고리</h4>
                <p className="hint">시간 기록에 쓰는 <b>색마다 이름을 붙이면 카테고리</b>가 됩니다.
                  이름이 있으면 일간 상세에서 색 대신 그 이름으로 보이고, 비워 두면 색으로만 구분해요.<br />
                  기록에는 색만 남기 때문에 이름을 바꿔도 지난 기록이 그대로 따라옵니다.</p>
                <CatList ws={ws} />
              </section>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" id="setCancel" onClick={cancel}>취소</button>
          <button className="btn primary" id="setSave" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

/** v3 renderCatSetup — 색(프리셋에서) · 이름 · 지우기 · 추가. 이름은 칸을 떠날 때 저장 */
function CatList({ ws }: { ws: Workspace }) {
  const list = ws.cats;
  const sum = useCatSum(ws);
  const [pop, setPop] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pop) return;
    const away = (e: MouseEvent) => { if (!(e.target as Element).closest('.cat-pop')) setPop(null); };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    return () => document.removeEventListener('mousedown', away);
  }, [pop]);
  const put = (i: number, c: Partial<Cat>) => list.map((x, j) => (j === i ? { ...x, ...c } : x));
  return (
    <div id="catList" className="cat-list">
      {list.map((c, i) => (
        <div className="cat-row" key={c.color}>
          <button className="cat-sw" type="button" style={{ '--c': catVar(c.color) } as React.CSSProperties} title="색 고르기"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPop({ i, x: r.left, y: r.bottom + 6 }); }} />
          <input data-f="name" maxLength={14} placeholder={`예) ${CAT_EX[i % CAT_EX.length]}`} defaultValue={c.name}
            onBlur={(e) => { if (e.target.value.trim() !== c.name) ws.setCats(put(i, { name: e.target.value })); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />
          <span className="cat-sum">{sum(c.color)}</span>
          <button className="imgbtn danger" title="이 카테고리 삭제" onClick={() => ws.setCats(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="cat-foot">
        <button className="btn ghost sm" id="catSetAdd" onClick={() => ws.setCats([...list, { color: nextCatColor(list), name: '' }])}>＋ 카테고리 추가</button>
        <span className="hint2">카테고리를 지워도, 그 색을 쓰던 지난 기록은 색 그대로 남아요</span>
      </div>
      {pop && (
        <div className="cat-pop" style={{ position: 'fixed', left: Math.min(pop.x, window.innerWidth - 200), top: pop.y }}>
          {/* 다른 카테고리가 쓰는 색은 못 고른다 — 고르면 두 카테고리가 하나로 합쳐진다 */}
          {SLOT_COLORS.map((col) => {
            const mine = col === list[pop.i].color;
            const taken = !mine && list.some((x) => x.color === col);
            return (
              <button key={col} type="button" className={mine ? 'on' : ''} disabled={taken} style={{ '--c': catVar(col), opacity: taken ? 0.25 : undefined } as React.CSSProperties}
                onClick={() => { setPop(null); if (!mine) ws.setCats(put(pop.i, { color: col }), [list[pop.i].color, col]); }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 데이터 › 이미지 — 쓰는 양 막대 · 그림 목록 (SYNC §14) */
function DataPane({ ws, onDay }: { ws: Workspace; onDay: (k: string) => void }) {
  const { list, usedTxt, pct } = useImageList(ws);
  const [ask, setAsk] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const shown = big ? [...list].sort((a, b) => b.size - a.size) : list;
  return (
    <section className="set-panel on" data-set-panel="data">
      <h4>데이터</h4>
      <div className="sec-t" style={{ marginTop: 0 }}>이미지</div>
      <div className="img-use"><b>{usedTxt}</b><span>{list.length}장</span></div>
      <div className="bar img-bar"><i className="done" style={{ width: `${pct}%` }} /></div>
      <p className="hint">{IMG_HINT}</p>
      {list.length ? <>
        <div className="seg sub img-sort">
          <button className={big ? '' : 'on'} onClick={() => setBig(false)}>최근 순</button>
          <button className={big ? 'on' : ''} onClick={() => setBig(true)}>큰 순</button>
        </div>
        {/* 그림이 많아도 설정 창이 길어지지 않게 — 이 상자 안에서만 굴린다 */}
        <div className="img-box">
          <ul className="img-grid">
            {shown.map((m) => (
              <li key={m.id} className="img-tile" onMouseLeave={() => ask === m.id && setAsk(null)}>
                <Thumb ws={ws} id={m.id} className="img-th" />
                <div className={`img-act${ask === m.id ? ' ask' : ''}`}>
                  {ask === m.id
                    ? <><button onClick={() => setAsk(null)}>취소</button>
                      <button className="sure" onClick={() => { ws.removeImage(m.id); setAsk(null); }}>정말 삭제</button></>
                    : <><button onClick={() => onDay(m.date)}>그 날로</button>
                      <button className="del" onClick={() => setAsk(m.id)}>삭제</button></>}
                </div>
                <span className="img-cap"><b>{imgDay(m.date)}</b><span>{m.area === 'memo' || m.area === 'wmemo' ? 'Memo' : 'Today'} · {fmtMB(m.size)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </> : <p className="hint" style={{ marginTop: 8 }}>아직 넣은 그림이 없어요. 할 일 · 메모에 그림을 붙여넣거나 끌어다 놓으면 여기에 모여요.</p>}
      <V3Import ws={ws} />
    </section>
  );
}

/** 로컬 앱(v3) 데이터 가져오기 — 파일을 읽어 무엇이 옮겨지는지 먼저 보여 주고, 누르면 그때 쓴다 */
function V3Import({ ws }: { ws: Workspace }) {
  const [pick, setPick] = useState<V3Pick | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const n = (x: number) => x.toLocaleString('ko-KR');
  const read = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setStep(null);
    try { setPick(await ws.v3Preview(f)); } catch { setPick(null); setErr('이 파일을 읽지 못했어요. 로컬 앱의 deskmate.sqlite 파일인지 확인해 주세요.'); }
  };
  const go = async () => {
    if (!pick) return;
    try { await ws.v3Import(pick, setStep); setPick(null); ws.say('로컬 앱 데이터를 가져왔어요'); }
    catch { setStep(null); setErr('가져오다가 멈췄어요. 같은 파일을 다시 가져오면 돼요. 이미 들어간 기록은 덮어써요.'); }
  };
  const r = pick?.conv.report, done = ws.v3Imported;
  return (
    <>
      <div className="sec-t">로컬 앱 데이터 가져오기</div>
      <p className="hint">맥에서 쓰던 DeskMate의 기록을 이 계정으로 옮겨요. 파일은 Finder에서 ⌘⇧G를 누르고
        <b> ~/Library/Application Support/DeskMate</b>를 열면 있는 <b>deskmate.sqlite</b>예요.</p>
      {done && !pick && <p className="hint">{new Date(done.at).toLocaleDateString('ko-KR')}에 가져왔어요. 다시 가져오면 그 파일의 값으로 덮어써요.</p>}
      {ws.backend.mode === 'local' && <p className="hint">지금은 개발 모드라 이 기기에만 들어가요.</p>}
      {!pick && !step && (
        <label className="btn ghost sm v3-pick">파일 고르기
          <input type="file" accept=".sqlite,.db,application/octet-stream" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} /></label>
      )}
      {err && <p className="hint v3-err">{err}</p>}
      {pick && r && !step && (
        <div className="v3-sum">
          <ul>
            <li>근태 <b>{n(r.days)}일</b> (휴게 {n(r.breaks)}건)</li>
            <li>할 일과 메모 <b>{n(r.lines)}줄</b>. 다음 날로 넘어간 줄은 처음 적은 날의 한 줄로 합쳐요</li>
            <li>시간 기록 <b>{n(r.slots)}건</b>, 근무 밖 휴게 {n(r.rests)}건, 뽀모도로 {n(r.pomos + r.pomosAdded)}회</li>
            <li>그림 <b>{n(r.images)}장</b>, D-Day {n(pick.conv.ddays.length)}개, 습관 {n(pick.conv.habits.length)}개</li>
            {pick.conv.members && <li>멤버 <b>{n(pick.conv.members.length)}명</b>(성향과 프로필 그림까지), 내 프로필, 워크스페이스 로고와 색, 팀 근무시간대</li>}
            <li>원본 파일도 통째로 보관해요. 대화, 앱 사용 기록처럼 웹에 아직 없는 기능의 데이터도 남아요.</li>
          </ul>
          <p className="hint">웹에 같은 날 기록이 있으면 로컬 앱의 기록으로 바뀌어요.</p>
          <div className="v3-act">
            <button className="btn ghost sm" onClick={() => setPick(null)}>취소</button>
            <button className="btn primary sm" onClick={() => void go()}>가져오기</button>
          </div>
        </div>
      )}
      {step && <p className="hint v3-step">{step === '끝' ? '다 가져왔어요.' : `${step}…`}</p>}
    </>
  );
}

/** 설정 › 멤버 설정 (v3 memRowHtml · 읽기 줄 + 성향) — 바꾼 값은 «저장» 을 눌러야 반영된다 */
function MemberList({ list, onChange }: { list: Member[]; onChange: (l: Member[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const put = (id: string, c: Partial<Member>) => onChange(list.map((m) => (m.id === id ? { ...m, ...c } : m)));
  return (
    <div id="memEdit">
      <div className="mem-bar"><span className="hint2">지금 {list.length}명 · 아래 «저장»을 눌러야 반영돼요</span></div>
      {list.map((m) => [
        <div key={m.id} className={`mem-row${m.enabled === false ? ' hidden-m' : ''}`}>
          <span className="av-cell"><span className="avprev none" style={avStyle(m.color, m.avatar)}>{avText(m.nick.slice(0, 1).toUpperCase() || '?', m.avatar)}</span></span>
          <span className="mr-nick">{m.nick || '(닉네임 없음)'}</span>
          <span className="mr-name">{m.name || '–'}</span>
          <span className="mr-role">{m.role || '–'}</span>
          <span className="mr-tag">{m.rank}</span>
          <span className="mr-tag soft">{toneLabel(m.tone)}</span>
          {m.enabled === false && <span className="mr-off">숨김</span>}
          <button className="txtbtn" type="button" aria-expanded={open === m.id} data-tip="근무 성향. 출퇴근 시각 · 집중 길이 · 휴가 빈도"
            onClick={() => setOpen(open === m.id ? null : m.id)}>성향</button>
        </div>,
        open === m.id && (
          <div key={`${m.id}-p`} className="persona">
            <div className="ps-row"><span>프리셋</span>
              <select value="" aria-label={`${m.nick} 성향 프리셋`} onChange={(e) => { const p = PERSONAS.find(([k]) => k === e.target.value); if (p) put(m.id, p[2]); }}>
                <option value="">직접 조절…</option>
                {PERSONAS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
              </select><span className="hint" style={{ margin: 0 }}>고르면 아래 값이 한 번에 바뀌어요</span></div>
            {PERSONA_SLIDERS.map(([f, name, lo, hi, st]) => (
              <label key={f} className="ps-sl"><span>{name}</span>
                <input type="range" min={lo} max={hi} step={st} value={m[f]} onChange={(e) => put(m.id, { [f]: +e.target.value })} />
                <em>{m[f]}</em></label>
            ))}
          </div>
        ),
      ])}
    </div>
  );
}
