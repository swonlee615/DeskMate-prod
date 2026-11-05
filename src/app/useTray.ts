/**
 * 메뉴바 (v3 trayState · syncTray — PC 앱 전용)
 * ★ 무엇을 그릴지는 여기서만 정한다. Rust(src-tauri/src/tray.rs)는 받은 모양을 그대로 세우고 누른 id 만 돌려준다
 * ★ 메뉴는 «달라졌을 때만» 다시 세운다 (열어 둔 메뉴가 눈앞에서 닫히지 않게). 초 단위 글자는 따로 보낸다
 * ponytail: v3 의 팝오버 카드 · 마크 아이콘 · 「메뉴바에 뽀모도로 두기」 설정은 아직 — 기본 메뉴에 답을 줄로 세운다
 */
import { useEffect, useRef } from 'react';
import type { Workspace } from './useWorkspace';
import { deviceKind } from '../data/device';
import { PRESETS } from './usePomodoro';
import { dayParts, openBreak, workMinutes } from '../domain/attendance/rules';
import { addDays, dateOf, fmtDur, hhmm, korClock, missedRange, mmss, keyOf } from '../ui/v3fmt';

export interface TrayItem { id?: string; label?: string; checked?: boolean; dim?: boolean; opens?: boolean; sep?: boolean }
export interface TrayState { title: string; head: string[]; items: TrayItem[] }

const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function trayState(ws: Workspace, now: number): TrayState {
  const d = ws.day, t = ws.timer, h = ws.arrival.hit, m = ws.arrival.missed;
  const worked = () => fmtDur(workMinutes(d, now));
  const rest = () => fmtDur(Math.floor(dayParts(d, now).breakMs / 60000));
  const offLine = () => `${d.onAt != null ? hhmm(d.onAt) : ''} → ${d.offAt != null ? hhmm(d.offAt) : ''} · 근무 ${worked()} · 뽀모도로 ${d.pomos ?? 0}회`;
  const remain = t.remainAt(now);
  const focusRows = (): TrayItem[] => PRESETS.map((n) => ({ id: `focus:${n}`, label: `　${n}분`, checked: t.cfg.focusMin === n }));
  const head: string[] = [], items: TrayItem[] = [];
  // 답을 기다리는 물음은 맨 위 — v3 는 팝오버 카드, 기본 메뉴에서는 줄로 선다
  if (m) items.push({ label: `앞서 놓친 업무 기록이 있어요. ${missedRange(m.s, m.e)}`, dim: true },
    { id: 'miss:add', label: '근무로 추가' }, { id: 'miss:drop', label: '취소' }, { sep: true });
  let title: string;
  const pend = ws.pendingDays;

  if (pend.length) {
    title = '확인 필요';
    const k = pend[0], pp = ws.dayOf(k).pending;
    head.push(`${md(k)} 퇴근을 안 누르고 자정을 넘겼어요${pend.length > 1 ? ` · 외 ${pend.length - 1}일` : ''}`);
    if (pp) items.push({ id: 'pendAt', label: `${hhmm(pp.guessOff)}에 퇴근했어요` });
    if (ws.canCarry(k)) items.push({ id: 'pendCarry', label: `계속 일했어요 → ${md(keyOf(addDays(dateOf(k), 1)))} 00:00까지 이어서 근무` });
    items.push({ sep: true }, { id: 'pending', label: `${md(k)} 근무 확인하기…`, opens: true });
  } else if (h && (d.onAt == null || d.offAt != null)) {
    const resume = d.offAt != null;
    title = resume ? '퇴근' : '출근 전';
    if (resume) head.push('퇴근', offLine()); else head.push('출근 전');
    items.push({ label: `${h.mode === 'resume' ? '업무를 다시 시작하셨나요?' : '업무를 시작하셨나요?'} ${korClock(h.at)}부터 근무 중이에요`, dim: true },
      { id: 'arr:go', label: h.mode === 'resume' ? `${korClock(h.at)}부터 업무 재개` : `${korClock(h.at)}로 출근 기록` },
      { id: 'arr:cancel', label: '취소' }, { id: 'arr:snooze', label: '오늘은 묻지 않기' }, { sep: true },
      { id: 'on', label: h.mode === 'resume' ? '업무 재개' : '지금 출근' });
  } else if (openBreak(d) && d.offAt == null) {
    const s = (now - openBreak(d)!.s) / 1000;
    title = mmss(s);
    head.push('휴게 중', `${Math.floor(s / 60)}분째 쉬는 중 · 오늘 휴게 ${rest()}`);
    items.push({ id: 'breakEnd', label: '휴게 끝내기' }, { id: 'off', label: '퇴근하기' });
  } else if (d.offAt != null) {
    title = '퇴근';
    head.push('퇴근', offLine());
    items.push({ id: 'on', label: '다시 출근' });
  } else if (d.onAt == null) {
    title = '출근 전';
    head.push('출근 전');
    items.push({ id: 'on', label: '출근' });
  } else if (t.running || (t.mode === 'focus' && remain < t.total - 1)) {
    // 글자 = 지금 하는 일, 근태는 근무 중 (v3.1.190)
    title = `${t.running ? (t.mode === 'focus' ? '🍅' : '☕️') : '⏸'} ${mmss(remain)}`;
    head.push(`${(d.pomos ?? 0) + 1}번째 집중 · ${t.running ? `${t.label} 중` : '멈춤'}`,
      `${Math.max(1, Math.round(remain / 60))}분 남음 · ${hhmm(d.onAt)} 출근 · ${worked()}`);
    items.push(...focusRows(), { id: 'focusToggle', label: t.running ? '일시정지' : '이어서 집중' },
      { id: 'focusStop', label: '이번 집중 그만두기' }, { sep: true },
      { id: 'breakStart', label: '휴게 시작' }, { id: 'off', label: '퇴근하기' });
  } else {
    title = '근무 중';
    head.push('근무 중', `${hhmm(d.onAt)} 출근 · ${worked()} · 휴게 ${rest()}`);
    items.push({ id: 'breakStart', label: '휴게 시작' }, { id: 'off', label: '퇴근하기' },
      { sep: true }, { id: 'focusToggle', label: '집중 시작' }, ...focusRows());
  }
  return { title, head, items };
}

/** 누른 항목 → 버튼 동작 (useWorkspace). 창이 필요한 것은 화면이 받는다 */
export function useTray(ws: Workspace, o: { openSettings: () => void; openDay: (k: string) => void }) {
  const live = useRef({ ws, o });
  live.current = { ws, o };
  const on = deviceKind() === 'desktop';

  useEffect(() => {
    if (!on) return;
    let sent = '', title = '', alive = true;
    const core = import('@tauri-apps/api/core');
    const push = () => void core.then(({ invoke }) => {
      if (!alive) return;
      const st = trayState(live.current.ws, Date.now());
      const menu = JSON.stringify([st.head, st.items]);
      if (menu !== sent) { sent = menu; title = st.title; void invoke('tray_set', { title: st.title, head: st.head, items: st.items }); }
      else if (st.title !== title) { title = st.title; void invoke('tray_title', { title }); }
    });
    push();
    const iv = setInterval(push, 1000);
    const un = import('@tauri-apps/api/event').then(({ listen }) => listen<string>('tray:command', ({ payload: c }) => {
      const { ws: w, o: x } = live.current;
      if (c.startsWith('arr:')) w.arrival.act(c.slice(4) as 'go' | 'cancel' | 'snooze');
      else if (c.startsWith('miss:')) w.arrival.missedAct(c.slice(5) as 'add' | 'drop');
      else if (c.startsWith('focus:')) w.timer.setFocusMin(+c.slice(6));
      else if (c === 'on') w.onOn();
      else if (c === 'off') w.onOff();
      else if (c === 'breakStart' || c === 'breakEnd') w.onRest();
      else if (c === 'focusToggle') w.timer.toggle();
      else if (c === 'focusStop') w.timer.reset();
      else if (c === 'pendAt' || c === 'pendCarry') { if (w.pendingDays[0]) w.resolvePending(w.pendingDays[0], c === 'pendAt' ? 'at' : 'carry'); }
      else if (c === 'pending') { if (w.pendingDays[0]) x.openDay(w.pendingDays[0]); }
      else if (c === 'settings') x.openSettings();
      push();
    }));
    return () => { alive = false; clearInterval(iv); void un.then((f) => f()); };
  }, [on]);
}
