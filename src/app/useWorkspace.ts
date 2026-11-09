/**
 * PC · 모바일이 함께 쓰는 «속» — 저장소 · 동기화 · 받아 두는 기간 · 하루 재생 · 근태 버튼 동작
 *
 * ★ 화면(레이아웃)은 `src/pc` · `src/mobile` 이 따로 그린다. 여기에는 화면 코드를 두지 않는다.
 *   같은 버튼이 PC 와 폰에서 다르게 동작하면 안 되므로 동작은 이 한 곳에만 있다.
 */
import { savedId, type SavedKind, type SavedMap, type SavedSort } from '../domain/saved';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Backend, DayEvents, Item, Repo, SyncStatus, User } from '../data';
import { deviceId, deviceKind, newId } from '../data/device';
import type { AttEvent, AttEventType, AttState, Day, Leave } from '../domain/attendance/types';
import { deriveDay } from '../domain/attendance/replay';
import { dateKey, dayEndMs, dayParts, dayStartMs, goalPastAfter, openBreak, sessions, stateOf, type GoalCfg } from '../domain/attendance/rules';
import { addBreakSpan, addWorkSpan, canCarry, editBreak, removeBreak, resolveAt, resolveCarry } from '../domain/attendance/edit';
import { catsOf, cleanCats, type Cat } from '../domain/attendance/cats';
import { breakConflicts, logsOf, overlapIds, resolveConflicts, splitRest, type Log, type SpanInput, type SpanRef } from '../domain/attendance/logs';
import { addDays, dateOf, fmtDur, hhmm, keyOf, korClock, weekStart } from '../ui/v3fmt';
import { notify } from './notify';
import { buildTeam, leaderboard, ROSTER, STATUS_ORDER, statusAt, TEAM_DEFAULT, teamHours, type LbRow, type Member, type MateStatus, type Team } from '../domain/sim/team';
import { useMinute } from './clock';
import { useIdleAway, type AppsLive, type IdlePerm } from './useIdleAway';
import { addAppSample, appSlotOf, APP_SLOT_MIN, type AppCell, type AppCells, type AppDoc } from '../domain/appUse';
import { arrCancel, arrClear, arrCool, arrCreate, arrSnooze, arrTick, type ArrHit, type ArrMode, type Missed } from '../domain/arrival';
import { LONG_BREAK_MS, MIN_BREAK_MS } from '../domain/attendance/types';
import { applyLook, SETTINGS_DEFAULT, type Settings } from '../ui/settingsNav';
import { rankToFix, type RankFix } from '../domain/stats';
import { POMO_DEFAULT, usePomodoro, type Pomodoro, type PomoDoc } from './usePomodoro';
import { afterSibling, appendBlock, deleteChunk, inverseOf, triFix, triToggle, type Block, type BlockArea, type Patch } from '../domain/todos/tree';
import { fmtMB, IMG_QUOTA, imgFits, imgToPurge, type ImgMeta } from '../domain/images';
import { shrinkImage } from '../ui/image';
import { convertV3, type Converted } from '../domain/migrate/v3';
import { loadV3 } from '../data/v3Load';

/** v3 파일을 읽은 결과 — 원본 바이트 + 변환 */
export interface V3Pick { bytes: Uint8Array; conv: Converted }
import { ddCanPin, ddClean, ddLabel, type DDay } from '../domain/dday';
import { HB_MAX, hbClean, hbDoneAt, hbFreqLabel, type Habit, type HbInput, type OffDay } from '../domain/habits';

/** 집중 타이머 문서 — 사람 하나에 하나 */
const POMO_ID = 'pomo';
/** 시간 기록 카테고리 문서 — 사람 하나에 하나 (목록 통째로 한 필드) */
const CATS_ID = 'cats';
const RANKS_ID = 'ranks';
const IMGS_ID = 'images';
const V3_ID = 'v3import';
const SAVED_ID = 'saved';
const MEMBERS_ID = 'members';
const TRASH_DAYS = 30;
/** 휴지통 칸이 사라지기까지 남은 날 */
export const daysLeft = (at: number, now = Date.now()) => Math.max(0, TRASH_DAYS - Math.floor((now - at) / 864e5));

/** 휴지통 한 칸 — 하루 통째 삭제만 (SYNC §14). 지움 표시한 것들의 id 를 들고 있다가 되살릴 때 걷는다 */
export interface TrashDay { id: string; kind: 'trash'; date: string; at: number; label: string; ev: string[]; bl: string[]; lg: string[]; deletedAt?: number | null }

const SETTINGS_ID = 'settings';
/** 근태 표가 보여 주는 주 수 (이번 주 포함) */
export const WEEKS_SHOWN = 5;
/** 근태 표가 한 번에 더 받는 주 수 (아래로 내리면) */
export const WEEKS_STEP = 5;

const OFF_CANCEL = { day: '1분이 안 돼서 출근을 취소했어요', session: '1분이 안 돼서 이 차수를 취소했어요' };


/** 토스트 — 글자만, 또는 그 자리에서 되받을 단추 하나 (v3 toast · actToast) */
export interface Toast { text: string; action?: { label: string; run: () => void }; bad?: boolean }

export interface Workspace {
  /** 저장됨 — 담은 메모 (사본이 아니라 원본 메모를 가리킨다) · 고정 · 정렬 (v3.1.206 · v3.1.262) */
  saved: SavedMap;
  savedSort: SavedSort;
  isSaved: (kind: SavedKind, key: string) => boolean;
  toggleSaved: (kind: SavedKind, key: string) => void;
  pinSaved: (id: string) => void;
  setSavedSort: (s: SavedSort) => void;
  /** 휴지통 — 하루 통째 삭제한 것 (최근부터) · 30일 지나면 앱을 열 때 비운다 */
  trash: TrashDay[];
  /** 이 날 기록 삭제 — 근태 · 할 일 · 메모 · 시간 기록을 휴지통으로 (v3 deleteDayRow) */
  deleteDay: (date: string) => void;
  restoreTrash: (id: string) => void;
  /** 영구삭제 — 휴지통 칸과 그 날 그림 파일을 비운다 (기록은 «지움» 표시로 남는다) */
  purgeTrash: (id: string) => void;
  emptyTrash: () => void;
  /** 팀 — 멤버 · 근무시간대 (랭킹 · 순위 이력 · 사이드바가 같이 쓴다) */
  teamCfg: Team;
  /** 숨긴 사람까지 전부 (설정 › 멤버 설정) · 통째로 저장 */
  members: Member[]; saveMembers: (list: Member[]) => void;
  /** 이 브라우저의 자리비움 감지 권한 · 묻기 (PC 브라우저 · Chrome/Edge) */
  idle: { perm: IdlePerm; ask: () => Promise<void>; live: AppsLive | null };
  /** 출근 감지 물음 · 놓친 업무 기록 (v3.2.0 · v3.2.1 — PC 앱) */
  arrival: { hit: ArrHit | null; missed: Missed | null; act: (a: 'go' | 'cancel' | 'snooze') => void; missedAct: (a: 'add' | 'drop') => void };
  /** 설정 (items/settings) — 계정에 하나 */
  settings: Settings;
  /** 바뀐 칸만 저장 (합치기) */
  saveSettings: (s: Partial<Settings>) => void;
  /** 하루 목표 — 목표를 읽는 곳은 전부 이 값으로 dayGoalMin 을 부른다 */
  goal: GoalCfg;
  backend: Backend;
  user: User;
  now: number;
  today: string;
  sync: SyncStatus | null;
  /** 받아 둔 기간의 하루들 (기록 있는 날만) */
  days: Record<string, Day>;
  /** 오늘 (기록이 없어도 빈 하루) */
  day: Day;
  state: AttState;
  unavailable: boolean;
  /** 활동이 보는 기간 — 그만큼 받아 둔다 (null = 놓기) */
  setDashSpan: (span: [string, string] | null) => void;
  /** 근태 표가 보여 주는 주 수 — v3 처럼 첫 기록까지 다 보이되, 아래로 내릴 때 WEEKS_STEP 주씩 받는다 */
  tblWeeks: number;
  /** 첫 기록이 든 주까지 다 보였나 */
  tblAll: boolean;
  moreWeeks: () => void;
  calMonth: Date;
  /** 주간 플래너가 보는 주 (월요일 키) */
  wpWeek: string;
  setWpWeek: (wk: string) => void;
  setCalMonth: (d: Date) => void;
  toast: Toast | null;
  say: (text: string, action?: Toast['action'], queue?: boolean) => void;
  /** 경고 — «막았다» 를 말한다. 단추 없이 조금 오래 (v3 toastBad) */
  warn: (text: string) => void;
  /** 이 기기의 집중 타이머 */
  timer: Pomodoro;
  onOn: () => void;
  onOff: () => void;
  onRest: () => void;
  onLeave: (date: string, leave: Leave) => void;
  /** 그 날 하루 (기록이 없으면 빈 하루) */
  dayOf: (date: string) => Day;
  /**
   * 손으로 고치기 — 고친 하루를 override 이벤트 하나로 남긴다 (replay.ts). 되돌리기 토스트를 띄운다.
   * fn 이 null 을 돌려주면 아무것도 안 남긴다
   */
  editDay: (date: string, fn: (d: Day) => Day | null, msg?: string) => boolean;
  /** 퇴근을 안 누르고 자정을 넘긴 지난 날들 (오래된 순) — LOGIC §7 */
  pendingDays: string[];
  resolvePending: (date: string, how: 'at' | 'carry') => void;
  canCarry: (date: string) => boolean;
  // ── 할 일 · 메모 줄
  /** 받아 둔 기간의 줄 전부 (지운 것 포함 — 화면 함수가 거른다) */
  blocks: Block[];
  addBlock: (b: Block) => void;
  /** record=false — 글자 치기처럼 브라우저 되돌리기에 맡기는 고침 */
  patchBlocks: (p: Patch[], record?: boolean) => void;
  /** 새 줄 + 고침을 «한 동작» 으로 (⌘Z 한 번에 같이 되돌아간다) */
  editBlocks: (p: Patch[], created?: Block[], base?: Block[]) => void;
  /** ⌘Z — 이 기기에서 한 마지막 동작을 되돌린다. 되돌릴 게 없으면 false */
  undoBlocks: () => boolean;
  /** ⌘⇧Z — 방금 되돌린 것을 다시. 새로 고치면 다시 할 것은 사라진다 */
  redoBlocks: () => boolean;
  /** 마지막으로 되돌린 시각 — 편집기가 «글자 다시 하기» 와 가른다 */
  lastUndoAt: () => number;
  /** 마지막으로 되돌릴 동작을 한 때 (글자 치기와 어느 쪽이 나중인지 가린다) */
  lastEditAt: () => number;
  /** 체크 — 끝낸 날 = 체크한 화면의 날짜 (소유자 결정) */
  toggleBlock: (b: Block, viewDate: string) => void;
  /** 덩어리째 지우기 + 되돌리기 */
  removeBlock: (b: Block) => void;
  newId: () => string;
  // ── D-Day (v3 dd* · PRD §2-1-2)
  ddays: DDay[];
  /** id 가 없으면 새로. 타이틀 · 날짜가 없으면 null */
  saveDDay: (id: string | null, v: { emoji: string; title: string; note: string; date: string }) => DDay | null;
  /** 자리가 다 찼으면 false — 남의 것을 밀어내지 않는다 */
  pinDDay: (id: string, on: boolean) => boolean;
  /** 아카이브 = «저장됨» 으로 옮김 (고정은 풀린다) · 끄면 목록으로 */
  archiveDDay: (id: string, on: boolean) => void;
  deleteDDay: (id: string) => void;
  /** 그림 목록 (items/images) — 크기 · 날짜 · 줄. 그림 파일은 따로 (SYNC §14) */
  images: Record<string, ImgMeta>;
  /** v3(로컬 앱) 파일 읽어 보기 — 아무것도 쓰지 않고 무엇이 몇 개 옮겨지는지만 (설정 › 데이터) */
  v3Preview: (file: File) => Promise<V3Pick>;
  /** v3 데이터 옮기기 — 원본 보관 → 근태 → 줄 → 기록 → 항목 → 그림. 다시 돌려도 덮어쓸 뿐 두 벌이 안 생긴다 */
  v3Import: (p: V3Pick, onStep: (msg: string) => void) => Promise<void>;
  /** 이미 옮긴 적이 있으면 그때 시각 · 요약 */
  v3Imported: { at: number; report: Converted['report'] } | null;
  /** 그림 넣기 — 줄인 뒤 한도를 보고 올려서, after 줄 바로 뒤에(없으면 맨 끝에) 그림 줄로. 넣은 줄 id 들 */
  addImages: (files: Blob[], date: string, area: BlockArea, after: Block | null, pasted: boolean) => Promise<string[]>;
  /** 그림 파일 받기 (기기에 있으면 기기에서) */
  imageBlob: (id: string) => Promise<Blob | null>;
  /** 설정에서 그림 지우기 — 그 그림 줄도 지운다 */
  removeImage: (id: string) => void;
  /** 지난 날 내 순위 — 그 날이 끝나면 한 번 세어 고정한다 (SYNC §11). 날짜 → 등수 */
  ranks: Record<string, RankFix>;
  /** 첫 기록 날짜 — 활동 «미근무» 가 그 날부터 센다. 처음 열 때 한 번 읽는다 */
  firstDate: string | null;
  // ── 습관 (v3 hb* · PRD §2-1-3)
  habits: Habit[];
  /** 그 날이 쉬는 날(연차 · 병가)인가 — 받아 둔 기간 밖은 근무일로 본다 */
  offDay: OffDay;
  /** 잘못된 입력이면 그 이유, 저장했으면 null */
  saveHabit: (id: string | null, v: HbInput) => string | null;
  archiveHabit: (id: string, on: boolean) => void;
  /** 정의와 기록을 함께 걷는다 (되돌리기 있음) */
  deleteHabit: (id: string) => void;
  /** 체크 · 해제 — 오늘 패널 · 일간 상세가 같이 쓴다 */
  toggleHabit: (id: string, date: string) => void;
  // ── 시간 기록 · 근무 밖 휴게 (v3 slots · rests — LOGIC §5 · §6)
  /** 받아 둔 기간의 기록 전부 (지운 것 포함 — logsOf 가 거른다) */
  logs: Log[];
  /** 모든 날의 기록 구독 — 설정 › 시간 기록의 «N건 · 시간» 만 쓴다 (보는 기간 손잡이와 따로) */
  watchAllLogs: (cb: (logs: Log[]) => void) => () => void;
  /** 그날 앱 사용 기록 (PC 마다 문서 하나 · domain/appUse) */
  watchApps: (date: string, cb: (d: AppDoc[]) => void) => () => void;
  /** 모든 날의 할 일 · 메모 줄 구독 — 검색만 쓴다 (보는 기간 손잡이와 따로) */
  watchAllBlocks: (cb: (blocks: Block[]) => void) => () => void;
  /**
   * 시간표 상자에서 저장 (v3 saveSlot) — 종류 바꾸기 · 겹치면 새것이 이긴다 · 휴게의 근무 밖 몫 나누기까지.
   * 한 번의 되돌리기로 전부 돌아온다. 잘못된 입력이면 그 이유, 저장했으면 null
   */
  saveSpan: (date: string, orig: SpanRef | null, v: SpanInput) => string | null;
  deleteSpan: (date: string, orig: SpanRef) => void;
  /** 앱 사용 초안 줄 지우기 (v3 · 잘못 잡힌 앱 사용 기록) — 그 구간의 칸만 비운다. 시간 기록 · 휴게는 그대로 */
  dropApps: (date: string, docs: AppDoc[], s: number, e: number) => void;
  /** 오늘 범례의 «↻ 싱크» (v3 syncAppUse) — 지금 칸을 바로 저장한다. cells = 표에 이미 있는 칸 */
  syncApps: (cells: string[]) => void;
  /** 「겹친 휴게 정리」 — 사람이 누른 정리라 비근무까지 자른다 (v3.1.64) */
  fixConflicts: (date: string) => void;
  /** 카테고리 = 이름 붙인 색 (v3 cfg.cats) — 저장한 적 없으면 12색 · 이름 없음 */
  cats: Cat[];
  /** recolor — 한 카테고리의 색만 바꿨을 때. 그 색으로 적은 기록도 같이 칠한다 (v3.1.86 — 색이 곧 키라 안 칠하면 이름을 잃는다) */
  setCats: (list: Cat[], recolor?: [string, string]) => void;
  // ── 가상 동료 (v3 sim — 대화 · 허들은 아직)
  /** 지금 상태 — 일하는 사람이 위 (v3 사이드바 순서) */
  mates: { m: Member; st: MateStatus }[];
  /** 오늘 근무 랭킹 — 나도 같은 줄에 */
  ranking: LbRow[];
  mateStatus: (id: string) => MateStatus | null;
  nick: string;
  initial: string;
  presence: 'active' | 'break' | 'offline';
}

export function useWorkspace(backend: Backend, user: User): Workspace {
  const repo: Repo = useMemo(() => backend.repoFor(user), [backend, user.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => repo.dispose(), [repo]);

  // 분 단위 — 초가 보이는 숫자는 그 조각이 따로 센다 (clock.ts)
  const [now, bumpNow] = useMinute();
  const today = dateKey(now);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [range, setRange] = useState<DayEvents>({ events: [], unavailable: false });
  const [calMonth, setCalMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  // 주간 플래너가 보고 있는 주 (월요일). 앱을 켜면 늘 이번 주부터 (v3 wkCur — 메모리에만)
  const [wpWeek, setWpWeek] = useState(() => keyOf(weekStart(new Date())));
  // 활동이 보고 있는 기간 (월간 · 연간이면 받아 두는 기간을 그만큼 넓힌다 — 보이는 것만, 떠나면 놓는다)
  const [dashSpan, setDashSpan] = useState<[string, string] | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => repo.watchSync(setSync), [repo]);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  useEffect(() => { repo.firstDate().then(setFirstDate, () => setFirstDate(null)); }, [repo]);

  // 근태 표 — v3 는 첫 기록까지 모든 주를 세운다. 웹은 보이는 만큼만 받으려고 아래로 내릴 때 더 받는다
  const [tblWeeks, setTblWeeks] = useState(WEEKS_SHOWN);
  const firstWk = firstDate ? keyOf(weekStart(dateOf(firstDate))) : null;
  const tblStart = keyOf(addDays(weekStart(dateOf(today)), -7 * (tblWeeks - 1)));
  const tblAll = !firstWk || tblStart <= firstWk;
  const moreWeeks = useCallback(() => setTblWeeks((n) => n + WEEKS_STEP), []);
  // 받아 두는 기간 = 표에 보이는 주 + 캘린더에 보이는 달 (노션 방식 — 보이는 것만)
  const from = useMemo(() => {
    const tblFrom = tblStart;
    const calFrom = keyOf(calMonth);
    return [tblFrom, calFrom, wpWeek, ...(dashSpan ? [dashSpan[0]] : [])].sort()[0];
  }, [tblStart, calMonth, wpWeek, dashSpan]);
  const to = useMemo(() => {
    const calTo = keyOf(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
    return [calTo, today, keyOf(addDays(dateOf(wpWeek), 6)), ...(dashSpan ? [dashSpan[1]] : [])].sort().at(-1) as string;
  }, [today, calMonth, wpWeek, dashSpan]);
  useEffect(() => repo.watchRange(from, to, setRange), [repo, from, to]);
  // 기록이 바뀌면(이 기기 버튼 · 다른 기기) 그 자리에서 다시 센다 — 다음 분까지 기다리지 않는다
  useEffect(bumpNow, [range, bumpNow]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  useEffect(() => repo.watchBlocks(from, to, (d) => setBlocks(d.blocks)), [repo, from, to]);
  const [logs, setLogs] = useState<Log[]>([]);
  const watchAllLogs = useCallback((cb: (l: Log[]) => void) => repo.watchLogs('0000-01-01', '9999-12-31', cb), [repo]);
  const watchAllBlocks = useCallback((cb: (b: Block[]) => void) => repo.watchBlocks('0000-01-01', '9999-12-31', (d) => cb(d.blocks)), [repo]);
  useEffect(() => repo.watchLogs(from, to, setLogs), [repo, from, to]);

  const byDate = useMemo(() => {
    const m: Record<string, AttEvent[]> = {};
    for (const e of range.events) (m[e.date] ??= []).push(e);
    return m;
  }, [range.events]);

  // D-Day · 습관 · 타이머 — 정의 하나 = 문서 하나 (items)
  const [items, setItems] = useState<Item[]>([]);
  // 첫 수신 전에는 «없다» 와 «아직 모른다» 가 구분되지 않는다 — 고정값처럼 한 번만 써야 하는 것은 이걸 기다린다
  const [itemsIn, setItemsIn] = useState(false);
  useEffect(() => repo.watchItems((xs) => { setItems(xs); setItemsIn(true); }), [repo]);
  const setDoc = items.find((x) => x.id === SETTINGS_ID) as (Item & Partial<Settings>) | undefined;
  const settings = useMemo<Settings>(() => ({ ...SETTINGS_DEFAULT, ...setDoc }), [setDoc]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 출근 감지가 돌면 자정을 넘긴 날은 묻지 않고 23:59 마감 (LOGIC §7 v3.2.0) — 기기 상태 대신 계정 설정으로 (SYNC §6)
  const closeAtMidnight = settings.arrivalDetect && settings.workAppsOn;
  const days = useMemo(() => {
    const out: Record<string, Day> = {};
    for (const [k, evs] of Object.entries(byDate)) {
      const slots = logsOf(logs, k, 'slot');
      out[k] = { ...deriveDay(k, evs, now, '', { closeAtMidnight }), ...(slots.length ? { slots } : {}) };
    }
    return out;
  }, [byDate, logs, now, closeAtMidnight]);
  const day: Day = days[today] ?? { date: today, onAt: null, offAt: null, breaks: [], leave: '' };
  const state = stateOf(day);

  const toastUntil = useRef(0);
  const say = useCallback((text: string, action?: Toast['action'], queue = false) => {
    const put = () => {
      setToast({ text, action });
      const ms = action ? 8000 : 1900;
      toastUntil.current = Date.now() + ms;
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => { setToast(null); toastUntil.current = 0; }, ms);
    };
    // v3 actToast — 단추가 달린 말은 앞의 말이 끝난 뒤에 세운다. 안 그러면 「세션 완료」가 순식간에 지워진다
    const wait = toastUntil.current - Date.now();
    // (되돌리기는 기다리지 않는다 — 방금 한 일을 되돌릴 길이 바로 보여야 한다)
    if (queue && wait > 250) window.setTimeout(put, wait + 250); else put();
  }, []);

  const warn = useCallback((text: string) => {
    setToast({ text, bad: true });
    toastUntil.current = Date.now() + 2600;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => { setToast(null); toastUntil.current = 0; }, 2600);
  }, []);

  const push = useCallback((type: AttEventType, date = today, extra: Partial<AttEvent> = {}) => {
    const e: AttEvent = {
      id: newId(), date, at: Date.now(), type,
      deviceId: deviceId(), deviceKind: deviceKind(), ...extra,
    };
    repo.addEvent(e);
    return e;
  }, [repo, today]);


  // 집중 타이머 — 사람 하나에 하나 (items/pomo · SYNC §9). 집중을 끝까지 채우면 횟수를 «끝난 날» 에 남긴다 (v3 onComplete)
  const pomoDoc = useMemo(() => (items.find((x) => x.id === POMO_ID) as (PomoDoc & Item) | undefined) ?? null, [items]);
  // 완료 이벤트 id 는 끝난 시각 — 여러 기기가 동시에 알아채도 한 건
  const pomoCount = useRef(0);
  pomoCount.current = day.pomos ?? 0;
  const timer = usePomodoro(
    pomoDoc,
    (fields, full) => (pomoDoc ? repo.patchItem(POMO_ID, fields) : repo.addItem({ id: POMO_ID, kind: 'pomo', ...full } as Item)),
    (mode, endedAt, min) => {
      // 꺼져 있던 사이에 끝난 세션은 알림을 안 띄운다 — 다시 켰을 때 지난 일로 울리지 않게
      const fresh = settingsRef.current.notify && Date.now() - endedAt < 60_000;
      if (mode !== 'focus') { if (fresh) void notify('휴식 끝', '다시 집중해볼까요?'); return; }
      push('pomoDone', dateKey(endedAt), { id: `pomo-${endedAt}`, at: endedAt, min });
      say(`세션 완료! 오늘 ${pomoCount.current + 1}회`);
      if (fresh) void notify('집중 세션 완료 🍅', `${min}분 집중했어요.`);
    },
    (mode) => say(mode === 'focus' ? '다음 집중을 자동으로 시작했어요' : '휴식을 자동으로 시작했어요',
      { label: '그만두기', run: () => { timerRef.current?.pause(); setToast(null); } }, true),
  );
  const timerRef = useRef<Pomodoro | null>(null);
  timerRef.current = timer;

  // ── 그림 (SYNC §14)
  const imgDoc = items.find((x) => x.id === IMGS_ID) as (Item & { map?: Record<string, ImgMeta> }) | undefined;
  const images = useMemo(() => imgDoc?.map ?? {}, [imgDoc]);
  const imgRef = useRef(images);
  imgRef.current = images;
  /** 그림 줄을 지우거나 되돌리면 그 그림에 표시 — 하루가 지나면 파일을 비운다 */
  function markGone(ps: Patch[]) {
    const ch: Record<string, unknown> = {};
    for (const p of ps) {
      if (!('deletedAt' in p)) continue;
      const img = blocks.find((x) => x.id === p.id)?.img;
      if (img && imgRef.current[img]) ch[`map.${img}.gone`] = p.deletedAt ?? null;
    }
    if (Object.keys(ch).length) repo.patchItem(IMGS_ID, ch);
  }
  const addImages: Workspace['addImages'] = async (files, date, area, after, pasted) => {
    const made: string[] = [];
    let prev = after, list = blocks;
    for (const f of files) {
      const s = await shrinkImage(f);
      if (!s) { say('그림 파일만 넣을 수 있어요'); continue; }
      if (!imgFits(imgRef.current, s.bytes.length)) { say(`그림 공간 ${fmtMB(IMG_QUOTA)}을 다 썼어요. 설정 › 데이터 › 이미지에서 안 쓰는 그림을 지워 주세요`, undefined, true); break; }
      const id = newId(), now = Date.now();
      await repo.putImage(id, s.bytes, s.mime);
      // 붙여넣은 그림은 화면 배율만큼 줄여 보인다 — 레티나 스크린샷이 두 배로 커지지 않게 (v3 DESIGN H)
      const nw = Math.round(pasted ? s.w / (window.devicePixelRatio || 1) : s.w);
      const nb: Block = {
        ...appendBlock(list, date, area, '', { id: newId(), now }, 'image'),
        ...(prev ? afterSibling(list, prev) : {}), img: id, nw,
      };
      repo.mergeItem({ id: IMGS_ID, kind: 'images', map: { [id]: { size: s.bytes.length, date, area, block: nb.id, at: now, w: s.w, h: s.h } } } as Item);
      imgRef.current = { ...imgRef.current, [id]: { size: s.bytes.length, date, area, block: nb.id, at: now, w: s.w, h: s.h } };
      editBlocks([], [nb]);
      list = [...list, nb]; prev = nb; made.push(nb.id);
    }
    return made;
  };
  const imageBlob = useCallback((id: string) => repo.getImage(id), [repo]);
  const removeImage = (id: string) => {
    const m = imgRef.current[id];
    if (m) repo.patchBlocks([{ id: m.block, deletedAt: Date.now() }]);
    void repo.deleteImage(id);
    repo.patchItem(IMGS_ID, { [`map.${id}`]: null });
    say('그림을 지웠어요');
  };

  // ── v3 옮기기 (2026-11-02 소유자 — 로컬 데이터를 하나도 빼먹지 않고)
  const v3Doc = items.find((x) => x.id === V3_ID) as (Item & { at: number; report: Converted['report'] }) | undefined;
  const v3Imported = v3Doc ? { at: v3Doc.at, report: v3Doc.report } : null;
  const v3Preview: Workspace['v3Preview'] = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, conv: convertV3(await loadV3(bytes), Date.now()) };
  };
  const v3Import: Workspace['v3Import'] = async ({ bytes, conv: c }, onStep) => {
    const PART = 700 * 1024, parts = Math.ceil(bytes.length / PART);
    onStep('원본 파일을 보관하는 중');
    for (let i = 0; i < parts; i++) repo.putArchive(`v3-sqlite-${i}`, bytes.slice(i * PART, (i + 1) * PART), { kind: 'v3-sqlite', part: i, of: parts, size: bytes.length });
    onStep(`근태 ${c.report.days}일을 옮기는 중`);
    // 같은 날 웹에 이미 있던 기록은 «v3 하루에 녹아 있다» 고 적는다 — 안 그러면 재생이 v3 하루 위에 그 기록을 다시 얹는다
    const ovs = c.events.filter((e) => e.type === 'override');
    const prior = ovs.length ? await repo.eventsIn(ovs[0].date, ovs[ovs.length - 1].date) : [];
    for (const e of c.events) {
      if (e.type === 'override') e.basedOn = prior.filter((x) => x.date === e.date && !x.id.startsWith('v3-') && x.type !== 'pomoDone').map((x) => x.id);
      repo.addEvent(e);
    }
    onStep(`할 일 · 메모 ${c.report.lines}줄을 옮기는 중`);
    for (const b of c.blocks) repo.addBlock(b);
    for (const l of c.logs) repo.addLog(l);
    onStep('D-Day · 습관 · 설정을 옮기는 중');
    for (const d of c.ddays) repo.addItem(d as unknown as Item);
    for (const h of c.habits) repo.addItem(h as unknown as Item);
    if (c.cats) repo.addItem({ id: CATS_ID, kind: 'cats', list: cleanCats(c.cats) } as Item);
    if (Object.keys(c.settings).length) repo.mergeItem({ id: SETTINGS_ID, kind: 'settings', ...c.settings } as Item);
    if (c.members) repo.addItem({ id: MEMBERS_ID, kind: 'members', list: c.members } as Item);
    if (Object.keys(c.pomo).length) repo.mergeItem({ id: POMO_ID, kind: 'pomo', ...POMO_DEFAULT, ...(pomoDoc ?? {}), ...c.pomo } as Item);
    if (Object.keys(c.saved.memos).length) repo.mergeItem({ id: SAVED_ID, kind: 'saved', memos: c.saved.memos, sort: c.saved.sort } as Item);
    let n = 0;
    for (const im of c.images) {
      onStep(`그림 ${++n} / ${c.images.length}을 옮기는 중`);
      const sh = await shrinkImage(await (await fetch(im.dataUrl)).blob());
      if (!sh) continue;
      await repo.putImage(im.id, sh.bytes, sh.mime);
      repo.mergeItem({ id: IMGS_ID, kind: 'images', map: { [im.id]: { size: sh.bytes.length, date: im.date, area: im.area, block: im.block, at: Date.now(), w: sh.w, h: sh.h } } } as Item);
    }
    repo.addItem({ id: V3_ID, kind: 'v3import', at: Date.now(), report: c.report } as Item);
    onStep('끝');
  };

  const saveSettings: Workspace['saveSettings'] = (x) => {
    // 하루 목표는 바꾼 날부터 — 어제까지는 이전 값으로 묶는다 (LOGIC v3.2.5)
    const past = x.goalHours != null ? goalPastAfter(settings.goalPast, settings.goalHours, x.goalHours, today) : settings.goalPast;
    repo.mergeItem({ id: SETTINGS_ID, kind: 'settings', ...x, ...(past !== settings.goalPast ? { goalPast: past } : {}) } as Item);
  };
  const goal = useMemo<GoalCfg>(() => ({ hours: settings.goalHours, leave: settings.leaveGoal, past: settings.goalPast }), [settings.goalHours, settings.leaveGoal, settings.goalPast]);
  // 앱 사용 기록 — 10분 칸을 메모리에 모았다가 칸이 바뀌거나 창을 떠날 때 한 번 쓴다 (쓰기 횟수를 줄인다)
  // ponytail: 같은 칸 도중에 앱을 껐다 켜면 그 칸의 앞쪽 표본은 덮인다
  const appAcc = useRef<{ date: string; g: number; cell: AppCell } | null>(null);
  const flushApps = useCallback(() => {
    const a = appAcc.current;
    if (a) repo.putAppCells(a.date, deviceId(), { [a.g]: a.cell });
  }, [repo]);
  useEffect(() => {
    const off = () => { if (document.visibilityState === 'hidden') flushApps(); };
    document.addEventListener('visibilitychange', off);
    window.addEventListener('pagehide', flushApps);
    return () => { flushApps(); document.removeEventListener('visibilitychange', off); window.removeEventListener('pagehide', flushApps); };
  }, [flushApps]);
  const watchApps = useCallback((date: string, cb: (d: AppDoc[]) => void) => repo.watchApps(date, date, cb), [repo]);
  // 출근 감지 (v3.2.0 · LOGIC §2-1) — 판정은 domain/arrival, 여기는 물음과 기록. 메모리에만 산다
  const arr = useRef(arrCreate());
  const arrApps = useRef<string[]>([]);
  const missedShow = useRef(false);
  const [, bumpArr] = useState(0);
  const arrCoolMin = () => Math.max(1, Math.min(240, Math.round(settings.arrivalCooldownMin || 30)));
  const arrLive = deviceKind() === 'desktop' && settings.arrivalDetect && settings.workAppsOn;
  const arrMode = (): ArrMode => {
    if (!arrLive || Object.keys(days).some((k) => k < today && days[k].pending)) return 'none';   // 「확인 필요」 가 먼저다
    return day.onAt == null ? 'pre' : day.offAt != null ? 'resume' : 'none';
  };
  // PC 브라우저 자리비움 감지 — 이벤트만 보낸다. 자리비움인지는 재생이 정한다 (여러 PC · 사람이 연 휴게 우선)
  const idle = useIdleAway({
    on: settings.away, min: settings.awayMin, working: state === 'work',
    apps: { on: settings.workAppsOn, workApps: settings.workApps, nonWorkApps: settings.nonWorkApps, unknownApp: settings.unknownApp },
    onAway: (at, by, mins) => {
      push('awayStart', dateKey(at), { at, by });
      if (by === 'idle') say(`${mins}분째 움직임이 없어 휴게로 기록하고 있어요`);
      if (by === 'app') say(`${mins}분째 업무 앱 사용이 없어서 휴게로 기록하고 있어요`);
    },
    onBack: (at) => { push('awayEnd', dateKey(at), { at }); },
    manualOpen: () => { const b = state === 'break' ? openBreak(day) : undefined; return b && !b.auto ? b.s : null; },
    onManualBack: (at) => {
      const e = push('breakEnd', dateKey(at), { at });
      say(`휴게 구간을 ${hhmm(at)}로 기록했어요 (${Math.round((at - (openBreak(day)?.s ?? at)) / 60000)}분)`, { label: '되돌리기', run: () => { repo.deleteEvent(e); setToast(null); } });
    },
    arrOn: arrLive, arrive: () => arrMode() !== 'none',
    onArrTick: ({ sec, kind, name, at }) => {
      const st = arr.current;
      const ev = arrTick(st, { now: at, mode: arrMode(), kind, idleSec: sec, awaySec: Math.max(3, settings.awayMin) * 60, longMs: LONG_BREAK_MS, dayKey: dateKey(at) });
      if (kind === 'work' && name && !arrApps.current.includes(name)) arrApps.current = [...arrApps.current, name].slice(-3);
      if (!st.run && !st.hit) arrApps.current = [];
      if (!ev) return;
      if (ev.type === 'hit' && st.hit) {
        st.hit.apps = arrApps.current; missedShow.current = true;
        if (settingsRef.current.notify) void notify(st.hit.mode === 'resume' ? '업무를 다시 시작하셨나요?' : '업무를 시작하셨나요?', `${korClock(st.hit.at)}부터 근무 중이에요.`);
      }
      // 놓친 기록이 막 생긴 때는 사람이 자리에 없다 — 다음 출근 순간까지 숨겨 둔다
      if (ev.type === 'withdrawn' && ev.missed) missedShow.current = false;
      bumpArr((n) => n + 1);
    },
    onSample: (f, self, kind, at) => {
      const date = dateKey(at), g = appSlotOf(Math.floor((at - dayStartMs(date)) / 60_000));
      let a = appAcc.current;
      if (!a || a.date !== date || a.g !== g) { flushApps(); a = appAcc.current = { date, g, cell: addAppSample(undefined, f, self, kind) }; }
      else a.cell = addAppSample(a.cell, f, self, kind);
    },
  });
  // 화면 모드 · 테마 — 시스템 설정이면 기기가 밤 모드로 넘어갈 때 따라간다
  useEffect(() => {
    applyLook(settings.mode, settings.theme);
    if (settings.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyLook('system', settings.theme);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [settings.mode, settings.theme]);

  const catsDoc = items.find((x) => x.id === CATS_ID) as (Item & { list?: Cat[] }) | undefined;
  const cats = useMemo(() => catsOf(catsDoc?.list), [catsDoc]);
  const setCats: Workspace['setCats'] = (list, recolor) => {
    const next = cleanCats(list);
    if (!next.length) { say('카테고리는 하나 이상 있어야 해요'); return; }
    if (catsDoc) repo.patchItem(CATS_ID, { list: next }); else repo.addItem({ id: CATS_ID, kind: 'cats', list: next } as Item);
    if (!recolor) return;
    // ponytail: 받아 둔 기간의 기록만 다시 칠한다 — 그보다 옛 기록은 옛 색에 남아 이름을 잃는다. 넓히려면 서버에서 색으로 찾아 고치기
    const [from, to] = recolor.map((c) => c.toLowerCase());
    for (const l of logs) if (!l.deletedAt && l.color?.toLowerCase() === from) repo.patchLog(l.id, { color: to });
  };

  // 버튼 하나가 무엇을 «취소» 했는지는 이벤트를 하나 더 얹어 재생해 보면 안다
  const after = (e: AttEvent) => deriveDay(today, [...(byDate[today] ?? []), e], Date.now());

  // On · Off 가 같은 칸이라 두 번 누르면 출근하자마자 퇴근이 찍힌다 — 칸이 바뀐 뒤 0.6초는 다시 안 받는다 (v3.1.265)
  const punchAt = useRef(0);
  const tooSoon = () => { const n = Date.now(); if (n - punchAt.current < 600) return true; punchAt.current = n; return false; };
  /** 출근이 찍힌 뒤 — 출근 단추 · 감지 물음이 같은 길을 지난다 (v3 afterPunchOn). 출근하는 순간이 놓친 기록을 알리는 때다 */
  const afterPunchOn = () => { arrClear(arr.current); arrApps.current = []; missedShow.current = true; bumpArr((n) => n + 1); };
  const onOn = () => { if (tooSoon()) return; push('clockIn'); afterPunchOn(); };
  const onOff = () => {
    if (tooSoon()) return;
    arrCool(arr.current, Date.now(), arrCoolMin() * 60_000);   // 퇴근 직후엔 «재개» 를 바로 묻지 않는다
    timer.pause();                       // v3 — 퇴근하면 집중도 멈춘다
    const before = sessions(day).length;
    const d = after(push('clockOut'));
    if (d.onAt == null) say(OFF_CANCEL.day);
    else if (sessions(d).length < before) say(OFF_CANCEL.session);
  };
  const onRest = () => {
    if (state === 'break') {
      const n0 = day.breaks.length;
      if (after(push('breakEnd')).breaks.length < n0) say('1분 미만이라 휴게로 남기지 않았어요');
    } else {
      timer.pause();                     // v3 — 쉬러 가면 집중도 멈춘다
      push('breakStart');
    }
  };
  const onLeave = (date: string, leave: Leave) => { push('leaveSet', date, { leave }); };

  const emptyDay = (date: string): Day => ({ date, onAt: null, offAt: null, breaks: [], leave: '' });
  const dayOf = (date: string) => days[date] ?? emptyDay(date);

  /** 고친 하루를 override 이벤트 하나로 (SYNC §6) */
  const overrideDay = (date: string, next: Day) => {
    const { onAt, offAt, breaks, leave, autoClosed, carriedFrom } = next;
    return push('override', date, {
      day: { onAt, offAt, breaks, leave, autoClosed, carriedFrom },
      basedOn: (byDate[date] ?? []).filter((x) => !x.deletedAt && x.type !== 'pomoDone').map((x) => x.id),
    });
  };
  const editDay = (date: string, fn: (d: Day) => Day | null, msg = '근태를 고쳤어요') => {
    const next = fn(dayOf(date));
    if (!next) return false;
    const e = overrideDay(date, next);
    say(msg, { label: '되돌리기', run: () => { repo.deleteEvent(e); setToast(null); } });
    return true;
  };

  const arrAct = (a: 'go' | 'cancel' | 'snooze') => {
    const st = arr.current, h = st.hit;
    if (!h) return;
    if (a === 'cancel') { arrCancel(st, Date.now(), arrCoolMin() * 60_000); say(`감지를 취소했어요. ${arrCoolMin()}분 뒤부터 다시 확인해요`); }
    else if (a === 'snooze') { arrSnooze(st, today); say('오늘은 출근 여부를 묻지 않을게요'); }
    else {
      // 감지 시각으로 출근 · 재개. 감지 뒤 대답 전에 비운 구간은 자리비움 휴게로 (v3 arrivalAccept)
      if (day.onAt != null && day.offAt == null) { afterPunchOn(); return; }   // 그 사이 다른 길로 이미 출근했다
      const at = day.offAt != null ? Math.max(h.at, day.offAt + 1) : h.at;
      const evs = [push('clockIn', today, { at })];
      const spans = [...h.aways, ...(h.awaySince != null ? [{ s: h.awaySince, e: Date.now() }] : [])];
      for (const x of spans) {
        if (x.s < at || x.e - x.s < MIN_BREAK_MS) continue;
        evs.push(push('awayStart', today, { at: x.s, by: 'idle' }), push('awayEnd', today, { at: x.e }));
      }
      afterPunchOn();
      say(`${korClock(h.at)}부터 ${h.mode === 'resume' ? '업무 재개' : '출근'}으로 기록했어요`,
        { label: '되돌리기', run: () => { evs.forEach((e) => repo.deleteEvent(e)); setToast(null); } });
      return;
    }
    arrApps.current = [];
    bumpArr((n) => n + 1);
  };
  const missedNow = missedShow.current ? arr.current.missed[0] ?? null : null;
  const missedAct = (a: 'add' | 'drop') => {
    const m = arr.current.missed[0];
    if (!m) return;
    if (a === 'add') {
      const range = `${korClock(m.s)}~${korClock(m.e)}`;
      if (!editDay(dateKey(m.s), (d) => addWorkSpan(d, m.s, m.e), `${range}을 근무로 추가했어요`)) {
        say('이 구간은 근무로 넣을 수 없어요. 근무 상세에서 차수를 직접 추가해 주세요'); return;
      }
    }
    arr.current.missed.shift();
    bumpArr((n) => n + 1);
  };
  const pendingDays = Object.keys(days).filter((k) => k < today && days[k].pending).sort();
  const nextKey = (k: string) => dateKey(dayEndMs(k));
  const canCarryFor = (k: string) => canCarry(days[nextKey(k)], k);

  const resolvePending = (date: string, how: 'at' | 'carry') => {
    if (how === 'at') { editDay(date, resolveAt, '기록을 확정했어요'); return; }
    if (!canCarryFor(date)) return;
    const n = nextKey(date);
    const e1 = push('override', date, (() => {
      const d = resolveCarry(dayOf(date));
      if (!d) return {};
      const { onAt, offAt, breaks, leave, autoClosed, carriedFrom } = d;
      return {
        day: { onAt, offAt, breaks, leave, autoClosed, carriedFrom },
        basedOn: (byDate[date] ?? []).filter((x) => !x.deletedAt && x.type !== 'pomoDone').map((x) => x.id),
      };
    })());
    // 다음날 00:00 출근 — «일어난 시각» 을 그 날 00:00 으로 적어야 재생 순서가 맞다.
    // 이미 00:00 출근이 있으면 같은 값이라 새로 안 만든다 (v3 canCarry v3.1.81)
    const e2 = days[n]?.onAt == null ? push('clockIn', n, { carriedFrom: date, at: dayEndMs(date) }) : null;
    say('기록을 확정했어요', { label: '되돌리기', run: () => {
      repo.deleteEvent(e1);
      if (e2) repo.deleteEvent(e2);
      setToast(null);
    } });
  };

  // ── 할 일 고침 — 되돌리기는 «그 기기의 동작» 단위 (결함표 Q4). 다른 기기 고침은 건드리지 않는다
  const undoStack = useRef<{ inv: Patch[]; at: number }[]>([]);
  const redoStack = useRef<{ inv: Patch[]; at: number }[]>([]);
  const record = (ps: Patch[], created: Block[] = [], base = blocks) => {
    const inv = inverseOf(base, ps, created);
    if (!inv.length) return;
    undoStack.current.push({ inv, at: Date.now() });
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
  };
  const editBlocks = (ps: Patch[], created: Block[] = [], base?: Block[]) => {
    markGone(ps);
    record(ps, created, base);
    for (const b of created) repo.addBlock(b);
    if (ps.length) repo.patchBlocks(ps);
  };
  const addBlock = (b: Block) => editBlocks([], [b]);
  const patchBlocks = (ps: Patch[], rec = true) => { if (rec) editBlocks(ps); else repo.patchBlocks(ps); };
  // 되돌리기 · 다시 하기 — 한쪽 더미에서 꺼내 적용하고, 그 반대를 다른 더미에 쌓는다
  const flip = (from: typeof undoStack, to: typeof undoStack) => {
    const top = from.current.pop();
    if (!top) return false;
    to.current.push({ inv: inverseOf(blocks, top.inv), at: Date.now() });
    markGone(top.inv);
    repo.patchBlocks(top.inv);
    return true;
  };
  const undoBlocks = () => flip(undoStack, redoStack);
  const redoBlocks = () => flip(redoStack, undoStack);
  const lastUndoAt = () => redoStack.current[redoStack.current.length - 1]?.at ?? 0;
  const lastEditAt = () => undoStack.current[undoStack.current.length - 1]?.at ?? 0;
  /** 체크 — 딸린 할 일까지 함께, 윗줄 진행도는 «고치는 지금» 맞춘다 (LOGIC §6-3 · Q6) */
  const toggleBlock = (b: Block, viewDate: string) => editBlocks(triToggle(blocks, b, viewDate, Date.now()));
  const removeBlock = (b: Block) => {
    const ids = deleteChunk(blocks, b);
    const at = Date.now();
    const ps: Patch[] = ids.map((id) => ({ id, deletedAt: at }));
    // 지운 줄이 하위 할 일이면 윗줄 완료도 다시 맞춘다
    const after = blocks.map((x) => (ids.includes(x.id) ? { ...x, deletedAt: at } : x));
    editBlocks([...ps, ...triFix(after, [b.id], b.doneOn ?? b.date)]);
    say(ids.length > 1 ? `${ids.length}줄을 지웠어요` : '지웠어요', {
      label: '되돌리기',
      run: () => { undoBlocks(); setToast(null); },
    });
  };

  // ── D-Day
  const ddays = useMemo(() => items.filter((x): x is DDay & Item => x.kind === 'dday' && !x.deletedAt), [items]);
  const saveDDay: Workspace['saveDDay'] = (id, v) => {
    const c = ddClean(v);
    if (!c) return null;
    let it: DDay;
    if (id) {
      const old = ddays.find((x) => x.id === id);
      if (!old) return null;
      it = { ...old, ...c };
      repo.patchItem(id, c);
    } else {
      it = { id: newId(), kind: 'dday', ...c, pinned: false, pinnedAt: null, archivedAt: null, createdAt: Date.now() };
      repo.addItem(it);
    }
    say(`${it.title} · ${ddLabel(it.date, today)}`);
    return it;
  };
  const pinDDay = (id: string, on: boolean) => {
    if (on && !ddCanPin(ddays, id)) return false;
    repo.patchItem(id, { pinned: on, pinnedAt: on ? Date.now() : null });
    return true;
  };
  const archiveDDay = (id: string, on: boolean) => {
    const it = ddays.find((x) => x.id === id);
    if (!it) return;
    // 목록에서 뺐는데 상세에 남아 있으면 «어디에도 없는데 계속 보이는» 것이 된다
    repo.patchItem(id, on ? { archivedAt: Date.now(), pinned: false, pinnedAt: null } : { archivedAt: null });
    say(on ? `「${it.title}」을 저장됨으로 보냈어요` : `「${it.title}」을 D-Day 목록으로 되돌렸어요`);
  };
  const deleteDDay = (id: string) => {
    repo.patchItem(id, { deletedAt: Date.now() });
    say('삭제했어요', { label: '되돌리기', run: () => { repo.patchItem(id, { deletedAt: null }); setToast(null); } });
  };

  // ── 습관
  const habits = useMemo(() => items.filter((x): x is Habit & Item => x.kind === 'habit' && !x.deletedAt), [items]);
  // ponytail: 받아 둔 기간(표 5주 + 캘린더 달)의 근태만 안다. 그 밖의 연차는 달성률에서 근무일로 센다 — 활동(내 분석)을 옮길 때 기간을 넓힌다
  const offDay: OffDay = (k) => { const lv = days[k]?.leave; return lv === '연차' || lv === '병가'; };
  const saveHabit: Workspace['saveHabit'] = (id, v) => {
    const c = hbClean(v);
    if (!c) return v.title.trim() ? '요일을 하나 이상 골라 주세요.' : '어떤 습관인지 적어 주세요.';
    if (id) {
      if (!habits.some((h) => h.id === id)) return '저장하지 못했어요.';
      repo.patchItem(id, { ...c });
    } else {
      if (habits.filter((h) => !h.archivedAt).length >= HB_MAX) return `습관은 ${HB_MAX}개까지 만들 수 있어요. 하나를 보관하거나 지워 주세요.`;
      repo.addItem({ id: newId(), kind: 'habit', ...c, createdAt: Date.now(), archivedAt: null } as Habit);
    }
    say(`${c.emoji ? c.emoji + ' ' : ''}${c.title} · ${hbFreqLabel(c)}`);
    return null;
  };
  const archiveHabit = (id: string, on: boolean) => {
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    repo.patchItem(id, { archivedAt: on ? Date.now() : null });
    say(on ? `「${h.title}」을 저장됨으로 보냈어요` : `「${h.title}」을 습관 목록으로 되돌렸어요`);
  };
  const deleteHabit = (id: string) => {
    repo.patchItem(id, { deletedAt: Date.now() });
    say('습관과 기록을 지웠어요', { label: '되돌리기', run: () => { repo.patchItem(id, { deletedAt: null }); setToast(null); } });
  };
  const toggleHabit = (id: string, date: string) => {
    const h = habits.find((x) => x.id === id);
    if (h) repo.patchItem(id, { [`done.${date}`]: hbDoneAt(h, date) ? null : Date.now() });
  };

  // ── 시간 기록 · 근무 밖 휴게
  const saveSpan: Workspace['saveSpan'] = (date, orig, v) => {
    if (!(v.e > v.s)) return '시간을 확인해 주세요. 끝나는 시각이 시작보다 뒤여야 해요';
    const text = v.text.trim();
    if (v.kind === 'slot' && !text) return '무엇을 했는지 적어 주세요';
    const at = Date.now();
    const ms = (m: number) => dayStartMs(date) + m * 60000;
    const undo: (() => void)[] = [];
    const gone = new Set<string>();
    const kill = (id: string) => { gone.add(id); repo.patchLog(id, { deletedAt: at }); undo.push(() => repo.patchLog(id, { deletedAt: null })); };
    const add = (kind: Log['kind'], s: number, e: number, color: string | null) => {
      for (const id of overlapIds(logs, date, kind, s, e)) kill(id);
      const l: Log = { id: newId(), date, kind, s, e, text, color, createdAt: at };
      repo.addLog(l);
      undo.push(() => repo.patchLog(l.id, { deletedAt: at }));
    };
    const patch = (id: string, s: number, e: number) => {
      const old = logs.find((x) => x.id === id);
      if (!old) return;
      for (const o of overlapIds(logs, date, old.kind, s, e, id)) kill(o);
      repo.patchLog(id, { s, e, text, color: v.color });
      undo.push(() => repo.patchLog(id, { s: old.s, e: old.e, text: old.text, color: old.color }));
    };
    const d0 = dayOf(date);
    let d = d0;
    let ref = orig;
    let msg = '';
    // 종류 바꾸기 (v3.1.240) — 원래 것을 지우고 새로 만드는 길을 그대로 탄다
    const origKind = !ref ? null : ref.type === 'slot' ? 'slot' : 'break';
    if (ref && origKind !== v.kind) {
      if (ref.type === 'brk') d = removeBreak(d, ref.idx) ?? d; else kill(ref.id);
      ref = null;
      msg = v.kind === 'break' ? '휴게로 바꿨어요. 근무시간에서 빠져요' : '시간 기록으로 바꿨어요. 근무시간에 들어가요';
    }
    if (v.kind === 'slot') {
      if (ref?.type === 'slot') { gone.add(ref.id); patch(ref.id, v.s, v.e); } else add('slot', v.s, v.e, v.color);
      msg ||= ref ? '시간 기록을 고쳤어요' : '시간 기록을 남겼어요';
      // 적었다는 건 그 시간에 일했다는 뜻 — 겹친 휴게는 그 자리에서 정리한다. 비근무는 안 건드린다 (v3.1.64)
      const slots = [...logsOf(logs, date, 'slot').filter((x) => !gone.has(x.id)), { s: v.s, e: v.e }];
      const r = resolveConflicts({ ...d, slots }, false);
      if (r.n) { d = { ...r.day, slots: d.slots }; msg += ` · 겹친 휴게 ${r.n}건을 정리했어요`; }
    } else if (ref?.type === 'rest') {
      patch(ref.id, v.s, v.e);
      msg ||= '휴게를 고쳤어요';
    } else if (ref?.type === 'brk') {
      const n = editBreak(d, ref.idx, ms(v.s), ms(v.e), text, v.color);
      if (!n) return '시간을 확인해 주세요';
      d = n;
      msg ||= '휴게를 고쳤어요';
    } else {
      // 근무 안 몫은 근태 휴게, 밖 몫은 근무 밖 휴게 (v3.1.239) — 출퇴근은 안 바뀐다
      const { inside, outside } = splitRest(d, v.s, v.e);
      for (const [a, z] of inside) d = addBreakSpan(d, ms(a), ms(z), text, v.color) ?? d;
      for (const [a, z] of outside) add('rest', a, z, v.color);
      msg ||= inside.length ? '휴게를 넣었어요. 근무시간에서 빠져요' : '휴게를 넣었어요. 근무시간에는 영향이 없어요';
    }
    if (d !== d0) { const e = overrideDay(date, d); undo.push(() => repo.deleteEvent(e)); }
    say(msg, { label: '되돌리기', run: () => { undo.forEach((f) => f()); setToast(null); } });
    return null;
  };
  const deleteSpan: Workspace['deleteSpan'] = (date, orig) => {
    if (orig.type === 'brk') { editDay(date, (x) => removeBreak(x, orig.idx), '휴게를 지웠어요'); return; }
    repo.patchLog(orig.id, { deletedAt: Date.now() });
    say(orig.type === 'slot' ? '시간 기록을 지웠어요' : '휴게를 지웠어요',
      { label: '되돌리기', run: () => { repo.patchLog(orig.id, { deletedAt: null }); setToast(null); } });
  };

  const dropApps: Workspace['dropApps'] = (date, docs, s, e) => {
    const undo: (() => void)[] = [];
    for (const doc of docs) {
      const keys = Object.keys(doc.cells ?? {}).filter((g) => +g + APP_SLOT_MIN > s && +g < e);
      if (!keys.length) continue;
      const empty: AppCells = {}, old: AppCells = {};
      for (const g of keys) { empty[g] = { n: {}, k: {}, l: {} }; old[g] = doc.cells[g]; }
      repo.putAppCells(date, doc.device, empty);
      undo.push(() => repo.putAppCells(date, doc.device, old));
    }
    say('앱 사용 기록을 지웠어요', { label: '되돌리기', run: () => { undo.forEach((f) => f()); setToast(null); } });
  };

  const syncApps: Workspace['syncApps'] = (cells) => {
    const a = appAcc.current, add = !!a && a.date === today && !cells.includes(String(a.g));
    flushApps();
    const n = cells.length + (add ? 1 : 0);
    say(`지금까지 모인 ${n}칸(${fmtDur(n * APP_SLOT_MIN)})을 표에 맞췄어요${add ? '. 방금 칸 1개 추가' : ''}`);
  };

  const fixConflicts = (date: string) => {
    const d = dayOf(date);
    const back = breakConflicts(d).reduce((a, c) => a + c.min, 0);
    const r = resolveConflicts(d, true);
    if (!r.n) { say('정리할 게 없어요'); return; }
    const left = breakConflicts(r.day).length;
    const e = overrideDay(date, r.day);
    say(left ? `휴게 ${r.n}건을 정리했는데 ${left}건이 아직 겹쳐 있어요. 알려 주세요` : `겹친 휴게 ${r.n}건을 정리해 ${fmtDur(back)}을 근무시간으로 돌렸어요`,
      { label: '되돌리기', run: () => { repo.deleteEvent(e); setToast(null); } });
  };

  const nick = settings.nick.trim() || (user.name ?? user.email?.split('@')[0] ?? '나');

  // ── 가상 동료 — 날짜 씨앗으로 매번 같은 하루 (저장하지 않는다)
  // 팀 = 멤버(계정에 저장 · 없으면 기본 4명) + 팀 근무시간대(설정 · 없으면 기본)
  const memDoc = items.find((x) => x.id === MEMBERS_ID) as (Item & { list?: Member[] }) | undefined;
  const teamCfg = useMemo<Team>(() => ({
    members: (memDoc?.list ?? ROSTER).filter((m) => m.enabled !== false),
    hours: settings.teamStart != null ? teamHours(settings.teamStart, settings.goalHours) : TEAM_DEFAULT,
  }), [memDoc, settings.teamStart, settings.goalHours]);
  const team = useMemo(() => buildTeam(today, teamCfg.members, teamCfg.hours), [today, teamCfg]);
  const members = memDoc?.list ?? ROSTER;
  const saveMembers = (list: Member[]) => (memDoc ? repo.patchItem(MEMBERS_ID, { list }) : repo.addItem({ id: MEMBERS_ID, kind: 'members', list } as Item));
  const nowMin = (() => { const t = new Date(now); return t.getHours() * 60 + t.getMinutes(); })();
  const mates = useMemo(() => teamCfg.members.map((m) => ({ m, st: statusAt(team[m.id], m, nowMin) }))
    .sort((a, b) => STATUS_ORDER[a.st.key] - STATUS_ORDER[b.st.key] || a.m.nick.localeCompare(b.m.nick)), [team, nowMin]);
  const myMin = dayParts(day, now).workMs / 60000;
  const ranking = useMemo(() => leaderboard(team, nowMin, myMin, nick, teamCfg.members), [team, nowMin, Math.floor(myMin), nick, teamCfg]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── 저장됨 — 담은 것 · 고정은 items/saved 의 memos 지도 하나 (바뀐 칸만 고친다)
  const savedDoc = items.find((x) => x.id === SAVED_ID) as (Item & { memos?: SavedMap; sort?: SavedSort }) | undefined;
  const saved = useMemo<SavedMap>(() => savedDoc?.memos ?? {}, [savedDoc]);
  const savedSort: SavedSort = savedDoc?.sort === 'date' ? 'date' : 'saved';
  const isSaved: Workspace['isSaved'] = (kind, key) => !!saved[savedId(kind, key)];
  const toggleSaved: Workspace['toggleSaved'] = (kind, key) => {
    const id = savedId(kind, key), cur = saved[id];
    if (!cur) { repo.mergeItem({ id: SAVED_ID, kind: 'saved', memos: { [id]: { savedAt: Date.now() } } } as Item); say('저장됨에 담았어요'); return; }
    repo.patchItem(SAVED_ID, { [`memos.${id}`]: null });
    say('저장됨에서 뺐어요. 메모는 지워지지 않아요', { label: '되돌리기', run: () => { repo.mergeItem({ id: SAVED_ID, kind: 'saved', memos: { [id]: cur } } as Item); setToast(null); } });
  };
  const pinSaved: Workspace['pinSaved'] = (id) => {
    const on = !saved[id]?.pinnedAt;
    repo.patchItem(SAVED_ID, { [`memos.${id}.pinnedAt`]: on ? Date.now() : null });
    say(on ? '맨 위에 고정했어요' : '고정을 풀었어요');
  };
  const setSavedSort: Workspace['setSavedSort'] = (x) => repo.mergeItem({ id: SAVED_ID, kind: 'saved', sort: x } as Item);
  // ── 휴지통 (하루 통째 삭제만 · SYNC §14)
  const trash = useMemo(() => (items.filter((x) => x.kind === 'trash' && !x.deletedAt) as unknown as TrashDay[]).sort((a, b) => b.at - a.at), [items]);
  const imgsOfBlocks = (ids: string[]) => { const on = new Set(ids); return Object.entries(imgRef.current).filter(([, m]) => on.has(m.block)).map(([id]) => id); };
  const deleteDay: Workspace['deleteDay'] = (date) => {
    const at = Date.now();
    const ev = range.events.filter((e) => e.date === date && !e.deletedAt);
    const bl = blocks.filter((b) => b.date === date && (b.area === 'today' || b.area === 'memo') && !b.deletedAt).map((b) => b.id);
    const lg = logs.filter((l) => l.date === date && !l.deletedAt).map((l) => l.id);
    if (!ev.length && !bl.length && !lg.length) { say('이 날은 지울 기록이 없어요'); return; }
    for (const e of ev) repo.deleteEvent(e);
    if (bl.length) repo.patchBlocks(bl.map((id) => ({ id, deletedAt: at })));
    for (const id of lg) repo.patchLog(id, { deletedAt: at });
    const d = dateOf(date), id = `trash-${date}-${at}`;
    const t = { id, kind: 'trash', date, at, label: `${d.getMonth() + 1}월 ${d.getDate()}일 하루 기록`, ev: ev.map((e) => e.id), bl, lg } as TrashDay;
    repo.addItem(t as unknown as Item);
    // 되돌리기는 방금 만든 칸을 직접 넘긴다 — 이 알림이 잡은 trash 목록에는 아직 그 칸이 없다
    say('휴지통으로 옮겼어요', { label: '되돌리기', run: () => { restoreDay(t); setToast(null); } });
  };
  const restoreTrash: Workspace['restoreTrash'] = (id) => {
    const t = trash.find((x) => x.id === id) ?? (items.find((x) => x.id === id) as unknown as TrashDay | undefined);
    if (t) restoreDay(t);
  };
  const restoreDay = (t: TrashDay) => {
    for (const eid of t.ev) repo.restoreEvent({ id: eid } as AttEvent);
    if (t.bl.length) repo.patchBlocks(t.bl.map((bid) => ({ id: bid, deletedAt: null as unknown as number })));
    for (const lid of t.lg) repo.patchLog(lid, { deletedAt: null });
    repo.patchItem(t.id, { deletedAt: Date.now() });
    say(`${t.label}을 복원했어요`);
  };
  const purgeTrash: Workspace['purgeTrash'] = (id) => {
    const t = trash.find((x) => x.id === id);
    if (!t) return;
    const imgs = imgsOfBlocks(t.bl);
    for (const g of imgs) void repo.deleteImage(g);
    if (imgs.length) repo.patchItem(IMGS_ID, Object.fromEntries(imgs.map((g) => [`map.${g}`, null])));
    repo.patchItem(id, { deletedAt: Date.now() });
  };
  const emptyTrash = () => { for (const t of trash) purgeTrash(t.id); say('휴지통을 비웠어요'); };
  // 30일 지난 칸은 앱을 열 때 비운다 (v3 cleanup)
  const trashSwept = useRef(false);
  useEffect(() => {
    if (!itemsIn || trashSwept.current) return;
    trashSwept.current = true;
    const cut = Date.now() - TRASH_DAYS * 864e5;
    for (const t of trash) if (t.at < cut) purgeTrash(t.id);
  }, [itemsIn, trash]); // eslint-disable-line react-hooks/exhaustive-deps

  // 지운 줄의 그림 비우기 — 앱을 열 때 한 번, 줄을 지운 지 하루가 지난 그림만 (SYNC §14)
  const purged = useRef(false);
  useEffect(() => {
    if (!itemsIn || purged.current) return;
    purged.current = true;
    const ids = imgToPurge(images, Date.now());
    for (const id of ids) void repo.deleteImage(id);
    if (ids.length) repo.patchItem(IMGS_ID, Object.fromEntries(ids.map((id) => [`map.${id}`, null])));
  }, [itemsIn, images, repo]);

  // 지난 순위 고정 — 받아 둔 날 중 끝났고 아직 안 고정한 날만. 합치기 저장이라 다른 기기 · 받기 전 문서를 덮지 않는다
  const ranks = useMemo(() => ((items.find((x) => x.id === RANKS_ID) as (Item & { days?: Record<string, RankFix> }) | undefined)?.days ?? {}), [items]);
  useEffect(() => {
    if (!itemsIn) return;
    const fix = rankToFix(days, ranks, today, now, nick, teamCfg);
    if (Object.keys(fix).length) repo.mergeItem({ id: RANKS_ID, kind: 'ranks', days: fix } as Item);
  }, [repo, itemsIn, days, ranks, today, nick, teamCfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const mateStatus = (id: string) => mates.find((x) => x.m.id === id)?.st ?? null;

  return {
    settings, saveSettings, goal, idle, arrival: { hit: arr.current.hit, missed: missedNow, act: arrAct, missedAct },
    backend, user, now, today, sync, days, day, state,
    unavailable: range.unavailable, setDashSpan, tblWeeks, tblAll, moreWeeks, calMonth, setCalMonth, wpWeek, setWpWeek, toast, timer, say, warn,
    onOn, onOff, onRest, onLeave, dayOf, editDay, pendingDays, resolvePending, canCarry: canCarryFor,
    blocks, addBlock, patchBlocks, editBlocks, undoBlocks, redoBlocks, lastUndoAt, lastEditAt, toggleBlock, removeBlock, newId,
    ddays, saveDDay, pinDDay, archiveDDay, deleteDDay,
    saved, savedSort, isSaved, toggleSaved, pinSaved, setSavedSort, trash, deleteDay, restoreTrash, purgeTrash, emptyTrash, teamCfg, members, saveMembers, v3Preview, v3Import, v3Imported, images, addImages, imageBlob, removeImage, ranks, firstDate, habits, offDay, saveHabit, archiveHabit, deleteHabit, toggleHabit,
    logs, watchAllLogs, watchApps, watchAllBlocks, saveSpan, deleteSpan, dropApps, syncApps, fixConflicts, cats, setCats,
    mates, ranking, mateStatus,
    nick, initial: nick.slice(0, 1).toUpperCase(),
    presence: state === 'break' ? 'break' : state === 'work' ? 'active' : 'offline',
  };
}
