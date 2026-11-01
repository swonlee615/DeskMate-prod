/**
 * v3 `deskmate.sqlite` 읽기 — v3 db.js `load()` 를 그대로 옮긴 것 (같은 입력 → 같은 상태 → 같은 변환)
 * 브라우저에서 파일을 읽기만 한다. sql.js 는 가져오기를 할 때만 받는다 (평소 앱 크기에 안 붙는다)
 */
import type { V3State } from '../domain/migrate/v3';

export async function loadV3(bytes: Uint8Array): Promise<V3State> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(bytes);
  const all = (q: string) => { const r = db.exec(q)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []; };
  const json = (s: unknown) => { try { return JSON.parse(String(s)); } catch { return undefined; } };
  try {
    const st: Record<string, unknown> = {};
    for (const r of all('SELECT key, value FROM setting')) { const v = json(r.value); st[String(r.key)] = v === undefined ? r.value : v; }
    const days: V3State['days'] = {};
    for (const r of all('SELECT * FROM day')) {
      const d = { date: r.date, onAt: r.on_at ?? null, offAt: r.off_at ?? null, leave: r.leave || '', sessions: r.sessions || 0, deletedAt: r.deleted_at || null, breaks: [], today: [], memo: [], slots: [], pomos: [] } as unknown as V3State['days'][string];
      if (r.extra) Object.assign(d, json(r.extra) ?? {});
      days[String(r.date)] = d;
    }
    for (const r of all('SELECT * FROM brk ORDER BY start_at')) {
      const d = days[String(r.date)]; if (!d) continue;
      const b: Record<string, unknown> = { s: r.start_at, e: r.end_at };
      if (r.kind) b.kind = r.kind;
      if (r.auto) b.auto = true;
      if (r.by_what) b.by = r.by_what;
      if (r.meta) Object.assign(b, json(r.meta) ?? {});
      d.breaks.push(b as never);
    }
    for (const r of all('SELECT * FROM block ORDER BY area, ord')) {
      const d = days[String(r.date)]; if (!d) continue;
      const b: Record<string, unknown> = r.type === 'image'
        ? { id: r.id, type: 'image', src: r.src, indent: r.indent || 0 }
        : { id: r.id, type: r.type, text: r.text || '', done: !!r.done, doneAt: r.done_at || null, indent: r.indent || 0 };
      if (r.type !== 'image' && r.src) b.src = r.src;
      if (r.meta) Object.assign(b, json(r.meta) ?? {});
      (r.area === 'memo' ? d.memo : d.today).push(b as never);
    }
    for (const r of all('SELECT * FROM slot ORDER BY start_min')) days[String(r.date)]?.slots.push({ id: String(r.id), s: Number(r.start_min), e: Number(r.end_min), label: String(r.label || ''), color: (r.color as string) ?? null });
    for (const r of all('SELECT * FROM pomodoro ORDER BY started_at')) days[String(r.date)]?.pomos.push({ s: Number(r.started_at), min: Number(r.minutes) });
    return { ...st, days } as V3State;
  } finally { db.close(); }
}
