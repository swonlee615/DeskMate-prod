/**
 * 설정 칸 목록 (v3 #settings `.set-nav`) — PC 설정 창 · 폰 설정 탭이 같은 목록을 쓴다
 * on = 웹에 옮긴 칸. 나머지는 자리만 v3 그대로 «준비 중»
 */
import { useEffect, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { catUsage } from '../domain/attendance/cats';
import { fmtDur } from './v3fmt';
import type { GoalPast } from '../domain/attendance/rules';
import type { AppEntry, UnknownApp } from '../domain/workApps';

export interface SetNav { k: string; ni: string; nm: string; on?: boolean; sep?: boolean }

export const SET_NAV: SetNav[] = [
  { k: 'general', ni: '⚙️', nm: '일반', on: true },
  { k: 'ws', ni: '🏢', nm: '워크스페이스', on: true },
  { k: 'members', ni: '👥', nm: '멤버 설정' },
  { k: 'pomo', ni: '🍅', nm: '뽀모도로', on: true },
  { k: 'slot', ni: '⏱️', nm: '시간 기록', on: true },
  { k: 'away', ni: '💻', nm: '자리비움 · 업무 앱', on: true },
  { k: 'data', ni: '🗄', nm: '데이터', on: true },
  { k: 'plugin', ni: '🧩', nm: '플러그인' },
  { k: 'sec', ni: '🛡', nm: '시스템 알림', sep: true },
];

export const SLOT_HINT = '시간 기록에 쓰는 색마다 이름을 붙이면 카테고리가 돼요. 이름을 붙인 색은 일간 상세에서 그 이름으로 보이고, 비워 두면 색으로만 구분해요. 기록에는 색만 남아서, 이름을 바꾸면 지난 기록에도 새 이름이 보여요.';

// ─────────────────────────────────────────────────────────── 설정 값 (v3 S.cfg 의 웹 몫 · items/settings 문서 하나)

export type LookMode = 'system' | 'light' | 'dark';
/** 계정에 하나 — 모든 기기가 같은 값을 쓴다 */
export interface Settings {
  mode: LookMode; theme: string; wsName: string; goalHours: number; leaveGoal: boolean; timerColor: string;
  /** 자리비움 자동 감지 · 기준 분 (v3 autoAway · autoAwayMin — 3~60, 기본 켬 · 10분) */
  away: boolean; awayMin: number;
  /** 업무 앱 기준 (v3 workAppsOn · workApps · nonWorkApps · unknownApp — PC 앱만 동작) */
  workAppsOn: boolean; workApps: AppEntry[]; nonWorkApps: AppEntry[]; unknownApp: UnknownApp;
  /** 출근 감지 · 취소 후 다시 묻기까지 분 (v3.2.0 arrivalDetect · arrivalCooldownMin — 1~240, 기본 켬 · 30분) */
  arrivalDetect: boolean; arrivalCooldownMin: number;
  /** 내 프로필 (v3 userNick · userName · userRank · userColor · userAvatar) — 비어 있으면 로그인 계정 이름 */
  nick: string; name: string; rank: string; color: string; avatar: string | null;
  /** 워크스페이스 로고 · 배지 색 · 팀 근무 시작(분) (v3 wsLogo · wsColor · teamStart) */
  wsLogo: string | null; wsColor: string; teamStart: number | null;
  /** 지난 날의 하루 목표 «이 날까지는 이 값» (v3.2.5 cfg.goalPast) — 바꾼 적 없으면 없다 */
  goalPast?: GoalPast[];
}
export const SETTINGS_DEFAULT: Settings = { mode: 'system', theme: 'navy', wsName: 'DeskMate', goalHours: 8, leaveGoal: true, timerColor: '#2b8fd8', away: true, awayMin: 10,
  workAppsOn: false, workApps: [], nonWorkApps: [], unknownApp: 'away', arrivalDetect: true, arrivalCooldownMin: 30,
  nick: '', name: '', rank: '', color: '#1264a3', avatar: null, wsLogo: null, wsColor: '#1264a3', teamStart: null };   // color-ok: v3 기본 프로필 · 배지 색 (데이터 값)

/** v3 화면 모드 (v3.1.37) — 기본은 시스템 설정 */
export const MODES: [LookMode, string, string, string][] = [
  ['system', '🖥', '시스템 설정', '기기 설정을 따라갑니다'],
  ['light', '☀️', '라이트', '늘 밝게'],
  ['dark', '🌙', '다크', '늘 어둡게'],
];
/** v3 THEMES — [키, 이름, 레일 색, 사이드바 색]. 키는 저장값이라 바꾸지 않는다 ('aubergine' = 플럼) */
export const THEMES: [string, string, string, string][] = [
  ['navy', '네이비', '#0f1633', '#121835'],
  ['aubergine', '플럼', '#2c092d', '#3f0e40'],
  ['forest', '포레스트', '#15271c', '#1b3126'],
  ['indigo', '인디고', '#191b3a', '#212458'],
  ['graphite', '그라파이트', '#141517', '#19171d'],
];
/** v3.1.244 타이머 색 — 초록은 근태 색이라 없다 */
export const TIMER_COLORS: [string, string][] = [['#2b8fd8', '파랑'], ['#3fb6d9', '하늘'], ['#8b6cf0', '보라'], ['#ef6c57', '코랄'], ['#e0a422', '앰버'], ['#8a8f99', '회색']];

const prefersDark = () => !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
/** body[data-mode] · [data-theme] 하나만 칠한다 — 라이트 값은 전부 토큰으로 뒤집힌다 */
export function applyLook(mode: LookMode, theme: string) {
  document.body.dataset.theme = theme || 'navy';
  document.body.dataset.mode = mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;
}
export const systemIsDark = prefersDark;

export const LEAVE_GOAL_HINT = '켜 두면 연차 · 병가인 날은 목표 0, 반차인 날은 목표가 절반이 됩니다. 주 목표도 평일 목표를 더한 값이라 같이 줄어요 (금요일 연차면 주 32시간). 끄면 근태는 달력 색으로만 남고, 목표는 날마다 하루 목표 그대로 계산합니다.';

export const AWAY_HINT = '근무 중에 키보드와 마우스가 기준 시간 넘게 멈추거나 화면이 잠기면, 그때부터 휴게로 자동 기록하고 돌아오면 닫아요.';
/** 이 브라우저의 감지 상태를 사람 말로 */
export function idleText(perm: 'unsupported' | 'granted' | 'denied' | 'prompt' | 'app'): string {
  if (perm === 'app') return '이 PC 앱에서 감지하고 있어요. 다른 앱을 쓰고 있어도 이 PC의 키보드와 마우스 입력을 기준으로 봐요.';
  if (perm === 'granted') return '이 브라우저에서 감지하고 있어요. 다른 앱이나 탭을 보고 있어도 이 맥의 입력을 기준으로 봐요.';
  if (perm === 'denied') return '이 브라우저에서 감지 권한이 꺼져 있어요. 주소창 왼쪽의 사이트 설정에서 «유휴 감지»를 허용해 주세요.';
  if (perm === 'prompt') return '이 브라우저에서 감지하려면 한 번 허용해 주세요.';
  return '이 브라우저에서는 감지할 수 없어요. PC의 Chrome이나 Edge에서 열면 쓸 수 있어요.';
}

/** 카테고리 줄 옆 «N건 · 시간» (v3 renderCatSetup cat-sum) — 이 칸을 보는 동안만 모든 날의 기록을 받는다 */
export function useCatSum(ws: Workspace) {
  const [use, setUse] = useState<ReturnType<typeof catUsage> | null>(null);
  const { watchAllLogs } = ws;
  useEffect(() => watchAllLogs((l) => setUse(catUsage(l))), [watchAllLogs]);
  return (color: string) => { const u = use?.get(color); return !use ? '' : u ? `${u.count}건 · ${fmtDur(u.min)}` : '아직 안 씀'; };
}
