/**
 * 이벤트 → 하루 (재생)
 *
 * 여러 기기가 각자 쌓은 이벤트를 «일어난 시각» 순서로 한 줄로 세우고 처음부터 다시 재생한다.
 * 그래서 오프라인이던 기기의 이벤트가 몇 시간 늦게 도착해도 결과는 같다.
 *
 * 다기기 규칙 (docs/SYNC.md §2)
 * 1. 근무 상태는 기기마다가 아니라 사람에게 하나다
 * 2. 수동 입력(버튼)은 어느 기기에서든 받는다. 시간 순서상 «마지막 버튼» 이 그 시점의 상태를 정한다
 * 3. 이미 그 상태인데 같은 버튼이 또 오면(다른 기기에서 모르고 누른 것) 무시한다
 *    — 예외: 퇴근 뒤 퇴근은 «퇴근 시각을 그때로 다시 찍기» (LOGIC §6-2)
 * 4. 자동 감지는 PC 앱만 보낸다. 감지하는 PC 가 여러 대면 «모두» 비었을 때만 자리비움이다
 * 5. 수동 입력이 자동 감지보다 우선한다. 사람이 연 휴게는 복귀 감지로 닫히지 않는다
 */
import type { AttEvent, AttState, Day, DaySnapshot, Leave, Span } from './types';
import { MIN_MS } from './types';
import { closeIfLongAway, dayEndMs, normalizeBreaks } from './rules';

function structuredCloneDay(d: DaySnapshot): DaySnapshot {
  return { ...d, breaks: d.breaks.map((b) => ({ ...b })) };
}

/** 고친 하루가 «지금 어떤 상태» 인가 — 거기서부터 버튼을 이어 재생한다 */
function stateOfRaw(day: Day): AttState {
  if (day.onAt == null) return 'none';
  if (day.offAt != null) return 'off';
  return day.breaks.some((b) => b.e == null) ? 'break' : 'work';
}

export function sortEvents(events: AttEvent[]): AttEvent[] {
  // 같은 시각이면 ID 로 — 어느 기기에서 재생해도 순서가 같아야 결과가 같다
  return [...events].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 정리·확정 전의 날것. 테스트와 디버깅용 */
export function replayRaw(date: string, events: AttEvent[], leave: Leave = ''): Day {
  const mine = sortEvents(events).filter((e) => !e.deletedAt && e.date === date);

  // 사람이 손으로 고친 하루가 있으면 «가장 최근에 고친 것» 에서 출발한다.
  // 고칠 때 이미 알던 이벤트(basedOn)는 그 안에 녹아 있으므로 다시 재생하지 않는다.
  // 고친 «뒤에» 쌓인 이벤트(그 뒤에 누른 버튼, 늦게 도착한 다른 기기 기록)만 그 위에 재생한다.
  const ov = [...mine].reverse().find((e) => e.type === 'override' && e.day);
  const base = ov?.day;
  const day: Day = base
    ? { date, ...structuredCloneDay(base), leave: base.leave ?? leave }
    : { date, onAt: null, offAt: null, breaks: [], leave };
  let state: AttState = base ? stateOfRaw(day) : 'none';
  // 클로저(clockOut) 안에서도 바뀌므로 매번 함수로 읽는다 — TS 가 좁힌 타입을 믿지 않게
  const cur = (): AttState => state;
  let autoOpen = false;
  const awaySince = new Map<string, number | null>(); // 감지하는 PC → 비운 시각 (null = 자리에 있음)

  const openSpan = (): Span | undefined => day.breaks.find((b) => b.e == null);
  const lastOff = (): Span | undefined =>
    [...day.breaks].reverse().find((b) => b.kind === 'off' && b.e != null);

  const closeOpen = (at: number) => {
    const b = openSpan();
    if (b) b.e = Math.max(at, b.s);
    autoOpen = false;
  };

  const clockOut = (at: number) => {
    const sessionStart = lastOff()?.e ?? (day.onAt as number);
    if (at - sessionStart < MIN_MS) {
      // LOGIC §4 v3.1.108 — 1분이 안 되는 차수는 «취소» 다
      const lo = lastOff();
      if (!lo) {
        day.onAt = null;
        day.offAt = null;
        day.breaks = [];
        state = 'none';
      } else {
        day.breaks = day.breaks.filter((b) => b !== lo);
        day.offAt = lo.s;
        state = 'off';
      }
      return;
    }
    day.offAt = at;
    state = 'off';
  };

  const allAway = () => awaySince.size > 0 && [...awaySince.values()].every((v) => v != null);

  const done = new Set(ov?.basedOn ?? []);
  const sorted = mine.filter((e) => e.type !== 'override' && !done.has(e.id));
  // 뽀모도로 횟수는 근무 상태와 따로 센다 — 고친 하루에 녹아 있지 않다
  const pomos = mine.filter((e) => e.type === 'pomoDone').length;
  if (pomos) day.pomos = pomos;

  // 감지하는 PC 의 처음 상태는 그 PC 의 «첫 자동 이벤트» 로 정한다.
  //  첫 이벤트가 awayStart → 그 전까지는 쓰고 있었다 (자리에 있음)
  //  첫 이벤트가 awayEnd   → 그 전까지는 꺼져 있었거나 비어 있었다
  // PC 앱은 켜질 때 awayEnd, 잠들거나 꺼질 때 awayStart(power) 를 보낸다 — docs/SYNC.md §3
  for (const e of sorted) {
    if (e.deviceKind !== 'desktop' || awaySince.has(e.deviceId)) continue;
    if (e.type === 'awayStart') awaySince.set(e.deviceId, null);
    else if (e.type === 'awayEnd') awaySince.set(e.deviceId, 0);
  }

  for (const ev of sorted) {
    const at = ev.at;

    switch (ev.type) {
      case 'clockIn':
        if (cur() === 'none') {
          day.onAt = at;
          if (ev.carriedFrom) day.carriedFrom = ev.carriedFrom;
          state = 'work';
        } else if (cur() === 'off') {
          // LOGIC §4 — 퇴근하고 1분 안에 다시 출근하면 차수를 가르지 않는다
          if (at - (day.offAt as number) > MIN_MS) {
            day.breaks.push({ s: day.offAt as number, e: at, kind: 'off' });
          }
          day.offAt = null;
          delete day.autoClosed;
          state = 'work';
        }
        break;

      case 'clockOut':
        if (cur() === 'work') clockOut(at);
        else if (cur() === 'break') {
          closeOpen(at);
          clockOut(at);
        } else if (cur() === 'off') {
          day.offAt = at; // LOGIC §6-2 — 퇴근 상태에서 또 누르면 퇴근 시각을 그때로
        }
        break;

      case 'breakStart':
        if (cur() === 'work') {
          day.breaks.push({ s: at, e: null, kind: 'break' });
          state = 'break';
          autoOpen = false;
        } else if (cur() === 'break' && autoOpen) {
          // 자동으로 열린 자리비움을 사람이 «휴게» 로 확정 — 이제 복귀 감지로 안 닫힌다
          const b = openSpan();
          if (b) { b.auto = false; delete b.by; }
          autoOpen = false;
        }
        break;

      case 'breakEnd':
        if (cur() === 'break') {
          closeOpen(at);
          state = 'work';
        }
        break;

      case 'awayStart': {
        if (ev.deviceKind !== 'desktop') break;
        awaySince.set(ev.deviceId, at);
        if (cur() === 'work' && allAway()) {
          // 마지막으로 비운 PC 의 시각부터가 «모두 비운» 구간이다
          const s = Math.max(...([...awaySince.values()] as number[]));
          day.breaks.push({ s, e: null, kind: 'break', auto: true, by: ev.by ?? 'idle' });
          state = 'break';
          autoOpen = true;
        }
        break;
      }

      case 'pomoDone':
      case 'override':
        break;

      case 'leaveSet':
        // 근태는 출퇴근 상태와 따로 논다 — 시간순으로 마지막에 고른 값이 그 날의 근태다
        day.leave = ev.leave ?? '';
        break;

      case 'awayEnd':
        if (ev.deviceKind !== 'desktop') break;
        awaySince.set(ev.deviceId, null);
        if (cur() === 'break' && autoOpen) {
          closeOpen(at);
          state = 'work';
        }
        break;
    }
  }
  return day;
}

/**
 * 화면·합계가 읽는 하루. 재생 → 정리(§3) → 2시간 넘긴 열린 구간 퇴근 확정(§3 v3.1.8)
 * 저장하지 않고 매번 계산한다 — 같은 이벤트면 어느 기기에서든 같은 하루가 나온다.
 */
export function deriveDay(date: string, events: AttEvent[], now: number, leave: Leave = ''): Day {
  const raw = replayRaw(date, events, leave);
  const until = Math.min(now, dayEndMs(date));
  const day = normalizeBreaks(closeIfLongAway(normalizeBreaks(raw), until));
  return now >= dayEndMs(date) ? settlePast(day) : day;
}

/**
 * 이미 지난 날인데 퇴근이 없다 — LOGIC §7 «자정을 넘긴 날»
 *  · 휴게(2시간 미만)가 열린 채 넘겼다 → 묻지 않는다. 휴게를 시작한 시각이 그 날의 끝 (v3.1.49)
 *    (2시간 이상은 위 closeIfLongAway 가 이미 퇴근으로 닫았다 — v3.1.8)
 *  · 일하던 채 넘겼다 → 물어본다 (`pending`). 근무시간은 23:59 까지로 센다 (v3 effectiveOff)
 * 저장하지 않고 계산만 한다 — 사람이 고르면 그때 override 로 남는다.
 * ★ v3 의 «앱이 켜진 채 넘겼으면 묻지 않고 이어붙인다» (v2.9.97) 는 옮기지 않았다.
 *   기기가 여럿이라 «앱이 켜져 있었다» 를 한 기기의 흔적으로 정할 수 없다 → 늘 묻는다 (docs/SYNC.md §6)
 */
function settlePast(day: Day): Day {
  if (day.onAt == null || day.offAt != null) return day;
  const open = day.breaks.find((b) => b.e == null && b.s > (day.onAt as number));
  if (open) {
    return { ...day, offAt: open.s, autoClosed: 'break', breaks: day.breaks.filter((b) => b !== open) };
  }
  return { ...day, pending: { reason: 'open', guessOff: dayEndMs(day.date) - MIN_MS } };
}
