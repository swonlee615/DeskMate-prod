/**
 * 저장소 계약 — 화면은 이 인터페이스만 안다. 로그인한 사용자 한 명에게 묶인다
 *
 * cloud : Firestore. 노션 방식 — 열어 본 것만 기기에 남고, 오프라인 편집은 쌓였다가 온라인이 되면 올라간다
 * local : Firebase 설정이 없을 때. 이 기기에만 저장한다 (개발용)
 */
import type { AppCells, AppDoc } from '../domain/appUse';
import type { AttEvent } from '../domain/attendance/types';
import type { Block, Patch } from '../domain/todos/tree';
import type { Log } from '../domain/attendance/logs';

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
  /** 첫 기록 날짜 (지우지 않은 이벤트 중 가장 이른 날) — 활동 «미근무» 가 그 날부터 센다 (v3.1.242). 없으면 null */
  firstDate(): Promise<string | null>;
  /** 그 기간의 이벤트를 한 번 읽는다 (구독 아님) — v3 가져오기가 «이미 있던 웹 기록» 을 알아야 할 때 */
  eventsIn(from: string, to: string): Promise<AttEvent[]>;
  /** 이벤트 한 건 쌓기. 오프라인이어도 바로 돌아온다 (서버 반영은 나중에) */
  addEvent(e: AttEvent): void;
  /** 지우기 = 표시만 (deletedAt). 다른 기기에도 «지웠다» 가 전해져야 하므로 */
  deleteEvent(e: AttEvent): void;
  /** 지움 표시를 걷는다 — 휴지통에서 하루를 되살릴 때 */
  restoreEvent(e: AttEvent): void;
  watchSync(cb: (s: SyncStatus) => void): () => void;

  // ── 할 일 · 메모 줄 (블록) — 줄 하나 = 문서 하나 (users/{uid}/blocks/{id})
  /** 기간 구독 — 그 기간에 «적힌» 줄 */
  watchBlocks(from: string, to: string, cb: (d: { blocks: Block[]; unavailable: boolean }) => void): () => void;
  /** 새 줄 */
  addBlock(b: Block): void;
  /** 바뀐 필드만 — 여러 줄을 한 번에 (Tab 으로 덩어리가 움직일 때 등). 한 덩어리로 저장된다 */
  patchBlocks(patches: Patch[]): void;

  // ── 시간 기록 · 근무 밖 휴게 — 기록 하나 = 문서 하나 (users/{uid}/logs/{id}). 블록처럼 보이는 기간만 받는다
  watchLogs(from: string, to: string, cb: (logs: Log[]) => void): () => void;
  addLog(l: Log): void;
  /** 바뀐 필드만 */
  patchLog(id: string, fields: Partial<Log>): void;

  // ── 앱 사용 기록 — 하루 × PC 마다 문서 하나 (users/{uid}/apps/{date}_{device}) · domain/appUse
  watchApps(from: string, to: string, cb: (docs: AppDoc[]) => void): () => void;
  /** 이 PC 의 그날 문서에 칸 몇 개를 덮어쓴다 (다른 칸 · 다른 PC 는 그대로) */
  putAppCells(date: string, device: string, cells: AppCells): void;

  // ── D-Day · 습관 — 몇십 개뿐이라 날짜로 나누지 않고 통째로 구독한다
  watchItems(cb: (items: Item[]) => void): () => void;
  addItem(it: Item): void;
  /** 바뀐 필드만. `'done.2026-10-27'` 처럼 점은 맵 안의 필드 하나, 값 null 은 그 필드를 지운다 */
  patchItem(id: string, fields: Record<string, unknown>): void;
  /** 그림 한 장 올리기 — 바이트 그대로 (SYNC §14). 줄과 따로 사는 문서 */
  putImage(id: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** 그림 받기 — 기기에 있으면 기기에서 (그림은 안 바뀐다). 없으면 null */
  getImage(id: string): Promise<Blob | null>;
  /** 원본 보관 — 옮기기 전 파일을 조각째 그대로 (`archive/{id}`). 웹에 아직 없는 기능의 데이터를 잃지 않게 */
  putArchive(id: string, bytes: Uint8Array, info: Record<string, unknown>): Promise<void>;
  /**
   * 많은 문서를 한꺼번에 (v3 가져오기) — 400개씩 묶어 쓰고, 서버가 받을 때까지 기다린다.
   * 한 건씩 쓰면 쓰기마다 구독이 다시 돌아 화면이 얼어붙는다 (2026-11-10)
   */
  putMany(col: 'events' | 'blocks' | 'logs', docs: { id: string }[]): Promise<void>;
  /** 그림 파일을 실제로 지운다 — 지우기 규칙의 유일한 예외 (SYNC §14) */
  deleteImage(id: string): Promise<void>;
  /** 있으면 합치고 없으면 만든다 — 맵 안은 깊게 합친다 (덮어쓰지 않는다). 아직 받아 오지 못한 문서에도 안전하다 */
  mergeItem(it: Item): void;
  dispose(): void;
}
