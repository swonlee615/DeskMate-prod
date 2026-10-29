// v3 따라가기 확인 — `npm run v3`
// 기획(변경 기록 분류) · 구현(아직 안 옮긴 줄) · 스타일 원본이 v3 최신과 맞는지 한 번에 본다 (docs/V3-FOLLOW.md)
import { readFileSync } from 'node:fs';

const v3 = JSON.parse(readFileSync('../v2.7.7/package.json', 'utf8')).version;
const web = JSON.parse(readFileSync('package.json', 'utf8')).version;
const doc = readFileSync('docs/V3-FOLLOW.md', 'utf8');
const css = readFileSync('src/v3/styles.css', 'utf8') === readFileSync('../v2.7.7/src/styles.css', 'utf8');
const rows = doc.split('\n').filter((l) => /^\| 3\.\d+\.\d+ \|/.test(l)).map((l) => l.split('|').map((x) => x.trim()));
const todo = rows.filter((r) => r[3].startsWith('그 단계에서') || r[3].startsWith('확인'));
const cmp = (a, b) => a.split('.').map(Number).reduce((d, x, i) => d || x - Number(b.split('.')[i]), 0);

const ok = (b) => (b ? '✓' : '✗');
console.log(`v3 로컬 최신     ${v3}`);
console.log(`${ok(cmp(web, v3) >= 0)} 기획 (분류)    웹 ${web}${cmp(web, v3) < 0 ? ` — ${v3} 까지 CHANGELOG 를 분류하고 package.json 버전을 올린다` : ''}`);
console.log(`${ok(css)} 스타일 원본    ${css ? '같음' : '다름 — cp ../v2.7.7/src/styles.css src/v3/styles.css'}`);
console.log(`${ok(!todo.length)} 구현          ${todo.length ? `아직 ${todo.length}건 (그 기능을 옮길 때 최신 모양으로)` : '다 옮김'}`);
for (const r of todo) console.log(`    ${r[1].padEnd(8)} ${r[3].padEnd(6)} ${r[2]}`);
process.exit(cmp(web, v3) < 0 || !css ? 1 : 0);
