/**
 * 줄 우클릭 메뉴 · 휴지통 (v3 openRowMenu · renderTrash) — 마크업 · 클래스는 v3 와 같다
 * ★ 휴지통에는 «하루 통째 삭제» 만 들어간다. 줄 ✕ · 시간 기록 삭제는 되돌리기 알림으로 끝 (SYNC §14)
 */
import { useLayoutEffect, useRef } from 'react';
import { daysLeft, type Workspace } from '../app/useWorkspace';

export function RowMenu({ x, y, can, onOpen, onDelete, onClose }: {
  x: number; y: number; can: boolean; onOpen: () => void; onDelete: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    const off = (e: MouseEvent) => { if (!el.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', off), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', off); };
  }, [x, y, onClose]);
  return (
    <div ref={ref} id="rowMenu" className="row-menu" style={{ left: x, top: y }}>
      <button onClick={() => { onClose(); onOpen(); }}>상세 열기</button>
      <button className="danger" disabled={!can} onClick={() => { onClose(); onDelete(); }}>이 날 기록 삭제</button>
    </div>
  );
}

export function TrashView({ ws, hidden }: { ws: Workspace; hidden: boolean }) {
  return (
    <div className={`view${hidden ? '' : ' on'}`} id="view-trash">
      <div className="dash" id="trash">
        <div className="wl-head"><h2>🗑 휴지통</h2><div className="hspace" style={{ flex: 1 }} />
          {ws.trash.length > 0 && <button className="btn ghost sm" id="trashEmpty" onClick={ws.emptyTrash}>비우기</button>}</div>
        <p className="hint">지운 하루 기록은 30일 동안 여기 남고, 그 뒤에 사라져요.</p>
        {!ws.trash.length
          ? <div className="empty-state">휴지통이 비어 있어요.</div>
          : ws.trash.map((t) => (
            <div key={t.id} className="tr-item">
              <span className="ic">📄</span>
              <span className="in"><b>{t.label}</b><span>{t.date} · 하루 · {daysLeft(t.at)}일 뒤 삭제</span></span>
              <button className="btn ghost sm" onClick={() => ws.restoreTrash(t.id)}>복원</button>
              <button className="btn ghost sm" onClick={() => ws.purgeTrash(t.id)}>영구 삭제</button>
            </div>
          ))}
      </div>
    </div>
  );
}
