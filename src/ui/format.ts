export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 7시간 12분 · 45분 · 0분 */
export function fmtDur(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${WD[new Date(y, m - 1, d).getDay()]})`;
}
