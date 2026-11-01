/**
 * 프로필 · 로고 그림 (v3 avatarHtml · applyWsBadge) — 색 바탕 위에 그림. 그림이 있으면 글자는 안 쓴다
 * `background:` 축약형을 쓰지 않는다 — 스타일시트의 background-size: cover 가 풀린다 (v3 주석)
 */
export const avStyle = (color: string, img?: string | null): React.CSSProperties =>
  img ? { backgroundColor: color, backgroundImage: `url("${img}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: color };
export const avText = (label: string, img?: string | null) => (img ? '' : label);
