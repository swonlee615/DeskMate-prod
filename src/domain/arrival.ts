/**
 * 출근 감지 (v3 arrival.js · LOGIC §2-1 — v3.2.0 · 놓친 업무 기록 v3.2.1). PC 앱 전용
 *
 * ★ 판정만 한다. 화면 · 저장 · 맨 앞 앱 읽기는 모른다. 표본을 받아 사건(감지 · 철회)만 돌려준다
 * ★ 업무 앱이 맨 앞 + 입력 있음이 연속 3분이면 감지. 다른 앱 30초 이내는 연속을 잇는다(그 30초는 안 센다)
 * ★ 입력 없음이 자리비움 기준 이상이면 연속이 끊긴다. 감지 시각 = 연속이 «시작된» 시각
 * ★ 대답 전에 비우면 그 구간을 기억한다(출근하면 휴게). 2시간 넘게 비우면 철회하고 «감지 ~ 비운 시각» 을 놓친 기록으로
 * ★ 취소 → 쿨다운 뒤부터 다시 · 오늘은 묻지 않기 → 그 날 끝까지 안 센다
 */
export const NEED_MS = 3 * 60_000;
export const GAP_MS = 30_000;

export type ArrMode = 'pre' | 'resume' | 'none';
export interface ArrHit { id: number; at: number; mode: Exclude<ArrMode, 'none'>; aways: { s: number; e: number }[]; awaySince: number | null; apps: string[] }
export interface Missed { s: number; e: number; mode: Exclude<ArrMode, 'none'> }
export interface ArrState {
  dayKey: string | null; run: { since: number; acc: number; last: number; prevWork: boolean } | null;
  hit: ArrHit | null; coolUntil: number; snoozeKey: string | null; seq: number; missed: Missed[];
}
export type ArrEvent = { type: 'hit'; at: number; mode: ArrMode } | { type: 'withdrawn'; missed?: Missed | null } | null;

export const arrCreate = (): ArrState => ({ dayKey: null, run: null, hit: null, coolUntil: 0, snoozeKey: null, seq: 0, missed: [] });
/** 감지 대기 · 쌓던 연속을 버린다 (출근을 직접 눌렀을 때 · 감지가 쓰였을 때) */
export function arrClear(st: ArrState) { st.run = null; st.hit = null; }
/** 취소 — 이 감지를 버리고 ms 뒤부터 다시 센다 */
export function arrCancel(st: ArrState, now: number, ms: number) { arrClear(st); st.coolUntil = now + Math.max(0, ms); }
/** 퇴근 직후 — 창을 정리하는 사이에 «재개» 를 묻지 않게 */
export function arrCool(st: ArrState, now: number, ms: number) { st.run = null; st.coolUntil = Math.max(st.coolUntil, now + Math.max(0, ms)); }
export function arrSnooze(st: ArrState, key: string) { arrClear(st); st.snoozeKey = key; }

/** 표본 하나 (10초마다). kind null = 앱 이름을 못 읽음 — 아무것도 바꾸지 않는다 */
export function arrTick(st: ArrState, i: {
  now: number; mode: ArrMode; kind: 'work' | 'other' | null; idleSec: number; awaySec: number; longMs: number; dayKey: string;
}): ArrEvent {
  if (st.dayKey !== i.dayKey) { arrClear(st); st.missed = []; st.dayKey = i.dayKey; }
  if (i.mode === 'none') {
    const had = !!st.hit;
    arrClear(st);
    return had ? { type: 'withdrawn' } : null;
  }
  if (st.snoozeKey === i.dayKey) return null;
  const away = i.idleSec >= i.awaySec;

  if (st.hit) {
    const h = st.hit;
    if (away) {
      h.awaySince ??= i.now - i.idleSec * 1000;
      if (i.now - h.awaySince >= i.longMs) {
        // 1분이 안 되는 것은 기록할 거리가 아니다
        const missed = h.awaySince - h.at >= 60_000 ? { s: h.at, e: h.awaySince, mode: h.mode } : null;
        if (missed) st.missed.push(missed);
        arrClear(st);
        return { type: 'withdrawn', missed };
      }
    } else if (h.awaySince != null) {
      // 돌아왔다 — 손을 다시 댄 시각에서 닫는다
      h.aways.push({ s: h.awaySince, e: i.now - i.idleSec * 1000 });
      h.awaySince = null;
    }
    return null;
  }
  if (i.now < st.coolUntil) { st.run = null; return null; }
  if (i.kind == null) return null;
  if (away) { st.run = null; return null; }

  const r = st.run;
  if (i.kind === 'work') {
    if (!r) { st.run = { since: i.now, acc: 0, last: i.now, prevWork: true }; return null; }
    if (r.prevWork) r.acc += i.now - r.last;   // 업무 → 업무 사이만 센다
    r.last = i.now; r.prevWork = true;
    if (r.acc >= NEED_MS) {
      st.seq += 1;
      st.hit = { id: st.seq, at: r.since, mode: i.mode, aways: [], awaySince: null, apps: [] };
      st.run = null;
      return { type: 'hit', at: st.hit.at, mode: i.mode };
    }
    return null;
  }
  if (r) {
    if (i.now - r.last > GAP_MS) st.run = null;
    else r.prevWork = false;
  }
  return null;
}
