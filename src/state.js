/* Persistence, permalink and sharing helpers.
   These operate on plain serializable state objects (no Garden/DOM coupling). */

import { PAL } from './palettes.js';

export var STATE_VERSION = 1;
export var STORAGE_KEY = 'typegarden.v1';

/* recipient share links (share.html): a permalink plus a gift envelope */
export var SHARE_VERSION = 1;
export var SHARE_NAME_MAX = 32;
export var SHARE_TEXT_MAX = 40;

/* aspect ratio -> [width, height] in poster units */
export var ASPECTS = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '16:9': [1920, 1080],
  '9:16': [1080, 1920]
};

export function defaultState() {
  return {
    v: STATE_VERSION,
    palette: 0,
    preset: 'breathe',
    ptext: 'in bloom',
    seed: 7,
    mode: 'type',
    aspect: '1:1',
    opts: { boil: true, recoil: 20, density: 1, curvy: 1, size: 1, roses: 1 }
  };
}

/* round to 2 decimals for compact URL params */
function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function n2(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

/* Compact, human-readable permalink fragment: #p=0&k=breathe&w=in%20bloom&s=7&m=type&a=1:1 */
export function stateToHash(s) {
  var q = new URLSearchParams();
  if (s.palette != null) q.set('p', String(s.palette));
  if (s.preset) q.set('k', s.preset);
  if (s.ptext != null) q.set('w', s.ptext);
  if (s.seed != null) q.set('s', String(s.seed));
  if (s.mode) q.set('m', s.mode);
  if (s.aspect) q.set('a', s.aspect);
  var o = s.opts;
  if (o && (o.density !== 1 || o.curvy !== 1 || o.size !== 1 || o.roses !== 1 || o.recoil !== 20 || o.boil !== true)) {
    q.set('o', [r2(o.density), r2(o.curvy), r2(o.size), r2(o.roses), r2(o.recoil), o.boil ? 1 : 0].join(','));
  }
  if (s.offs && s.offs.length) {
    q.set('d', s.offs.map(function (t) { return t[0] + ':' + r2(t[1]) + ':' + r2(t[2]); }).join(','));
  }
  return q.toString();
}

export function hashToState(hash) {
  var str = String(hash || '').replace(/^#/, '');
  if (!str) return null;
  var q;
  try { q = new URLSearchParams(str); } catch (e) { return null; }
  if (![...q.keys()].length) return null;
  var s = {};
  if (q.has('p')) s.palette = parseInt(q.get('p'), 10) || 0;
  if (q.has('k')) s.preset = q.get('k');
  if (q.has('w')) s.ptext = q.get('w').slice(0, 40);
  if (q.has('s')) s.seed = parseInt(q.get('s'), 10) || 0;
  if (q.has('m')) s.mode = q.get('m');
  if (q.has('a')) s.aspect = q.get('a');
  if (q.has('o')) {
    var p = q.get('o').split(',');
    var opts = {};
    var dens = n2(p[0]), curvy = n2(p[1]), size = n2(p[2]), roses = n2(p[3]), recoil = n2(p[4]);
    if (dens != null) opts.density = dens;
    if (curvy != null) opts.curvy = curvy;
    if (size != null) opts.size = size;
    if (roses != null) opts.roses = roses;
    if (recoil != null) opts.recoil = recoil;
    if (p[5] != null) opts.boil = p[5] === '1';
    s.opts = opts;
  }
  if (q.has('d')) {
    s.offs = q.get('d').split(',').map(function (triple) {
      var t = triple.split(':');
      return [parseInt(t[0], 10) || 0, n2(t[1]) || 0, n2(t[2]) || 0];
    });
  }
  s.v = STATE_VERSION;
  return s;
}

export function loadSaved() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || s.v !== STATE_VERSION) return null;
    return s;
  } catch (e) { return null; }
}

export function saveSaved(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
}

export function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

export function absURL(hash) {
  var u = location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname + location.search;
  return u + (hash ? '#' + hash : '');
}

/* ---------------- recipient share links (share.html) ----------------
   A gift link is a normal garden permalink plus a small, versioned envelope of
   gift fields, all carried in the URL fragment so nothing is ever uploaded:

     share.html#p=0&k=breathe&w=you%20are%20my%20favourite&s=7&sv=1&f=Sam&t=Alex

   The garden keys (p/k/w/s/a/o/d) are exactly the permalink keys understood by
   hashToState(), so the same fragment also opens normally in index.html. */

/* trim, drop control characters/line breaks, collapse runs of whitespace and
   clamp on code-point boundaries so surrogate pairs (emoji) never get sliced */
export function cleanText(v, max) {
  var s = String(v == null ? '' : v);
  s = s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var cp = Array.from(s);
  return cp.length > max ? cp.slice(0, max).join('') : s;
}

/* The subset of a message a single canvas glyph can draw.
   Astral code points (emoji), lone surrogates, variation selectors and
   combining marks would each ask the canvas for a letter it cannot draw,
   leaving blank slots, so they stay in the message but not in the artwork. */
export function artText(v, max) {
  var cp = Array.from(cleanText(v, max)), out = '';
  for (var i = 0; i < cp.length; i++) {
    var c = cp[i].codePointAt(0);
    if (c > 0xffff) continue;                     /* emoji and other astral pairs */
    if (c >= 0xd800 && c <= 0xdfff) continue;     /* lone surrogate halves */
    if (c >= 0xfe00 && c <= 0xfe0f) continue;     /* variation selectors */
    if (c >= 0x0300 && c <= 0x036f) continue;     /* combining marks */
    if (c === 0x00ad) continue;                   /* soft hyphen */
    out += cp[i];
  }
  return out.replace(/\s+/g, ' ').trim();
}

function cl(v, lo, hi, dflt) {
  var n = parseFloat(v);
  if (isNaN(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/* state + gift fields -> share hash (no leading '#') */
export function shareToHash(msg, from, to, state) {
  var s = state || {};
  var q = new URLSearchParams(stateToHash({
    palette: s.palette,
    preset: s.preset,
    ptext: cleanText(msg, SHARE_TEXT_MAX),
    seed: s.seed,
    aspect: s.aspect,
    opts: s.opts,
    offs: s.offs
  }));
  q.set('sv', String(SHARE_VERSION));
  var f = cleanText(from, SHARE_NAME_MAX), t = cleanText(to, SHARE_NAME_MAX);
  if (f) q.set('f', f);
  if (t) q.set('t', t);
  return q.toString();
}

/* share hash -> validated gift payload. Never throws: a hand-edited or
   truncated link comes back as { ok:false, reason:'…' }.
   reasons: 'empty' (no data) · 'legacy' (permalink without an envelope) ·
   'version' (made by a newer Vendure) · 'corrupt' (unparseable numbers etc.) */
export function parseShare(hash) {
  var out = { ok: false, reason: 'empty', from: '', to: '', message: '', state: null };
  var raw = String(hash == null ? '' : hash).replace(/^#/, '').trim();
  if (!raw) return out;
  var q;
  try { q = new URLSearchParams(raw); } catch (e) { out.reason = 'corrupt'; return out; }
  if (![...q.keys()].length) return out;
  var sv = q.get('sv');
  if (sv == null) { out.reason = 'legacy'; return out; }
  var v = parseInt(sv, 10);
  if (isNaN(v) || v < 1) { out.reason = 'corrupt'; return out; }
  if (v > SHARE_VERSION) { out.reason = 'version'; return out; }
  var st;
  try { st = hashToState(raw); } catch (e) { st = null; }
  if (!st) { out.reason = 'corrupt'; return out; }
  /* clamp everything a hand-edited URL could exaggerate */
  st.palette = Math.max(0, Math.min(PAL.length - 1, Math.floor(st.palette) || 0));
  if (st.opts) {
    st.opts.density = cl(st.opts.density, 0.2, 3, 1);
    st.opts.curvy = cl(st.opts.curvy, 0.2, 3, 1);
    st.opts.size = cl(st.opts.size, 0.3, 2.5, 1);
    st.opts.roses = cl(st.opts.roses, 0, 3, 1);
    st.opts.recoil = cl(st.opts.recoil, 0, 120, 20);
    if (typeof st.opts.boil !== 'boolean') st.opts.boil = true;
  }
  if (st.offs) {
    st.offs = st.offs
      .filter(function (o) { return o[0] >= 0 && o[0] < 200; })
      .map(function (o) { return [o[0], cl(o[1], -4000, 4000, 0), cl(o[2], -4000, 4000, 0)]; });
  }
  out.ok = true;
  out.reason = '';
  out.message = cleanText(q.get('w') != null ? q.get('w') : st.ptext, SHARE_TEXT_MAX);
  out.from = cleanText(q.get('f') || '', SHARE_NAME_MAX);
  out.to = cleanText(q.get('t') || '', SHARE_NAME_MAX);
  out.state = st;
  return out;
}

/* absolute URL of a sibling page, so links keep working when the app is
   hosted in a subdirectory (e.g. https://host/vendure/share.html#…) */
export function pageURL(page, hash) {
  var base;
  if (location.origin && location.origin !== 'null') {
    var path = location.pathname || '/';
    if (path.charAt(path.length - 1) !== '/') {
      var seg = path.split('/').pop() || '';
      path = seg.indexOf('.') === -1 ? path + '/' : path.replace(/[^/]*$/, '');
    }
    base = location.origin + path;
  } else {
    /* file:// (the app is not servable that way, but never throw) */
    base = String(location.href || '').split('?')[0].split('#')[0].replace(/[^/]*$/, '');
  }
  return base + page + (hash ? '#' + hash : '');
}

export async function shareOrCopy(url, title, text) {
  if (navigator.share) {
    try { await navigator.share({ title: title, text: text, url: url }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

export async function copyBlob(blob, type) {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) return false;
    var item = new ClipboardItem((function () { var o = {}; o[type || blob.type] = blob; return o; })());
    await navigator.clipboard.write([item]);
    return true;
  } catch (e) { return false; }
}
