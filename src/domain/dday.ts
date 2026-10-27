/**
 * D-Day — «앞으로» 를 담는 자리 (v3 worklog.js `dd*` · PRD §2-1-2)
 *
 * ▣ 저장: D-Day 하나 = 문서 하나 (users/{uid}/items/{id}, kind 'dday'). 지우기는 deletedAt
 * ▣ 셈은 «언제나 오늘 기준». 보고 있는 날짜 기준으로 세면 한 화면에 시간축이 둘이 된다
 */
import { DOW, dateOf } from '../ui/v3fmt';

export interface DDay {
  id: string;
  kind: 'dday';
  emoji: string;
  title: string;
  note: string;
  /** YYYY-MM-DD — 날짜만, 시각은 없다 */
  date: string;
  pinned: boolean;
  pinnedAt: number | null;
  /** 「저장됨」 으로 옮긴 때. 지운 것이 아니다 */
  archivedAt: number | null;
  createdAt: number;
  deletedAt?: number | null;
}

export const DD_PIN_MAX = 5;
export const DD_MAX_TITLE = 40, DD_MAX_NOTE = 80;

/** 남은 날 — 양쪽을 정오로 맞춘 뒤 뺀다 (밀리초로 빼면 서머타임으로 8.99 가 나온다) */
export function ddDiff(key: string, today: string): number {
  const a = dateOf(today), b = dateOf(key);
  a.setHours(12, 0, 0, 0); b.setHours(12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** 오늘은 `D-DAY` — `D-0` 은 쓰지 않는다 */
export function ddLabel(key: string, today: string): string {
  const n = ddDiff(key, today);
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
}

const alive = (x: DDay) => !x.deletedAt;

/** 목록 — 다가오는 것은 가까운 순, 지난 것은 그 뒤에 최근 순. 아카이브한 것은 빠진다 */
export function ddLive(all: DDay[], today: string): DDay[] {
  const up: DDay[] = [], past: DDay[] = [];
  for (const x of all) if (alive(x) && !x.archivedAt) (x.date >= today ? up : past).push(x);
  up.sort((a, b) => a.date.localeCompare(b.date));
  past.sort((a, b) => b.date.localeCompare(a.date));
  return up.concat(past);
}

/** 고정한 것 — 고정한 순서대로 */
export const ddPinned = (all: DDay[]) =>
  all.filter((x) => alive(x) && x.pinned && !x.archivedAt).sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));

/** 일간 상세에 설 줄 — 고정한 것 + 그 날의 것, 같은 것은 한 번만 */
export function ddOfDay(all: DDay[], key: string): DDay[] {
  const out = ddPinned(all);
  const seen = new Set(out.map((x) => x.id));
  for (const x of all) if (alive(x) && !x.archivedAt && x.date === key && !seen.has(x.id)) out.push(x);
  return out;
}

/** 고정을 켤 수 있나 — 자리가 다 찼으면 남의 것을 밀어내지 않고 안 켠다 */
export const ddCanPin = (all: DDay[], id: string) =>
  ddPinned(all).length < DD_PIN_MAX || ddPinned(all).some((x) => x.id === id);

/** 입력 다듬기 — 타이틀과 날짜가 없으면 null (빈 줄이 목록에 서면 안 된다) */
export function ddClean(v: { emoji: string; title: string; note: string; date: string }) {
  const out = {
    emoji: v.emoji.trim(),
    title: v.title.trim().slice(0, DD_MAX_TITLE),
    note: v.note.trim().slice(0, DD_MAX_NOTE),
    date: v.date.trim(),
  };
  return /^\d{4}-\d{2}-\d{2}$/.test(out.date) && out.title ? out : null;
}

/** 「2026년 10월 27일 (화) · D-DAY」 */
export function ddDateLabel(k: string, today: string) {
  if (!k) return '날짜를 골라 주세요';
  const d = dateOf(k);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) · ${ddLabel(k, today)}`;
}
