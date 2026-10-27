/**
 * 가상 동료 — 로스터 · 하루 일정 · 지금 상태 · 랭킹 (v3 roster.js · schedule.js · sim.js 의 일정 부분 그대로)
 *
 * ▣ 동료의 하루는 저장하지 않는다. (날짜 · 사람) 씨앗으로 매번 같은 하루를 만든다 — 기기가 여럿이어도 같다
 * ▣ 슬랙 상태 규칙: 출퇴근 30분 / 미팅 = 회의 길이 / 병가 · 재택 = 하루 / 휴가 = 1~5일
 * 아직 안 옮긴 것: 대화(dialogue · _planMessages) · 허들 · 동료 설정(이름 · 근무 시간 바꾸기 · 합류 시각)
 */
import { clamp, RNG } from './rng';

export interface Member {
  id: string; nick: string; name: string; role: string; rank: string;
  tone: 'casual' | 'dry' | 'formal' | 'bubbly';
  /** 아침형(−) · 저녁형(+) 분 */
  chrono: number; diligence: number; chattiness: number; focusLen: number; overtime: number;
  usesDnd: boolean; meetingProp: number; emoji: string; remoteProp: number; leaveProp: number; sickProp: number;
  color: string;
}

/** v3.1.188 — 흰 글자 대비 · 채도 · 서로의 차이를 함께 맞춘 12색 (기본 동료 12명과 같은 수) */
const AV_COLORS = ['#b15120', '#a16702', '#837601', '#18721b', '#008566', '#00818a', '#027cb1', '#5265c7', '#844ca9', '#be3771', '#b5363a', '#4a5568'];
type Seed = Omit<Member, 'id' | 'color'>;
const SEED: Seed[] = [
  { nick: 'Ssol', name: '이예솔', role: '프로덕트 디자이너', rank: '대리', tone: 'casual', chrono: -25, diligence: 0.82, chattiness: 0.95, focusLen: 45, overtime: 0.22, usesDnd: false, meetingProp: 0.9, emoji: '🎨', remoteProp: 0.14, leaveProp: 1.0, sickProp: 1.0 },
  { nick: 'Minho', name: '평민호', role: '프론트엔드', rank: '사원', tone: 'dry', chrono: 42, diligence: 0.74, chattiness: 0.35, focusLen: 78, overtime: 0.62, usesDnd: true, meetingProp: 0.5, emoji: '', remoteProp: 0.30, leaveProp: 0.7, sickProp: 1.3 },
  { nick: 'Ellie', name: '고언정', role: 'PM', rank: '과장', tone: 'formal', chrono: -18, diligence: 0.78, chattiness: 0.85, focusLen: 35, overtime: 0.30, usesDnd: false, meetingProp: 2.2, emoji: '', remoteProp: 0.06, leaveProp: 1.1, sickProp: 0.8 },
  { nick: 'Emma', name: '정세진', role: '마케터', rank: '대리', tone: 'bubbly', chrono: 8, diligence: 0.70, chattiness: 0.90, focusLen: 38, overtime: 0.18, usesDnd: false, meetingProp: 1.4, emoji: '🌷', remoteProp: 0.16, leaveProp: 1.4, sickProp: 1.1 },
  { nick: 'Wayne', name: '전웅', role: '사업 운영', rank: '과장', tone: 'formal', chrono: -35, diligence: 0.66, chattiness: 0.55, focusLen: 40, overtime: 0.10, usesDnd: false, meetingProp: 1.8, emoji: '', remoteProp: 0.04, leaveProp: 1.2, sickProp: 0.9 },
  { nick: 'Harry', name: '김용민', role: '백엔드', rank: '대리', tone: 'dry', chrono: 12, diligence: 0.93, chattiness: 0.30, focusLen: 85, overtime: 0.40, usesDnd: true, meetingProp: 0.4, emoji: '', remoteProp: 0.26, leaveProp: 0.5, sickProp: 0.7 },
  { nick: 'Jihyun', name: '나지현', role: '서비스 기획', rank: '주임', tone: 'formal', chrono: -8, diligence: 0.80, chattiness: 0.95, focusLen: 40, overtime: 0.35, usesDnd: false, meetingProp: 1.5, emoji: '', remoteProp: 0.10, leaveProp: 1.0, sickProp: 1.0 },
  { nick: 'Jake', name: '조경철', role: '퍼블리셔', rank: '사원', tone: 'casual', chrono: 20, diligence: 0.62, chattiness: 0.60, focusLen: 32, overtime: 0.25, usesDnd: false, meetingProp: 0.7, emoji: '', remoteProp: 0.20, leaveProp: 1.3, sickProp: 1.4 },
  { nick: 'Glen', name: '맹승주', role: '개발 리드', rank: '팀장', tone: 'casual', chrono: 0, diligence: 0.79, chattiness: 0.70, focusLen: 50, overtime: 0.55, usesDnd: true, meetingProp: 2.4, emoji: '🐱', remoteProp: 0.08, leaveProp: 0.8, sickProp: 0.8 },
  { nick: 'Yesee', name: '박상일', role: 'QA', rank: '과장', tone: 'formal', chrono: -45, diligence: 0.95, chattiness: 0.45, focusLen: 62, overtime: 0.20, usesDnd: true, meetingProp: 0.6, emoji: '', remoteProp: 0.05, leaveProp: 0.6, sickProp: 0.5 },
  { nick: 'Nara', name: '김나라', role: '데이터 분석', rank: '대리', tone: 'dry', chrono: 30, diligence: 0.86, chattiness: 0.25, focusLen: 72, overtime: 0.38, usesDnd: true, meetingProp: 0.5, emoji: '', remoteProp: 0.34, leaveProp: 0.9, sickProp: 0.9 },
  { nick: 'Toby', name: '오태빈', role: '인턴', rank: '인턴', tone: 'bubbly', chrono: -30, diligence: 0.72, chattiness: 0.88, focusLen: 30, overtime: 0.15, usesDnd: false, meetingProp: 0.8, emoji: '🐣', remoteProp: 0.03, leaveProp: 0.4, sickProp: 1.2 },
];
export const ROSTER: Member[] = SEED.map((m, i) => ({ ...m, id: `m${i}`, color: AV_COLORS[i % AV_COLORS.length] }));

const RANKS = ['인턴', '사원', '주임', '대리', '과장', '차장', '팀장', '이사', '대표'];
const rankIdx = (r: string) => { const i = RANKS.indexOf(r); return i < 0 ? 3 : i; };

export type StatusKey = 'commute' | 'meeting' | 'huddle' | 'focus' | 'dnd' | 'lunch' | 'away' | 'remote' | 'sick' | 'vacation' | 'online' | 'offline';
export type Presence = 'active' | 'break' | 'dnd' | 'offline';
export const STATUS: Record<StatusKey, { emoji: string; label: string; presence: Presence }> = {
  commute: { emoji: '🚌', label: '출퇴근 중', presence: 'break' },
  meeting: { emoji: '📅', label: '미팅 중', presence: 'active' },
  huddle: { emoji: '🎧', label: '허들 중', presence: 'active' },
  focus: { emoji: '💻', label: '집중 중', presence: 'active' },
  dnd: { emoji: '', label: '방해 금지', presence: 'dnd' },
  lunch: { emoji: '🍽', label: '식사 중', presence: 'break' },
  away: { emoji: '', label: '자리 비움', presence: 'break' },
  remote: { emoji: '🏡', label: '원격으로 작업 중', presence: 'active' },
  sick: { emoji: '🤒', label: '병가', presence: 'offline' },
  vacation: { emoji: '🌴', label: '휴가 중', presence: 'offline' },
  online: { emoji: '', label: '온라인', presence: 'active' },
  offline: { emoji: '', label: '오프라인', presence: 'offline' },
};
/** 사이드바 순서 — 일하는 사람이 위 (v3 ORDER) */
export const STATUS_ORDER: Record<StatusKey, number> = { online: 0, remote: 1, focus: 2, dnd: 3, huddle: 4, meeting: 5, away: 6, lunch: 7, commute: 8, offline: 9, sick: 10, vacation: 11 };

// ─────────────────────────────────────────────────────────── 하루 일정 (v3 schedule.js)

const MEETING_TOPICS = ['스프린트 플래닝', '디자인 리뷰', '주간 정기회의', '기획 싱크', 'QA 이슈 공유', '클라이언트 미팅', '1on1', '데일리 스크럼', '리서치 공유', '릴리즈 점검'];
const BREAK_TOPICS = ['자리 비움', '커피', '통화', '스트레칭', '택배 수령', '흡연'];
const FOCUS_TOPICS = ['문서 작성', '자료 정리', '리서치', '내용 정리'];
/** 직무를 바꾸면 하는 일이 같이 바뀐다 (v3 ROLE_TOPICS) */
const ROLE_TOPICS: { kw: RegExp; t: string[] }[] = [
  { kw: /디자인|디자이너|UX|UI|프로덕트 디자/, t: ['시안 작업', '와이어프레임 정리', '스타일 가이드 정리', '컴포넌트 정리', '프로토타입 제작', '디자인 QA'] },
  { kw: /퍼블|마크업|HTML|CSS/, t: ['퍼블리싱', '반응형 대응', '마크업 수정', '크로스브라우징 확인'] },
  { kw: /프론트|프론트엔드|FE/, t: ['컴포넌트 리팩터링', '상태관리 정리', '화면 연동', '렌더링 최적화'] },
  { kw: /백엔드|서버|BE|인프라|DevOps/, t: ['API 연동', '쿼리 최적화', '배포 준비', '스키마 정리', '로그 확인'] },
  { kw: /개발\s*리드|테크리드|CTO|개발자|개발/, t: ['코드 리뷰', 'API 연동', '버그 수정', '아키텍처 정리'] },
  { kw: /기획|PM|PO|프로덕트 매니저|서비스 기획/, t: ['기획서 수정', 'IA 정리', '요구사항 정리', '일정 조율', '플로우 정리'] },
  { kw: /QA|품질|테스트/, t: ['테스트 케이스 작성', '이슈 리포트 정리', '회귀 테스트', '릴리즈 검증'] },
  { kw: /마케|콘텐츠|그로스|퍼포먼스|CRM/, t: ['카피 작성', '캠페인 리포트', '소재 검수', '채널 성과 정리'] },
  { kw: /데이터|분석|애널|리서치/, t: ['데이터 정리', '지표 대시보드', '쿼리 작성', '퍼널 분석'] },
  { kw: /과장|차장|팀장|리드|매니저|이사|대표/, t: ['주간 보고 정리', '리소스 조율', '일정 점검', '이슈 정리'] },
  { kw: /인턴|주니어/, t: ['자료 정리', '리서치', '문서 정리', '작업 요청 처리'] },
];
const topicsFor = (role: string) => ROLE_TOPICS.find((r) => r.kw.test(role))?.t ?? FOCUS_TOPICS;

const COMMUTE_MIN = 30;
/** 팀 표준 근무 시간(분) — 하루 목표 + 점심 1시간. 개인은 chrono 만큼 앞뒤로 흩어진다 */
export const TEAM_DEFAULT = { start: 650, end: 1190 };

type SegKind = 'commute' | 'active' | 'focus' | 'meeting' | 'break' | 'lunch' | 'dinner';
export interface Seg { s: number; e: number; kind: SegKind; topic?: string; with?: string }
type DayStat = 'weekend' | 'vacation' | 'sick' | 'remote' | 'normal';
export interface MateDay { segments: Seg[]; arrive: number | null; leave: number | null; overtime: boolean; status: DayStat; off: boolean }

const keyOfD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const vacCache: Record<string, Set<number>> = {};
function vacationSet(m: Member, y: number, mo: number) {
  const key = `${m.id}|${y}-${mo}`;
  if (vacCache[key]) return vacCache[key];
  const rng = new RNG(key + '|vac');
  const out = new Set<number>();
  const n = rng.chance(0.7 * m.leaveProp) ? (rng.chance(0.2) ? 2 : 1) : 0;
  for (let i = 0; i < n; i++) {
    const len = rng.chance(0.7) ? 1 : rng.int(2, 4);
    const start = rng.int(1, 26);
    for (let d = 0; d < len; d++) out.add(start + d);
  }
  return (vacCache[key] = out);
}

function dayStatus(m: Member, date: Date): DayStat {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return 'weekend';
  const y = date.getFullYear(), mo = date.getMonth() + 1, dd = date.getDate();
  if (vacationSet(m, y, mo).has(dd)) return 'vacation';
  const rng = new RNG(`${y}-${mo}-${dd}|${m.id}|dstat`);
  if (rng.chance(0.018 * m.sickProp)) return 'sick';
  if (rng.chance(m.remoteProp)) return 'remote';
  return 'normal';
}

/** 야근 — 날짜와 사람만으로 정해진다 (다음 날이 «어제 야근» 을 하루를 다시 안 만들고 물을 수 있게) */
const otOf = (m: Member, dk: string) => new RNG(`${dk}|${m.id}|ot`).chance(m.overtime);

export function buildDay(m: Member, dk: string, hours = TEAM_DEFAULT): MateDay {
  const hStart = hours.start, hEnd = Math.max(hours.start + 150, hours.end);
  const date = new Date(`${dk}T12:00:00`);
  const dow = date.getDay();
  const rng = new RNG(`${dk}|${m.id}|day`);
  const st = dayStatus(m, date);
  const segs: Seg[] = [];
  const offDay = (status: DayStat): MateDay => ({ segments: [], arrive: null, leave: null, overtime: false, status, off: true });
  if (st === 'sick' || st === 'vacation') return offDay(st);
  if (st === 'weekend' && !rng.chance(0.16)) return offDay('weekend');
  const weekend = st === 'weekend', remote = st === 'remote';

  // 어제 야근했으면 오늘은 늦게 나오거나 일찍 간다 (보정은 따로 뽑아 안 한 날 값이 안 밀리게)
  const prevD = new Date(date); prevD.setDate(prevD.getDate() - 1);
  const pSt = dayStatus(m, prevD);
  const tired = pSt !== 'sick' && pSt !== 'vacation' && pSt !== 'weekend' && otOf(m, keyOfD(prevD));
  const trng = new RNG(`${dk}|${m.id}|tired`);
  const tLate = tired ? Math.round(trng.range(0, 55)) : 0;
  const tEarly = tired ? Math.round(trng.range(0, 55)) : 0;

  let arrive = hStart - 12 + m.chrono + rng.gauss(0, 22) + tLate;
  if (remote) arrive -= rng.range(15, 50);
  if (weekend) arrive = rng.range(hStart + 130, hStart + 250);
  arrive = clamp(Math.round(arrive), weekend ? hStart + 50 : hStart - 105, weekend ? hStart + 250 : hStart + 55);

  const lunchMid = clamp(hStart + 92, 690, 840);
  let lunchS = clamp(Math.round(rng.gauss(lunchMid, 30)), lunchMid - 40, lunchMid + 70);
  const lunchDur = Math.round(clamp(rng.gauss(remote ? 44 : 54, 13), 35, 88));
  let lunchE = lunchS + lunchDur;
  if (lunchS < arrive + 40) { lunchS = arrive + 40 + Math.round(rng.range(0, 25)); lunchE = lunchS + lunchDur; }

  let leave = hEnd + 14 + rng.gauss(0, 24);
  if (dow === 5) leave -= rng.range(10, 45);
  const isOvertime = otOf(m, dk);
  if (isOvertime) leave = hEnd + 60 + rng.expo(72);
  else leave -= tEarly;
  leave = clamp(Math.round(leave), lunchE + 60, Math.min(1405, hEnd + 235));
  if (weekend) leave = clamp(Math.round(arrive + rng.range(120, 300)), 0, 1405);

  // 저녁은 점심과 같은 물건 — 야근하는 사람만
  let dinnerS: number | null = null, dinnerE: number | null = null;
  if (isOvertime && !weekend) {
    const dS = clamp(Math.round(rng.gauss(1110, 18)), 1080, 1150);
    const dDur = Math.round(clamp(rng.gauss(45, 10), 30, 70));
    if (dS > lunchE + 60 && leave > dS + dDur + 30) { dinnerS = dS; dinnerE = dS + dDur; }
  }

  if (!remote && !weekend) segs.push({ s: Math.max(0, arrive - COMMUTE_MIN), e: arrive, kind: 'commute' });

  let meetingCount = 0;
  const rankBoost = 1 + Math.max(0, rankIdx(m.rank) - 3) * 0.18;   // 직급이 높을수록 회의가 많다
  const maxMeetings = weekend ? 0 : Math.round(clamp(rng.gauss(m.meetingProp * rankBoost * (remote ? 0.6 : 1), 0.7), 0, 5));

  const fill = (from: number, to: number) => {
    let t = from;
    if (from === arrive) {
      const d = Math.round(rng.range(9, 22));
      segs.push({ s: t, e: t + d, kind: 'active', topic: '메일·슬랙 확인' });
      t += d;
    }
    let guard = 0;
    while (t < to - 6 && guard++ < 60) {
      const hour = t / 60;
      const meetingBoost = hour >= 14 && hour < 17.5 ? 3.2 : hour >= 11 && hour < 12 ? 1.6 : 1;
      const kind = rng.weighted({
        focus: 86 * m.diligence * (hour < 12 ? 1.35 : hour > 18 ? 1.2 : 1) * (remote ? 1.25 : 1),
        meeting: meetingCount < maxMeetings ? 32 * m.meetingProp * meetingBoost : 0,
        active: 58 * (1.5 - m.diligence),
        break: 28 * (1.45 - m.diligence) * (hour >= 15 && hour < 16.5 ? 1.5 : 1) * (remote ? 0.7 : 1),
      });
      let d: number, topic: string;
      if (kind === 'focus') { d = Math.round(clamp(rng.gauss(m.focusLen, 14), 18, 95)); topic = rng.pick(topicsFor(m.role)); }
      else if (kind === 'meeting') { d = rng.pick([30, 30, 45, 60, 60, 90]); topic = rng.pick(MEETING_TOPICS); meetingCount++; }
      else if (kind === 'active') { d = Math.round(rng.range(8, 26)); topic = ''; }
      else { d = Math.round(rng.range(5, 19)); topic = rng.pick(BREAK_TOPICS); }
      const e = Math.min(t + d, to);
      if (e - t >= 3) segs.push({ s: t, e, kind, topic });
      t = e;
    }
    if (t < to) segs.push({ s: t, e: to, kind: 'active', topic: '' });
  };

  fill(arrive, lunchS);
  segs.push({ s: lunchS, e: lunchE, kind: 'lunch', topic: '식사' });
  if (dinnerS != null && dinnerE != null) {
    fill(lunchE, dinnerS);
    segs.push({ s: dinnerS, e: dinnerE, kind: 'dinner', topic: '식사' });
    fill(dinnerE, leave);
  } else fill(lunchE, leave);
  if (!remote && !weekend) segs.push({ s: leave, e: Math.min(1439, leave + COMMUTE_MIN), kind: 'commute' });

  return { segments: segs, arrive, leave, overtime: isOvertime, status: st, off: false };
}

/** 1on1 은 혼자 할 수 없다 — 일정을 다 만든 뒤 짝을 붙인다. 없으면 혼자여도 되는 회의로 (v2.9.68) */
function pairOneOnOnes(days: Record<string, MateDay>, dk: string) {
  const rng = new RNG(`${dk}|1on1`);
  const SOLO_OK = ['주간 정기회의', '데일리 스크럼', '기획 싱크', 'QA 이슈 공유', '릴리즈 점검'];
  const busyAt = (day: MateDay, s: number, e: number) => day.segments.some((x) => x.kind === 'meeting' && x.s < e && x.e > s);
  const putMeeting = (day: MateDay, s: number, e: number, seg: Seg) => {
    const out: Seg[] = [];
    for (const x of day.segments) {
      if (x.e <= s || x.s >= e || x.kind === 'lunch' || x.kind === 'dinner' || x.kind === 'commute') { out.push(x); continue; }
      if (x.s < s) out.push({ s: x.s, e: s, kind: x.kind, topic: x.topic });
      if (x.e > e) out.push({ s: e, e: x.e, kind: x.kind, topic: x.topic });
    }
    out.push(seg);
    out.sort((a, b) => a.s - b.s || a.e - b.e);
    day.segments = out.filter((x) => x.e - x.s >= 3);
  };
  const ids = Object.keys(days).sort();
  for (const id of ids) {
    const day = days[id];
    if (day.off) continue;
    for (const seg of day.segments) {
      if (seg.kind !== 'meeting' || seg.topic !== '1on1' || seg.with) continue;
      const mates = ids.filter((o) => {
        const od = days[o];
        if (o === id || od.off || !od.segments.length) return false;
        if ((od.arrive ?? 0) > seg.s || (od.leave ?? 0) < seg.e) return false;
        return !busyAt(od, seg.s, seg.e);
      });
      if (!mates.length) { seg.topic = rng.pick(SOLO_OK); continue; }
      const mate = rng.pick(mates);
      seg.with = mate;
      putMeeting(days[mate], seg.s, seg.e, { s: seg.s, e: seg.e, kind: 'meeting', topic: '1on1', with: id });
    }
  }
}

/** 그 날 팀 전체의 하루 — 같은 날짜면 늘 같다 */
export function buildTeam(dk: string, members = ROSTER): Record<string, MateDay> {
  const days: Record<string, MateDay> = {};
  for (const m of members) days[m.id] = buildDay(m, dk);
  pairOneOnOnes(days, dk);
  return days;
}

export interface MateStatus { key: StatusKey; emoji: string; label: string; presence: Presence; topic: string; with: string | null; remote: boolean }

/** 그 분(00:00 기준)의 상태 (v3 statusAt — 허들은 아직 없다) */
export function statusAt(day: MateDay | undefined, m: Member, min: number): MateStatus {
  const make = (key: StatusKey, topic = '', w: string | null = null, remote = false): MateStatus => ({ key, ...STATUS[key], topic, with: w, remote });
  if (!day) return make('offline');
  if (day.status === 'vacation') return make('vacation');
  if (day.status === 'sick') return make('sick');
  if (day.off) return make('offline');
  const seg = day.segments.find((s) => min >= s.s && min < s.e);
  const map: Record<SegKind, StatusKey> = {
    commute: 'commute', meeting: 'meeting', focus: m.usesDnd ? 'dnd' : 'focus', lunch: 'lunch', dinner: 'lunch', break: 'away',
    active: day.status === 'remote' ? 'remote' : 'online',
  };
  return make(seg ? map[seg.kind] : 'offline', seg?.topic ?? '', seg?.with ?? null, day.status === 'remote');
}

/** 그 분까지 일한 분 — 집중 · 회의 · 온라인 (v3 workUntil) */
export function workUntil(day: MateDay | undefined, min: number) {
  if (!day || day.off) return 0;
  let t = 0;
  for (const s of day.segments) {
    if (s.kind !== 'focus' && s.kind !== 'meeting' && s.kind !== 'active') continue;
    const e0 = Math.min(s.e, min);
    if (e0 > s.s) t += e0 - s.s;
  }
  return Math.round(t);
}

export interface LbRow { id: string; nick: string; min: number; me: boolean; rank: number; m?: Member }

/** 오늘 근무 랭킹 — 나도 같은 줄에 (v3 leaderboard) */
export function leaderboard(team: Record<string, MateDay>, min: number, myMin: number, myNick: string, members = ROSTER): LbRow[] {
  const rows: LbRow[] = members.map((m) => ({ id: m.id, nick: m.nick, min: workUntil(team[m.id], min), me: false, rank: 0, m }));
  rows.push({ id: 'me', nick: myNick, min: Math.round(myMin), me: true, rank: 0 });
  rows.sort((a, b) => b.min - a.min || a.nick.localeCompare(b.nick));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
