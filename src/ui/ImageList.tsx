/**
 * 설정 › 데이터 › 이미지 (SYNC §14) — 쓰는 양 · 그림 목록. PC 설정 창 · 폰 설정이 같은 숫자 · 같은 목록을 쓴다 (모양만 따로)
 */
import { useEffect, useState } from 'react';
import type { Workspace } from '../app/useWorkspace';
import { fmtMB, IMG_QUOTA, imgList, imgUsed } from '../domain/images';
import { dateOf, DOW } from './v3fmt';

export function useImageList(ws: Workspace) {
  const list = imgList(ws.images), used = imgUsed(ws.images);
  return { list, used, usedTxt: `${fmtMB(used)} / ${fmtMB(IMG_QUOTA)}`, pct: Math.min(100, (used / IMG_QUOTA) * 100) };
}
export const imgDay = (k: string) => { const d = dateOf(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
export const IMG_HINT = '할 일과 메모에 넣은 그림이에요. 그림 줄을 지우면 다음 날 그림 파일도 지워지고, 그만큼 공간이 돌아와요.';

/** 작은 미리보기 — 목록에 보일 때만 받는다 (기기에 있으면 기기에서) */
export function Thumb({ ws, id, className }: { ws: Workspace; id: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, u: string | null = null;
    ws.imageBlob(id).then((b) => { if (alive && b) { u = URL.createObjectURL(b); setUrl(u); } }, () => undefined);
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id, ws.imageBlob]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={className}>{url && <img src={url} alt="" loading="lazy" />}</span>;
}
