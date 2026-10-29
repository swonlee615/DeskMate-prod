/**
 * 줄 글자 ↔ 화면 (v3 inlineHtml · readInline · inlineSel · inlineMark) — 규칙은 domain/todos/inline
 *
 * ★ 칩 · 링크는 «한 덩어리» — contenteditable="false" 칩, 안쪽에 커서를 두지 않는다
 * ★ 브라우저가 스스로 넣은 <b> · <i> · <u> · <s> 도 서식으로 읽는다 (붙여넣기 등)
 * ★ 커서 자리는 «내용 글자» 로 잰다 — 표시 문자는 0, 칩 · 링크는 토큰 길이 (v3.1.167 · 자는 하나)
 */
import { dateChipLabel, MD_LINK_RE, MEN_RE, mkJoin, mkLen, mkNorm, mkParse, MK_ORDER, MK_TAG, URL_RE, type Part } from '../domain/todos/inline';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const TOK_RE = new RegExp(`(?:${MEN_RE.source})|(?:${MD_LINK_RE.source})|(?:${URL_RE.source})`, 'g');
const unesc = (s: string) => s.replace(/\\(.)/g, '$1');

const NOTION_MARK = '<svg class="mi-n" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8.5 16.5V8.2l7 8.3V8"/></svg>';
const linkHtml = (href: string, label: string) =>
  `<a class="lnk" href="${esc(href)}" data-href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-tip="${esc(`${href}\n눌러서 새 탭에서 엽니다`)}">${esc(label)}</a>`;
const chipHtml = (kind: string, ref: string, label: string, token: string, today: string) =>
  `<span class="men ${kind}" contenteditable="false" data-token="${esc(token)}" data-kind="${kind}" data-ref="${esc(ref)}">${
    kind === 'date' ? '<i class="mi-e">📅</i>' : NOTION_MARK}<span class="mt">${esc(kind === 'date' ? dateChipLabel(ref, label, today) : label)}</span></span>`;

function menHtml(text: string, today: string) {
  const re = new RegExp(TOK_RE.source, 'g');
  let out = '', last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    if (m[2]) out += chipHtml(m[2], m[3], unesc(m[1]), m[0], today);
    else if (m[5]) out += linkHtml(m[5], unesc(m[4]));
    else out += linkHtml(m[0], m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** 텍스트 → HTML (칩은 칩으로, 서식은 태그로) */
export function inlineHtml(text: string, today: string): string {
  return mkParse(text).map((p) => {
    let h = menHtml(p.t, today);
    for (let i = MK_ORDER.length - 1; i >= 0; i--) {
      const k = MK_ORDER[i];
      if (p.m.includes(k)) h = `<${MK_TAG[k]} data-mk="${k}">${h}</${MK_TAG[k]}>`;
    }
    return h;
  }).join('');
}

const MK_FROM_TAG: Record<string, string> = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', CODE: 'c', KBD: 'c' };
/** contenteditable → 텍스트 (칩은 토큰으로, 링크는 글자로, 서식은 표시 문자로) */
export function readInline(el: { childNodes: NodeListOf<ChildNode> | ChildNode[] }): string {
  const parts: Part[] = [];
  const walk = (node: { childNodes: NodeListOf<ChildNode> | ChildNode[] }, m: string) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { parts.push({ t: n.nodeValue ?? '', m }); continue; }
      if (n.nodeType !== 1) continue;
      const e = n as HTMLElement;
      if (e.classList.contains('men')) { parts.push({ t: e.dataset.token ?? '', m }); continue; }
      if (e.classList.contains('lnk')) {
        const href = e.dataset.href || e.getAttribute('href') || '', label = e.textContent ?? '';
        parts.push({ t: label === href ? href : `[${label.replace(/([[\]])/g, '\\$1')}](${href})`, m });
        continue;
      }
      if (e.tagName === 'BR') continue;
      const k = e.dataset.mk || MK_FROM_TAG[e.tagName] || '';
      walk(e, k && !m.includes(k) ? mkNorm(m + k) : m);
    }
  };
  walk(el, '');
  return mkJoin(parts);
}

const fragLen = (f: DocumentFragment) => mkLen(readInline(f));
/** 고른 구간을 «내용 글자» 자리로 */
export function inlineSel(el: HTMLElement): { s: number; e: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const upto = (node: Node, off: number) => {
    const q = document.createRange();
    q.selectNodeContents(el); q.setEnd(node, off);
    return fragLen(q.cloneContents());
  };
  return { s: upto(r.startContainer, r.startOffset), e: upto(r.endContainer, r.endOffset) };
}

/** 내용 자리 [s, e) 를 다시 고른다 — 'end' 는 줄 끝 */
export function inlineMark(el: HTMLElement, s: number | 'end', e: number | 'end' = s) {
  const find = (target: number): [Node, number] | null => {
    let n = 0, res: [Node, number] | null = null;
    const walk = (p: Node) => {
      for (const c of Array.from(p.childNodes)) {
        if (res) return;
        if (c.nodeType === 3) {
          const L = (c.nodeValue ?? '').length;
          if (n + L >= target) { res = [c, target - n]; return; }
          n += L;
        } else if (c.nodeType === 1) {
          const h = c as HTMLElement;
          if (h.classList.contains('men') || h.classList.contains('lnk')) {
            const L = mkLen(readInline({ childNodes: [c] }));
            if (n + L >= target) { res = [c.parentNode!, Array.from(c.parentNode!.childNodes).indexOf(c) + 1]; return; }
            n += L;
          } else if (h.tagName !== 'BR') walk(c);
        }
      }
    };
    walk(el);
    return res;
  };
  el.focus();
  const total = mkLen(readInline(el));
  const a = find(s === 'end' ? total : s), z = find(e === 'end' ? total : e);
  const r = document.createRange();
  // 못 찾으면(빈 줄 · 끝) 줄의 처음 · 끝으로
  if (a) r.setStart(a[0], a[1]); else r.setStart(el, s === 0 ? 0 : el.childNodes.length);
  if (z) r.setEnd(z[0], z[1]); else r.setEnd(el, el.childNodes.length);
  const sl = window.getSelection();
  sl?.removeAllRanges(); sl?.addRange(r);
}
