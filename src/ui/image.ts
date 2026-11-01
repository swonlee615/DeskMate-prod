/**
 * 그림을 올리기 전에 기기에서 줄인다 (SYNC §14) — 긴 변 1200px · WebP(안 되면 JPEG) · 700KB 넘으면 화질 · 크기를 낮춰 다시
 */
import { IMG_EDGE, IMG_MAX } from '../domain/images';

export interface Shrunk { bytes: Uint8Array; mime: string; w: number; h: number }

export async function shrinkImage(file: Blob): Promise<Shrunk | null> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { return null; }   // 그림이 아닌 파일
  const webp = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  const mime = webp ? 'image/webp' : 'image/jpeg';
  let scale = Math.min(1, IMG_EDGE / Math.max(bmp.width, bmp.height));
  for (let tries = 0; tries < 8; tries++) {
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    if (!webp) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }   // color-ok: JPEG 는 투명이 없어 흰 바탕을 깐다 (화면 색이 아니다)
    g.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58]) {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, mime, q));
      if (blob && blob.size <= IMG_MAX) { bmp.close(); return { bytes: new Uint8Array(await blob.arrayBuffer()), mime, w, h }; }
    }
    scale *= 0.8;
  }
  bmp.close();
  return null;
}
