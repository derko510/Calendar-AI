// Safe link detection. Only http(s) URLs ever become links; everything else stays text.

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?*'"\]}>]+$/;

export const safeHref = (url) => {
  if (!url) return null;
  let value = String(url).trim();
  if (/^www\./i.test(value)) value = `https://${value}`;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};

// Trim punctuation that is almost never part of a URL, and a ")" with no matching "(".
const cleanMatch = (raw) => {
  let url = raw.replace(TRAILING, '');
  while (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
    url = url.slice(0, -1).replace(TRAILING, '');
  }
  return url;
};

/** Split plain text into [{ type: 'text', value } | { type: 'link', value, href }]. */
export const splitLinks = (text) => {
  const str = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of str.matchAll(URL_RE)) {
    const value = cleanMatch(match[0]);
    const href = safeHref(value);
    if (!href) continue;
    if (match.index > last) parts.push({ type: 'text', value: str.slice(last, match.index) });
    parts.push({ type: 'link', value, href });
    last = match.index + value.length;
  }
  if (last < str.length) parts.push({ type: 'text', value: str.slice(last) });
  return parts;
};

export const findUrls = (text) =>
  text ? toLinkSegments(text).filter(s => s.type === 'link').map(s => s.href) : [];

const looksLikeHtml = (text) => /<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(String(text || ''));

const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE']);

/**
 * Google Calendar descriptions are often HTML. Read it with DOMParser (which never runs scripts),
 * keep only text, line breaks and http(s) anchors, and never inject the HTML itself.
 */
export const htmlToSegments = (html) => {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const segments = [];
  const push = (seg) => {
    const prev = segments[segments.length - 1];
    if (seg.type === 'text' && prev?.type === 'text') prev.value += seg.value;
    else segments.push(seg);
  };
  const walk = (node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        push({ type: 'text', value: child.textContent.replace(/\s+/g, ' ') });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') return;
        if (tag === 'BR') { push({ type: 'text', value: '\n' }); return; }
        if (tag === 'LI') push({ type: 'text', value: '• ' });
        if (tag === 'A') {
          const href = safeHref(child.getAttribute('href'));
          const label = child.textContent.trim();
          if (href) { push({ type: 'link', value: label || href, href }); return; }
        }
        walk(child);
        if (BLOCK.has(tag)) push({ type: 'text', value: '\n' });
      }
    });
  };
  walk(doc.body);
  // Collapse runs of blank lines and trim
  const cleaned = segments.map(s => (s.type === 'text' ? { ...s, value: s.value.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n') } : s));
  if (cleaned[0]?.type === 'text') cleaned[0].value = cleaned[0].value.replace(/^\s+/, '');
  const lastSeg = cleaned[cleaned.length - 1];
  if (lastSeg?.type === 'text') lastSeg.value = lastSeg.value.replace(/\s+$/, '');
  return cleaned.filter(s => s.type === 'link' || s.value);
};

/** Text or HTML -> segments with every http(s) URL turned into a link segment. */
export const toLinkSegments = (text) => {
  const base = looksLikeHtml(text) ? htmlToSegments(text) : [{ type: 'text', value: String(text ?? '') }];
  return base.flatMap(seg => (seg.type === 'text' ? splitLinks(seg.value) : [seg]));
};

/** Plain text version of a (possibly HTML) description, for previews. */
export const toPlainText = (text) =>
  toLinkSegments(text).map(s => s.value).join('').replace(/\s+/g, ' ').trim();

/** Editable text version of a (possibly HTML) description: keeps line breaks and each link's URL. */
export const toEditableText = (text) =>
  toLinkSegments(text)
    .map(s => (s.type === 'link' && s.value !== s.href && !s.value.includes(s.href.replace(/\/$/, '')) ? `${s.value} (${s.href})` : s.value))
    .join('')
    .trim();
