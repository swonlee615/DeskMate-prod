/**
 * 근태 자료구조
 *
 * ▣ 저장(동기화)하는 것은 «이벤트» 다. 기기는 버튼을 누를 때마다 이벤트 한 건을 쌓기만 한다.
 *   이벤트는 문서 하나씩이라 두 기기가 동시에 써도 충돌이 없다.
 * ▣ 화면과 합계가 읽는 것은 «하루(Day)» 다. 이벤트를 시간순으로 재생해서 만든다 (replay.ts).
 *   Day 의 모양과 규칙은 v3 LOGIC.md §1~§5 를 그대로 따른다.
 */

/** 기기 종류. 자동 감지(자리비움·앱 판정)는 desktop 만 보낸다 */
export type DeviceKind = 'desktop' | 'browser' | 'mobile';

export type AttEventType =
  | 'clockIn'     // 출근 · 업무 재개(퇴근 뒤 다시 출근)
  | 'clockOut'    // 퇴근
  | 'breakStart'  // ☕️ 휴게 (사람이 누름)
  | 'breakEnd'    // 휴게 끝 · 업무 재개 (사람이 누름)
  | 'awayStart'   // 자리비움 감지 (PC 앱이 보냄)
  | 'awayEnd'     // 자리 복귀 감지 (PC 앱이 보냄)
  | 'leaveSet'    // 근태(연차·반차·병가) 고르기 — 그 날의 마지막 값이 이긴다
  | 'pomoDone'    // 뽀모도로 집중 한 번을 끝까지 채움 — 근무 상태와 무관, 횟수만 센다
  | 'override';   // 사람이 손으로 고친 하루 (시각 편집 · 차수 추가/합치기/지우기 · 휴게 편집 · 자정 확정)

export type AwayBy = 'idle' | 'app' | 'power' | 'gap';

export interface AttEvent {
  /** 기기에서 만든 고유 ID. 서버를 거치지 않고 정해진다 */
  id: string;
  /** 이 이벤트가 속한 날 (기기 현지 시각 기준 YYYY-MM-DD) */
  date: string;
  /** 기기에서 «일어난» 시각 (epoch ms). 서버에 도착한 시각이 아니다 */
  at: number;
  type: AttEventType;
  deviceId: string;
  deviceKind: DeviceKind;
  /** awayStart 일 때 무엇으로 감지했나 */
  by?: AwayBy;
  /** leaveSet 일 때 고른 근태 ('' = 근무) */
  leave?: Leave;
  /** pomoDone 일 때 집중한 분 */
  min?: number;
  /**
   * override 일 때 — 고친 뒤의 하루. 재생은 가장 최근 override 에서 출발한다
   * (그때 이미 알던 이벤트 `basedOn` 은 이 안에 녹아 있으므로 다시 재생하지 않는다)
   */
  day?: DaySnapshot;
  basedOn?: string[];
  /** clockIn 일 때 — 전날 근무를 이어받은 00:00 출근 (LOGIC §7 «계속 일했어요») */
  carriedFrom?: string;
  /** 지운 이벤트. 실제로 지우지 않고 표시만 한다 (되돌리기 · 다른 기기 반영) */
  deletedAt?: number;
}

export type SpanKind = 'break' | 'off';

/** LOGIC.md §1 span */
export interface Span {
  s: number;
  e: number | null;
  kind: SpanKind;
  auto?: boolean;
  by?: AwayBy;
  /** 휴게 메모 (LOGIC §5-1 — 점심 · 병원 · 회의 이동 …) */
  note?: string;
}

export type Leave = '' | '연차' | '오전 반차' | '오후 반차' | '병가';

/** LOGIC.md §1 day (근태 부분만) */
export interface Day {
  date: string;
  onAt: number | null;
  offAt: number | null;
  breaks: Span[];
  leave: Leave;
  /** 그 날 끝까지 채운 뽀모도로 집중 횟수 (v3 day.sessions) */
  pomos?: number;
  /**
   * 퇴근을 앱이 정했나 사람이 정했나 (LOGIC §7)
   * away  2시간 넘게 비워 그 시작을 퇴근으로 · break  휴게 중 자정을 넘겨 휴게 시작을 퇴근으로
   * confirmed  사람이 확정했다 (안내를 안 띄운다)
   */
  autoClosed?: 'away' | 'break' | 'confirmed';
  /** 퇴근을 안 누르고 자정을 넘겨 «물어봐야 하는» 지난 날 (LOGIC §7). 저장하지 않고 계산한다 */
  pending?: { reason: 'open'; guessOff: number };
  /** 전날에서 이어받은 날 (00:00 출근) */
  carriedFrom?: string;
}

/** override 이벤트에 싣는 하루 — 근태 부분만 */
export type DaySnapshot = Pick<Day, 'onAt' | 'offAt' | 'breaks' | 'leave' | 'autoClosed' | 'carriedFrom'>;

/** 지금 상태. 화면의 버튼과 표시를 정한다 */
export type AttState = 'none' | 'work' | 'break' | 'off';

export const MIN_MS = 60_000;
/** LOGIC §3 — 이만큼 비웠으면 비근무(퇴근) */
export const LONG_BREAK_MS = 2 * 60 * MIN_MS;
/** LOGIC §3 정리 — 1분 미만 구간은 기록으로 안 남긴다. 1분 미만 차수도 취소(§4) */
export const MIN_BREAK_MS = MIN_MS;
/** LOGIC §3 정리 — 이 간격 안으로 붙은 같은 종류 구간은 하나로 합친다 */
export const JOIN_GAP_MS = 2 * MIN_MS;
