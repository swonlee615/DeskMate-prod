/**
 * 검색 (v3 #view-search · renderSearch · openScRange) — PC 와 같은 판정(domain/search)
 * ★ 이 화면을 보는 동안만 모든 날의 줄 · 기록을 받는다
 * ★ 1층 = 전체 + 기간 버튼(다른 축이라 오른쪽 끝의 조용한 글자), 2층 = 할 일 / 메모 / 시간 기록 / 주간 메모
 *   v3 1층의 «근태 / 나와의 대화» 는 대화가 웹에 없어 «전체» 하나만 남는다
 * ★ 건수는 기간을 적용한 뒤의 수 · 날짜 미정은 기간이 걸리면 빠지므로 메타 줄에 밝힌다
 * ★ 두 글자부터 · 120ms 모아서 한 번에
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import type { Block } from '../domain/todos/tree';
import type { Log } from '../domain/attendance/logs';
import {
  daysBetween, dateOk, hlParts, inRange, rangeLabel, rangeOf, SC_GROUPS, SC_QUICK, searchScan, SEARCH_MIN, SEARCH_TOP,
  type ScKind, type ScRange, type ScRow,
} from '../domain/search';
import { addDays, dateOf, DOW, fmtDur, keyOf } from '../ui/v3fmt';
import { CHEV } from './Worklog';

const SI = <svg viewBox="0 0 20 20" className="si"><circle cx="9" cy="9" r="5.3" /><path d="m13.1 13.1 3.1 3.1" /></svg>;
const TAG: Record<ScKind, string> = { todo: '할 일', memo: '메모', slot: '시간 기록', week: '주간 메모' };
const fm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function SearchView({ ws, hidden, onJump }: { ws: Workspace; hidden: boolean; onJump: (r: ScRow) => void }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sub, setSub] = useState<'all' | ScKind>('all');
  const [more, setMore] = useState<Partial<Record<ScKind, boolean>>>({});
  const [range, setRange] = useState<ScRange>({ mode: 'all', from: '', to: '' });
  const [rp, setRp] = useState<DOMRect | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const inp = useRef<HTMLInputElement>(null);
  const { watchAllBlocks, watchAllLogs, today } = ws;

  useEffect(() => {
    if (hidden) return;
    const a = watchAllBlocks(setBlocks), b = watchAllLogs(setLogs);
    setTimeout(() => inp.current?.focus(), 40);
    return () => { a(); b(); };
  }, [hidden, watchAllBlocks, watchAllLogs]);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 120); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setSub('all'); setMore({}); }, [q]);

  const gone = useMemo(() => new Set(ws.trash.map((t) => t.date)), [ws.trash]);
  const res = useMemo(() => {
    if (q.length < SEARCH_MIN || !blocks) return null;
    const t0 = performance.now();
    const raw = searchScan(q, blocks, logs, gone);
    const rg = rangeOf(range, today);
    const all = rg ? raw.filter((r) => inRange(r, rg)) : raw;
    const dropped = rg ? raw.filter((r) => r.undated).length : 0;
    const oldest = raw.reduce((a, r) => (r.undated || (a && a <= r.key) ? a : r.key), '');
    return { all, rg, dropped, oldest, ms: Math.max(1, Math.round(performance.now() - t0)) };
  }, [q, blocks, logs, gone, range, today]);
  // 「좁혔는데 왜 결과가 없지」 — 그 기간에 기록이 있는 날 수
  const daysWith = (from: string, to: string) => {
    const s = new Set<string>();
    for (const b of blocks ?? []) if (!b.deletedAt && b.area !== 'someday' && b.date >= from && b.date <= to) s.add(b.date);
    for (const l of logs) if (!l.deletedAt && l.date >= from && l.date <= to) s.add(l.date);
    for (const [k, d] of Object.entries(ws.days)) if (d.onAt != null && k >= from && k <= to) s.add(k);
    return s.size;
  };

  const cnt = Object.fromEntries(SC_GROUPS.map(([k]) => [k, res?.all.filter((r) => r.k === k).length ?? 0])) as Record<ScKind, number>;
  const kinds: ScKind[] = sub === 'all' ? SC_GROUPS.map((g) => g[0]) : [sub];
  const shown = kinds.reduce((a, k) => a + cnt[k], 0);

  return (
    <div className={`view${hidden ? '' : ' on'}`} id="view-search">
      <div className="dash">
        <div className="search-box">{SI}
          <input id="searchInput" ref={inp} value={text} placeholder="할 일 · 메모 · 시간 기록 · 주간 메모에서 찾기"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && text) { e.stopPropagation(); setText(''); } }} />
          {text && <button className="sc-x" id="searchClear" aria-label="지우기" onClick={() => { setText(''); inp.current?.focus(); }}>✕</button>}
        </div>
        {res && <>
          <div className="sc-tabs" id="searchTabs">
            <button className="sc-tab on">전체<span className="n">{res.all.length}</span></button>
            <button className={`sc-per${res.rg ? ' on' : ''}`} id="scPer" onClick={(e) => setRp(rp ? null : e.currentTarget.getBoundingClientRect())}>
              기간 <b>{rangeLabel(range, today)}</b> ▾</button>
          </div>
          <div className="sc-sub" id="searchSub">
            <button className={`sc-sbt${sub === 'all' ? ' on' : ''}`} onClick={() => { setSub('all'); setMore({}); }}>전체</button>
            {SC_GROUPS.map(([k, l]) => (
              <button key={k} className={`sc-sbt${sub === k ? ' on' : ''}`} disabled={!cnt[k]} onClick={() => { setSub(k); setMore({}); }}>
                {l}<span className="n">{cnt[k]}</span></button>
            ))}
          </div>
          <div className="sc-meta" id="searchMeta">
            <span>{shown}건</span><span className="dot">·</span>
            <span>{res.rg ? `${res.rg.from} ~ ${res.rg.to}` : res.oldest ? `전체 기간 (${res.oldest} ~ 오늘)` : '전체 기간'}</span>
            {res.dropped > 0 && <><span className="dot">·</span><span className="off">날짜 미정 {res.dropped}건 제외</span></>}
            <span className="ms">검색 {res.ms}ms</span>
          </div>
        </>}
        <div id="searchResult">
          {!res
            ? <div className="empty-state">할 일, 메모, 시간 기록, 주간 메모를 한 번에 찾아요.
              {text.trim() && <><br /><span style={{ color: 'var(--text-dim)' }}>{blocks ? '두 글자부터 찾기 시작해요.' : '기록을 불러오는 중이에요.'}</span></>}</div>
            : !shown
              ? <div className="empty-state">이 조건에는 결과가 없어요.
                {res.rg && <><br /><span className="sc-note">{res.rg.from} ~ {res.rg.to} 중 기록이 있는 날은 {daysWith(res.rg.from, res.rg.to)}일이에요.</span></>}</div>
              : SC_GROUPS.filter(([k]) => kinds.includes(k) && cnt[k]).map(([k, label, ic]) => {
                const rows = res.all.filter((r) => r.k === k);
                const list = more[k] ? rows : rows.slice(0, SEARCH_TOP);
                return (
                  <div key={k} className="sc-grp">
                    <div className="sc-gh"><span>{ic}</span><span>{label}</span><span className="cnt">{rows.length}</span>
                      {rows.length > SEARCH_TOP && <button className="more" onClick={() => setMore({ ...more, [k]: !more[k] })}>
                        {more[k] ? '접기 ▴' : `더보기 ${rows.length - SEARCH_TOP}건 ▾`}</button>}</div>
                    {list.map((r) => <SrRow key={`${r.k}${r.id}`} r={r} q={q} onClick={() => onJump(r)} />)}
                  </div>
                );
              })}
        </div>
      </div>
      {rp && <RangePop at={rp} cur={range} today={today} daysWith={daysWith}
        onApply={(r) => { setRange(r); setMore({}); setRp(null); }} onClose={() => setRp(null)} />}
    </div>
  );
}

function Hl({ text, q }: { text: string; q: string }) {
  return <>{hlParts(text, q).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

function SrRow({ r, q, onClick }: { r: ScRow; q: string; onClick: () => void }) {
  const label = r.undated ? '날짜 미정' : r.k === 'week' ? `${r.key} 주` : r.key;
  return (
    <div className="sr" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}>
      <div className="h1"><span className="tag">{TAG[r.k]}</span><b>{label}</b>
        {r.crumb && <span className="crumb">{r.weak ? <Hl text={r.crumb} q={q} /> : r.crumb}<i>›</i></span>}
        {r.s != null && r.e != null && <><span>{fm(r.s)} ~ {fm(r.e)}</span><span className="dur">{fmtDur(r.e - r.s)}</span></>}
        {r.done && <span className="dn">✓</span>}</div>
      <div className={`b1${r.done ? ' done' : ''}`}><Hl text={r.text} q={q} /></div>
    </div>
  );
}

/**
 * 기간 고르기 (v3.1.13) — 빠른 선택은 두 칸을 «채우기만» 한다. 확정은 «적용» 한 곳에서만
 * 달력은 두 번 눌러 시작 · 끝. 시작 > 끝이면 조용히 뒤집는다. Esc 닫기 · Enter 적용
 */
function RangePop({ at, cur, today, daysWith, onApply, onClose }: {
  at: DOMRect; cur: ScRange; today: string; daysWith: (a: string, b: string) => number;
  onApply: (r: ScRange) => void; onClose: () => void;
}) {
  const rg0 = rangeOf(cur, today);
  const [mode, setMode] = useState(cur.mode);
  const [from, setFrom] = useState(rg0?.from ?? '');
  const [to, setTo] = useState(rg0?.to ?? '');
  const [next, setNext] = useState<'from' | 'to'>('from');
  const [ym, setYm] = useState(() => { const d = dateOf(rg0?.to ?? today); return { y: d.getFullYear(), m: d.getMonth() }; });
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.right - 280, top: at.bottom + 6 });
  const lo = from && to ? (from > to ? to : from) : '', hi = from && to ? (from > to ? from : to) : '';
  const apply = () => {
    if (mode === 'custom' && !(from && to)) return;   // 한쪽만 찍힌 상태로는 못 적용한다
    onApply({ mode, from: lo, to: hi });
  };
  useEffect(() => {
    const b = box.current;
    if (b) {
      const w = b.offsetWidth, h = b.offsetHeight;
      setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, at.right - w)), top: at.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, at.top - h - 6) : at.bottom + 6 });
    }
    const away = (e: MouseEvent) => { if (!(e.target as Element).closest('.rp, #scPer')) onClose(); };
    document.addEventListener('mousedown', away, true);
    return () => document.removeEventListener('mousedown', away, true);
  }, [at, onClose]);
  const quick = (m: typeof mode) => {
    setMode(m);
    const r = rangeOf({ mode: m, from, to }, today);
    if (r) { setFrom(r.from); setTo(r.to); setNext('from'); const d = dateOf(r.to); setYm({ y: d.getFullYear(), m: d.getMonth() }); }
  };
  // 칸에 친 글자 — 값이 실제로 달라졌을 때만 «직접 지정» 으로
  const type = (which: 'from' | 'to', v: string) => {
    const s = v.trim();
    if (s === (which === 'from' ? from : to)) return;
    if (s && !dateOk(s)) return;
    (which === 'from' ? setFrom : setTo)(s); setMode('custom');
  };
  const pick = (k: string) => {
    setMode('custom');
    if (next === 'from') { setFrom(k); setTo(''); setNext('to'); } else { setTo(k); setNext('from'); }
  };
  const first = new Date(ym.y, ym.m, 1);
  const start = addDays(first, -first.getDay());
  return (
    <div ref={box} className="rp" style={{ position: 'fixed', left: pos.left, top: pos.top }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } if (e.key === 'Enter') { e.preventDefault(); apply(); } }}>
      <div className="rp-qs">
        {SC_QUICK.map(([k, l]) => <button key={k} type="button" className={`rp-q${mode === k ? ' on' : ''}`} onClick={() => quick(k)}>{l}</button>)}
        <button type="button" className={`rp-q${mode === 'custom' ? ' on' : ''}`} onClick={() => { setMode('custom'); setNext('from'); }}>직접 지정</button>
      </div>
      <div className="rp-in2">
        <input key={`f${from}`} className={`rp-i${next === 'from' ? ' on' : ''}`} defaultValue={from} placeholder="시작" aria-label="시작 날짜"
          onFocus={() => setNext('from')} onBlur={(e) => type('from', e.target.value)} />
        <span>–</span>
        <input key={`t${to}`} className={`rp-i${next === 'to' ? ' on' : ''}`} defaultValue={to} placeholder="끝" aria-label="끝 날짜"
          onFocus={() => setNext('to')} onBlur={(e) => type('to', e.target.value)} />
      </div>
      <div className="dpk-h">
        <button type="button" className="dpk-nav" aria-label="이전 달" onClick={() => setYm(ym.m ? { y: ym.y, m: ym.m - 1 } : { y: ym.y - 1, m: 11 })}>{CHEV(-1)}</button>
        <b>{ym.y}년 {ym.m + 1}월</b>
        <button type="button" className="dpk-nav" aria-label="다음 달" onClick={() => setYm(ym.m < 11 ? { y: ym.y, m: ym.m + 1 } : { y: ym.y + 1, m: 0 })}>{CHEV(1)}</button>
      </div>
      <div className="dpk-w">{DOW.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="dpk-g">
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i), k = keyOf(d);
          const cls = ['dpk-d', d.getMonth() === ym.m ? '' : 'out', k === from || k === to ? 'on' : '', lo && k > lo && k < hi ? 'rp-in' : '', k === today ? 'today' : ''].filter(Boolean).join(' ');
          return <button key={k} type="button" className={cls} onClick={() => pick(k)}>{d.getDate()}</button>;
        })}
      </div>
      <div className="rp-f">
        <span>{lo ? `${daysBetween(lo, hi)}일 · 기록 있는 날 ${daysWith(lo, hi)}일` : '기간을 고르거나 날짜를 두 번 누르세요'}</span>
        <button type="button" className="rp-x" onClick={() => onApply({ mode: 'all', from: '', to: '' })}>삭제</button>
        <button type="button" className="rp-ok" onClick={apply}>적용</button>
      </div>
    </div>
  );
}
