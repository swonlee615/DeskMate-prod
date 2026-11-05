/**
 * 설정 › 자리비움 › 업무 앱 기준 (v3 appsCardHtml · bindAppsCard) — PC 앱에서만 보인다
 * ★ v3 처럼 바꾸는 즉시 저장한다 (설정 창의 «취소» 로 되돌리지 않는다 · v3.1.216 SNAP_SKIP)
 * ★ 출근 감지 줄은 여기 (v3.2.0). 오늘 휴게 요약은 아직
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { appKey, appLabel, appMatches, putApp, ACTIVE_SEC, SAMPLE_MS, WORK_TOLERANCE, type AppEntry, type FrontApp } from '../domain/workApps';

type Kind = 'work' | 'away';
const NAME: Record<Kind, string> = { work: '업무 앱', away: '딴짓 앱' };
const toEntry = (f: FrontApp): AppEntry => ({ id: f.id || null, name: f.name || f.id || '', exec: f.exec || f.name || null });

export function WorkAppsCard({ ws }: { ws: Workspace }) {
  const s = ws.settings, live = ws.idle.live;
  const [catalog, setCatalog] = useState<FrontApp[]>([]);
  useEffect(() => {
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke<FrontApp[]>('installed_apps_list')).then(setCatalog, () => setCatalog([]));
  }, []);

  const cfg = { workApps: s.workApps, nonWorkApps: s.nonWorkApps, unknownApp: s.unknownApp };
  const put = (kind: Kind, e: AppEntry) => {
    ws.saveSettings(putApp(cfg, kind, e));
    ws.say(`${appLabel(e)} → ${NAME[kind]}으로 지정했어요`);
  };
  const del = (kind: Kind, key: string) => {
    const k = kind === 'work' ? 'workApps' : 'nonWorkApps';
    ws.saveSettings({ [k]: s[k].filter((x) => appKey(x) !== key) });
  };
  const min = s.awayMin, tol = Math.round(min * WORK_TOLERANCE);
  const win = live?.winMs ?? 0;
  const unseen = (live?.seen ?? []).filter((f) => ![...s.workApps, ...s.nonWorkApps].some((e) => appMatches(e, f)));

  const chips = (kind: Kind) => {
    const list = kind === 'work' ? s.workApps : s.nonWorkApps;
    if (!list.length) return <em className="ap-empty">아직 없어요</em>;
    return list.map((e) => (
      <span key={appKey(e)} className={`chip ${kind}`} title={e.id || '번들 ID가 없어 이름으로 맞춰요'}>
        <b>{appLabel(e)}</b>{!e.id && <i className="warn" title="번들 ID를 못 읽어 이름으로 맞춰요">!</i>}
        <button type="button" title="삭제" aria-label={`${appLabel(e)} 삭제`} onClick={() => del(kind, appKey(e))}>✕</button></span>
    ));
  };

  return (
    <>
      <div className="ap-row">
        <label>업무 앱 기준</label>
        <select data-tgl aria-label="업무 앱 기준" value={s.workAppsOn ? '1' : '0'} onChange={(e) => ws.saveSettings({ workAppsOn: e.target.value === '1' })}>
          <option value="1">켜기</option><option value="0">끄기</option></select>
      </div>
      <p className="ap-why"><b>업무 앱 기준</b>은 한 걸음 더 가요. PC는 쓰고 있는데 아래 <b>딴짓 앱</b>만 {min}분 넘게 쓰고 있으면
        (같은 시간 업무 앱은 {tol}분 이하) 그것도 휴게로 봐요. <b>맨 앞에 띄워 놓고 실제로 손대는 앱</b>만 세고,
        {ACTIVE_SEC}초 넘게 입력이 없으면 표본에서 빼서 띄워만 둔 앱은 잡히지 않아요.</p>
      <div className="ap-row">
        <label>출근 감지</label>
        <select data-tgl aria-label="출근 감지" value={s.arrivalDetect ? '1' : '0'} onChange={(e) => ws.saveSettings({ arrivalDetect: e.target.value === '1' })}>
          <option value="1">켜기</option><option value="0">끄기</option></select>
        <label style={{ marginLeft: 8 }}>취소 후 다시 묻기</label>
        <input className="n" type="number" min={1} max={240} step={1} aria-label="취소 후 다시 묻기까지 분" defaultValue={s.arrivalCooldownMin} key={s.arrivalCooldownMin}
          onBlur={(e) => { const v = Math.max(1, Math.min(240, Math.round(+e.target.value || 30))); if (v !== s.arrivalCooldownMin) ws.saveSettings({ arrivalCooldownMin: v }); else e.target.value = String(v); }} />
        <label>분 뒤</label>
      </div>
      <p className="ap-why"><b>출근 감지</b>는 출근을 누르지 않은 채 <b>업무 앱을 3분 연속</b> 쓰면 출근했는지 물어요.
        기록되는 출근 시각은 <b>처음 감지된 시각</b>이에요. 퇴근한 뒤 다시 업무 앱을 잡아도 같은 방식으로 «업무 재개»를 물어요.<br />
        <b>취소</b>는 지금까지의 감지를 버리고 위 시간 뒤부터 다시 세고, <b>오늘은 묻지 않기</b>는 자정까지 멈춰요.
        {!s.workAppsOn && <><br />⚠️ 출근 감지는 업무 앱 목록으로 판단해요. <b>업무 앱 기준</b>이 꺼져 있어 지금은 동작하지 않아요.</>}</p>
      {s.workAppsOn && live && (
        <div className="ap-meter">
          <span>최근 {Math.round(win / 60000)}분 실사용</span>
          <span className="mt"><i className="d" style={{ width: `${Math.min(100, live.distractMs / win * 100)}%` }} /><i className="w" style={{ width: `${Math.min(100, live.workMs / win * 100)}%` }} /></span>
          <span className="mv">딴짓 <b>{Math.round(live.distractMs / 60000)}분</b> · 업무 <b>{Math.round(live.workMs / 60000)}분</b></span>
          <span className="ap-hint2">{min}분 넘게 딴짓하고 업무는 {tol}분 이하면 휴게로 바꿔요</span>
        </div>
      )}
      {(['work', 'away'] as Kind[]).map((kind) => (
        <div key={kind} className="ap-grp">
          <div className="ap-h">{kind === 'work' ? '💻 업무 앱 · 쓰고 있으면 근무로 봐요' : '☕️ 딴짓 앱 · 쓰고 있으면 휴게로 봐요'}</div>
          <div className="chips">{chips(kind)}</div>
          <AppPicker catalog={catalog} chosen={[...s.workApps, ...s.nonWorkApps]} onPick={(e) => put(kind, e)} />
        </div>
      ))}
      {unseen.length > 0 && (
        <div className="ap-grp"><div className="ap-h">👀 최근 감지된 앱 · 눌러서 나눠 주세요</div>
          <div className="chips">{unseen.map((f) => (
            <span key={appKey(f)} className="chip seen"><b>{appLabel(f)}</b>
              <button type="button" onClick={() => put('work', toEntry(f))}>업무</button>
              <button type="button" onClick={() => put('away', toEntry(f))}>딴짓</button></span>
          ))}</div></div>
      )}
      <div className="ap-row">
        <label htmlFor="set-unknownApp">두 목록에 없는 앱은</label>
        <select id="set-unknownApp" value={s.unknownApp} onChange={(e) => ws.saveSettings({ unknownApp: e.target.value === 'work' ? 'work' : 'away' })}>
          <option value="away">딴짓으로 봐요 (업무 앱 목록만 허용)</option>
          <option value="work">업무로 봐요 (딴짓 앱 목록만 막음)</option>
        </select>
      </div>
      <p className="ap-note"><b>맨 앞에 있고 실제로 손대고 있는 앱</b>만 세요. 뒤에 떠 있기만 한 앱은 세지 않아요.
        {SAMPLE_MS / 1000}초마다 표본을 쌓아 최근 {Math.round((win || 0) / 60000) || Math.max(15, min * 2)}분을 <b>합쳐서</b> 보니까, 딴짓 앱과 업무 앱을 오가도 함께 판단해요.<br />
        지금 쓰는 앱 이름은 이 PC 안에서만 읽어요. 고른 목록은 다른 PC의 DeskMate에서도 같이 써요.</p>
    </>
  );
}

/** 앱 고르기 (v3 appPicker · v2.9.21 콤보박스) — 이름 어디에 있든 걸린다 (크롬 = 'Google Chrome') */
function AppPicker({ catalog, chosen, onPick }: { catalog: FrontApp[]; chosen: AppEntry[]; onPick: (e: AppEntry) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const taken = useMemo(() => new Set(chosen.map((e) => (e.name || '').toLowerCase())), [chosen]);
  const pool = catalog.filter((a) => !taken.has((a.name || '').toLowerCase()));
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, '');
  const list = pool.filter((a) => norm(a.name || '').includes(norm(q))).slice(0, 60);

  const pick = (a?: FrontApp) => {
    const v = q.trim();
    if (a) onPick(toEntry(a));
    else if (v) onPick({ id: null, name: v });
    else return;
    setQ(''); setOpen(false); setHi(0);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(list.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(open && list.length ? list[hi] : undefined); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  const dupe = <p className="ap-dupe">이미 업무 앱이나 딴짓 앱으로 지정한 앱은 다시 고를 수 없어요.</p>;

  if (!pool.length) return (
    <><div className="chips"><div className="ap-cb">
      <input ref={inp} className="ap-add" placeholder="앱 이름 직접 입력 + Enter" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} />
    </div></div>{dupe}</>
  );
  return (
    <><div className="chips"><div className="ap-cb">
      <input ref={inp} className="ap-add" autoComplete="off" role="combobox" aria-expanded={open} aria-autocomplete="list"
        placeholder="지정할 앱을 골라 주세요" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onKeyDown={key}
        onBlur={() => setTimeout(() => setOpen(false), 80)} />
      <button className="ap-cb-arrow" type="button" tabIndex={-1} aria-label="설치된 앱 목록 열기"
        onMouseDown={(e) => { e.preventDefault(); setOpen(!open); inp.current?.focus(); }}>
        <svg viewBox="0 0 20 20"><path d="m6 8.5 4 4 4-4" /></svg></button>
      {open && <div className="ap-menu" role="listbox">
        {!q && <div className="ap-mgrp">이름 일부만 적어도 돼요. 크롬은 'Google Chrome'이에요</div>}
        {list.length ? list.map((a, i) => (
          <button key={a.id || a.name} type="button" role="option" aria-selected={i === hi} className={`ap-opt${i === hi ? ' on' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); pick(a); }} onMouseEnter={() => setHi(i)}>
            <span className="ao-n">{a.name}</span></button>
        )) : <div className="ap-opt none">설치된 앱 중에는 없어요. <b>Enter</b>를 누르면 적은 이름 그대로 넣어요</div>}
      </div>}
    </div></div>{dupe}</>
  );
}
