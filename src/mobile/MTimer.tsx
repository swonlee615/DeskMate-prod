/**
 * 모바일 집중 타이머 — PC 다이얼(v3.1.244 부채꼴 · 눈금 · 바늘)을 그대로 쓰고, 둘레만 폰에 맞춘다
 *
 * ★ 다이얼 = PC 부품(`Dial`). 카드 폭을 거의 다 쓰게 키운다
 * ★ 가운데 손잡이 → 시각이 적힌 원판. 원판을 눌러도 시작/멈춤 (PC 손잡이와 같은 자리 · 같은 일)
 * ★ 엄지 자리(아래)에 큰 시작 버튼 · 양옆 리셋 · 건너뛰기. 시간 고르기는 한 줄 분절, «직접» 은 시트(− / + 단추)
 * 동작은 전부 ws.timer (사람 하나에 하나 — SYNC §9)
 */
import { useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { PRESETS, usePomoClock } from '../app/usePomodoro';
import { Dial } from '../pc/TimerCard';
import { Sheet } from './parts';

const MIN = 1, MAX = 180;

export function MTimer({ ws }: { ws: Workspace }) {
  const t = ws.timer;
  const live = usePomoClock(t);
  const [custom, setCustom] = useState(false);
  const brk = t.mode !== 'focus';
  const cur = t.cfg.focusMin;
  const isCustom = !PRESETS.includes(cur);
  const act = t.running ? '일시정지' : brk ? '휴식 시작' : '집중 시작';
  const pick = (n: number) => { t.setFocusMin(n); ws.say(`집중 시간을 ${n}분으로 맞췄어요`); };

  return (
    <section className={`m-card m-tm${brk ? ' brk' : ''}${t.running ? ' run' : ''}`} id="m-timer" aria-label="집중 타이머"
      style={{ '--tc': ws.settings.timerColor } as React.CSSProperties}>
      <div className="m-tm-h">
        <span className="m-tm-mode"><i aria-hidden="true" />{t.label}{t.running ? ' 중' : ' 대기'}</span>
        <span>오늘 <b>{ws.day.pomos ?? 0}회</b></span>
      </div>

      <div className="m-tm-dial">
        <Dial total={t.total} remain={live.remain} brk={brk} tc={ws.settings.timerColor}>
          <button className="m-tm-hub" type="button" onClick={t.toggle} aria-label={`${act} — 남은 시간 ${live.clock}`}>
            <b>{live.clock}</b>
            <small>{t.running ? '눌러서 멈춤' : '눌러서 시작'}</small>
          </button>
        </Dial>
      </div>

      <div className="m-tm-pre" role="radiogroup" aria-label="집중 시간">
        {PRESETS.map((n) => (
          <button key={n} role="radio" aria-checked={cur === n} className={cur === n ? 'on' : ''} onClick={() => pick(n)}>{n}<small>분</small></button>
        ))}
        <button role="radio" aria-checked={isCustom} className={isCustom ? 'on' : ''} onClick={() => setCustom(true)}>
          {isCustom ? <>{cur}<small>분</small></> : '직접'}
        </button>
      </div>

      <div className="m-tm-a">
        <button className="m-tm-ic" onClick={t.reset} aria-label="처음부터">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 2-4.5" /><path d="M4 3.5V7h3.5" /></svg>
        </button>
        <button className="m-tm-go" onClick={t.toggle}>
          {t.running
            ? <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="3.5" width="3.6" height="13" rx="1.2" /><rect x="11.4" y="3.5" width="3.6" height="13" rx="1.2" /></svg>
            : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 3.8v12.4c0 .7.8 1.1 1.4.7l9.2-6.2c.5-.4.5-1.1 0-1.5L7.9 3.1c-.6-.4-1.4 0-1.4.7Z" /></svg>}
          {act}
        </button>
        <button className="m-tm-ic" onClick={t.skip} aria-label={brk ? '휴식 건너뛰기' : '다음 휴식으로'}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.6v10.8c0 .6.7 1 1.2.6L12 11c.4-.3.4-1 0-1.3L5.2 4C4.7 3.6 4 4 4 4.6Z" className="f" /><rect x="13.5" y="4" width="2.6" height="12" rx="1" className="f" /></svg>
        </button>
      </div>

      {custom && <CustomSheet start={cur} onClose={() => setCustom(false)} onSave={(n) => { pick(n); setCustom(false); }} />}
    </section>
  );
}

/** 「직접」 — 작은 입력칸 대신 큰 숫자 + − / + (1~180분, v3 와 같은 범위) */
function CustomSheet({ start, onSave, onClose }: { start: number; onSave: (n: number) => void; onClose: () => void }) {
  const [n, setN] = useState(start);
  const step = (d: number) => setN((x) => Math.max(MIN, Math.min(MAX, x + d)));
  return (
    <Sheet title="집중 시간 직접 맞추기" sub={`${MIN}~${MAX}분`} onClose={onClose}>
      <div className="m-step">
        <button onClick={() => step(-5)} disabled={n <= MIN}>−5</button>
        <button onClick={() => step(-1)} disabled={n <= MIN}>−1</button>
        <label className="m-step-n">
          <input inputMode="numeric" aria-label="집중 시간(분)" value={n}
            onChange={(e) => { const v = +e.target.value.replace(/\D/g, ''); setN(Math.min(MAX, v || 0)); }}
            onBlur={() => setN((x) => Math.max(MIN, x))} />
          <small>분</small>
        </label>
        <button onClick={() => step(1)} disabled={n >= MAX}>+1</button>
        <button onClick={() => step(5)} disabled={n >= MAX}>+5</button>
      </div>
      <button className="m-btn go" disabled={n < MIN} onClick={() => onSave(Math.max(MIN, n))}>{n}분으로 맞추기</button>
    </Sheet>
  );
}
