/**
 * 설정 (v3 #settings · `.set-modal`) — 옮긴 칸만 연다. 나머지는 레일처럼 «준비 중»
 * 지금 옮긴 것: 시간 기록 (카테고리)
 */
import { useEffect, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { catVar, SLOT_COLORS } from '../domain/attendance/logs';
import { CAT_EX, nextCatColor, type Cat } from '../domain/attendance/cats';

const NAV: { k: string; ni: string; nm: string; on?: boolean }[] = [
  { k: 'general', ni: '⚙️', nm: '일반' },
  { k: 'ws', ni: '🏢', nm: '워크스페이스' },
  { k: 'members', ni: '👥', nm: '멤버 설정' },
  { k: 'pomo', ni: '🍅', nm: '뽀모도로' },
  { k: 'slot', ni: '⏱️', nm: '시간 기록', on: true },
  { k: 'away', ni: '💻', nm: '자리비움 · 업무 앱' },
  { k: 'data', ni: '🗄', nm: '데이터' },
  { k: 'plugin', ni: '🧩', nm: '플러그인' },
];

export function SettingsModal({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg open" id="settings" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal set-modal">
        <div className="set-wrap">
          <nav className="set-nav">
            <div className="set-nav-t">설정</div>
            {NAV.map((n) => (
              <button key={n.k} className={`set-nav-i${n.on ? ' on' : ' soon'}`} data-set-nav={n.k} aria-disabled={!n.on}
                onClick={() => { if (!n.on) ws.say(`${n.nm} 설정은 준비 중이에요`); }}>
                <span className="ni">{n.ni}</span><span className="nm">{n.nm}</span></button>
            ))}
          </nav>
          <div className="modal-body set-body">
            <section className="set-panel on" data-set-panel="slot">
              <h4>시간 기록 카테고리</h4>
              <p className="hint">시간 기록에 쓰는 <b>색마다 이름을 붙이면 카테고리</b>가 됩니다.
                이름이 있으면 일간 상세에서 색 대신 그 이름으로 보이고, 비워 두면 색으로만 구분해요.<br />
                기록에는 색만 남기 때문에 이름을 바꿔도 지난 기록이 그대로 따라옵니다.</p>
              <CatList ws={ws} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** v3 renderCatSetup — 색(프리셋에서) · 이름 · 지우기 · 추가. 이름은 칸을 떠날 때 저장 */
function CatList({ ws }: { ws: Workspace }) {
  const list = ws.cats;
  const [pop, setPop] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pop) return;
    const away = (e: MouseEvent) => { if (!(e.target as Element).closest('.cat-pop')) setPop(null); };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    return () => document.removeEventListener('mousedown', away);
  }, [pop]);
  const put = (i: number, c: Partial<Cat>) => list.map((x, j) => (j === i ? { ...x, ...c } : x));
  return (
    <div id="catList" className="cat-list">
      {list.map((c, i) => (
        <div className="cat-row" key={c.color}>
          <button className="cat-sw" type="button" style={{ '--c': catVar(c.color) } as React.CSSProperties} title="색 고르기"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPop({ i, x: r.left, y: r.bottom + 6 }); }} />
          <input data-f="name" maxLength={14} placeholder={`예) ${CAT_EX[i % CAT_EX.length]}`} defaultValue={c.name}
            onBlur={(e) => { if (e.target.value.trim() !== c.name) ws.setCats(put(i, { name: e.target.value })); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />
          <button className="imgbtn danger" title="이 카테고리 삭제" onClick={() => ws.setCats(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="cat-foot">
        <button className="btn ghost sm" id="catSetAdd" onClick={() => ws.setCats([...list, { color: nextCatColor(list), name: '' }])}>＋ 카테고리 추가</button>
        <span className="hint2">카테고리를 지워도, 그 색을 쓰던 지난 기록은 색 그대로 남아요</span>
      </div>
      {pop && (
        <div className="cat-pop" style={{ position: 'fixed', left: Math.min(pop.x, window.innerWidth - 200), top: pop.y }}>
          {/* 다른 카테고리가 쓰는 색은 못 고른다 — 고르면 두 카테고리가 하나로 합쳐진다 */}
          {SLOT_COLORS.map((col) => {
            const mine = col === list[pop.i].color;
            const taken = !mine && list.some((x) => x.color === col);
            return (
              <button key={col} type="button" className={mine ? 'on' : ''} disabled={taken} style={{ '--c': catVar(col), opacity: taken ? 0.25 : undefined } as React.CSSProperties}
                onClick={() => { setPop(null); if (!mine) ws.setCats(put(pop.i, { color: col }), [list[pop.i].color, col]); }} />
            );
          })}
        </div>
      )}
    </div>
  );
}
