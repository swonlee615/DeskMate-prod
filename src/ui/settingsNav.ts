/**
 * 설정 칸 목록 (v3 #settings `.set-nav`) — PC 설정 창 · 폰 설정 탭이 같은 목록을 쓴다
 * on = 웹에 옮긴 칸. 나머지는 자리만 v3 그대로 «준비 중»
 */
export interface SetNav { k: string; ni: string; nm: string; on?: boolean; sep?: boolean }

export const SET_NAV: SetNav[] = [
  { k: 'general', ni: '⚙️', nm: '일반' },
  { k: 'ws', ni: '🏢', nm: '워크스페이스' },
  { k: 'members', ni: '👥', nm: '멤버 설정' },
  { k: 'pomo', ni: '🍅', nm: '뽀모도로' },
  { k: 'slot', ni: '⏱️', nm: '시간 기록', on: true },
  { k: 'away', ni: '💻', nm: '자리비움 · 업무 앱' },
  { k: 'data', ni: '🗄', nm: '데이터' },
  { k: 'plugin', ni: '🧩', nm: '플러그인' },
  { k: 'sec', ni: '🛡', nm: '시스템 알림', sep: true },
];

export const SLOT_HINT = '시간 기록에 쓰는 색마다 이름을 붙이면 카테고리가 됩니다. 이름이 있으면 일간 상세에서 색 대신 그 이름으로 보이고, 비워 두면 색으로만 구분해요. 기록에는 색만 남기 때문에 이름을 바꿔도 지난 기록이 그대로 따라옵니다.';
