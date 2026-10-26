// Firebase 콘솔에서 복사한 firebaseConfig 덩어리를 받아 .env.local 을 만든다
// 사용: node scripts/write-env.mjs  (붙여 넣고 빈 줄에서 엔터 두 번, 또는 Ctrl+D)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });
const lines = [];
let blank = 0;
rl.on('line', (l) => {
  lines.push(l);
  blank = l.trim() === '' ? blank + 1 : 0;
  if (blank >= 2 || /^\s*};?\s*$/.test(l)) rl.close();
});
rl.on('close', () => {
  const text = lines.join('\n');
  const get = (k) => (text.match(new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']')) || [])[1] || '';
  const v = {
    VITE_FB_API_KEY: get('apiKey'),
    VITE_FB_AUTH_DOMAIN: get('authDomain'),
    VITE_FB_PROJECT_ID: get('projectId'),
    VITE_FB_APP_ID: get('appId'),
  };
  const missing = Object.entries(v).filter(([, x]) => !x).map(([k]) => k);
  if (missing.length) {
    console.error('\n✗ 다음 값을 찾지 못했어요: ' + missing.join(', '));
    console.error('  콘솔의 「const firebaseConfig = { … };」 덩어리를 통째로 붙여 넣어 주세요.');
    process.exit(1);
  }
  let keep = 'VITE_AUTH_PROVIDERS=google\n';
  if (existsSync('.env.local')) {
    const old = readFileSync('.env.local', 'utf8').match(/^VITE_AUTH_PROVIDERS=.*$/m);
    if (old) keep = old[0] + '\n';
  }
  const out = Object.entries(v).map(([k, x]) => `${k}=${x}`).join('\n') + '\n' + keep;
  writeFileSync('.env.local', out);
  console.log('\n✓ .env.local 을 만들었어요 — 프로젝트: ' + v.VITE_FB_PROJECT_ID);
});
