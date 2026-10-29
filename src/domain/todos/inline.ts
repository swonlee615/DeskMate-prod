/**
 * 줄 글자 안의 서식 · 칩 · 링크 (v3 app.js mkParse · mkJoin · mkSplit · mkToggle · worklog.js isStruck)
 *
 * ▣ 저장 형식은 «그냥 문자열» 이다 — v3 와 같은 표시를 글자 안에 남긴다 (v3 데이터가 그대로 읽힌다)
 *     **굵게**  *기울임*  __밑줄__  ~~취소선~~  `코드`
 *     @[라벨](date:YYYY-MM-DD) · @[라벨](notion:id) — 칩 · [이름](https://…) · 맨 URL — 링크
 * ▣ 마크다운 규칙 — 여는 표시 뒤 · 닫는 표시 앞은 공백이 아니어야 하고 짝이 있어야 한다 ("2 * 3 * 4" 는 그냥 글)
 * ▣ 코드가 가장 안쪽 (v3.1.141) — 코드 안의 표시는 글자 그대로
 * ▣ «자» 는 하나 — 표시 문자는 길이 0, 칩 · 링크는 «토큰 길이» 로 센다 (v3.1.167 · mkChars)
 */

export type Mk = 'b' | 'i' | 'u' | 's' | 'c';
export interface Part { t: string; m: string }

export const MK_ORDER: Mk[] = ['b', 'i', 'u', 's', 'c'];
export const MK_OF: Record<Mk, string> = { b: '**', i: '*', u: '__', s: '~~', c: '`' };
export const MK_TAG: Record<Mk, string> = { b: 'b', i: 'i', u: 'u', s: 's', c: 'code' };
const MK_LIST: [Mk, string][] = [['b', '**'], ['u', '__'], ['s', '~~'], ['i', '*'], ['c', '`']];   // 긴 표시부터 본다

export const MEN_RE = /@\[((?:[^\]\\]|\\.)*)\]\((notion|date):([^)]+)\)/g;
export const MD_LINK_RE = /\[((?:[^\]\\]|\\.)*)\]\((https?:\/\/[^)\s]+)\)/;
export const URL_RE = /https?:\/\/[^\s<>()[\]«»"']+[^\s<>()[\]«»"'.,;:!?]/;
const STRIKE_RE = /~~[\s\S]*?~~/g;
const MENTION_RE = /@\[(?:[^\]\\]|\\.)*\]\((?:notion|date):[^)]+\)/g;

export const mkNorm = (m: string) => MK_ORDER.filter((k) => (m || '').includes(k)).join('');
const mkAt = (s: string, i: number) => { for (const x of MK_LIST) if (s.startsWith(x[1], i)) return x; return null; };

/** 여기 있는 표시를 서식으로 볼지 — 짝 · 공백 규칙 */
function mkUsable(s: string, i: number, t: string, open: boolean) {
  if (!open) return i > 0 && /\S/.test(s[i - 1]);
  const nx = s[i + t.length];
  if (!nx || !/\S/.test(nx)) return false;
  for (let j = i + t.length; j < s.length; j++) {
    const h = mkAt(s, j);
    if (h && h[1] === t && /\S/.test(s[j - 1])) return true;
  }
  return false;
}

/** 텍스트 → [{ t, m }] (m 은 'bi' 처럼 걸린 서식) */
export function mkParse(text: string): Part[] {
  const s = text || '', out: Part[] = [], on: Record<Mk, number> = { b: 0, i: 0, u: 0, s: 0, c: 0 };
  let buf = '';
  const push = () => { if (buf) { out.push({ t: buf, m: mkNorm(MK_ORDER.filter((k) => on[k]).join('')) }); buf = ''; } };
  for (let i = 0; i < s.length;) {
    const h = mkAt(s, i);
    const skip = on.c && h && h[0] !== 'c';
    if (h && !skip && mkUsable(s, i, h[1], !on[h[0]])) { push(); on[h[0]] = on[h[0]] ? 0 : 1; i += h[1].length; continue; }
    buf += s[i]; i += 1;
  }
  push();
  return out;
}

/** 서식 가장자리의 공백은 표시 바깥으로 — 자기 자신을 되읽을 수 있는 글로 (v3.1.140) */
function mkEdgeSafe(parts: Part[]): Part[] {
  const merged: Part[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    const m = mkNorm(p.m);
    if (last && last.m === m) last.t += p.t || '';
    else merged.push({ t: p.t || '', m });
  }
  const out: Part[] = [];
  for (const p of merged) {
    if (!p.t || !p.m) { out.push(p); continue; }
    const lead = (/^\s+/.exec(p.t) || [''])[0];
    const rest = p.t.slice(lead.length);
    const trail = (/\s+$/.exec(rest) || [''])[0];
    const core = rest.slice(0, rest.length - trail.length);
    if (!core) { out.push({ t: p.t, m: '' }); continue; }
    if (lead) out.push({ t: lead, m: '' });
    out.push({ t: core, m: p.m });
    if (trail) out.push({ t: trail, m: '' });
  }
  return out;
}

/** [{ t, m }] → 텍스트 */
export function mkJoin(parts0: Part[]): string {
  const parts = mkEdgeSafe(parts0);
  let out = '', prev = '';
  for (const p of parts) {
    if (!p.t) continue;
    const cur = mkNorm(p.m);
    for (let i = MK_ORDER.length - 1; i >= 0; i--) { const k = MK_ORDER[i]; if (prev.includes(k) && !cur.includes(k)) out += MK_OF[k]; }
    for (const k of MK_ORDER) if (cur.includes(k) && !prev.includes(k)) out += MK_OF[k];
    out += p.t; prev = cur;
  }
  for (let i = MK_ORDER.length - 1; i >= 0; i--) { const k = MK_ORDER[i]; if (prev.includes(k)) out += MK_OF[k]; }
  return out;
}

/** 내용 글자 하나씩 (표시 문자는 빠진다) */
export function mkChars(text: string): { c: string; m: string }[] {
  const cs: { c: string; m: string }[] = [];
  // UTF-16 한 칸씩 — 브라우저 커서 자리(Range offset)와 같은 자 (v3 와 같다)
  for (const p of mkParse(text)) for (let i = 0; i < p.t.length; i++) cs.push({ c: p.t[i], m: p.m });
  return cs;
}
function mkFromChars(cs: { c: string; m: string }[]) {
  const parts: Part[] = [];
  for (const x of cs) {
    const last = parts[parts.length - 1];
    if (last && last.m === x.m) last.t += x.c; else parts.push({ t: x.c, m: x.m });
  }
  return mkJoin(parts);
}
/** 내용 글자 수 — 커서 자리를 재는 자 */
export const mkLen = (text: string) => mkChars(text).length;

/** 서식을 지키며 내용 자리 n 에서 자른다 (v3.1.136) — 칩 · 링크 한가운데로는 자르지 않는다 */
export function mkSplit(text: string, n: number): [string, string] {
  const cs = mkChars(text || '');
  let at = Math.max(0, Math.min(n, cs.length));
  const plain = cs.map((x) => x.c).join('');
  const re = new RegExp(`(?:${MEN_RE.source})|(?:${MD_LINK_RE.source})`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain))) {
    if (m.index >= at) break;
    if (at < m.index + m[0].length) { at = m.index; break; }
  }
  return [mkFromChars(cs.slice(0, at)), mkFromChars(cs.slice(at))];
}

/** [s, e) 에 서식을 걸거나 뺀다 — 이미 전부 걸려 있으면 뺀다 (노션과 같다). 양 끝 공백은 뺀다 (v3.1.140) */
export function mkToggle(text: string, s: number, e: number, k: Mk): string | null {
  const cs = mkChars(text);
  let a = Math.max(0, Math.min(s, cs.length));
  let z = Math.max(0, Math.min(e, cs.length));
  while (a < z && /\s/.test(cs[a].c)) a += 1;
  while (z > a && /\s/.test(cs[z - 1].c)) z -= 1;
  if (a >= z) return null;
  // 공백은 보지 않는다 — 서식 사이 공백은 표시 «밖» 에 서므로(mkEdgeSafe) 늘 «안 걸림» 으로 읽힌다.
  // 그걸 세면 `**굵게** 뒤` 전체에 건 취소선이 다시 눌러도 안 풀렸다 (웹에서 찾음 · 2026-10-30)
  const allOn = cs.slice(a, z).filter((x) => /\S/.test(x.c)).every((x) => x.m.includes(k));
  for (let i = a; i < z; i++) cs[i].m = allOn ? mkNorm(cs[i].m.replace(k, '')) : mkNorm(cs[i].m + k);
  return mkFromChars(cs);
}

/** 줄 전체에 서식을 걸거나 뺀다 — 여러 줄 고르기 · 그 줄 전체 (v3.1.256) */
export const mkToggleAll = (text: string, k: Mk) => mkToggle(text, 0, mkLen(text), k);
/** 줄 전체가 그 서식인가 (공백은 빼고) */
export const mkAllOn = (text: string, k: Mk) => { const cs = mkChars(text).filter((x) => /\S/.test(x.c)); return cs.length > 0 && cs.every((x) => x.m.includes(k)); };

/**
 * 줄 «전체» 취소선 = 「안 하기로 했다」 (v2.9.98 · LOGIC) — 이월 · 주간 · 달성에서 빠지고, 부분 체크에서는 «해결»
 * 취소선 밖에 글자 · 숫자가 하나라도 남으면 부분 취소선(고쳐 쓴 흔적)이다. 칩과 기호는 글자가 아니다 (v3.1.263)
 */
export function isStruck(b: { text: string } | null | undefined): boolean {
  const t = String(b?.text || '').trim();
  if (!t || !t.includes('~~')) return false;
  return t.replace(STRIKE_RE, '').replace(MENTION_RE, '').replace(/[^\p{L}\p{N}]/gu, '') === '';
}

/** 보이는 글자만 (검색 · 목록 미리보기 · 라벨 고르기) — 칩은 라벨, 링크는 이름 */
export function plainText(text: string): string {
  return mkParse(text).map((p) => p.t).join('')
    .replace(new RegExp(MEN_RE.source, 'g'), (_, l: string) => l.replace(/\\(.)/g, '$1'))
    .replace(new RegExp(MD_LINK_RE.source, 'g'), (_, l: string) => l.replace(/\\(.)/g, '$1'));
}

// ─────────────────────────────────────────────────────────── 날짜 칩 라벨 (v3.1.140 · 152 · 227)

const REL_DAY: Record<string, number> = { 그저께: -2, 어제: -1, 오늘: 0, 내일: 1, 모레: 2 };
const REL_DOW = /^(이번|다음 주) [일월화수목금토]요일$/;
const REL_ABS = /^\d{1,2}월 \d{1,2}일 \([일월화수목금토]\)$/;
const DOW = '일월화수목금토';
const at12 = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const monday = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x.getTime(); };
/** 우리가 만든 말이면 오늘 기준으로 다시 읽는다 — 「모레」 는 하루만 지나면 거짓말이 된다. 사람이 적은 말은 그대로 */
export function dateChipLabel(ref: string, label: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ref) || !(label in REL_DAY || REL_DOW.test(label) || REL_ABS.test(label))) return label;
  const dt = at12(ref), t = at12(today);
  const n = Math.round((dt.getTime() - t.getTime()) / 864e5);
  for (const [w, v] of Object.entries(REL_DAY)) if (v === n) return w;
  if (n >= 3 && n <= 6) return `${monday(dt) === monday(t) ? '이번' : '다음 주'} ${DOW[dt.getDay()]}요일`;
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})`;
}
