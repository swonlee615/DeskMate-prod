/**
 * 자정을 넘긴 미완결 기록 — 자동 확정하지 않고 묻는다 (v3 pendingBannerHtml · LOGIC §7)
 * 마크업 · 문구는 v3 그대로
 */
import type { Workspace } from '../app/useWorkspace';
import { dayEndMs } from '../domain/attendance/rules';
import { dateOf, hhmm, keyOf } from '../ui/v3fmt';

export function PendBanner({ ws, date, onEdit, more = 0 }: { ws: Workspace; date: string; onEdit: () => void; more?: number }) {
  const d = ws.dayOf(date);
  if (!d.pending) return null;
  const dt = dateOf(date);
  const label = `${dt.getMonth() + 1}/${dt.getDate()}`;
  const nx = new Date(dayEndMs(date));
  const carryTo = `${nx.getMonth() + 1}/${nx.getDate()}`;
  const canCarry = ws.canCarry(date);
  const nextOn = ws.dayOf(keyOf(nx)).onAt;
  return (
    <div className="pend" data-pend={date}>
      <div className="pend-t">⏳ <b>{label}</b> 근무가 마무리되지 않았어요</div>
      <div className="pend-d">퇴근을 누르지 않고 자정을 넘겼어요. 어느 쪽인지 알려주시면 그대로 기록할게요.
        {more > 0 && <em> · 확인할 날이 {more}일 더 있어요</em>}</div>
      <div className="pend-a">
        <button className={`btn ${canCarry ? 'ghost' : 'primary'} sm`} data-pend-do="at" onClick={() => ws.resolvePending(date, 'at')}>
          {hhmm(d.pending.guessOff)}에 퇴근했어요</button>
        {canCarry && (
          <button className="btn primary sm" data-pend-do="carry" onClick={() => ws.resolvePending(date, 'carry')}>
            계속 일했어요 → {carryTo} 00:00으로 이어짐 <em>추천</em></button>
        )}
        <button className="btn ghost sm" data-pend-do="edit" onClick={onEdit}>시각 직접 입력</button>
      </div>
      {!canCarry && nextOn != null && (
        <div className="pend-n">{carryTo}에 이미 <b>{hhmm(nextOn)}</b> 출근 기록이 있어서 이어붙일 수 없어요.
          새벽까지 일하셨다면 <b>시각 직접 입력</b>에서 퇴근 시각을 넣고, {carryTo} 상세에서 출근을 00:00으로 고쳐 주세요.</div>
      )}
    </div>
  );
}
