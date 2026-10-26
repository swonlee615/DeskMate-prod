/**
 * v3 의 날짜·시간 표기를 그대로 옮긴 것 (v3 app.js · worklog.js)
 * 글자 하나라도 다르면 «같은 앱» 으로 안 보인다 — 바꿀 때는 v3 쪽과 함께 바꾼다
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** 『N시간 N분』 — 0분은 생략 (v3 fmtDur, v2.9.21) */
export function fmtDur(mins: number): string {
  const m = Math.round(mins);
  const h = Math.floor(m / 60);
  if (h > 0) return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`;
  return `${m}분`;
}

/** 분(0~1440) → HH:MM (v3 fmtClock) */
export function fmtClock(mins: number): string {
  const t = Math.floor(Math.max(0, mins));
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
}

export const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const mmss = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function dateOf(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 그 주 월요일 */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Oct 19 – Oct 25 2026 */
export function weekLabel(ws: Date): string {
  const we = addDays(ws, 6);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${M[ws.getMonth()]} ${ws.getDate()} – ${M[we.getMonth()]} ${we.getDate()} ${we.getFullYear()}`;
}

/** 주 이름은 그 주 «목요일» 이 든 달이 정한다 (v3 weekTag, v3.1.122) */
export function weekTag(d: Date): { year: number; month: number; no: number } {
  const ws = weekStart(d);
  const th = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 3);
  const first = new Date(th.getFullYear(), th.getMonth(), 1);
  const off = (3 - ((first.getDay() + 6) % 7) + 7) % 7;
  return { year: th.getFullYear(), month: th.getMonth() + 1, no: Math.floor((th.getDate() - 1 - off) / 7) + 1 };
}

const REL_DAY: [string, number][] = [['그저께', -2], ['어제', -1], ['오늘', 0], ['내일', 1], ['모레', 2]];

/** 노션식 날짜 라벨 (v3 dayLabel) */
export function dayLabel(dt: Date, now: Date): string {
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  const d0 = new Date(dt); d0.setHours(0, 0, 0, 0);
  const diff = Math.round((t0.getTime() - d0.getTime()) / 86400000);
  for (const [w, v] of REL_DAY) if (v === -diff) return w;
  const ws = weekStart(t0);
  const we = addDays(ws, 7);
  const nx = addDays(we, 7);
  const lastWs = addDays(ws, -7);
  if (d0 >= ws && d0 < we) return `이번 주 ${DOW[d0.getDay()]}요일`;
  if (d0 >= we && d0 < nx) return `다음 주 ${DOW[d0.getDay()]}요일`;
  if (d0 >= lastWs && d0 < ws) return `지난주 ${DOW[d0.getDay()]}요일`;
  return `${d0.getMonth() + 1}월 ${d0.getDate()}일`;
}

/** 표의 날짜 칸 — 앞뒤 이레는 상대 표현 + 날짜, 그 밖은 전체 날짜 (v3 rowDateHtml) */
export function rowDate(key: string, now: Date): { b: string; span: string } {
  const dt = dateOf(key);
  const gap = Math.round((dateOf(keyOf(now)).getTime() - dt.getTime()) / 86400000);
  if (gap >= -7 && gap <= 7) return { b: dayLabel(dt, now), span: `${dt.getMonth() + 1}/${dt.getDate()}` };
  return { b: `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`, span: DOW[dt.getDay()] };
}

/** 근태 목록 (v3 LEAVES) — [값, 이름, 점 색] */
export const LEAVES: [string, string, string][] = [
  ['', '근무', ''],
  ['연차', '연차', '#a45cff'],
  ['오전 반차', '오전 반차', '#ecb22e'],
  ['오후 반차', '오후 반차', '#e8912d'],
  ['병가', '병가', '#e01e5a'],
];
export const leaveOf = (v: string | undefined) => LEAVES.find((x) => x[0] === (v || '')) ?? LEAVES[0];

/** '905' · '9:05' · '0905' → '09:05' (v3 normTime) */
export function normTime(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let h: number, m: number;
  const mm = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (mm) { h = +mm[1]; m = +mm[2]; } else {
    const dg = t.replace(/\D/g, '');
    if (dg.length <= 2) { h = +dg; m = 0; } else if (dg.length <= 4) { h = +dg.slice(0, -2); m = +dg.slice(-2); } else return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
