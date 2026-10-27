/**
 * 다이얼 타이머의 모양 계산 (v3 app.js `dialSpan` · `dialPt` · `dialFace` · `renderDial`, v3.1.244)
 * 남은 시간 = 부채꼴. 눈금은 길이에 맞춘다 — 60분 이하 60 · 120분 이하 120 · 그 위 180
 */
export const DIAL = { C: 94, R: 90, W: 66 };

export const dialSpan = (sec: number) => (sec <= 3600 ? 60 : sec <= 7200 ? 120 : 180);

export function dialPt(min: number, r: number, span: number): [number, number] {
  const a = (min / span) * 2 * Math.PI - Math.PI / 2;
  return [+(DIAL.C + r * Math.cos(a)).toFixed(2), +(DIAL.C + r * Math.sin(a)).toFixed(2)];
}

/** 눈금 — 작은 점(minor) · 긴 금(major) · 숫자 */
export function dialFace(span: number) {
  const minor = span === 60 ? 1 : span === 120 ? 2 : 3, major = span === 60 ? 5 : span === 120 ? 10 : 15;
  const dots: [number, number][] = [], ticks: [number, number, number, number][] = [], nums: [number, number, number][] = [];
  for (let m = 0; m < span; m += minor) {
    if (m % major) { dots.push(dialPt(m, 74, span)); continue; }
    ticks.push([...dialPt(m, 69, span), ...dialPt(m, 76, span)]);
    nums.push([m, ...dialPt(m, 83.5, span)]);
  }
  return { dots, ticks, nums };
}

/** 남은 분 → 부채꼴 path (0 이면 빈 문자열, 눈금 한 바퀴면 꽉 찬 원) */
export function dialWedge(left: number, span: number) {
  const { C, W } = DIAL;
  if (left <= 0) return '';
  if (left >= span) return `M${C} ${C - W}A${W} ${W} 0 1 1 ${C - 0.01} ${C - W}Z`;
  const [x1, y1] = dialPt(0, W, span), [x2, y2] = dialPt(left, W, span);
  return `M${C} ${C}L${x1} ${y1}A${W} ${W} 0 ${left > span / 2 ? 1 : 0} 1 ${x2} ${y2}Z`;
}
