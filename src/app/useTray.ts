/**
 * 메뉴바 (v3 trayState · syncTray · trayMarkPng — PC 앱 전용)
 * ★ 무엇을 그릴지는 여기서만 정한다. Rust(src-tauri/src/tray.rs)는 받은 모양을 그대로 세우고 누른 id 만 돌려준다
 *   왼쪽 클릭 = 팝오버(public/tray.html), 오른쪽 클릭 = 같은 상태로 만든 기본 메뉴 (v3.2.0 예비 길)
 * ★ 상태는 «달라졌을 때만» 다시 보낸다 (열어 둔 메뉴가 눈앞에서 닫히지 않게). 초 단위 글자는 따로 보낸다
 * ponytail: 「메뉴바에 뽀모도로 두기」 설정은 아직 — v3 기본값(켬)으로 늘 보인다
 */
import { useEffect, useRef } from 'react';
import type { Workspace } from './useWorkspace';
import { deviceKind } from '../data/device';
import { dayGoalMin, dayParts, openBreak, workMinutes } from '../domain/attendance/rules';
import { addDays, dateOf, fmtDur, hhmm, korClock, missedRange, mmss, keyOf } from '../ui/v3fmt';

export interface TrayItem { id?: string; label?: string; checked?: boolean; dim?: boolean; opens?: boolean; sep?: boolean }
export interface TrayCard { tag?: string; title: string; actions: TrayItem[] }
export type TrayMark = 'pre' | 'work' | 'rest' | 'off' | 'alert';
export interface TrayState { title: string; head: string[]; items: TrayItem[]; card: TrayCard | null; missed: TrayCard | null; mark: TrayMark; p: number }

/** v3 TRAY_PRESETS */
const TRAY_PRESETS = [15, 25, 50];
const md = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function trayState(ws: Workspace, now: number): TrayState {
  const d = ws.day, t = ws.timer, h = ws.arrival.hit, m = ws.arrival.missed;
  const worked = () => fmtDur(workMinutes(d, now));
  const rest = () => fmtDur(Math.floor(dayParts(d, now).breakMs / 60000));
  const offLine = () => `${d.onAt != null ? hhmm(d.onAt) : ''} → ${d.offAt != null ? hhmm(d.offAt) : ''} · 근무 ${worked()} · 뽀모도로 ${d.pomos ?? 0}회`;
  const remain = t.remainAt(now);
  const focusRows = (): TrayItem[] => TRAY_PRESETS.map((n) => ({ id: `focus:${n}`, label: `　${n}분`, checked: t.cfg.focusMin === n }));
  const head: string[] = [], items: TrayItem[] = [];
  let title: string, mark: TrayMark, card: TrayCard | null = null;
  const pend = ws.pendingDays;

  if (pend.length) {
    // 자정을 넘긴 날 — 두 갈래는 여기서 바로, 시각 직접 입력은 창에서 (v3.1.140)
    title = '확인 필요'; mark = 'alert';
    const k = pend[0], pp = ws.dayOf(k).pending;
    head.push(`${md(k)} 퇴근을 안 누르고 자정을 넘겼어요${pend.length > 1 ? ` · 외 ${pend.length - 1}일` : ''}`);
    if (pp) items.push({ id: 'pendAt', label: `${hhmm(pp.guessOff)}에 퇴근했어요` });
    if (ws.canCarry(k)) items.push({ id: 'pendCarry', label: `계속 일했어요 → ${md(keyOf(addDays(dateOf(k), 1)))} 00:00까지 이어서 근무` });
    items.push({ sep: true }, { id: 'pending', label: `${md(k)} 근무 확인하기…`, opens: true });
  } else if (h && (d.onAt == null || d.offAt != null)) {
    // 출근 감지 — 글자 · 상태 줄은 평소 그대로, 카드만 하나 더 선다 (v3.2.1)
    const resume = d.offAt != null;
    title = resume ? '퇴근' : '출근 전'; mark = 'alert';
    if (resume) head.push('퇴근', offLine()); else head.push('출근 전');
    card = { title: `${korClock(h.at)}부터 근무 중이에요`, actions: [
      { id: 'arr:go', label: h.mode === 'resume' ? `${korClock(h.at)}부터 업무 재개` : `${korClock(h.at)}로 출근 기록` },
      { id: 'arr:cancel', label: '취소' }, { id: 'arr:snooze', label: '오늘은 묻지 않기' }] };
    items.push({ id: 'on', label: h.mode === 'resume' ? '업무 재개' : '지금 출근' });
  } else if (openBreak(d) && d.offAt == null) {
    const s = (now - openBreak(d)!.s) / 1000;
    title = mmss(s); mark = 'rest';
    head.push('휴게 중', `${Math.floor(s / 60)}분째 쉬는 중 · 오늘 휴게 ${rest()}`);
    items.push({ id: 'breakEnd', label: '휴게 끝내기' }, { id: 'off', label: '퇴근하기' });
  } else if (d.offAt != null) {
    title = '퇴근'; mark = 'off';
    head.push('퇴근', offLine());
    items.push({ id: 'on', label: '다시 출근' });
  } else if (d.onAt == null) {
    title = '출근 전'; mark = 'pre';
    head.push('출근 전');
    items.push({ id: 'on', label: '출근' });
  } else if (t.running || (t.mode === 'focus' && remain < t.total - 1)) {
    // 마크 = 근태(근무 중), 글자 = 지금 하는 일 (v3.1.190)
    title = `${t.running ? (t.mode === 'focus' ? '🍅' : '☕️') : '⏸'} ${mmss(remain)}`; mark = 'work';
    head.push(`${(d.pomos ?? 0) + 1}번째 집중 · ${t.running ? `${t.label} 중` : '멈춤'}`,
      `${Math.max(1, Math.round(remain / 60))}분 남음 · ${hhmm(d.onAt)} 출근 · ${worked()}`);
    items.push(...focusRows(), { id: 'focusToggle', label: t.running ? '일시정지' : '이어서 집중' },
      { id: 'focusStop', label: '이번 집중 그만두기' }, { sep: true },
      { id: 'breakStart', label: '휴게 시작' }, { id: 'off', label: '퇴근하기' });
  } else {
    title = '근무 중'; mark = 'work';
    head.push('근무 중', `${hhmm(d.onAt)} 출근 · ${worked()} · 휴게 ${rest()}`);
    items.push({ id: 'breakStart', label: '휴게 시작' }, { id: 'off', label: '퇴근하기' },
      { sep: true }, { id: 'focusToggle', label: '집중 시작' }, ...focusRows());
  }
  const missed = m ? { tag: '앞서 놓친 업무 기록이 있어요', title: missedRange(m.s, m.e), actions: [{ id: 'miss:add', label: '근무로 추가' }, { id: 'miss:drop', label: '취소' }] } : null;
  // 목표는 그 날 근태만큼 줄어든 값. 연차라 0 이면 일한 만큼 전부 «넘친» 것 (v3.1.209)
  const g0 = dayGoalMin(ws.goal, d), w0 = workMinutes(d, now);
  return { title, head, items, card, missed, mark, p: g0 ? Math.max(0, Math.min(1, w0 / g0)) : (w0 > 0 ? 1 : 0) };
}

/**
 * 메뉴바 마크 (v3 trayMarkPng · v3.1.72) — 36×36 을 2배율로. 색 없이 투명도만 담아 템플릿 이미지로 보낸다
 * 근무 = 고리 + 진행 호(330° 까지) · 목표 채움 = 찬 원 · 출근 전 = 옅은 고리 · 휴게 = 고리 + 가로 막대 · 퇴근 = ◉ · 확인 필요 = 찬 원에 느낌표
 */
async function markPng(kind: TrayMark, p: number): Promise<number[] | null> {
  const S2 = 36, c = S2 / 2, R = 11.5, W = 2.7;
  const cv = document.createElement('canvas');
  cv.width = S2; cv.height = S2;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.lineCap = 'round';
  const ink = (a: number) => `rgba(0,0,0,${a})`; // color-ok: 템플릿 이미지는 알파만 읽는다 (OS 가 메뉴바에 맞춰 칠함)
  const ring = (a: number, w = W, r = R) => { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.strokeStyle = ink(a); g.lineWidth = w; g.stroke(); };
  if (kind === 'off') {
    ring(.42, 1.9);
    g.beginPath(); g.arc(c, c, 4.6, 0, Math.PI * 2); g.fillStyle = ink(1); g.fill();
  } else if (kind === 'rest') {
    ring(.9, 2.3);
    g.strokeStyle = ink(1); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(c - 4.4, c); g.lineTo(c + 4.4, c); g.stroke();
  } else if (kind === 'alert') {
    g.beginPath(); g.arc(c, c, 13.5, 0, Math.PI * 2); g.fillStyle = ink(1); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = ink(1); g.lineWidth = 3.6;
    g.beginPath(); g.moveTo(c, c - 7.5); g.lineTo(c, c + 2); g.stroke();
    g.beginPath(); g.arc(c, c + 7.4, 2.1, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
  } else if (kind === 'work' && p >= 1) {
    ring(.30);
    g.beginPath(); g.arc(c, c, R - 1.4, 0, Math.PI * 2); g.fillStyle = ink(1); g.fill();
  } else {
    ring(.26);
    if (kind === 'work' && p > 0) {
      const a0 = -Math.PI / 2;
      g.beginPath(); g.arc(c, c, R, a0, a0 + Math.PI * 2 * (p * (330 / 360)));
      g.strokeStyle = ink(1); g.lineWidth = W; g.stroke();
    }
  }
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'));
  return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null;
}

/** 누른 항목 → 버튼 동작 (useWorkspace). 창이 필요한 것은 화면이 받는다 */
export function useTray(ws: Workspace, o: { openSettings: () => void; openDay: (k: string) => void }) {
  const live = useRef({ ws, o });
  live.current = { ws, o };
  const on = deviceKind() === 'desktop';

  useEffect(() => {
    if (!on) return;
    let sent = '', title = '', markKey = '', alive = true;
    const core = import('@tauri-apps/api/core');
    const push = () => void core.then(async ({ invoke }) => {
      if (!alive) return;
      const st = trayState(live.current.ws, Date.now());
      // 진행 호는 24칸으로 끊는다. 100% 는 칸이 아니라 «다른 상태» (v3.1.162)
      const mk = `${st.mark}:${st.mark === 'work' ? (st.p >= 1 ? 'full' : Math.round(st.p * 24)) : 0}`;
      if (mk !== markKey) {
        markKey = mk;
        const png = await markPng(st.mark, st.p);
        if (png) void invoke('tray_icon', { png });
      }
      const key = JSON.stringify([st.head, st.items, st.card, st.missed, st.mark, Math.round(st.p * 100)]);
      if (key !== sent) { sent = key; title = st.title; void invoke('tray_set', { st }); }
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
