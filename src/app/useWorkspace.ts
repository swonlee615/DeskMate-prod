/**
 * PC · 모바일이 함께 쓰는 «속» — 저장소 · 동기화 · 받아 두는 기간 · 하루 재생 · 근태 버튼 동작
 *
 * ★ 화면(레이아웃)은 `src/pc` · `src/mobile` 이 따로 그린다. 여기에는 화면 코드를 두지 않는다.
 *   같은 버튼이 PC 와 폰에서 다르게 동작하면 안 되므로 동작은 이 한 곳에만 있다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Backend, DayEvents, Item, Repo, SyncStatus, User } from '../data';
import { deviceId, deviceKind, newId } from '../data/device';
import type { AttEvent, AttEventType, AttState, Day, Leave } from '../domain/attendance/types';
import { deriveDay } from '../domain/attendance/replay';
import { dateKey, dayEndMs, sessions, stateOf } from '../domain/attendance/rules';
import { canCarry, resolveAt, resolveCarry } from '../domain/attendance/edit';
import { addDays, dateOf, keyOf, weekStart } from '../ui/v3fmt';
import { usePomodoro, type Pomodoro } from './usePomodoro';
import { deleteChunk, inverseOf, triFix, triToggle, type Block, type Patch } from '../domain/todos/tree';
import { ddCanPin, ddClean, ddLabel, type DDay } from '../domain/dday';
import { HB_MAX, hbClean, hbDoneAt, hbFreqLabel, type Habit, type HbInput, type OffDay } from '../domain/habits';

export const GOAL_HOURS = 8; // 설정 화면을 옮기기 전까지 v3 기본값
/** 근태 표가 보여 주는 주 수 (이번 주 포함) */
export const WEEKS_SHOWN = 5;

const OFF_CANCEL = { day: '1분이 안 돼서 출근을 취소했어요', session: '1분이 안 돼서 이 차수를 취소했어요' };

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** 토스트 — 글자만, 또는 그 자리에서 되받을 단추 하나 (v3 toast · actToast) */
export interface Toast { text: string; action?: { label: string; run: () => void }; bad?: boolean }

export interface Workspace {
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
  nick: string;
  initial: string;
  presence: 'active' | 'break' | 'offline';
}

export function useWorkspace(backend: Backend, user: User): Workspace {
  const repo: Repo = useMemo(() => backend.repoFor(user), [backend, user.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => repo.dispose(), [repo]);

  const now = useNow();
  const today = dateKey(now);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [range, setRange] = useState<DayEvents>({ events: [], unavailable: false });
  const [calMonth, setCalMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  // 주간 플래너가 보고 있는 주 (월요일). 앱을 켜면 늘 이번 주부터 (v3 wkCur — 메모리에만)
  const [wpWeek, setWpWeek] = useState(() => keyOf(weekStart(new Date())));
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => repo.watchSync(setSync), [repo]);

  // 받아 두는 기간 = 표에 보이는 5주 + 캘린더에 보이는 달 (노션 방식 — 보이는 것만)
  const from = useMemo(() => {
    const tblFrom = keyOf(addDays(weekStart(dateOf(today)), -7 * (WEEKS_SHOWN - 1)));
    const calFrom = keyOf(calMonth);
    return [tblFrom, calFrom, wpWeek].sort()[0];
  }, [today, calMonth, wpWeek]);
  const to = useMemo(() => {
    const calTo = keyOf(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
    return [calTo, today, keyOf(addDays(dateOf(wpWeek), 6))].sort()[2];
  }, [today, calMonth, wpWeek]);
  useEffect(() => repo.watchRange(from, to, setRange), [repo, from, to]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  useEffect(() => repo.watchBlocks(from, to, (d) => setBlocks(d.blocks)), [repo, from, to]);

  const byDate = useMemo(() => {
    const m: Record<string, AttEvent[]> = {};
    for (const e of range.events) (m[e.date] ??= []).push(e);
    return m;
  }, [range.events]);

  const days = useMemo(() => {
    const out: Record<string, Day> = {};
    for (const [k, evs] of Object.entries(byDate)) out[k] = deriveDay(k, evs, now);
    return out;
  }, [byDate, now]);
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

  // 집중을 끝까지 채우면 횟수를 서버에 남긴다 — 횟수는 «그 날» 의 것 (v3 onComplete)
  const pomoCount = useRef(0);
  pomoCount.current = day.pomos ?? 0;
  const timer = usePomodoro(
    (min) => {
      push('pomoDone', dateKey(Date.now()), { min });
      say(`세션 완료! 오늘 ${pomoCount.current + 1}회`);
    },
    (mode) => say(mode === 'focus' ? '다음 집중을 자동으로 시작했어요' : '휴식을 자동으로 시작했어요',
      { label: '그만두기', run: () => { timerRef.current?.pause(); setToast(null); } }, true),
  );
  const timerRef = useRef<Pomodoro | null>(null);
  timerRef.current = timer;

  // 버튼 하나가 무엇을 «취소» 했는지는 이벤트를 하나 더 얹어 재생해 보면 안다
  const after = (e: AttEvent) => deriveDay(today, [...(byDate[today] ?? []), e], Date.now());

  const onOn = () => { push('clockIn'); };
  const onOff = () => {
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

  const editDay = (date: string, fn: (d: Day) => Day | null, msg = '근태를 고쳤어요') => {
    const next = fn(dayOf(date));
    if (!next) return false;
    const { onAt, offAt, breaks, leave, autoClosed, carriedFrom } = next;
    const e = push('override', date, {
      day: { onAt, offAt, breaks, leave, autoClosed, carriedFrom },
      basedOn: (byDate[date] ?? []).filter((x) => !x.deletedAt && x.type !== 'pomoDone').map((x) => x.id),
    });
    say(msg, { label: '되돌리기', run: () => { repo.deleteEvent(e); setToast(null); } });
    return true;
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
  const record = (ps: Patch[], created: Block[] = [], base = blocks) => {
    const inv = inverseOf(base, ps, created);
    if (!inv.length) return;
    undoStack.current.push({ inv, at: Date.now() });
    if (undoStack.current.length > 100) undoStack.current.shift();
  };
  const editBlocks = (ps: Patch[], created: Block[] = [], base?: Block[]) => {
    record(ps, created, base);
    for (const b of created) repo.addBlock(b);
    if (ps.length) repo.patchBlocks(ps);
  };
  const addBlock = (b: Block) => editBlocks([], [b]);
  const patchBlocks = (ps: Patch[], rec = true) => { if (rec) editBlocks(ps); else repo.patchBlocks(ps); };
  const undoBlocks = () => {
    const top = undoStack.current.pop();
    if (!top) return false;
    repo.patchBlocks(top.inv);
    return true;
  };
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
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => repo.watchItems(setItems), [repo]);
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
      if (habits.filter((h) => !h.archivedAt).length >= HB_MAX) return `습관은 ${HB_MAX}개까지 만들 수 있어요 — 하나를 보관하거나 지워 주세요.`;
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

  const nick = user.name ?? user.email?.split('@')[0] ?? '나';

  return {
    backend, user, now, today, sync, days, day, state,
    unavailable: range.unavailable, calMonth, setCalMonth, wpWeek, setWpWeek, toast, timer, say, warn,
    onOn, onOff, onRest, onLeave, dayOf, editDay, pendingDays, resolvePending, canCarry: canCarryFor,
    blocks, addBlock, patchBlocks, editBlocks, undoBlocks, lastEditAt, toggleBlock, removeBlock, newId,
    ddays, saveDDay, pinDDay, archiveDDay, deleteDDay,
    habits, offDay, saveHabit, archiveHabit, deleteHabit, toggleHabit,
    nick, initial: nick.slice(0, 1).toUpperCase(),
    presence: state === 'break' ? 'break' : state === 'work' ? 'active' : 'offline',
  };
}
