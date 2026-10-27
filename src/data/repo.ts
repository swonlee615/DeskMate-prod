/**
 * 저장소 계약 — 화면은 이 인터페이스만 안다. 로그인한 사용자 한 명에게 묶인다
 *
 * cloud : Firestore. 노션 방식 — 열어 본 것만 기기에 남고, 오프라인 편집은 쌓였다가 온라인이 되면 올라간다
 * local : Firebase 설정이 없을 때. 이 기기에만 저장한다 (개발용)
 */
import type { AttEvent } from '../domain/attendance/types';
import type { Block, Patch } from '../domain/todos/tree';

export interface SyncStatus {
  mode: 'cloud' | 'local';
  online: boolean;
  /** 아직 서버에 안 올라간 쓰기 수 */
  pending: number;
  /** 지금 보이는 데이터가 서버가 아니라 기기 캐시에서 왔나 */
  fromCache: boolean;
}

export interface DayEvents {
  events: AttEvent[];
  /** 이 날을 이 기기에서 한 번도 불러온 적 없고 지금 오프라인이다 → 「불러올 수 없어요」 */
  unavailable: boolean;
}

/** D-Day · 습관 — 정의 하나 = 문서 하나 (users/{uid}/items/{id}). `kind` 로 가른다 */
export interface Item { id: string; kind: string; deletedAt?: number | null }

export interface Repo {
  readonly mode: 'cloud' | 'local';
  /** 그 날 근태 이벤트 구독 — 다른 기기의 변경도 들어온다 */
  watchDay(date: string, cb: (d: DayEvents) => void): () => void;
  /**
   * 기간 구독 (from ~ to, 양끝 포함, YYYY-MM-DD) — 근태 표 · 캘린더가 쓴다.
   * 노션 방식 그대로 «화면에 보이는 기간» 만 받아 기기에 남긴다
   */
  watchRange(from: string, to: string, cb: (d: DayEvents) => void): () => void;
  /** 이벤트 한 건 쌓기. 오프라인이어도 바로 돌아온다 (서버 반영은 나중에) */
  addEvent(e: AttEvent): void;
  /** 지우기 = 표시만 (deletedAt). 다른 기기에도 «지웠다» 가 전해져야 하므로 */
  deleteEvent(e: AttEvent): void;
  watchSync(cb: (s: SyncStatus) => void): () => void;

  // ── 할 일 · 메모 줄 (블록) — 줄 하나 = 문서 하나 (users/{uid}/blocks/{id})
  /** 기간 구독 — 그 기간에 «적힌» 줄 */
  watchBlocks(from: string, to: string, cb: (d: { blocks: Block[]; unavailable: boolean }) => void): () => void;
  /** 새 줄 */
  addBlock(b: Block): void;
  /** 바뀐 필드만 — 여러 줄을 한 번에 (Tab 으로 덩어리가 움직일 때 등). 한 덩어리로 저장된다 */
  patchBlocks(patches: Patch[]): void;

  // ── D-Day · 습관 — 몇십 개뿐이라 날짜로 나누지 않고 통째로 구독한다
  watchItems(cb: (items: Item[]) => void): () => void;
  addItem(it: Item): void;
  /** 바뀐 필드만. `'done.2026-10-27'` 처럼 점은 맵 안의 필드 하나, 값 null 은 그 필드를 지운다 */
  patchItem(id: string, fields: Record<string, unknown>): void;
  dispose(): void;
}
