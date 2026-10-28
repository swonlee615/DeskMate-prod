/**
 * 폰 시간표 세로 배치 — 기록이 없는 2시간 이상은 한 줄로 접는다 (기록 수만큼만 길어지게)
 * 접힌 줄 안은 그 높이에 시간을 고르게 눌러 담는다 — 근무 띠처럼 접힌 곳을 지나는 구간도 끊기지 않는다
 */
export type TLRow = { kind: 'h'; h: number; y: number } | { kind: 'fold'; from: number; to: number; y: number };

export interface TLLayout { rows: TLRow[]; height: number; y: (m: number) => number; m: (y: number) => number | null }

export function tlLayout(h0: number, h1: number, busy: Set<number>, H: number, F: number, open = false): TLLayout {
  const rows: TLRow[] = [];
  let y = 0;
  for (let h = h0; h < h1;) {
    let k = h;
    while (!open && k < h1 && !busy.has(k)) k++;
    if (k - h >= 2) { rows.push({ kind: 'fold', from: h, to: k, y }); y += F; h = k; continue; }
    rows.push({ kind: 'h', h, y }); y += H; h++;
  }
  const at = (m: number) => {
    const h = Math.floor(m / 60);
    return rows.find((r) => (r.kind === 'h' ? r.h === h : h >= r.from && h < r.to)) ?? null;
  };
  return {
    rows,
    height: y,
    y: (m) => {
      if (m >= h1 * 60) return y;
      const r = at(Math.max(h0 * 60, m));
      if (!r) return 0;
      const mm = Math.max(h0 * 60, m);
      return r.kind === 'h' ? r.y + (mm - r.h * 60) * (H / 60) : r.y + ((mm - r.from * 60) / ((r.to - r.from) * 60)) * F;
    },
    // 접힌 줄 위면 null — 거기를 누르면 펼친다
    m: (py) => {
      const r = [...rows].reverse().find((x) => x.y <= py);
      if (!r || r.kind === 'fold') return null;
      return r.h * 60 + (py - r.y) / (H / 60);
    },
  };
}

/** 그 시간에 볼 것이 있나 — 기록 · 휴게가 걸친 시간, 출퇴근 · 비근무 경계, 지금 */
export function busyHours(spans: { kind: string; s: number; e: number }[], nowM: number | null): Set<number> {
  const out = new Set<number>();
  for (const x of spans) {
    if (x.kind === 'work' || x.kind === 'off') {
      out.add(Math.floor(x.s / 60));
      if (x.e < 1440) out.add(Math.floor(x.e / 60));
      continue;
    }
    for (let h = Math.floor(x.s / 60); h <= Math.floor((Math.max(x.s + 1, x.e) - 1) / 60); h++) out.add(h);
  }
  if (nowM != null) out.add(Math.floor(nowM / 60));
  return out;
}
