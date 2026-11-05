/**
 * 출근 감지 물음 카드 (v3 renderArrivalAsk · v3.2.0) — 오른쪽 아래. 저절로 사라지지 않고 ✕ 도 없다 (답 셋 중 «취소» 가 닫기)
 * ★ 놓친 업무 기록(v3.2.1)이 있으면 같은 카드 위쪽에 한 칸 더 선다
 */
import type { Workspace } from '../app/useWorkspace';
import { fmtDur } from '../ui/v3fmt';

const korClock = (ms: number) => { const t = new Date(ms), h = t.getHours(); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(t.getMinutes()).padStart(2, '0')}`; };
/** 오전 9:00–9:30 (30분) — 오전/오후가 같으면 뒤에서는 뗀다 (v3 missedRange) */
function range(s: number, e: number) {
  const a = new Date(s), b = new Date(e);
  const tail = (a.getHours() < 12) === (b.getHours() < 12) ? `${b.getHours() % 12 || 12}:${String(b.getMinutes()).padStart(2, '0')}` : korClock(e);
  return `${korClock(s)}–${tail} (${fmtDur((e - s) / 60000)})`;
}

export function ArrivalAsk({ ws }: { ws: Workspace }) {
  const { hit: h, missed: m, act, missedAct } = ws.arrival;
  if (!h && !m) return null;
  const resume = h?.mode === 'resume';
  const title = resume ? '업무를 다시 시작하셨나요?' : '업무를 시작하셨나요?';
  return (
    <div id="arrivalAsk" className="resume-ask arrival-ask" role="alertdialog" aria-label={h ? title : '놓친 업무 기록'}>
      {m && <div className="aa-miss"><div className="rz-t">앞서 놓친 업무 기록이 있어요</div>
        <div className="rz-s">{range(m.s, m.e)}</div>
        <div className="rz-a"><button className="btn ghost sm" onClick={() => missedAct('add')}>근무로 추가</button>
          <button className="btn ghost sm" onClick={() => missedAct('drop')}>취소</button></div></div>}
      {h && <div className="aa-ask"><div className="rz-t">{title}</div>
        <div className="rz-s">💻 {h.apps.join(' · ') || '업무 앱'}. <b>{korClock(h.at)}</b>부터 근무 중이에요</div>
        <div className="rz-a"><button className="btn primary sm" onClick={() => act('go')}>{resume ? `${korClock(h.at)}부터 업무 재개` : `${korClock(h.at)}로 출근 기록`}</button>
          <button className="btn ghost sm" onClick={() => act('cancel')}>취소</button>
          <button className="btn ghost sm" onClick={() => act('snooze')}>오늘은 묻지 않기</button></div></div>}
    </div>
  );
}
