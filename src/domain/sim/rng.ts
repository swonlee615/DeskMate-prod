/**
 * 씨앗 고정 난수 (v3 rng.js 그대로) — 같은 씨앗이면 어느 기기에서든 같은 수가 나온다.
 * 그래서 동료의 하루를 저장하지 않고 날짜로 다시 만들어도 같다 (앱을 껐다 켜도 오늘의 서사가 유지된다)
 */
export function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private f: () => number;
  constructor(seed: number | string) { this.f = mulberry32(typeof seed === 'number' ? seed : hashStr(String(seed))); }
  next() { return this.f(); }
  range(a: number, b: number) { return a + this.f() * (b - a); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.f() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.f() * arr.length)]; }
  gauss(mean: number, sd: number) {
    let u = 0, v = 0;
    while (u === 0) u = this.f();
    while (v === 0) v = this.f();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  expo(mean: number) { return -Math.log(1 - this.f()) * mean; }
  weighted<K extends string>(obj: Record<K, number>): K {
    const keys = Object.keys(obj) as K[];
    let total = 0;
    for (const k of keys) total += Math.max(0, obj[k]);
    let r = this.f() * total;
    for (const k of keys) { r -= Math.max(0, obj[k]); if (r <= 0) return k; }
    return keys[keys.length - 1];
  }
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
