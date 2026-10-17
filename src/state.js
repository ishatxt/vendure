/* Persistence, permalink and sharing helpers.
   These operate on plain serializable state objects (no Garden/DOM coupling). */

export var STATE_VERSION = 1;
export var STORAGE_KEY = 'typegarden.v1';

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
    opts: { boil: true, recoil: 20, density: 1 }
  };
}

/* Compact, human-readable permalink fragment: #p=0&k=breathe&w=in%20bloom&s=7&m=type&a=1:1 */
export function stateToHash(s) {
  var q = new URLSearchParams();
  if (s.palette != null) q.set('p', String(s.palette));
  if (s.preset) q.set('k', s.preset);
  if (s.ptext != null) q.set('w', s.ptext);
  if (s.seed != null) q.set('s', String(s.seed));
  if (s.mode) q.set('m', s.mode);
  if (s.aspect) q.set('a', s.aspect);
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
