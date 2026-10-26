import { describe, expect, it } from 'vitest';
import type { AttEvent, AttEventType, DeviceKind } from './types';
import { deriveDay, replayRaw } from './replay';
import { effKind, normalizeBreaks, sessions, stateOf, workMinutes, dayGoalMin } from './rules';

const D = '2026-10-21';
/** '09:30' → 그 날 KST epoch ms */
const t = (hm: string, date = D) => {
  const [h, m] = hm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};
let seq = 0;
const ev = (
  type: AttEventType, hm: string,
  device = 'mac', kind: DeviceKind = 'desktop', extra: Partial<AttEvent> = {},
): AttEvent => ({ id: `e${String(++seq).padStart(4, '0')}`, date: D, at: t(hm), type, deviceId: device, deviceKind: kind, ...extra });
const END = t('23:59');

describe('기본 하루', () => {
  it('출근 → 휴게 → 복귀 → 퇴근', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'), ev('breakStart', '12:00'), ev('breakEnd', '13:00'), ev('clockOut', '18:00'),
    ], END);
    expect(stateOf(d)).toBe('off');
    expect(workMinutes(d, END)).toBe(8 * 60);
  });

  it('퇴근 안 했으면 «지금» 까지만 센다', () => {
    const d = deriveDay(D, [ev('clockIn', '09:00')], t('10:30'));
    expect(stateOf(d)).toBe('work');
    expect(workMinutes(d, t('10:30'))).toBe(90);
  });
});

describe('LOGIC.md §9 — 이상한 하루', () => {
  it('안 닫힌 구간이 2시간을 넘기면 휴게를 누른 시각이 퇴근이 된다', () => {
    const d = deriveDay(D, [ev('clockIn', '09:00'), ev('breakStart', '15:00')], t('17:30'));
    expect(d.offAt).toBe(t('15:00'));
    expect(d.autoClosed).toBe('away');
    expect(d.breaks).toHaveLength(0);
    expect(workMinutes(d, t('17:30'))).toBe(6 * 60);
  });

  it('2시간 미만의 열린 휴게는 그대로 휴게다', () => {
    const d = deriveDay(D, [ev('clockIn', '09:00'), ev('breakStart', '15:00')], t('16:30'));
    expect(stateOf(d)).toBe('break');
    expect(effKind(d, d.breaks[0], t('16:30'))).toBe('break');
    expect(workMinutes(d, t('16:30'))).toBe(6 * 60);
  });

  it('2분 간격으로 조각난 자리비움은 하나로 합친다', () => {
    const d = normalizeBreaks({
      date: D, onAt: t('09:00'), offAt: t('23:00'), leave: '',
      breaks: [
        { s: t('21:44'), e: t('22:10'), kind: 'break', auto: true },
        { s: t('22:12'), e: t('22:54'), kind: 'break', auto: true },
      ],
    });
    expect(d.breaks).toHaveLength(1);
    expect(d.breaks[0].e).toBe(t('22:54'));
  });

  it('5분 떨어진 두 구간은 합치지 않는다', () => {
    const d = normalizeBreaks({
      date: D, onAt: t('09:00'), offAt: t('23:00'), leave: '',
      breaks: [
        { s: t('10:00'), e: t('10:20'), kind: 'break' },
        { s: t('10:25'), e: t('10:40'), kind: 'break' },
      ],
    });
    expect(d.breaks).toHaveLength(2);
  });

  it('합쳐서 2시간을 넘기면 비근무가 된다 (§2 v2.9.66 — 쪼개진 부재가 퇴근으로 찍히지 않게)', () => {
    const d = normalizeBreaks({
      date: D, onAt: t('09:00'), offAt: t('23:00'), leave: '',
      breaks: [
        { s: t('12:00'), e: t('13:25'), kind: 'break', auto: true },
        { s: t('13:26'), e: t('15:36'), kind: 'break', auto: true },
      ],
    });
    expect(d.breaks).toHaveLength(1);
    expect(d.breaks[0].kind).toBe('off');
  });

  it('차수 3개', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'), ev('clockOut', '12:00'),
      ev('clockIn', '13:00'), ev('clockOut', '15:00'),
      ev('clockIn', '19:00'), ev('clockOut', '21:00'),
    ], END);
    expect(sessions(d).map((s) => [s.on, s.off])).toEqual([
      [t('09:00'), t('12:00')], [t('13:00'), t('15:00')], [t('19:00'), t('21:00')],
    ]);
    expect(workMinutes(d, END)).toBe(7 * 60);
  });

  it('1분이 안 되는 1차는 취소 — 출근한 적이 없는 날이 된다', () => {
    const d = deriveDay(D, [ev('clockIn', '09:00'), { ...ev('clockOut', '09:00'), at: t('09:00') + 30_000 }], END);
    expect(stateOf(d)).toBe('none');
  });

  it('1분이 안 되는 2차는 앞 차수의 퇴근으로 되돌린다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'), ev('clockOut', '12:00'),
      ev('clockIn', '13:00'), { ...ev('clockOut', '13:00'), at: t('13:00') + 20_000 },
    ], END);
    expect(sessions(d)).toHaveLength(1);
    expect(d.offAt).toBe(t('12:00'));
  });

  it('퇴근 뒤 1분 안에 다시 출근하면 차수를 가르지 않는다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'), ev('clockOut', '12:00'),
      { ...ev('clockIn', '12:00'), at: t('12:00') + 30_000 }, ev('clockOut', '18:00'),
    ], END);
    expect(sessions(d)).toHaveLength(1);
  });

  it('2시간 넘게 쉬고 돌아와 재개하면 그 사이가 비근무가 되고 2차 근무가 된다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'), ev('breakStart', '12:00'), ev('breakEnd', '14:30'), ev('clockOut', '18:00'),
    ], END);
    expect(sessions(d)).toHaveLength(2);
    expect(workMinutes(d, END)).toBe(9 * 60 - 150);
  });
});

describe('다기기 — 수동 입력', () => {
  it('오프라인 폰이 모르고 휴게를 또 눌러도 이중 차감되지 않는다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00', 'mac'),
      ev('breakStart', '12:00', 'mac'),
      ev('breakStart', '12:10', 'phone', 'mobile'),
      ev('breakEnd', '13:00', 'mac'),
      ev('clockOut', '18:00', 'mac'),
    ], END);
    expect(d.breaks).toHaveLength(1);
    expect(workMinutes(d, END)).toBe(8 * 60);
  });

  it('시간 순서상 마지막 버튼이 그 시점의 상태를 정한다 — 폰 재개 12:50 이 먼저면 12:50 부터 근무', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00', 'mac'),
      ev('breakStart', '12:00', 'mac'),
      ev('breakStart', '12:10', 'phone', 'mobile'),
      ev('breakEnd', '12:50', 'phone', 'mobile'),
      ev('breakEnd', '13:00', 'mac'),
    ], t('14:00'));
    expect(d.breaks[0].e).toBe(t('12:50'));
  });

  it('늦게 도착한 이벤트도 일어난 시각 순서로 재생된다 (도착 순서와 무관)', () => {
    const a = [
      ev('clockIn', '09:00', 'mac'),
      ev('breakStart', '12:00', 'phone', 'mobile'),
      ev('breakEnd', '13:00', 'phone', 'mobile'),
      ev('clockOut', '18:00', 'mac'),
    ];
    const shuffled = [a[3], a[1], a[0], a[2]];
    expect(deriveDay(D, shuffled, END)).toEqual(deriveDay(D, a, END));
  });

  it('두 기기에서 퇴근을 누르면 늦은 시각이 퇴근이다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00', 'mac'),
      ev('clockOut', '18:00', 'phone', 'mobile'),
      ev('clockOut', '18:20', 'mac'),
    ], END);
    expect(d.offAt).toBe(t('18:20'));
  });

  it('두 기기에서 출근을 누르면 이른 시각이 출근이다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:05', 'mac'),
      ev('clockIn', '08:58', 'phone', 'mobile'),
    ], t('10:00'));
    expect(d.onAt).toBe(t('08:58'));
  });

  it('지운 이벤트는 재생하지 않는다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'),
      ev('breakStart', '10:00', 'mac', 'desktop', { deletedAt: t('10:01') }),
    ], t('11:00'));
    expect(stateOf(d)).toBe('work');
  });
});

describe('다기기 — 자동 감지', () => {
  it('폰은 자동 감지를 보내도 무시한다', () => {
    const d = deriveDay(D, [ev('clockIn', '09:00'), ev('awayStart', '10:00', 'phone', 'mobile')], t('11:00'));
    expect(stateOf(d)).toBe('work');
  });

  it('PC 두 대 — 한 대만 비면 자리비움이 아니다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00', 'pcA'),
      ev('awayStart', '10:00', 'pcA'),
      ev('awayEnd', '09:30', 'pcB'), // pcB 는 쓰는 중 (감지 PC 로 등록)
    ], t('11:00'));
    expect(stateOf(d)).toBe('work');
  });

  it('PC 두 대 — 둘 다 비었을 때, 나중에 빈 시각부터 자리비움', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00', 'pcA'),
      ev('awayStart', '10:00', 'pcA'),
      ev('awayStart', '10:20', 'pcB'),
      ev('awayEnd', '10:50', 'pcB'),
    ], t('11:00'));
    expect(d.breaks).toEqual([{ s: t('10:20'), e: t('10:50'), kind: 'break', auto: true, by: 'idle' }]);
  });

  it('사람이 연 휴게는 복귀 감지로 닫히지 않는다 (수동 > 자동)', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'),
      ev('breakStart', '12:00', 'phone', 'mobile'),
      ev('awayEnd', '12:05', 'mac'),
    ], t('12:30'));
    expect(stateOf(d)).toBe('break');
  });

  it('자동으로 열린 자리비움에 사람이 휴게를 누르면 사람 것이 된다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'),
      ev('awayStart', '12:00', 'mac', 'desktop', { by: 'idle' }),
      ev('breakStart', '12:05', 'phone', 'mobile'),
      ev('awayEnd', '12:10', 'mac'),
    ], t('12:30'));
    expect(stateOf(d)).toBe('break');
    expect(d.breaks[0].auto).toBe(false);
  });

  it('폰에서 «업무 재개» 를 누르면 PC 가 비어 있어도 근무다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00', 'mac'),
      ev('awayStart', '12:00', 'mac'),
      ev('breakEnd', '12:20', 'phone', 'mobile'),
    ], t('13:00'));
    expect(stateOf(d)).toBe('work');
    expect(d.breaks[0].e).toBe(t('12:20'));
  });
});

describe('목표 (§4 v3.1.209)', () => {
  it('근태만큼 목표가 줄어든다', () => {
    expect(dayGoalMin(8, { leave: '' })).toBe(480);
    expect(dayGoalMin(8, { leave: '오전 반차' })).toBe(240);
    expect(dayGoalMin(8, { leave: '연차' })).toBe(0);
    expect(dayGoalMin(8, { leave: '연차' }, false)).toBe(480);
  });
});

it('replayRaw 는 정리 전 상태를 준다', () => {
  expect(replayRaw(D, [ev('clockIn', '09:00')]).onAt).toBe(t('09:00'));
});

describe('근태(연차·반차·병가) 고르기 — leaveSet', () => {
  it('마지막에 고른 값이 그 날의 근태다 (기기가 달라도)', () => {
    const d = deriveDay(D, [
      ev('leaveSet', '08:00', 'phone', 'mobile', { leave: '연차' }),
      ev('leaveSet', '08:30', 'mac', 'desktop', { leave: '오후 반차' }),
    ], END);
    expect(d.leave).toBe('오후 반차');
    expect(dayGoalMin(8, d)).toBe(240);
  });

  it('「근무」로 되돌리면 빈 값이다', () => {
    const d = deriveDay(D, [
      ev('leaveSet', '08:00', 'mac', 'desktop', { leave: '병가' }),
      ev('leaveSet', '09:00', 'mac', 'desktop', { leave: '' }),
    ], END);
    expect(d.leave).toBe('');
  });

  it('근태를 골라도 출퇴근 상태는 그대로다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'),
      ev('leaveSet', '12:00', 'mac', 'desktop', { leave: '오후 반차' }),
      ev('clockOut', '13:00'),
    ], END);
    expect(stateOf(d)).toBe('off');
    expect(workMinutes(d, END)).toBe(240);
    expect(d.leave).toBe('오후 반차');
  });

  it('지운 근태 이벤트는 없던 일이다', () => {
    const d = deriveDay(D, [ev('leaveSet', '08:00', 'mac', 'desktop', { leave: '연차', deletedAt: 1 })], END);
    expect(d.leave).toBe('');
  });
});

describe('뽀모도로 횟수 — pomoDone', () => {
  it('끝까지 채운 집중만 세고, 근무 상태는 안 건드린다', () => {
    const d = deriveDay(D, [
      ev('clockIn', '09:00'),
      ev('pomoDone', '09:25', 'mac', 'desktop', { min: 25 }),
      ev('pomoDone', '10:00', 'phone', 'mobile', { min: 25 }),
    ], t('10:30'));
    expect(d.pomos).toBe(2);
    expect(stateOf(d)).toBe('work');
    expect(workMinutes(d, t('10:30'))).toBe(90);
  });
});

// ───────────────────────────────────────── 손으로 고치기 (override) — LOGIC §4 · §7
import { addSessionAt, dropSession, mergeSession, removeBreak, resolveAt, resolveCarry, sessionRows, setBreakAt, setSessionTime } from './edit';
import type { DaySnapshot } from './types';

const snap = (d: ReturnType<typeof deriveDay>): DaySnapshot =>
  ({ onAt: d.onAt, offAt: d.offAt, breaks: d.breaks, leave: d.leave, autoClosed: d.autoClosed, carriedFrom: d.carriedFrom });
const ovr = (hm: string, d: ReturnType<typeof deriveDay>, basedOn: AttEvent[]) =>
  ev('override', hm, 'mac', 'desktop', { day: snap(d), basedOn: basedOn.map((e) => e.id) });

describe('override — 고친 하루에서 출발해 그 뒤 이벤트를 얹는다', () => {
  const base = () => [ev('clockIn', '09:00'), ev('breakStart', '12:00'), ev('breakEnd', '13:00'), ev('clockOut', '18:00')];

  it('출근 시각 고치기 → 고친 값이 이긴다', () => {
    const evs = base();
    const d0 = deriveDay(D, evs, END);
    const r = setSessionTime(d0, 0, 'on', t('08:30'));
    expect(r.ok).toBe(true);
    const d = deriveDay(D, [...evs, ovr('19:00', (r as { day: ReturnType<typeof deriveDay> }).day, evs)], END);
    expect(d.onAt).toBe(t('08:30'));
    expect(workMinutes(d, END)).toBe(8 * 60 + 30);
  });

  it('고친 뒤에 누른 버튼은 그 위에 재생된다', () => {
    const evs = [ev('clockIn', '09:00')];
    const d0 = deriveDay(D, evs, t('10:00'));
    const r = setSessionTime(d0, 0, 'on', t('08:00'));
    const o = ovr('10:00', (r as { day: ReturnType<typeof deriveDay> }).day, evs);
    const d = deriveDay(D, [...evs, o, ev('clockOut', '17:00')], END);
    expect(d.onAt).toBe(t('08:00'));
    expect(d.offAt).toBe(t('17:00'));
  });

  it('고친 «뒤에» 늦게 도착한 다른 기기 기록도 얹힌다', () => {
    const evs = [ev('clockIn', '09:00')];
    const r = setSessionTime(deriveDay(D, evs, t('10:00')), 0, 'on', t('08:00'));
    const o = ovr('10:00', (r as { day: ReturnType<typeof deriveDay> }).day, evs);
    const late = ev('breakStart', '10:30', 'phone', 'mobile');
    const d = deriveDay(D, [...evs, o, late, ev('breakEnd', '11:00', 'phone', 'mobile')], END);
    expect(d.breaks.filter((b) => b.kind === 'break')).toHaveLength(1);
  });

  it('override 를 지우면(되돌리기) 고치기 전으로', () => {
    const evs = base();
    const r = setSessionTime(deriveDay(D, evs, END), 0, 'on', t('08:30'));
    const o = { ...ovr('19:00', (r as { day: ReturnType<typeof deriveDay> }).day, evs), deletedAt: 1 };
    expect(deriveDay(D, [...evs, o], END).onAt).toBe(t('09:00'));
  });
});

describe('차수 편집 — LOGIC §4', () => {
  // 1차 09–12 · 2차 14–18
  const two = () => deriveDay(D, [ev('clockIn', '09:00'), ev('clockOut', '12:00'), ev('clockIn', '14:00'), ev('clockOut', '18:00')], END);

  it('차수 줄', () => {
    const rows = sessionRows(two());
    expect(rows.map((r) => [r.on, r.off])).toEqual([[t('09:00'), t('12:00')], [t('14:00'), t('18:00')]]);
  });

  it('범위 밖이면 안 고치고 «어디까지» 를 알려 준다', () => {
    const r = setSessionTime(two(), 0, 'off', t('15:00'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.w).toEqual({ lo: t('09:00'), hi: t('14:00') });
  });

  it('퇴근을 앞당기면 그 뒤 휴게는 잘린다 (clipBreaks)', () => {
    const d0 = deriveDay(D, [ev('clockIn', '09:00'), ev('breakStart', '17:00'), ev('breakEnd', '17:40'), ev('clockOut', '18:00')], END);
    const r = setSessionTime(d0, 0, 'off', t('17:20'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.day.breaks).toEqual([expect.objectContaining({ s: t('17:00'), e: t('17:20') })]);
      expect(r.cut).toBe(1);
    }
  });

  it('합치기 = 사이 비근무를 지운다 (근무 ↑) · 지우기 = 그 시간을 뺀다 (근무 ↓)', () => {
    const m = mergeSession(two(), 1)!;
    expect(workMinutes(m, END)).toBe(9 * 60);
    const dLast = dropSession(two(), 1)!;
    expect(dLast.offAt).toBe(t('12:00'));
    expect(workMinutes(dLast, END)).toBe(3 * 60);
    const dFirst = dropSession(two(), 0)!;
    expect(dFirst.onAt).toBe(t('14:00'));
    expect(workMinutes(dFirst, END)).toBe(4 * 60);
    expect(mergeSession(two(), 0)).toBeNull();
  });

  it('퇴근 뒤 차수 추가 — 사이는 비근무', () => {
    const d0 = deriveDay(D, [ev('clockIn', '09:00'), ev('clockOut', '12:00')], END);
    const d = addSessionAt(d0, t('20:00'), t('22:00'))!;
    expect(sessionRows(d)).toHaveLength(2);
    expect(workMinutes(normalizeBreaks(d), END)).toBe(5 * 60);
  });

  it('휴게 시각 고치기 · 지우기', () => {
    const d0 = deriveDay(D, [ev('clockIn', '09:00'), ev('breakStart', '12:00'), ev('breakEnd', '13:00'), ev('clockOut', '18:00')], END);
    const i = d0.breaks.findIndex((b) => b.kind === 'break');
    const d1 = setBreakAt(d0, i, 'e', t('12:30'))!;
    expect(workMinutes(d1, END)).toBe(8 * 60 + 30);
    expect(setBreakAt(d0, i, 'e', t('11:00'))).toBeNull();
    expect(workMinutes(removeBreak(d0, i)!, END)).toBe(9 * 60);
  });
});

describe('자정을 넘긴 날 — LOGIC §7', () => {
  const NEXT = new Date(2026, 9, 22, 9, 0).getTime();

  it('일하던 채 넘겼으면 물어본다 (pending) — 근무는 23:59 까지', () => {
    const d = deriveDay(D, [ev('clockIn', '20:00')], NEXT);
    expect(d.pending).toBeTruthy();
    expect(stateOf(d)).toBe('off');
    expect(workMinutes(d, NEXT)).toBe(3 * 60 + 59);
  });

  it('휴게 중에 넘겼으면 묻지 않는다 — 휴게 시작이 퇴근 (v3.1.49)', () => {
    const d = deriveDay(D, [ev('clockIn', '20:00'), ev('breakStart', '23:00')], NEXT);
    expect(d.pending).toBeUndefined();
    expect(d.offAt).toBe(t('23:00'));
    expect(d.autoClosed).toBe('break');
  });

  it('「그때 퇴근」 · 「계속 일했어요」', () => {
    const d = deriveDay(D, [ev('clockIn', '20:00')], NEXT);
    expect(resolveAt(d)!.offAt).toBe(t('23:59'));
    expect(resolveCarry(d)!.offAt).toBe(t('23:59'));
    expect(resolveCarry(d)!.autoClosed).toBe('confirmed');
  });

  it('확정을 override 로 남기면 더는 묻지 않는다', () => {
    const evs = [ev('clockIn', '20:00')];
    const d0 = deriveDay(D, evs, NEXT);
    const o = ovr('23:00', resolveAt(d0)!, evs);
    const d = deriveDay(D, [...evs, o], NEXT);
    expect(d.pending).toBeUndefined();
    expect(d.offAt).toBe(t('23:59'));
  });
});
