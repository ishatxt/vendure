/* Recipient page for shared gift links (share.html).
   Renders the shared words with the real Vendure engine — the same layout,
   growth, drawing and frame code the editor uses — but with none of the
   editor: no typing field, no panels, no toolbar, no export dialog.

   The gift payload comes from parseShare() (./state.js). Everything needed to
   rebuild the artwork lives in the URL fragment. */

import { FONT } from './constants.js';
import { pal } from './palettes.js';
import { SHARE_TEXT_MAX, artText, cleanText, parseShare } from './state.js';
import { Garden } from './garden.js';
import './garden-state.js';   /* applyState() */
import './poster.js';        /* applyOffsets() */
import './input.js';         /* add(), onTap(), bloomAt() */
import './layout.js';        /* resize(), layout(), mw() */
import './draw.js';          /* render() + drawing primitives */
import './growth.js';        /* vine/gen/grow */
import './butterflies.js';   /* spawnFly(), drawFlies() */
import './frame.js';         /* frame(), paint(), mainState() */

function el(id) { return document.getElementById(id); }

/* the mounted artwork, exposed so the test suite can drive frames */
export var artwork = null;

/* #rrggbb -> rgba() string, so palette colours can wash the page */
function rgba(hex, a) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return 'rgba(255,255,255,' + a + ')';
  return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
}

/* paint the page in the garden's own palette */
function theme(p) {
  var s = document.documentElement.style;
  s.setProperty('--bg', p.bg);
  s.setProperty('--accent', p.C.red);
  s.setProperty('--stem', p.C.blue);
  s.setProperty('--line', p.C.line);
  s.setProperty('--ink', p.C.text);
  s.setProperty('--glow', rgba(p.C.red, 0.3));
  s.setProperty('--wash', rgba(p.C.blue, 0.13));
  s.setProperty('--edge', rgba(p.C.text, 0.18));
  s.setProperty('--muted', rgba(p.C.text, 0.6));
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.bg);
}

/* ---------------------------------------------------------------------------
   The artwork. A Garden instance without the editor scaffolding: the
   constructor (./garden.js) wires canvases, panels and input, so instead we
   start from the shared prototype and hand it the few fields the layout,
   growth, drawing, butterfly and frame modules read. */
export function mountArtwork(canvas, state, text) {
  var art = Object.create(Garden.prototype);
  art.cv = canvas;
  art.g = canvas.getContext('2d');
  art.letters = [];
  art.flowers = [];
  art.flies = [];
  art.perch = [];
  art.fa = {};
  art.uid = 1;
  art.cache = {};
  art.Sd = 0; art.St = 0; art.wrapped = false;
  art.cx = 0; art.cy = 0; art.ctx_ = 0; art.cty = 0;
  art.palette = 0;
  art.seed = 7;
  art.ptext = '';
  art.opts = { boil: true, recoil: 20, density: 1, curvy: 1, size: 1, roses: 1 };
  art.rand = Math.random;
  art.mx = null; art.my = null;
  art.emode = false; art.sel = null; art.drag = null;
  art._now = 0; art._kd = false; art._tap = null; art._flyLast = 0;
  art.mode = 'type';
  art.preset = 'breathe';
  art.aspect = '1:1';
  art.ZW = 1080; art.ZH = 1080;
  art._light = [540, 540];
  art.status = ''; art.busy = false; art.composing = false;
  art._wantMode = null; art._offs = null; art.P = null; art.pt0 = 0;
  art.F = FONT;
  art.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  art.ptype = 'mouse';
  /* the gift page never persists state or rewrites its own permalink */
  art.changed = function () {};
  art.persist = function () {};
  art.updateHash = function () {};
  art.applyState(state || null);
  art.resize();
  /* grow the words one after another, like watching someone type */
  var chars = Array.from(text || '');
  var n = chars.length;
  var step = art.reduce ? 0 : Math.min(170, Math.max(70, 2400 / Math.max(1, n)));
  var t = art.reduce ? performance.now() - 4000 : performance.now();
  for (var i = 0; i < n; i++) {
    art.add(chars[i], t);
    t += chars[i] === ' ' ? step * 2 : step;
  }
  art.applyOffsets(state && state.offs);
  art.lt = performance.now();
  return art;
}

/* ---------------------------------------------------------------------------
   Page wiring */
function fail(reason) {
  var copy = {
    empty: ['No garden in this link', 'This address carries no shared garden. Grow one worth sending.'],
    legacy: ['This is an old permalink', 'It holds a garden but no gift. Ask for a fresh share link, or grow your own.'],
    version: ['This link needs a newer Vendure', 'It was made with a version this page does not understand yet.'],
    corrupt: ['This link did not survive the trip', 'Part of the share data is damaged. Ask for the link again, or grow your own.']
  }[reason] || null;
  if (!copy) copy = ['No garden in this link', 'This address carries no shared garden. Grow one worth sending.'];
  var head = el('ghead'), stage = el('gstage'), foot = el('gfoot');
  if (head) head.hidden = true;
  if (stage) stage.hidden = true;
  if (foot) foot.hidden = true;
  var h = el('gerrhead'), s = el('gerrsub');
  if (h) h.textContent = copy[0];
  if (s) s.textContent = copy[1];
  var box = el('gerror');
  if (box) box.hidden = false;
  document.documentElement.setAttribute('data-state', 'error');
}

function greet(to, from) {
  var eye = el('geyebrow'), name = el('gname'), sub = el('gfromto');
  if (eye) eye.textContent = to ? 'A little gift for you' : 'A little gift';
  if (name) name.textContent = to || 'For you';
  if (sub) {
    sub.textContent = from ? 'From ' + from : '';
    sub.hidden = !from;
  }
}

function ready() { document.documentElement.setAttribute('data-state', 'ready'); }

function start() {
  var res = parseShare(location.hash);
  if (!res.ok) { fail(res.reason); return; }
  var st = res.state || {};
  theme(pal(st.palette));

  var to = res.to, from = res.from, msg = res.message;
  greet(to, from);

  /* the garden spells the message; with no message it spells their name */
  var words = artText(msg, SHARE_TEXT_MAX) || artText(to, SHARE_TEXT_MAX) || 'for you';
  var canvas = el('cv');
  if (!canvas) return;
  var label = el('gmsg');
  if (label) {
    label.textContent = (from ? 'From ' + from + '. ' : '')
      + (to ? 'For ' + to + '. ' : '')
      + 'The garden spells \u201c' + cleanText(words, SHARE_TEXT_MAX) + '\u201d.';
  }
  canvas.setAttribute('aria-label', 'A living garden made of letters that spell: ' + cleanText(words, SHARE_TEXT_MAX));
  document.title = to ? 'A garden for ' + to + ' \u00b7 Vendure' : (from ? from + ' sent you a garden \u00b7 Vendure' : 'A little gift \u00b7 Vendure');

  var art = mountArtwork(canvas, st, words);
  artwork = art;
  ready();

  /* the pointer gently draws the flowers toward it */
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var r = canvas.getBoundingClientRect();
    art.mx = e.clientX - r.left;
    art.my = e.clientY - r.top;
  });
  document.addEventListener('pointerleave', function () { art.mx = null; art.my = null; });
  /* the same gestures as the editor: tap for a butterfly, double-tap to bloom */
  canvas.addEventListener('pointerdown', function (e) { art.onTap(e.clientX, e.clientY); });

  window.addEventListener('resize', function () {
    art.resize();
    if (art.reduce) art.frame();
  });
  document.addEventListener('visibilitychange', function () { art.lt = performance.now(); });

  if (art.reduce) {
    /* nothing moves: paint the finished garden once and stop */
    art.frame();
    art.frame();
    return;
  }
  var raf = 0;
  (function loop() {
    raf = requestAnimationFrame(loop);
    if (!art.W) art.resize();          /* the tab may have been hidden while mounting */
    if (!document.hidden) art.frame();
  })();
  /* one butterfly drifts in once the words have grown */
  setTimeout(function () {
    var note = el('gplay');
    if (note) note.hidden = false;
    if (art.W && art.H) art.spawnFly(art.W * (0.25 + Math.random() * 0.5), art.H * 0.4);
  }, 3400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
