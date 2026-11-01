/**
 * v3 → 웹 옮기기 대조 — `npx vite-node scripts/v3-check.ts <deskmate.sqlite 가 든 폴더>`
 * v3 쪽은 v3 원본 코드(db.js load · worklog.js)로, 웹 쪽은 옮긴 이벤트를 웹 재생으로 — 날마다 근무 · 휴게 분을 나란히 본다
 * 원본 파일은 읽기만 한다 (복사본 폴더를 넘길 것)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { convertV3, type V3State } from '../src/domain/migrate/v3';
import { deriveDay } from '../src/domain/attendance/replay';
import { dayParts } from '../src/domain/attendance/rules';

const dir = process.argv[2];
const V3 = '../../v2.7.7';
const req = createRequire(import.meta.url);
const db = req(`${V3}/db.js`);
await db.open(dir);                     // version 없이 — 백업 · 디스크 쓰기 없음
const st = db.load() as V3State & { days: Record<string, unknown> };
const win: { DM: { WL?: Record<string, (...a: unknown[]) => number> } } = { DM: {} };
vm.runInNewContext(readFileSync(new URL(`${V3}/src/js/worklog.js`, import.meta.url), 'utf8'), { window: win, Date, Math, JSON, console });
const WL = win.DM.WL!;

const now = Date.now();
const c = convertV3(st, now);
let bad = 0;
const rows: string[] = [];
for (const d of Object.values(st.days)) {
  const v3w = WL.workMinutes(d), v3b = WL.breakMinutes ? WL.breakMinutes(d) : NaN;
  const day = deriveDay(d.date, c.events.filter((e) => e.date === d.date), now, (d.leave || '') as never);
  day.slots = c.logs.filter((l) => l.date === d.date && l.kind === 'slot' && !l.deletedAt).map((l) => ({ s: l.s, e: l.e }));
  const p = dayParts(day, now);
  const ww = p.workMs / 60000, wb = p.breakMs / 60000;
  const ok = Math.abs(ww - v3w) < 1 && (Number.isNaN(v3b) || Math.abs(wb - v3b) < 1);
  if (!ok) { bad++; rows.push(`  ✗ ${d.date}  근무 v3 ${v3w.toFixed(1)} / 웹 ${ww.toFixed(1)}   휴게 v3 ${v3b.toFixed?.(1)} / 웹 ${wb.toFixed(1)}`); }
}
const v3Lines = Object.values(st.days).reduce((a, d) => a + d.today.filter((b) => b.type !== 'moved' && !b.movedTo).length + d.memo.length, 0);
// 줄 하나하나 — v3 살아 있는 줄이 웹에 같은 글 · 같은 체크로 있나
const web = new Map(c.blocks.map((b) => [b.id, b]));
let lineBad = 0;
for (const d of Object.values(st.days)) for (const area of ['today', 'memo'] as const) for (const v of d[area]) {
  if (v.type === 'moved' || v.movedTo) continue;
  const b = web.get(v.id) ?? web.get(`${v.id}~${d.date}`);
  const txt = v.type === 'image' || v.type === 'divider' ? '' : v.text ?? '';
  if (!b || b.text !== txt || !!b.done !== !!v.done) { lineBad++; if (lineBad <= 5) rows.push(`  ✗ 줄 ${d.date} ${area} ${v.id} — ${!b ? '없음' : b.text !== txt ? '글이 다름' : '체크가 다름'}`); }
}
let tw = 0, tb = 0;
for (const d of Object.values(st.days)) { tw += WL.workMinutes(d); tb += WL.breakMinutes(d); }
console.log(`v3 합계: 근무 ${(tw / 60).toFixed(1)}시간 · 휴게 ${(tb / 60).toFixed(1)}시간`);
console.log(`줄 대조: 다른 줄 ${lineBad}`);
console.log('옮긴 것:', JSON.stringify(c.report));
console.log(`줄: v3 살아 있는 줄 ${v3Lines} + 주 ${c.report.weekLines} → 웹 ${c.report.lines} (지운 사슬 ${c.report.goneChains} 은 «지운 줄» 로 보관)`);
console.log(`근태 대조: ${Object.keys(st.days).length}일 중 다른 날 ${bad}일`);
rows.forEach((r) => console.log(r));
