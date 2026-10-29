import { describe, expect, it } from 'vitest';
import { dateCandidates, dateChipLabel, dateLabelOf, isStruck, menToken, mkJoin, mkLen, mkParse, mkSplit, mkToggle, mkToggleAll, plainText, setChipDate } from './inline';

describe('줄 서식 (v3 mkParse · mkJoin)', () => {
  it('짝이 있고 공백에 붙지 않은 표시만 서식이다', () => {
    expect(mkParse('**굵게** 그냥')).toEqual([{ t: '굵게', m: 'b' }, { t: ' 그냥', m: '' }]);
    expect(mkParse('2 * 3 * 4')).toEqual([{ t: '2 * 3 * 4', m: '' }]);
    expect(mkParse('`a **b**`')).toEqual([{ t: 'a **b**', m: 'c' }]);   // 코드 안은 글자 그대로
  });
  it('되읽을 수 있게 쓴다 — 가장자리 공백은 표시 밖으로 (v3.1.140)', () => {
    expect(mkJoin([{ t: '볼드 항목→ ', m: 'b' }])).toBe('**볼드 항목→** ');
    const t = '앞 **~~둘~~** `코드` 뒤';   // 여는 순서는 늘 b → i → u → s → c
    expect(mkJoin(mkParse(t))).toBe(t);
  });
});

describe('자르기 · 서식 켜고 끄기', () => {
  it('Enter 로 잘라도 서식이 풀리지 않는다 (v3.1.136)', () => {
    expect(mkSplit('앞 `코드` 뒤', 4)).toEqual(['앞 `코드`', ' 뒤']);
  });
  it('칩 한가운데로는 자르지 않는다', () => {
    const t = '회의 @[내일](date:2026-10-31) 준비';
    expect(mkSplit(t, 6)[0]).toBe('회의 ');
  });
  it('⌘B — 걸고, 다 걸려 있으면 푼다 · 끝 공백은 안 건다', () => {
    const on = mkToggle('할 일 하나', 0, 3, 'b')!;
    expect(on).toBe('**할 일** 하나');
    expect(mkToggle(on, 0, 4, 'b')).toBe('할 일 하나');
    expect(mkToggleAll('끝낸 일', 's')).toBe('~~끝낸 일~~');
    expect(mkLen('**굵게**')).toBe(2);
    // 굵게가 섞인 줄 전체 취소선 — 다시 누르면 풀린다 (사이 공백은 표시 밖에 선다)
    const st = mkToggleAll('**보고서** 초안', 's')!;
    expect(st).toBe('**~~보고서~~** ~~초안~~');
    expect(mkToggleAll(st, 's')).toBe('**보고서** 초안');
  });
});

describe('취소선 = 취소한 일 (LOGIC · v3.1.263)', () => {
  it('줄 전체만 · 칩과 기호는 글자가 아니다 · 글자가 남으면 부분 취소선', () => {
    expect(isStruck({ text: '~~안 하기로~~' })).toBe(true);
    expect(isStruck({ text: '~~연대 커뮤니케이션 대학원~~ → @[그저께](date:2026-10-26)' })).toBe(true);
    expect(isStruck({ text: '~~할 일~~ 2건' })).toBe(false);
    expect(isStruck({ text: '그냥 줄' })).toBe(false);
  });
});

describe('보이는 글자 · 날짜 칩 라벨', () => {
  it('칩은 라벨, 링크는 이름, 표시는 빠진다', () => {
    expect(plainText('**보고서** [문서](https://a.b/c) @[내일](date:2026-10-31)')).toBe('보고서 문서 내일');
  });
  it('우리가 만든 말은 오늘 기준으로 다시 읽고, 사람이 적은 말은 그대로', () => {
    expect(dateChipLabel('2026-11-01', '모레', '2026-10-31')).toBe('내일');
    expect(dateChipLabel('2026-11-05', '내일', '2026-10-30')).toBe('다음 주 목요일');
    expect(dateChipLabel('2026-10-29', '10월 29일 (목)', '2026-10-30')).toBe('어제');
    expect(dateChipLabel('2026-10-29', '발표날', '2026-10-30')).toBe('발표날');
  });
});

describe('@날짜 (v2.9.69 · v3.1.152)', () => {
  const T = '2026-10-30';   // 금
  it('앞글자 · 요일 · 숫자 모양을 다 받는다', () => {
    expect(dateCandidates('', T).map((x) => x.ref)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-10-29']);
    expect(dateCandidates('내', T)[0]).toEqual({ ref: '2026-10-31', label: '내일 · 10월 31일 (토)' });
    expect(dateCandidates('수', T)[0].label).toBe('다음 주 수요일 · 11월 4일 (수)');
    expect(dateCandidates('1104', T)[0].ref).toBe('2026-11-04');
    expect(dateCandidates('11월4일', T)[0].ref).toBe('2026-11-04');
    expect(dateCandidates('2', T).map((x) => x.ref)).toEqual(['2026-10-02', '2026-11-02']);   // 지난 날이면 다음 달도
    expect(dateCandidates('231', T)).toEqual([]);   // 2월 31일은 없다
  });
  it('칩에는 늘 절대 날짜 · 바꾸기 · 지우기', () => {
    const t = `제출 ${menToken('date', '2026-10-31', dateLabelOf('2026-10-31'))} 까지`;
    expect(t).toBe('제출 @[10월 31일 (토)](date:2026-10-31) 까지');
    expect(setChipDate(t, '@[10월 31일 (토)](date:2026-10-31)', '2026-11-02')).toBe('제출 @[11월 2일 (월)](date:2026-11-02) 까지');
    expect(setChipDate(t, '@[10월 31일 (토)](date:2026-10-31)', null)).toBe('제출 까지');
  });
});
