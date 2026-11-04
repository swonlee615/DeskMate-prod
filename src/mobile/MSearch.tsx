/**
 * 폰 검색 — PC 검색(pc/Search)과 같은 판정(domain/search). 화면만 폰에 맞게
 * ★ 홈 머리의 돋보기로 연다. 보는 동안만 모든 날의 줄 · 기록을 받는다
 * ★ 종류 칩 한 줄 + 기간 한 줄(빠른 선택만. 직접 지정 달력은 PC 에서)
 * ★ 결과를 누르면 그 날 상세(할 일 · 메모 칸을 골라 연다), 주간 메모 · 날짜 미정은 홈 › 주간
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import type { Block } from '../domain/todos/tree';
import type { Log } from '../domain/attendance/logs';
import { hlParts, inRange, rangeOf, SC_GROUPS, SC_QUICK, searchScan, SEARCH_MIN, SEARCH_TOP, type ScKind, type ScMode, type ScRow } from '../domain/search';
import { dateOf, DOW, fmtDur } from '../ui/v3fmt';

const fm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dl = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const PER: [ScMode, string][] = [['all', '전체'], ...SC_QUICK.map(([k, l]) => [k, l.replace('최근 ', '')] as [ScMode, string])];

export function MSearch({ ws, onJump }: { ws: Workspace; onJump: (r: ScRow) => void }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sub, setSub] = useState<'all' | ScKind>('all');
  const [mode, setMode] = useState<ScMode>('all');
  const [more, setMore] = useState<Partial<Record<ScKind, boolean>>>({});
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const inp = useRef<HTMLInputElement>(null);
  const { watchAllBlocks, watchAllLogs, today } = ws;

  useEffect(() => {
    const a = watchAllBlocks(setBlocks), b = watchAllLogs(setLogs);
    inp.current?.focus();
    return () => { a(); b(); };
  }, [watchAllBlocks, watchAllLogs]);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 120); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setSub('all'); setMore({}); }, [q]);

  const gone = useMemo(() => new Set(ws.trash.map((t) => t.date)), [ws.trash]);
  const res = useMemo(() => {
    if (q.length < SEARCH_MIN || !blocks) return null;
    const raw = searchScan(q, blocks, logs, gone);
    const rg = rangeOf({ mode, from: '', to: '' }, today);
    return { all: rg ? raw.filter((r) => inRange(r, rg)) : raw, rg, dropped: rg ? raw.filter((r) => r.undated).length : 0 };
  }, [q, blocks, logs, gone, mode, today]);
  const cnt = Object.fromEntries(SC_GROUPS.map(([k]) => [k, res?.all.filter((r) => r.k === k).length ?? 0])) as Record<ScKind, number>;
  const kinds: ScKind[] = sub === 'all' ? SC_GROUPS.map((g) => g[0]) : [sub];
  const shown = kinds.reduce((a, k) => a + cnt[k], 0);

  return (
    <div className="m-sc">
      <label className="m-sc-box">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.3" /><path d="m13.1 13.1 3.1 3.1" /></svg>
        <input ref={inp} type="search" enterKeyHint="search" value={text} placeholder="할 일 · 메모 · 시간 기록에서 찾기" aria-label="찾을 말"
          onChange={(e) => setText(e.target.value)} />
        {text && <button type="button" className="m-sc-x" aria-label="지우기" onClick={() => { setText(''); inp.current?.focus(); }}>✕</button>}
      </label>

      {res && <>
        <div className="m-chips wrap m-sc-kinds">
          <button className={sub === 'all' ? 'on' : ''} onClick={() => { setSub('all'); setMore({}); }}>전체 {res.all.length}</button>
          {SC_GROUPS.map(([k, l]) => (
            <button key={k} className={sub === k ? 'on' : ''} disabled={!cnt[k]} onClick={() => { setSub(k); setMore({}); }}>{l} {cnt[k]}</button>
          ))}
        </div>
        <div className="m-seg sm m-sc-per" role="tablist" aria-label="기간">
          {PER.map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => { setMode(k); setMore({}); }}>{l}</button>)}
        </div>
        {res.dropped > 0 && <p className="m-sc-note">날짜 미정 {res.dropped}건은 기간을 고르면 빠져요.</p>}
      </>}

      {!res
        ? <p className="m-sc-empty">할 일, 메모, 시간 기록, 주간 메모를 한 번에 찾아요.
          {text.trim() && <><br /><span>{blocks ? '두 글자부터 찾기 시작해요.' : '기록을 불러오는 중이에요.'}</span></>}</p>
        : !shown
          ? <p className="m-sc-empty">이 조건에는 결과가 없어요.</p>
          : SC_GROUPS.filter(([k]) => kinds.includes(k) && cnt[k]).map(([k, label]) => {
            const rows = res.all.filter((r) => r.k === k);
            const list = more[k] ? rows : rows.slice(0, SEARCH_TOP);
            return (
              <section key={k} className="m-sc-grp">
                <h4>{label} <em>{rows.length}</em></h4>
                <ul className="m-card m-sc-list">
                  {list.map((r) => <Row key={`${r.k}${r.id}`} r={r} q={q} onClick={() => onJump(r)} />)}
                </ul>
                {rows.length > SEARCH_TOP && <button className="m-sc-more" onClick={() => setMore({ ...more, [k]: !more[k] })}>
                  {more[k] ? '접기' : `${rows.length - SEARCH_TOP}건 더 보기`}</button>}
              </section>
            );
          })}
    </div>
  );
}

function Hl({ text, q }: { text: string; q: string }) {
  return <>{hlParts(text, q).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

function Row({ r, q, onClick }: { r: ScRow; q: string; onClick: () => void }) {
  const when = r.undated ? '날짜 미정' : r.k === 'week' ? `${dl(r.key)} 주` : dl(r.key);
  return (
    <li><button className="m-sc-r" onClick={onClick}>
      <span className="m-sc-h">{when}
        {r.crumb && <i>{r.weak ? <Hl text={r.crumb} q={q} /> : r.crumb}</i>}
        {r.s != null && r.e != null && <i>{fm(r.s)} ~ {fm(r.e)} · {fmtDur(r.e - r.s)}</i>}</span>
      <span className={`m-sc-t${r.done ? ' done' : ''}`}><Hl text={r.text} q={q} /></span>
    </button></li>
  );
}
