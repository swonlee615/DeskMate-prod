/**
 * 우측 패널 맨 위 «집중 타이머» 카드 (v3 index.html `.timer-card` · renderTimer · renderDial · renderPresets)
 * v3.1.244 — 고리 + 글자 버튼 줄 → 다이얼 하나. 가운데 손잡이 = 시작/멈춤, 리셋 · 건너뛰기는 시각 양옆 아이콘
 * 마크업 · id 는 v3 와 같다. 스타일은 v3 styles.css
 */
import { useEffect, useRef, useState } from 'react';
import type { Pomodoro } from '../app/usePomodoro';
import { PRESETS } from '../app/usePomodoro';
import { DIAL, dialFace, dialPt, dialSpan, dialWedge } from './dial';

/** @param onDraft 「직접」 입력 중인지 — v3 는 `#panelTimer.pre-draft` 로 시계 · 다이얼 색을 바꾼다 */
export function TimerCard({ t, onSet, onDraft }: { t: Pomodoro; onSet: (msg: string) => void; onDraft: (on: boolean) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => onDraft(draft != null), [draft != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hint, setHint] = useState('');
  const cur = t.cfg.focusMin;
  const custom = !PRESETS.includes(cur);
  const draftN = draft != null ? Math.max(1, Math.min(180, +draft || 0)) : null;
  // 치는 동안 다이얼도 그 값을 미리 따라간다 (v3 preview)
  const preview = draftN != null && !!draft;

  const pick = (n: number, fromInput = false) => {
    t.setFocusMin(n);
    if (!fromInput) onSet(`집중 시간을 ${n}분으로 맞췄어요`);
  };
  const knob = t.running ? '일시정지' : t.mode === 'focus' ? '집중 시작' : '휴식 시작';

  return (
    <div className="timer-card">
      <Dial total={preview ? draftN * 60 : t.total} remain={preview ? draftN * 60 : t.remain} brk={!preview && t.mode !== 'focus'}>
        <button className="dial-knob" id="btnStart" type="button" aria-label={knob} data-tip={knob} onClick={t.toggle}>
          {t.running ? ICON_PAUSE : ICON_PLAY}
        </button>
      </Dial>
      <div className="dial-row">
        <button className="dial-ic" id="btnReset" type="button" aria-label="리셋" data-tip="리셋" onClick={t.reset}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10a6 6 0 1 0 2-4.5" /><path d="M4 3.5V7h3.5" /></svg>
        </button>
        <div className="t-time">
          <b id="clock">{preview ? `${String(draftN).padStart(2, '0')}:00` : t.clock}</b>
          <small id="tmode">{draft != null ? '집중 — 입력 중' : `${t.label}${t.running ? ' 중' : ' 대기'}`}</small>
        </div>
        <button className="dial-ic" id="btnSkip" type="button" aria-label="건너뛰기" data-tip="건너뛰기" onClick={t.skip}>
          <svg viewBox="0 0 20 20"><path d="M4 4.6v10.8c0 .6.7 1 1.2.6L12 11c.4-.3.4-1 0-1.3L5.2 4C4.7 3.6 4 4 4 4.6Z" fill="currentColor" /><rect x="13.5" y="4" width="2.6" height="12" rx="1" fill="currentColor" /></svg>
        </button>
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

const ICON_PLAY = <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 3.8v12.4c0 .7.8 1.1 1.4.7l9.2-6.2c.5-.4.5-1.1 0-1.5L7.9 3.1c-.6-.4-1.4 0-1.4.7Z" fill="currentColor" /></svg>;
const ICON_PAUSE = <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="3.5" width="3.6" height="13" rx="1.2" fill="currentColor" /><rect x="11.4" y="3.5" width="3.6" height="13" rx="1.2" fill="currentColor" /></svg>;

/** 다이얼 판 — 눈금 · 부채꼴(남은 시간) · 바늘. 색은 `--tc` (타이머 색 설정은 설정 화면을 옮길 때) */
function Dial({ total, remain, brk, children }: { total: number; remain: number; brk: boolean; children: React.ReactNode }) {
  const span = dialSpan(total);
  const left = Math.max(0, Math.min(total, remain)) / 60;
  const face = dialFace(span);
  const { C, R, W } = DIAL;
  const [hx, hy] = dialPt(left, W + 2, span);
  return (
    <div className={`dial${brk ? ' brk' : ''}`} id="dial">
      <svg id="dialSvg" viewBox="0 0 188 188" aria-hidden="true">
        <circle className="dl-face" cx={C} cy={C} r={R} />
        <path className="dl-wedge" id="dialWedge" d={dialWedge(left, span)} />
        {face.dots.map(([x, y], i) => <circle key={`d${i}`} className="dl-dot" cx={x} cy={y} r=".9" />)}
        {face.ticks.map(([x1, y1, x2, y2], i) => <line key={`t${i}`} className="dl-tick" x1={x1} y1={y1} x2={x2} y2={y2} />)}
        {face.nums.map(([m, x, y]) => <text key={`n${m}`} className="dl-num" x={x} y={y}>{m}</text>)}
        <line className="dl-hand" id="dialHand" x1={C} y1={C} x2={hx} y2={hy} />
      </svg>
      {children}
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
