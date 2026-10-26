/**
 * 우측 패널 맨 위 «집중 타이머» 카드 (v3 index.html `.timer-card` · renderTimer · renderPresets)
 * 마크업 · id 는 v3 와 같다. 스타일은 v3 styles.css
 */
import { useEffect, useRef, useState } from 'react';
import type { Pomodoro } from '../app/usePomodoro';
import { PRESETS } from '../app/usePomodoro';

const CIRC = 2 * Math.PI * 65; // 408.4 — v3 와 같은 고리

export function TimerCard({ t, onSet }: { t: Pomodoro; onSet: (msg: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const cur = t.cfg.focusMin;
  const custom = !PRESETS.includes(cur);
  const draftN = draft != null ? Math.max(1, Math.min(180, +draft || 0)) : null;

  const pick = (n: number, fromInput = false) => {
    t.setFocusMin(n);
    if (!fromInput) onSet(`집중 시간을 ${n}분으로 맞췄어요`);
  };

  return (
    <div className={`timer-card${draft != null ? ' pre-draft' : ''}`}>
      <div className="ring">
        <svg width="152" height="152" viewBox="0 0 152 152">
          <circle cx="76" cy="76" r="65" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="9" />
          <circle id="ringArc" cx="76" cy="76" r="65" fill="none" strokeWidth="9" strokeLinecap="round"
            strokeDasharray="408.4"
            style={{ strokeDashoffset: CIRC * (1 - (draft != null ? 0 : t.pct)), stroke: t.mode === 'focus' ? '#2bac76' : '#ecb22e' }} />
        </svg>
        <div className="t-time">
          <b id="clock">{draftN != null && draft ? `${String(draftN).padStart(2, '0')}:00` : t.clock}</b>
          <small id="tmode">{draft != null ? '집중 — 입력 중' : `${t.label}${t.running ? ' 중' : ' 대기'}`}</small>
        </div>
      </div>
      <div className="t-actions">
        <button className={`btn${t.running ? '' : ' primary'}`} id="btnStart" onClick={t.toggle}>{t.running ? '일시정지' : '시작'}</button>
        <button className="btn ghost" id="btnSkip" onClick={t.skip}>건너뛰기</button>
        <button className="btn ghost" id="btnReset" onClick={t.reset}>리셋</button>
      </div>
      <div className="presets" id="presets">
        {PRESETS.map((n) => (
          <button key={n} className={`preset${n === cur ? ' on' : ''}`} data-pre={n} onClick={() => pick(n)}>{n}분</button>
        ))}
        {draft == null
          ? <button className={`preset${custom ? ' on' : ''}`} id="preCustom" onClick={() => setDraft(String(cur))}>{custom ? `${cur}분` : '직접'}</button>
          : <CustomInput value={draft} onChange={(v) => {
              setDraft(v);
              const raw = +v;
              setHint(raw > 180 ? '최대 180분까지 맞출 수 있어요' : v && raw < 1 ? '1분보다 짧게는 못 맞춰요' : '');
            }} onClose={(keep) => {
              const n = Math.max(1, Math.min(180, +(draft || 0) || cur));
              setDraft(null); setHint('');
              if (keep && n !== cur) pick(n, true);
            }} />}
      </div>
      {hint && <div className="pre-hint" id="preHint">{hint}</div>}
    </div>
  );
}

/** 「직접」 — 확정하면 칩이 그 값을 들고 있는다 (v3.1.169) */
function CustomInput({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: (keep: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const close = (keep: boolean) => { if (done.current) return; done.current = true; onClose(keep); };
  return (
    <span className="preset on pre-in">
      <input id="preInput" ref={ref} type="number" min={1} max={180} value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); close(true); }
          if (e.key === 'Escape') { e.preventDefault(); close(false); }
        }}
        onBlur={() => close(true)} />
      <em>분</em>
    </span>
  );
}
