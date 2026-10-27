/**
 * 가상 동료 — 사이드바 줄 · 오늘 근무 랭킹 (v3 renderSidebar 의 DM 줄 · renderPanel 의 #lb · fitLb)
 * ★ 마크업 · 클래스는 v3 와 같다. 동료의 상태는 ws.mates / ws.ranking (src/domain/sim/team.ts)
 * 아직 안 옮긴 것: 대화방(누르면 DM) · 허들 · 안 읽은 수 · 알림 끄기
 */
import { useLayoutEffect } from 'react';
import type { Workspace } from '../app/useWorkspace';
import type { MateStatus, Member, Presence } from '../domain/sim/team';
import { fmtDur } from '../ui/v3fmt';

/** v3 avatarHtml — 이모지가 있으면 이모지, 없으면 첫 글자 */
export function Avatar({ m, presence }: { m: Pick<Member, 'nick' | 'emoji' | 'color'>; presence?: Presence }) {
  return (
    <span className={`av${presence ? ' haspd' : ''}`}>
      <span className="avi" style={{ backgroundColor: m.color }}>{m.emoji || m.nick.slice(0, 1).toUpperCase()}</span>
      {presence && <span className="pdot" data-p={presence} />}
    </span>
  );
}

/** 상태 옆 말 — 회의 상대가 있으면 붙인다 (v3 stTopic) */
const stTopic = (ws: Workspace, st: MateStatus) => {
  const base = st.topic || st.label;
  const o = st.with ? ws.mates.find((x) => x.m.id === st.with)?.m : null;
  return o ? `${base} · ${o.nick}` : base;
};

export function MateRows({ ws }: { ws: Workspace }) {
  return <>{ws.mates.map(({ m, st }) => {
    const tag = st.remote && !['sick', 'vacation', 'offline'].includes(st.key) ? '🏡' : '';
    return (
      <div key={m.id} className="sb-row" data-mate={m.id} title={`${st.label}${st.topic ? ` · ${stTopic(ws, st)}` : ''}`}>
        <Avatar m={m} presence={st.presence} />
        <span className="nm">{m.nick} <span className="tag">({m.name})</span>
          {(st.emoji || tag) && <span className="st">{tag && st.emoji !== '🏡' ? tag : ''}{st.emoji}</span>}</span>
      </div>
    );
  })}</>;
}

const LB_MIN = 140;
/** 랭킹만 따로 굴린다 — 남은 높이가 3줄(140px)도 안 되면 패널 전체가 굴러간다 (v3.1.246 fitLb) */
function useFitLb() {
  useLayoutEffect(() => {
    const p = document.getElementById('panelTimer'), s = document.getElementById('lbScroll');
    if (!p || !s) return;
    const fit = () => {
      if (!p.clientHeight) return;
      const wasFix = p.classList.contains('lb-fix');
      const top = s.getBoundingClientRect().top - p.getBoundingClientRect().top + (wasFix ? 0 : p.scrollTop);
      const room = Math.floor(p.clientHeight - top - parseFloat(getComputedStyle(p).paddingBottom || '0'));
      const fix = room >= LB_MIN;
      p.classList.toggle('lb-fix', fix);
      s.style.height = fix ? `${room}px` : '';
      if (fix && p.scrollTop) p.scrollTop = 0;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(p);
    for (const c of p.children) if (c !== s) ro.observe(c);
    fit();
    return () => ro.disconnect();
  }, []);
}

export function Ranking({ ws }: { ws: Workspace }) {
  useFitLb();
  const lb = ws.ranking;
  const meIdx = lb.findIndex((r) => r.me);
  const me = lb[meIdx], above = lb[meIdx - 1];
  return (
    <>
      <div className="sec-t">오늘 근무 랭킹</div>
      <div className="lb-scroll" id="lbScroll">
        <div id="lb">
          {lb.map((r) => {
            const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank;
            let pres: Presence, ac: string;
            if (r.me || !r.m) {
              pres = ws.presence === 'active' ? 'active' : ws.presence;
              ac = ws.presence === 'break' ? '휴식 중' : ws.presence === 'active' ? '근무 중' : '오프라인';
            } else {
              const st = ws.mateStatus(r.id);
              pres = st?.presence ?? 'offline';
              ac = st ? (st.emoji ? `${st.emoji} ${stTopic(ws, st)}` : stTopic(ws, st)) : '';
            }
            return (
              <div key={r.id} className={`lb-row${r.me ? ' me' : ''}`}><span className="lb-rank">{medal}</span>
                <Avatar m={r.m ?? { nick: ws.initial, emoji: '', color: '#1264a3' }} presence={pres} />
                <span className="lb-mid"><span className="lb-name">{r.nick}{r.me ? ' (나)' : ''}</span>
                  <span className="lb-ac">{ac}</span></span><span className="lb-time">{fmtDur(r.min)}</span></div>
            );
          })}
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center' }}>
            {lb.length}명 중 <b style={{ color: 'var(--blue)' }}>{me.rank}위</b></div>
        </div>
        <div id="nudge" className="hint" style={{ margin: '8px 0 0', textAlign: 'center' }}>
          {above
            ? <><b style={{ color: 'var(--text)' }}>{Math.max(1, Math.ceil(above.min - me.min) + 1)}분</b> 더 일하면 {above.nick} 님을 제치고 <b style={{ color: 'var(--blue)' }}>{above.rank}위</b></>
            : '🏆 지금 팀에서 가장 오래 일하고 있어요'}
        </div>
      </div>
    </>
  );
}
