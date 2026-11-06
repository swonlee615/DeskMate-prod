import { describe, expect, it } from 'vitest';
import { appBucket, manualBack, appList, appMatches, distracted, pushSample, putApp, rememberApp, windowStats, winMs, SAMPLE_MS, type Sample, type WorkAppsCfg } from './workApps';

const cfg = (x: Partial<WorkAppsCfg> = {}): WorkAppsCfg => ({ workApps: [], nonWorkApps: [], unknownApp: 'away', ...x });
const code = { id: 'com.microsoft.VSCode', name: 'Visual Studio Code', exec: 'Electron' };

describe('업무 앱 기준 (v3 appBucket · windowStats)', () => {
  it('번들 ID 가 양쪽에 있으면 그것으로만 맞춘다. 없으면 이름 · 실행 파일 이름', () => {
    expect(appMatches(code, { id: 'com.microsoft.vscode', name: 'Code' })).toBe(true);
    expect(appMatches(code, { id: 'other', name: 'Visual Studio Code' })).toBe(false);
    expect(appMatches({ id: null, name: 'Slack' }, { id: 'com.tinyspeck.slackmacgap', name: 'slack' })).toBe(true);
    expect(appMatches({ id: null, name: 'Code', exec: 'Code.exe' }, { name: 'code.exe' })).toBe(true);
  });

  it('옛 쉼표 문자열 목록도 읽는다', () => {
    expect(appList('Slack, Figma')).toEqual([{ id: null, name: 'Slack' }, { id: null, name: 'Figma' }]);
  });

  it('두 목록에 없는 앱은 설정대로. 이 앱 자신은 늘 근무', () => {
    const c = cfg({ workApps: [code], nonWorkApps: [{ id: null, name: 'YouTube' }] });
    expect(appBucket({ id: 'com.microsoft.VSCode' }, c)).toBe('work');
    expect(appBucket({ name: 'YouTube' }, c)).toBe('away');
    expect(appBucket({ name: 'Finder' }, c)).toBe('away');
    expect(appBucket({ name: 'Finder' }, { ...c, unknownApp: 'work' })).toBe('work');
    expect(appBucket({ id: 'io.github.swonlee615.deskmate', name: 'DeskMate' }, c)).toBe('work');
    expect(appBucket({}, c)).toBeNull();
  });

  it('딴짓만 기준 시간 넘게 · 업무는 15% 이하일 때만 자리비움. 첫 딴짓 시각부터', () => {
    const t0 = 1_000_000, min = 10;
    let s: Sample[] = [];
    for (let i = 0; i < 60; i++) s = pushSample(s, { t: t0 + i * SAMPLE_MS, k: 'distract' }, winMs(min));
    expect(distracted(windowStats(s), min)).toBe(true);
    expect(windowStats(s).firstD).toBe(t0);
    // 같은 시간에 업무 앱을 2분 섞으면 (10분의 20%) 아니다
    for (let i = 60; i < 72; i++) s = pushSample(s, { t: t0 + i * SAMPLE_MS, k: 'work' }, winMs(min));
    expect(distracted(windowStats(s), min)).toBe(false);
  });

  it('표본 사이가 벌어져도(맥이 잠듦) 한 칸은 30초까지만 센다', () => {
    const st = windowStats([{ t: 0, k: 'distract' }, { t: 600_000, k: 'distract' }]);
    expect(st.distractMs).toBe(SAMPLE_MS + 3 * SAMPLE_MS);
  });

  it('목록에 넣으면 반대 목록에서 빠지고, 최근 감지는 같은 앱을 맨 앞으로', () => {
    const c = cfg({ nonWorkApps: [{ id: 'com.tinyspeck.slackmacgap', name: 'Slack' }] });
    const r = putApp(c, 'work', { id: 'com.tinyspeck.slackmacgap', name: 'Slack' });
    expect(r.workApps).toHaveLength(1);
    expect(r.nonWorkApps).toHaveLength(0);
    const seen = rememberApp(rememberApp([], { name: 'A' }), { name: 'B' });
    expect(rememberApp(seen, { name: 'a' }).map((x) => x.name)).toEqual(['a', 'B']);
    expect(rememberApp(seen, { name: 'DeskMate' })).toBe(seen);
  });
});

describe('손으로 켠 휴게를 업무 앱으로 닫기 (v3 MANUAL_BACK_SAMPLES · v3.1.227)', () => {
  const s = (t: number, k: Sample['k']): Sample => ({ t, k });
  const T = 1_000_000_000, open = T - 600_000;
  it('업무 앱 표본 셋이 연달아 → 첫 표본 시각. 휴게 1분은 남긴다', () => {
    expect(manualBack([s(T - 20_000, 'work'), s(T - 10_000, 'work'), s(T, 'work')], T, open)).toBe(T - 20_000);
    expect(manualBack([s(T - 20_000, 'work'), s(T - 10_000, 'work'), s(T, 'work')], T, T - 70_000)).toBe(T - 10_000);
  });
  it('딴짓 · 섞임 · 모자람 · 띄엄띄엄(맥이 잠깐씩 깸)은 닫지 않는다', () => {
    expect(manualBack([s(T - 20_000, 'distract'), s(T - 10_000, 'distract'), s(T, 'distract')], T, open)).toBeNull();
    expect(manualBack([s(T - 20_000, 'work'), s(T - 10_000, null), s(T, 'work')], T, open)).toBeNull();
    expect(manualBack([s(T - 10_000, 'work'), s(T, 'work')], T, open)).toBeNull();
    expect(manualBack([s(T - 300_000, 'work'), s(T - 150_000, 'work'), s(T, 'work')], T, open)).toBeNull();
  });
});
