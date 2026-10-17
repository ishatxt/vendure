
"use strict";

import { PAL } from './palettes.js';
import { h, spr, eo, eb, rng, bez, at } from './math.js';
import {
  gU16, gU32, bU16, bU32, gBytes, gConcat, crcBytes,
  pngChunk, deflateBytes, quantizeColors, buildPaletteLUT,
  gifLZW, gifSubBlocks, nextTick
} from './encoders.js';
import {
  STATE_VERSION, ASPECTS, defaultState, stateToHash, hashToState,
  loadSaved, saveSaved, absURL, shareOrCopy, copyText, copyBlob
} from './state.js';

var FONT = '"Playfair Display", Georgia, serif';
var SENT = String.fromCharCode(0x200b);

/* pure helpers are imported and attached to the prototype so existing
   `this.h(...)` style calls keep working. */
Garden.prototype.h = h;
Garden.prototype.spr = spr;
Garden.prototype.eo = eo;
Garden.prototype.eb = eb;
Garden.prototype.rng = rng;
Garden.prototype.bez = bez;
Garden.prototype.at = at;

/* motion profile: snappy growth-in, calm idle sway, livelier butterflies */
var MOTION = {
  growDur: 430,
  growMin: 220,
  leafK: 9, leafW: 18,
  petalK: 6, petalW: 11,
  sway: 1.5,
  flyCap: 12,
  flyLinger: 6
};

/* poster motion presets: id, label, subtitle, loop duration (ms) */
var PRESETS = [
  { id: 'breathe', label: 'Breathe', sub: 'Slow sway \u00b7 3s', T: 3000 },
  { id: 'grow', label: 'Grow & wither', sub: 'Bloom, then back \u00b7 6s', T: 6000 },
  { id: 'typed', label: 'Typed', sub: 'Type, cut, repeat \u00b7 5s', T: 5000 },
  { id: 'wind', label: 'Gust', sub: 'Wind sweeps through \u00b7 4s', T: 4000 },
  { id: 'reach', label: 'Reach', sub: 'Stems follow a light \u00b7 6s', T: 6000 },
  { id: 'scatter', label: 'Scatter', sub: 'Random bloom, fade \u00b7 6s', T: 6000 },
  { id: 'visit', label: 'Visitor', sub: 'Butterfly drops by \u00b7 7s', T: 7000 }
];

function Garden() {
  this.cv = document.getElementById('cv');
  this.inp = document.getElementById('inp');
  this.app = document.getElementById('app');
  this.bar = document.getElementById('bar');
  this.g = this.cv.getContext('2d');

  this.letters = [];
  this.flowers = [];
  this.uid = 1;
  this.cache = {};
  this.Sd = 0; this.St = 0; this.wrapped = false;
  this.palette = 0;
  this.opts = { boil: true, recoil: 20, density: 1 };
  this.rand = Math.random;
  this.mx = null; this.my = null;
  this.flies = []; this.perch = []; this.fa = {};
  this._now = 0;
  this.composing = false;
  this._kd = false;
  this.touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  this.ptype = 'mouse';
  this.F = FONT;

  this.pcv = document.getElementById('pcv');
  this.posterEl = document.getElementById('poster');
  this.mode = 'type';
  this.preset = 'breathe';
  this.seed = 7;
  this.ptext = 'in bloom';
  this.P = null;
  this.pt0 = 0;
  this.busy = false;
  this.status = '';
  this._crcT = null;
  this.aspect = '1:1';
  this.ZW = 1080; this.ZH = 1080;
  this._light = [this.ZW / 2, this.ZH / 2];
  this._tap = null;
  this._wantMode = null;
  this._hashApplied = true;
  this.vmime = (typeof MediaRecorder !== 'undefined')
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0] || null
    : null;

  if (this.touch) document.documentElement.setAttribute('data-touch', '');

  /* restore state from permalink first, then from local autosave */
  this.applyState(defaultState());
  var bootState = hashToState(location.hash) || loadSaved();
  if (bootState) this.applyState(bootState);

  this.buildUI();
  this.bind();
  this.iv = SENT;
  this.inp.value = SENT;
  this.resize();
  /* replay a shared/autosaved garden's words into the live canvas (Type mode) */
  if (this._wantMode !== 'poster' && bootState && typeof bootState.ptext === 'string' && bootState.ptext) {
    this.typeText(bootState.ptext);
  }

  var self = this;
  if (document.fonts) {
    document.fonts.load('700 100px ' + FONT).then(function () {
      self.cache = {}; self.layout(true); self.buildPoster();
    }).catch(function () {});
  }

  this.buildPoster();
  this.syncUI();
  if (this._wantMode === 'poster') this.setMode('poster');
  this.lt = performance.now();
  (function loop() { self.raf = requestAnimationFrame(loop); self.frame(); })();

  if (!this.touch) setTimeout(function () { try { self.inp.focus({ preventScroll: true }); } catch (e) {} }, 60);
}

/* ---------------- UI ---------------- */
Garden.prototype.buildUI = function () {
  var self = this, pal = document.getElementById('pal');
  pal.innerHTML = '';
  PAL.forEach(function (p, i) {
    var btn = document.createElement('button');
    btn.className = 'sw' + (i === self.palette ? ' active' : '');
    btn.setAttribute('aria-label', p[0]);
    btn.setAttribute('title', p[0]);
    btn.style.background = p[1];
    btn.style.borderColor = i === self.palette ? '#fff' : 'transparent';
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = p[2];
    btn.appendChild(dot);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      self.setPalette(i);
      self.refocus();
    });
    pal.appendChild(btn);
  });
  document.getElementById('savePNG').addEventListener('click', function (e) { e.stopPropagation(); self.savePNG(); });
  document.getElementById('saveSVG').addEventListener('click', function (e) { e.stopPropagation(); self.saveSVG(); });
  var shg = document.getElementById('shareGarden');
  if (shg) shg.addEventListener('click', function (e) { e.stopPropagation(); self.shareLink(); });
  this.buildPosterUI();
  this.applyPalette();
};
Garden.prototype.setPalette = function (i) {
  this.palette = i;
  var pal = document.getElementById('pal');
  if (pal) Array.prototype.forEach.call(pal.querySelectorAll('.sw'), function (b, k) {
    b.classList.toggle('active', k === i);
    b.style.borderColor = (k === i) ? '#fff' : 'transparent';
  });
  var pp = document.getElementById('ppal');
  if (pp) Array.prototype.forEach.call(pp.querySelectorAll('.pp'), function (b, k) {
    b.classList.toggle('active', k === i);
  });
  this.applyPalette();
  this.changed();
  this.refocus();
};
Garden.prototype.buildPosterUI = function () {
  var self = this;
  var motion = document.getElementById('pmotion');
  motion.innerHTML = '';
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.className = 'opt' + (self.preset === p.id ? ' active' : '');
    b.setAttribute('data-preset', p.id);
    var lab = document.createElement('span'); lab.textContent = p.label;
    var sub = document.createElement('span'); sub.className = 'osub'; sub.textContent = p.sub;
    b.appendChild(lab); b.appendChild(sub);
    b.addEventListener('click', function () {
      self.preset = p.id;
      Array.prototype.forEach.call(motion.querySelectorAll('.opt'), function (o) {
        o.classList.toggle('active', o.getAttribute('data-preset') === p.id);
      });
      self.buildPoster();
      self.changed();
    });
    motion.appendChild(b);
  });
  var ppal = document.getElementById('ppal');
  ppal.innerHTML = '';
  PAL.forEach(function (p, i) {
    var b = document.createElement('button');
    b.className = 'pp' + (self.palette === i ? ' active' : '');
    var sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = p[1];
    var fl = document.createElement('span'); fl.className = 'flower'; fl.style.background = p[2];
    var st = document.createElement('span'); st.className = 'stem'; st.style.background = p[3];
    var aa = document.createElement('span'); aa.className = 'aa'; aa.style.color = p[5]; aa.textContent = 'Aa';
    sw.appendChild(fl); sw.appendChild(st); sw.appendChild(aa);
    var nm = document.createElement('span'); nm.className = 'pname'; nm.textContent = p[0];
    b.appendChild(sw); b.appendChild(nm);
    b.setAttribute('aria-label', p[0]);
    b.addEventListener('click', function (e) { e.stopPropagation(); self.setPalette(i); });
    ppal.appendChild(b);
  });
  var words = document.getElementById('pwords');
  words.value = this.ptext;
  words.addEventListener('input', function () {
    self.ptext = words.value.slice(0, 40);
    self.buildPoster();
    self.changed();
  });
  document.getElementById('pregrow').addEventListener('click', function () {
    self.seed = Math.floor(Math.random() * 1e6);
    self.buildPoster();
    self.changed();
  });
  this.buildShareUI();
  this.buildExportUI();
  var modes = document.getElementById('modes');
  Array.prototype.forEach.call(modes.querySelectorAll('.mode'), function (b) {
    b.addEventListener('click', function () { self.setMode(b.getAttribute('data-mode')); });
  });
  this.setStatus('');
};
Garden.prototype.buildExportUI = function () {
  var self = this, caps = this.caps();
  var modal = document.getElementById('pexp'), formats = document.getElementById('pexpformats');
  var tabBtns = modal.querySelectorAll('.tab'), tab = this.expTab || 'motion';
  var unsupported = [];
  function render() {
    formats.innerHTML = '';
    EXPORT_FORMATS[tab].forEach(function (f) {
      var ok = !!caps[f.cap];
      var b = document.createElement('button');
      b.className = 'fmt';
      b.setAttribute('data-format', f.id);
      b.setAttribute('data-unsup', ok ? '0' : '1');
      var lab = document.createElement('span'); lab.textContent = f.label;
      var sub = document.createElement('span'); sub.className = 'fsub'; sub.textContent = ok ? f.sub : f.sub + ' \u00b7 unsupported';
      b.appendChild(lab); b.appendChild(sub);
      b.disabled = !ok || self.busy;
      b.addEventListener('click', function () { self.exportFormat(f.id); });
      formats.appendChild(b);
    });
    var fw = document.getElementById('pexpfpswrap');
    if (fw) fw.style.display = tab === 'motion' ? '' : 'none';
    Array.prototype.forEach.call(tabBtns, function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });
    document.getElementById('pexpinfo').textContent = self.aspect + ' \u00b7 ' + (self.P ? (self.P.T / 1000) + 's loop \u00b7 ' + self.pr().label : '');
  }
  Array.prototype.forEach.call(tabBtns, function (t) {
    t.addEventListener('click', function () { tab = t.getAttribute('data-tab'); self.expTab = tab; render(); });
  });
  Object.keys(caps).forEach(function (k) { if (!caps[k]) unsupported.push(k); });
  var hint = document.getElementById('pexphint');
  if (hint) hint.textContent = unsupported.length
    ? 'Unavailable here: ' + unsupported.join(', ').toUpperCase() + '. Greyed-out formats are not supported by this browser.'
    : '';
  document.getElementById('pexport').addEventListener('click', function () {
    if (self.busy) return;
    render();
    modal.hidden = false;
    var st = document.getElementById('pexpstatus'); if (st) st.textContent = '';
  });
  document.getElementById('pexpclose').addEventListener('click', function () { if (!self.busy) modal.hidden = true; });
  document.getElementById('pexpbackdrop').addEventListener('click', function () { if (!self.busy) modal.hidden = true; });
};
Garden.prototype.buildShareUI = function () {
  var self = this;
  function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); }
  on('pshare', function () { self.shareLink(); });
  on('paspect', function () { self.toggleAspect(); });
  on('pcopypng', function () { self.copyPNG(); });
  on('pcopysvg', function () { self.copyPosterSVG(); });
  on('psavejson', function () { self.saveJSON(); });
  var file = document.getElementById('pljson');
  on('ploadjson', function () { if (file) file.click(); });
  if (file) file.addEventListener('change', function () {
    self.loadJSON(file.files && file.files[0]);
    file.value = '';
  });
  var aspectSel = document.getElementById('pexpaspect');
  if (aspectSel) aspectSel.addEventListener('change', function () {
    self.setAspect(aspectSel.value);
    if (self.mode === 'poster') self.buildPoster();
    self.changed();
    self.setStatus('Poster ' + self.aspect + ' \u00b7 ' + self.ZW + ' \u00d7 ' + self.ZH);
  });
};
Garden.prototype.applyPalette = function () {
  var p = this.pal();
  this.app.style.background = p.bg;
  this.bar.style.color = p.C.text;
};
Garden.prototype.refocus = function () {
  if (this.mode === 'type' && this.ptype === 'mouse' && this.inp) { try { this.inp.focus({ preventScroll: true }); } catch (e) {} }
};
Garden.prototype.pal = function () {
  var p = PAL[this.palette] || PAL[0];
  return { bg: p[1], C: { red: p[2], blue: p[3], line: p[4], text: p[5], vein: p[1] } };
};

/* ---------------- state & sharing ---------------- */
Garden.prototype.serialize = function () {
  return {
    v: STATE_VERSION,
    palette: this.palette,
    preset: this.preset,
    ptext: this.mode === 'type' ? this.liveText() : this.ptext,
    seed: this.seed,
    mode: this.mode,
    aspect: this.aspect,
    opts: { boil: !!this.opts.boil, recoil: this.opts.recoil, density: this.opts.density }
  };
};
Garden.prototype.applyState = function (s) {
  if (!s) return;
  if (s.palette != null) this.palette = s.palette;
  if (s.preset) this.preset = s.preset;
  if (typeof s.ptext === 'string') this.ptext = s.ptext.slice(0, 40);
  if (s.seed != null) this.seed = s.seed;
  if (s.aspect && ASPECTS[s.aspect]) this.setAspect(s.aspect);
  if (s.opts) {
    if (typeof s.opts.boil === 'boolean') this.opts.boil = s.opts.boil;
    if (s.opts.recoil != null) this.opts.recoil = s.opts.recoil;
    if (s.opts.density != null) this.opts.density = s.opts.density;
  }
  if (s.mode) this._wantMode = s.mode;
};
Garden.prototype.setAspect = function (a) {
  var dims = ASPECTS[a] || ASPECTS['1:1'];
  this.aspect = a;
  this.ZW = dims[0]; this.ZH = dims[1];
  this._light = [this.ZW / 2, this.ZH / 2];
  if (this.pcv) {
    this.pcv.width = this.ZW; this.pcv.height = this.ZH;
    this.pcv.style.aspectRatio = this.ZW + ' / ' + this.ZH;
  }
  var ab = document.getElementById('paspect');
  if (ab && ab.textContent !== a) ab.textContent = a;
  var sel = document.getElementById('pexpaspect');
  if (sel && sel.value !== a) sel.value = a;
};
Garden.prototype.changed = function () {
  this.persist();
  this.updateHash();
};
Garden.prototype.persist = function () {
  if (this._saveTimer) clearTimeout(this._saveTimer);
  var self = this;
  this._saveTimer = setTimeout(function () { saveSaved(self.serialize()); }, 250);
};
Garden.prototype.updateHash = function () {
  try {
    var h = '#' + stateToHash(this.serialize());
    if (location.hash !== h) history.replaceState(null, '', h);
    this._hashApplied = true;
  } catch (e) {}
};
Garden.prototype.shareLink = function () {
  var self = this;
  var url = absURL(stateToHash(this.serialize()));
  this.setStatus('Sharing\u2026');
  shareOrCopy(url, 'Type Garden', this.ptext).then(function (r) {
    if (r === 'copied') self.setStatus('Link copied to clipboard');
    else if (r === 'shared') self.setStatus('Shared');
    else if (r === 'cancelled') self.setStatus('');
    else self.setStatus('Copy failed \u2014 ' + url);
  });
};
Garden.prototype.copyText = function (t, label) {
  var self = this;
  copyText(t).then(function (ok) { self.setStatus(ok ? (label || 'Copied') : 'Copy failed'); });
};
Garden.prototype.copyPNG = function () {
  var self = this, s = this.expSettings();
  this.stillBlob(s.scale, this.P ? this.P.T * 0.4 : 0, 'image/png').then(function (b) {
    if (!b) { self.setStatus('Could not render image'); return; }
    copyBlob(b, 'image/png').then(function (ok) { self.setStatus(ok ? 'PNG copied' : 'Copy unsupported \u2014 use Export'); });
  });
};
Garden.prototype.copyPosterSVG = function () {
  var svg = this.posterSVG(this.P ? this.P.T * 0.4 : 0, 1);
  this.copyText(svg, 'SVG copied');
};
Garden.prototype.saveJSON = function () {
  var blob = new Blob([JSON.stringify(this.serialize(), null, 2)], { type: 'application/json' });
  this.dl(blob, this.fname() + '.json');
  this.setStatus('Saved project .json');
};
Garden.prototype.loadJSON = function (file) {
  var self = this;
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var s = JSON.parse(String(reader.result));
      self.applyState(s);
      self.syncUI();
      self.letters = []; self.flowers = [];
      if (self._wantMode === 'poster') {
        self.setMode('poster');
        self.buildPoster();
      } else {
        if (self.mode !== 'type') self.setMode('type');
        if (typeof s.ptext === 'string' && s.ptext) self.typeText(s.ptext);
      }
      self.changed();
      self.setStatus('Loaded project');
    } catch (e) { self.setStatus('Invalid project file'); }
  };
  reader.readAsText(file);
};
Garden.prototype.toggleAspect = function () {
  var keys = Object.keys(ASPECTS), i = keys.indexOf(this.aspect);
  var next = keys[(i + 1 + keys.length) % keys.length];
  this.setAspect(next);
  if (this.mode === 'poster') this.buildPoster();
  this.changed();
  this.setStatus('Poster ' + this.aspect + ' \u00b7 ' + this.ZW + ' \u00d7 ' + this.ZH);
};
Garden.prototype.syncUI = function () {
  var self = this;
  var w = document.getElementById('pwords'); if (w) w.value = this.ptext;
  var pal = document.getElementById('pal');
  if (pal) Array.prototype.forEach.call(pal.querySelectorAll('.sw'), function (b, k) {
    b.classList.toggle('active', k === self.palette); b.style.borderColor = k === self.palette ? '#fff' : 'transparent';
  });
  var pp = document.getElementById('ppal');
  if (pp) Array.prototype.forEach.call(pp.querySelectorAll('.pp'), function (b, k) { b.classList.toggle('active', k === self.palette); });
  var motion = document.getElementById('pmotion');
  if (motion) Array.prototype.forEach.call(motion.querySelectorAll('.opt'), function (o) { o.classList.toggle('active', o.getAttribute('data-preset') === self.preset); });
};

/* ---------------- poster mode ---------------- */
Garden.prototype.liveText = function () {
  return (this.letters || []).filter(function (l) { return !l.dead; }).map(function (l) { return l.ch; }).join('').trim();
};
Garden.prototype.pr = function () {
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === this.preset) return PRESETS[i];
  return PRESETS[0];
};
Garden.prototype.setStatus = function (t) {
  this.status = t;
  var el = document.getElementById('pstatus'); if (el) el.textContent = t || '';
  /* the poster panel (and its status line) is hidden in Type mode, so surface
     a transient toast there for share / copy / save feedback */
  if (this.mode !== 'poster') this.toast(t);
};
Garden.prototype.toast = function (t) {
  var el = document.getElementById('toast'); if (!el) return;
  if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
  if (!t) { el.classList.remove('on'); return; }
  el.textContent = t;
  el.classList.add('on');
  var self = this;
  this._toastTimer = setTimeout(function () { el.classList.remove('on'); self._toastTimer = null; }, 2800);
};
Garden.prototype.typeText = function (str) {
  var now = performance.now(), s = String(str || '').slice(0, 40);
  for (var i = 0; i < s.length; i++) this.add(s[i], now);
};
Garden.prototype.setBusy = function (b) {
  this.busy = b;
  var self = this;
  var eb = document.getElementById('pexport'); if (eb) eb.disabled = b;
  Array.prototype.forEach.call(document.querySelectorAll('#pexpformats .fmt'), function (el) {
    el.disabled = b || el.getAttribute('data-unsup') === '1';
  });
  Array.prototype.forEach.call(document.querySelectorAll('#pexpsettings select'), function (s) { s.disabled = b; });
};
Garden.prototype.setMode = function (mode) {
  if (mode === this.mode) return;
  var self = this;
  var exm = document.getElementById('pexp'); if (exm) exm.hidden = true;
  if (mode === 'poster') {
    var t = this.liveText();
    if (t) {
      this.ptext = t.slice(0, 40);
      var w = document.getElementById('pwords'); if (w) w.value = this.ptext;
    }
    this.mode = 'poster';
    this.posterEl.hidden = false;
    this.cv.style.display = 'none';
    document.getElementById('peers').style.display = 'none';
    this.bar.style.display = 'none';
    try { this.inp.blur(); } catch (e) {}
    this.setAspect(this.aspect);
    this.buildPoster();
  } else {
    this.mode = 'type';
    this.posterEl.hidden = true;
    this.cv.style.display = 'block';
    document.getElementById('peers').style.display = '';
    this.bar.style.display = '';
    this.resize();
    this.refocus();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#modes .mode'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
  this.applyPalette();
  this.changed();
};
Garden.prototype.buildPoster = function () {
  var self = this, pr = this.pr(), text = (this.ptext || '').slice(0, 40) || ' ';
  this.rand = this.rng(this.seed * 7919 + 1);
  var L = [], prev = null, uid = 1, i, ch;
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (ch === ' ') { var sp = { ch: ' ', id: 9000 + uid++, els: [] }; L.push(sp); prev = sp; continue; }
    var same = prev && prev.ch !== ' ';
    var l = { ch: ch, id: 9000 + uid++, ws: same ? prev.ws : Math.floor(this.rand() * 1e9), wi: same ? prev.wi + 1 : 0, prev: same ? prev : null };
    this.gen(l); L.push(l); prev = l;
  }
  var n = L.length;
  var step = pr.id === 'grow' ? Math.min(110, 3000 / n) : pr.id === 'typed' ? Math.min(85, 3600 / n) : 0;
  var off = pr.id === 'grow' ? 200 : pr.id === 'typed' ? 300 : 0;
  L.forEach(function (l, idx) { l.b = off + idx * step; });
  if (pr.id === 'scatter') {
    var sr = this.rng(this.seed * 31 + 5);
    L.forEach(function (l) { l.b = 150 + sr() * 2400; });
  }
  var wd = Math.min(60, 900 / n);
  L.forEach(function (l, idx) {
    l.d = pr.id === 'scatter' ? 4700 + idx * 8 : 4200 + (n - 1 - idx) * wd;
    var nx = L[idx + 1];
    l.cutRel = null;
    if (pr.id !== 'scatter' && l.ch !== ' ' && nx && nx.ch === ' ') {
      l.cutRel = Math.max(30, nx.b - l.b);
      self.genEnd(l, l.cutRel);
    }
  });
  this.rand = Math.random;
  var W = this.ZW, H = this.ZH;
  var res = this.layoutCore(L, W, H, false);
  var S = res.S, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  function addP(l, x, y, r) {
    var X = l.tx + x * S, Y = l.ty + y * S, R = (r || 0) * S;
    if (X - R < x0) x0 = X - R; if (X + R > x1) x1 = X + R;
    if (Y - R < y0) y0 = Y - R; if (Y + R > y1) y1 = Y + R;
  }
  L.forEach(function (l) {
    if (l.ch === ' ') return;
    addP(l, -l.tw / S / 2, -0.75); addP(l, l.tw / S / 2, 0.1);
    l.els.concat(l.endEls || []).forEach(function (e) {
      if (e.t === 'stem') e.pts.forEach(function (q) { addP(l, q[0], q[1], 0.02); });
      else if (e.t === 'leaf') addP(l, e.x, e.y, e.L);
      else addP(l, e.x, e.y, e.R * 1.15);
    });
  });
  var tx0 = 1e9, tx1 = -1e9, ty0 = 1e9, ty1 = -1e9;
  L.forEach(function (l) {
    if (l.ch === ' ') return;
    if (l.tx - l.tw / 2 < tx0) tx0 = l.tx - l.tw / 2;
    if (l.tx + l.tw / 2 > tx1) tx1 = l.tx + l.tw / 2;
    if (l.ty - 0.72 * S < ty0) ty0 = l.ty - 0.72 * S;
    if (l.ty > ty1) ty1 = l.ty;
  });
  var ZW = this.ZW, ZH = this.ZH, halfX = ZW * 0.44, halfY = ZH * 0.44, bcx = (tx0 + tx1) / 2, bcy = (ty0 + ty1) / 2;
  var k = Math.min(1.25, halfX / Math.max(1, bcx - x0), halfY / Math.max(1, bcy - y0), halfX / Math.max(1, x1 - bcx), halfY / Math.max(1, y1 - bcy));
  L.forEach(function (l) {
    l.tx = ZW / 2 + (l.tx - bcx) * k; l.ty = ZH / 2 + (l.ty - bcy) * k;
    l.tw *= k; l.x = l.tx; l.y = l.ty;
  });
  this.P = { letters: L, S: S * k, T: pr.T, preset: pr.id };
  this.pt0 = performance.now();
  var pinfo = document.getElementById('pinfo');
  if (pinfo) pinfo.textContent = this.aspect + ' \u00b7 ' + (pr.T / 1000) + 's loop \u00b7 30 fps';
  var pinfo2 = document.getElementById('pinfo2');
  if (pinfo2) pinfo2.textContent = this.ZW + ' \u00d7 ' + this.ZH + ' \u00b7 video, GIF, PNG, SVG, PDF';
};
Garden.prototype.drawBg = function (g, W, H) { g.fillStyle = this.pal().bg; g.fillRect(0, 0, W || this.ZW, H || this.ZH); };
Garden.prototype.posterFly = function (B, tt, P, C) {
  var ps = this.perch.slice().sort(function (a, b) { return a.x - b.x; });
  if (!ps.length) return;
  var p1 = ps[Math.floor(ps.length * 0.25)], p2 = ps[Math.min(ps.length - 1, Math.floor(ps.length * 0.75))];
  var A = [-80, this.ZH * 0.28], s1 = [p1.x, p1.y - p1.R * 0.55], s2 = [p2.x, p2.y - p2.R * 0.55], E = [this.ZW + 80, this.ZH * 0.24];
  var sz = Math.max(12, P.S * 0.09), t = tt / 1000, self = this;
  var eo = function (v) { return self.eo(Math.max(0, Math.min(1, v))); };
  var leg = function (a, b, u, lift) { var e = eo(u); return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e - Math.sin(e * Math.PI) * lift]; };
  var p, flying = true, vx = 0;
  if (t < 1.8) { p = leg(A, s1, t / 1.8, 160); vx = 1; }
  else if (t < 3.4) { p = s1; flying = false; }
  else if (t < 4.6) { p = leg(s1, s2, (t - 3.4) / 1.2, 140); vx = s2[0] > s1[0] ? 1 : -1; }
  else if (t < 5.8) { p = s2; flying = false; }
  else { p = leg(s2, E, (t - 5.8) / 1.2, 60); vx = 1; }
  var o, ang;
  if (flying) { o = Math.abs(Math.cos(t * 17)); p = [p[0] + Math.sin(t * 7) * 6, p[1] + Math.sin(t * 13) * 4]; ang = vx * 0.3; }
  else { var burst = (t > 2.4 && t < 2.8) || (t > 5 && t < 5.3); o = burst ? 0.2 + 0.8 * Math.abs(Math.cos(t * 9)) : 0.3 + 0.1 * Math.sin(t * 3); ang = 0; }
  this.butterfly(B, p[0], p[1], sz, ang, o, C);
};
Garden.prototype.posterDraw = function (g, t, scale) {
  var P = this.P; if (!P) return;
  var ZW = this.ZW, ZH = this.ZH, sc = scale || 1;
  g.setTransform(sc, 0, 0, sc, 0, 0);
  this.drawBg(g, ZW, ZH);
  var T = P.T, tt = ((t % T) + T) % T, L = P.letters;
  var B = this.backend(g);
  var st = { letters: L, S: P.S, C: this.pal().C, boil: this.opts.boil, recoil: this.opts.recoil, speed: 1, wither: 600, textAll: true };
  L.forEach(function (l) { l.x = l.tx; l.y = l.ty; l.dead = null; });
  var set = function (base) {
    L.forEach(function (l) { l.birth = base + l.b; l.tb = l.birth; l.cut = l.cutRel != null ? l.birth + l.cutRel : null; });
  };
  if (P.preset === 'breathe') {
    set(-1e5);
    var ph = tt / T * Math.PI * 2, S = P.S;
    st.warp = function (x, y, l) {
      var h = Math.max(0, (l.y - y) / S);
      return [x + Math.sin(ph + l.x * 0.004 + h * 1.1) * S * 0.03 * h, y + Math.cos(ph + x * 0.003) * S * 0.008 * h];
    };
    st.rotw = function (e) { return Math.sin(ph + e.id * 0.7) * 0.12; };
  } else if (P.preset === 'grow' || P.preset === 'scatter') {
    set(0);
    L.forEach(function (l) { if (tt >= l.d) l.dead = l.d; });
  } else if (P.preset === 'wind') {
    set(-1e5);
    var SW = P.S, u = tt / P.T, front = -0.35 + u * 1.9;
    st.warp = (function (S, W) {
      return function (x, y, l) {
        var hh = Math.max(0, (l.y - y) / S), d = l.x / W - front;
        var gg = d < 0 ? Math.exp(d * 2.2) * Math.cos(-d * 9) : Math.exp(-d * d * 30);
        var idle = Math.sin(tt / 1000 * 1.6 + l.x * 0.01) * 0.012;
        return [x + (gg * 0.13 + idle) * S * hh * hh * 0.6 + (gg * 0.13 + idle) * S * hh * 0.4, y + Math.abs(gg) * 0.02 * S * hh];
      };
    })(SW, this.ZW);
    st.rotw = function (e) {
      var d = e.x / self.ZW - front;
      return (d < 0 ? Math.exp(d * 2.2) * Math.cos(-d * 9) : Math.exp(-d * d * 30)) * 0.35;
    };
  } else if (P.preset === 'reach') {
    set(-1e5);
    var SR = P.S, phr = tt / P.T * Math.PI * 2, lx = ZW / 2 + Math.sin(phr) * ZW * 0.398, ly = ZH / 2 + Math.sin(phr * 2) * ZH * 0.24;
    this._light = [lx, ly];
    st.warp = function (x, y, l) {
      var dx = lx - l.x, dy = ly - (l.y - SR * 0.6), d = Math.hypot(dx, dy) || 1, w = Math.max(0, 1 - d / 560), s = w * w * (3 - 2 * w);
      var hh = Math.min(2.5, Math.max(0, (l.y - y) / SR)), f = hh * hh * 0.5 + hh * 0.5;
      return [x + dx / d * s * SR * 0.12 * f, y + dy / d * s * SR * 0.06 * f];
    };
    st.rotw = function (e) { var a = Math.atan2(ly - e.y, lx - e.x); return Math.sin(a) * 0.15; };
  } else if (P.preset === 'visit') {
    set(-1e5);
    st.perchOn = true; this.perch = [];
    var phv = tt / P.T * Math.PI * 2;
    st.warp = function (x, y, l) { var hh = Math.max(0, (l.y - y) / P.S); return [x + Math.sin(phv + l.x * 0.004 + hh) * P.S * 0.015 * hh, y]; };
  } else {
    if (tt >= 4400) return;
    set(0);
    st.letters = L.filter(function (l) { return tt >= l.birth; });
    st.textAll = false;
  }
  this.render(B, tt, st);
  if (P.preset === 'reach') {
    var li = this._light, rr = P.S * 0.09, pts = [];
    for (var k = 0; k < 20; k++) { var a = k / 20 * Math.PI * 2; pts.push([li[0] + Math.cos(a) * rr, li[1] + Math.sin(a) * rr]); }
    B.fill(pts, st.C.line);
  }
  if (P.preset === 'visit') this.posterFly(B, tt, P, st.C);
  if (P.preset === 'typed') {
    var born = st.letters, last = born[born.length - 1], S2 = P.S;
    if (Math.floor(tt / 400) % 2 === 0 || (last && tt - last.birth < 300)) {
      var x = last ? last.tx + last.tw / 2 + 0.07 * S2 : ZW / 2;
      var y = last ? last.ty - 0.33 * S2 : ZH / 2;
      var w = Math.max(2, S2 * 0.03), h = 0.8 * S2;
      B.rect(x - w / 2, y - h / 2, w, h, st.C.text);
    }
  }
};

/* ---------------- export helpers ---------------- */
/* binary encoders, quantization and LZW now live in ./src/encoders.js */

var EXPORT_FORMATS = {
  motion: [
    { id: 'mp4', label: 'MP4', sub: 'H.264 / AVC', cap: 'mp4' },
    { id: 'webm', label: 'WebM', sub: 'VP9 / VP8', cap: 'webm' },
    { id: 'gif', label: 'GIF', sub: 'Animated GIF', cap: 'gif' },
    { id: 'apng', label: 'APNG', sub: 'Animated PNG', cap: 'apng' },
    { id: 'mov', label: 'MOV', sub: 'ProRes / QuickTime', cap: 'mov' },
    { id: 'pngzip', label: 'PNG Sequence', sub: '.zip \u00b7 frame by frame', cap: 'png' },
    { id: 'svgzip', label: 'SVG Sequence', sub: '.zip \u00b7 vector frames', cap: 'svg' }
  ],
  still: [
    { id: 'png', label: 'PNG', sub: 'Lossless bitmap', cap: 'png' },
    { id: 'jpeg', label: 'JPEG', sub: 'Compressed bitmap', cap: 'jpeg' },
    { id: 'webp', label: 'WEBP', sub: 'Modern web image', cap: 'webp' },
    { id: 'svg', label: 'SVG', sub: 'Vector \u00b7 editable', cap: 'svg' },
    { id: 'pdf', label: 'PDF', sub: 'Printable document', cap: 'pdf' }
  ]
};

/* ---------------- poster export ---------------- */
Garden.prototype.fname = function (suffix) {
  var base = 'garden-' + (this.ptext || 'loop').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() + '-' + this.preset;
  return suffix ? base + suffix : base;
};
Garden.prototype.svgCtx = function () {
  var parts = [];
  function nn(v) { return Math.round(v * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var c = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    font: '700 16px sans-serif', textAlign: 'center', textBaseline: 'alphabetic',
    _d: '', _has: false,
    setTransform: function () {},
    beginPath: function () { this._d = ''; this._has = false; },
    moveTo: function (x, y) { this._d += 'M' + nn(x) + ' ' + nn(y); this._has = true; },
    lineTo: function (x, y) { this._d += 'L' + nn(x) + ' ' + nn(y); this._has = true; },
    quadraticCurveTo: function (a, b, x, y) { this._d += 'Q' + nn(a) + ' ' + nn(b) + ' ' + nn(x) + ' ' + nn(y); this._has = true; },
    closePath: function () { this._d += 'Z'; },
    fill: function () { if (this._has) parts.push('<path d="' + this._d + '" fill="' + this.fillStyle + '"/>'); },
    stroke: function () { if (this._has) parts.push('<path d="' + this._d + '" fill="none" stroke="' + this.strokeStyle + '" stroke-width="' + nn(this.lineWidth) + '" stroke-linecap="round" stroke-linejoin="round"/>'); },
    fillRect: function (x, y, w, h) { parts.push('<rect x="' + nn(x) + '" y="' + nn(y) + '" width="' + nn(w) + '" height="' + nn(h) + '" fill="' + this.fillStyle + '"/>'); },
    fillText: function (ch, x, y) {
      var m = /(\d+(?:\.\d+)?)px/.exec(this.font), fs = m ? parseFloat(m[1]) : 16;
      parts.push('<text x="' + nn(x) + '" y="' + nn(y) + '" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="' + nn(fs) + '" fill="' + this.fillStyle + '">' + esc(ch) + '</text>');
    }
  };
  return { ctx: c, parts: parts };
};
Garden.prototype.posterSVG = function (t, scale) {
  var sc = this.svgCtx();
  this.posterDraw(sc.ctx, t, 1);
  var W = Math.round(this.ZW * (scale || 1)), H = Math.round(this.ZH * (scale || 1));
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + this.ZW + ' ' + this.ZH + '">' + sc.parts.join('') + '</svg>';
};
Garden.prototype.stillBlob = function (scale, t, type, q) {
  var self = this, W = Math.round(this.ZW * scale), H = Math.round(this.ZH * scale);
  return new Promise(function (res) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    self.posterDraw(c.getContext('2d'), t, scale);
    c.toBlob(function (b) { res(b); }, type, q);
  });
};
Garden.prototype.makePDF = function (jpeg, w, h) {
  var enc = new TextEncoder();
  function cat(list) { return gConcat(list); }
  var header = enc.encode('%PDF-1.4\n%TYPE-GARDEN\n');
  var objs = {};
  objs[1] = enc.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objs[2] = enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs[3] = enc.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  objs[4] = cat([enc.encode('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n'), jpeg, enc.encode('\nendstream')]);
  var content = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q';
  objs[5] = enc.encode('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
  var out = [header], off = header.length, offsets = {}, i;
  for (i = 1; i <= 5; i++) {
    offsets[i] = off;
    var b = cat([enc.encode(i + ' 0 obj\n'), objs[i], enc.encode('\nendobj\n')]);
    out.push(b); off += b.length;
  }
  var xrefOff = off, xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (i = 1; i <= 5; i++) xref += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
  out.push(enc.encode(xref + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOff + '\n%%EOF\n'));
  return new Blob(out, { type: 'application/pdf' });
};
Garden.prototype.caps = function () {
  var MR = typeof MediaRecorder !== 'undefined';
  var ts = function (m) { return !!(MR && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)); };
  var webp = false;
  try { var cv = document.createElement('canvas'); cv.width = cv.height = 2; webp = cv.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) {}
  var mp4 = ts('video/mp4;codecs=avc1.42E01E') || ts('video/mp4');
  var webm = ts('video/webm;codecs=vp9') || ts('video/webm;codecs=vp8') || ts('video/webm');
  return {
    mp4: mp4,
    webm: webm,
    mov: ts('video/quicktime') || mp4 || webm,
    gif: true,
    apng: typeof CompressionStream !== 'undefined',
    png: true, jpeg: true, webp: webp, svg: true, pdf: typeof Blob !== 'undefined'
  };
};
Garden.prototype.pickVideoMime = function (kind) {
  var c = {
    mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'],
    webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
    mov: ['video/quicktime', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  }[kind] || [];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
  return null;
};
Garden.prototype.expSettings = function () {
  var g = function (id, d) { var e = document.getElementById(id); return e ? e.value : d; };
  return {
    scale: parseFloat(g('pexpscale', '1')) || 1,
    fps: parseInt(g('pexpfps', '30'), 10) || 30,
    quality: g('pexpq', 'high')
  };
};
Garden.prototype.qualityValue = function (kind) {
  var q = this.expSettings().quality;
  if (kind === 'jpeg' || kind === 'webp') return q === 'standard' ? 0.72 : q === 'prores' ? 0.98 : 0.9;
  if (kind === 'video') return q === 'standard' ? 8e6 : q === 'prores' ? 40e6 : 16e6;
  return q;
};
Garden.prototype.prog = function (cur, total, label) {
  var wrap = document.getElementById('pexpprog'), bar = document.getElementById('pexpbar'), txt = document.getElementById('pexpprogtext');
  if (wrap) wrap.hidden = false;
  var p = total ? Math.max(0, Math.min(1, cur / total)) : 0;
  if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
  if (txt) txt.textContent = label || (Math.round(p * 100) + '%');
};
Garden.prototype.progDone = function () {
  var wrap = document.getElementById('pexpprog'), bar = document.getElementById('pexpbar');
  if (bar) bar.style.width = '0%';
  if (wrap) wrap.hidden = true;
};
Garden.prototype.posterExportName = function (ext) {
  return this.fname() + '.' + ext;
};
Garden.prototype.runStill = function (fmt) {
  var s = this.expSettings(), t = this.P.T * 0.4, q = this.qualityValue(fmt);
  if (fmt === 'svg') {
    var svg = this.posterSVG(t, s.scale);
    this.dl(new Blob([svg], { type: 'image/svg+xml' }), this.posterExportName('svg'));
    return Promise.resolve();
  }
  var self = this;
  if (fmt === 'pdf') {
    return this.stillBlob(s.scale, t, 'image/jpeg', 0.94).then(function (b) {
      return b.arrayBuffer();
    }).then(function (buf) {
      self.dl(self.makePDF(new Uint8Array(buf), Math.round(self.ZW*s.scale), Math.round(self.ZH*s.scale)), self.posterExportName('pdf'));
    });
  }
  var type = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
  return this.stillBlob(s.scale, t, type, q).then(function (b) {
    if (b) self.dl(b, self.posterExportName(fmt === 'jpeg' ? 'jpg' : fmt));
  });
};
Garden.prototype.runSequence = function (kind) {
  var self = this, s = this.expSettings(), P = this.P;
  var N = Math.max(1, Math.round(P.T / 1000 * s.fps)), files = [];
  this.setStatus('Rendering frames\u2026');
  return new Promise(function (resolve, reject) {
    var i = 0;
    function next() {
      if (i >= N) { resolve({ files: files, N: N }); return; }
      var idx = i, t = i * 1000 / s.fps;
      self.prog(i, N, 'Rendering frame ' + (i + 1) + '/' + N + ' (' + Math.round(i / N * 100) + '%)');
      if (kind === 'svg') {
        try { files.push({ name: 'frame_' + String(idx + 1).padStart(4, '0') + '.svg', data: new TextEncoder().encode(self.posterSVG(t, 1)) }); }
        catch (e) { reject(e); return; }
        i++;
        setTimeout(next, 0);
        return;
      }
      var c = self._seqCanvas(s.scale);
      self.posterDraw(c.getContext('2d'), t, s.scale);
      c.toBlob(function (b) {
        if (!b) { reject(new Error('Frame capture failed')); return; }
        b.arrayBuffer().then(function (buf) {
          files.push({ name: 'frame_' + String(idx + 1).padStart(4, '0') + '.png', data: new Uint8Array(buf) });
          i++;
          setTimeout(next, 0);
        });
      }, 'image/png');
    }
    next();
  });
};
Garden.prototype._seqCanvas = function (scale) {
  if (!this.__sc || this.__scScale !== scale || this.__scWidth !== this.ZW || this.__scHeight !== this.ZH) {
    this.__sc = document.createElement('canvas');
    this.__sc.width = Math.round(this.ZW * scale);
    this.__sc.height = Math.round(this.ZH * scale);
    this.__scScale = scale;
    this.__scWidth = this.ZW; this.__scHeight = this.ZH;
  }
  return this.__sc;
};
Garden.prototype.exportVideoFmt = function (kind) {
  var self = this, s = this.expSettings(), P = this.P;
  var mime = this.pickVideoMime(kind);
  if (!mime) return Promise.reject(new Error('Video not supported in this browser'));
  var size = Math.round(this.ZW * s.scale);
  var c = document.createElement('canvas'); c.width = size; c.height = Math.round(this.ZH * s.scale);
  var g = c.getContext('2d');
  var stream = c.captureStream(0), track = stream.getVideoTracks()[0];
  var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: this.qualityValue('video') });
  var chunks = [];
  rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
  var N = Math.max(1, Math.round(P.T / 1000 * s.fps));
  return new Promise(function (resolve, reject) {
    rec.onerror = function () { reject(new Error('Recording failed')); };
    rec.onstop = function () {
      var ext = mime.indexOf('quicktime') >= 0 ? 'mov' : mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      resolve({ blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: ext, N: N });
    };
    self.setStatus('Recording ' + (mime.indexOf('quicktime') >= 0 ? 'MOV' : mime.indexOf('mp4') >= 0 ? 'MP4' : 'WebM') + '\u2026');
    self.posterDraw(g, 0, s.scale);
    rec.start();
    var t0 = performance.now(), i = -1;
    (function step() {
      i++;
      if (i >= N) { rec.stop(); return; }
      self.posterDraw(g, i * 1000 / s.fps, s.scale);
      if (track.requestFrame) track.requestFrame();
      self.prog(i, N, 'Recording ' + Math.round(i / N * 100) + '%');
      var target = t0 + (i + 1) * 1000 / s.fps;
      setTimeout(step, Math.max(0, target - performance.now()));
    })();
  });
};
Garden.prototype.exportGIF = async function () {
  var self = this, s = this.expSettings(), P = this.P;
  var W = Math.round(this.ZW * s.scale), H = Math.round(this.ZH * s.scale), N = Math.max(1, Math.round(P.T / 1000 * s.fps));
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d', { willReadFrequently: true });
  var per = Math.max(400, Math.floor(24000 / N));
  var step = Math.max(1, Math.floor(Math.sqrt(W * H / per)));
  var samples = [], i, x, y;
  for (i = 0; i < N; i++) {
    self.posterDraw(g, i * 1000 / s.fps, s.scale);
    var data = g.getImageData(0, 0, W, H).data;
    for (y = 0; y < H; y += step) for (x = 0; x < W; x += step) {
      var p = (y * W + x) * 4;
      samples.push(data[p], data[p + 1], data[p + 2]);
    }
    self.prog(i, N * 2, 'Analyzing colors ' + Math.round(i / N * 100) + '%');
    if (i % 5 === 0) await nextTick();
  }
  var pal = quantizeColors(samples, 256), lut = buildPaletteLUT(pal);
  var parts = [];
  parts.push(gBytes([71, 73, 70, 56, 57, 97])); // GIF89a
  parts.push(gBytes(gU16(W).concat(gU16(H)).concat([0xF7, 0, 0])));
  var gct = new Uint8Array(768);
  for (i = 0; i < 256; i++) { var col = pal[i] || [0, 0, 0]; gct[i * 3] = col[0]; gct[i * 3 + 1] = col[1]; gct[i * 3 + 2] = col[2]; }
  parts.push(gct);
  parts.push(gBytes([0x21, 0xFF, 0x0B, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 0x03, 0x01, 0x00, 0x00, 0x00]));
  var delay = Math.max(2, Math.round(100 / s.fps));
  for (i = 0; i < N; i++) {
    self.posterDraw(g, i * 1000 / s.fps, s.scale);
    var px = g.getImageData(0, 0, W, H).data;
    var idx = new Uint8Array(W * H);
    for (var q = 0; q < idx.length; q++) { var o = q * 4; idx[q] = lut[((px[o] >> 3) << 10) | ((px[o + 1] >> 3) << 5) | (px[o + 2] >> 3)]; }
    var lzw = gifLZW(idx, 8);
    parts.push(gBytes([0x21, 0xF9, 0x04, 0x04, delay & 255, (delay >> 8) & 255, 0, 0x00]));
    parts.push(gBytes([0x2C].concat(gU16(0), gU16(0), gU16(W), gU16(H), [0x00])));
    parts.push(gBytes([8]));
    parts.push(gifSubBlocks(lzw));
    self.prog(N + i, N * 2, 'Encoding GIF ' + Math.round(i / N * 100) + '%');
    if (i % 3 === 0) await nextTick();
  }
  parts.push(gBytes([0x3B]));
  this.dl(new Blob(parts, { type: 'image/gif' }), this.posterExportName('gif'));
  this.setStatus('Saved GIF \u00b7 ' + N + ' frames @ ' + s.fps + ' fps');
};
Garden.prototype.exportAPNG = async function () {
  if (typeof CompressionStream === 'undefined') throw new Error('APNG requires a newer browser');
  var self = this, s = this.expSettings(), P = this.P;
  var W = Math.round(this.ZW * s.scale), H = Math.round(this.ZH * s.scale), N = Math.max(1, Math.round(P.T / 1000 * s.fps));
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d', { willReadFrequently: true });
  var parts = [gBytes([137, 80, 78, 71, 13, 10, 26, 10])];
  parts.push(pngChunk('IHDR', gBytes(bU32(W).concat(bU32(H), [8, 6, 0, 0, 0]))));
  parts.push(pngChunk('acTL', gBytes(bU32(N).concat(bU32(0)))));
  var seq = 0;
  for (var i = 0; i < N; i++) {
    self.posterDraw(g, i * 1000 / s.fps, s.scale);
    var id = g.getImageData(0, 0, W, H).data;
    var raw = new Uint8Array((W * 4 + 1) * H), row = W * 4;
    for (var yy = 0; yy < H; yy++) {
      raw[yy * (row + 1)] = 0;
      raw.set(id.subarray(yy * row, (yy + 1) * row), yy * (row + 1) + 1);
    }
    var comp = await deflateBytes(raw);
    var fctl = gBytes(bU32(seq++).concat(bU32(W), bU32(H), bU32(0), bU32(0), bU16(1), bU16(s.fps), [0, 0]));
    parts.push(pngChunk('fcTL', fctl));
    if (i === 0) parts.push(pngChunk('IDAT', comp));
    else parts.push(pngChunk('fdAT', gConcat([gBytes(bU32(seq++)), comp])));
    self.prog(i, N, 'Encoding APNG ' + Math.round(i / N * 100) + '%');
    if (i % 3 === 0) await nextTick();
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  this.dl(new Blob(parts, { type: 'image/apng' }), this.posterExportName('png'));
  this.setStatus('Saved APNG \u00b7 ' + N + ' frames @ ' + s.fps + ' fps');
};
Garden.prototype.exportFormat = async function (fmt) {
  if (this.busy || !this.P) return;
  var self = this, s = this.expSettings();
  this.setBusy(true);
  this.setStatus('');
  var st = document.getElementById('pexpstatus'); if (st) st.textContent = '';
  this.prog(0, 1, 'Preparing\u2026');
  try {
    if (EXPORT_FORMATS.still.some(function (f) { return f.id === fmt; })) {
      await this.runStill(fmt);
      var ext = fmt === 'jpeg' ? 'jpg' : fmt;
      this.setStatus('Saved ' + ext.toUpperCase() + ' \u00b7 ' + Math.round(this.ZW * s.scale) + '\u00d7' + Math.round(this.ZH * s.scale));
    } else if (fmt === 'gif') {
      await this.exportGIF();
    } else if (fmt === 'apng') {
      await this.exportAPNG();
    } else if (fmt === 'pngzip' || fmt === 'svgzip') {
      var kind = fmt === 'svgzip' ? 'svg' : 'png';
      var res = await this.runSequence(kind);
      this.dl(this.zip(res.files), this.fname() + '-' + kind + '-frames.zip');
      this.setStatus('Saved ' + res.N + ' ' + kind.toUpperCase() + ' frames \u00b7 ' + s.fps + ' fps');
    } else {
      var vr = await this.exportVideoFmt(fmt);
      this.dl(vr.blob, this.posterExportName(vr.ext));
      this.setStatus('Saved ' + vr.ext.toUpperCase() + ' \u00b7 ' + vr.N + ' frames @ ' + s.fps + ' fps');
    }
    if (st) st.textContent = this.status;
  } catch (e) {
    this.setStatus(e && e.message ? e.message : 'Export failed');
    if (st) st.textContent = this.status;
  } finally {
    this.setBusy(false);
    this.progDone();
  }
};
Garden.prototype.zip = function (files) {
  var crcT = this._crcT || (this._crcT = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })());
  var crc = function (d) { var c = 0xFFFFFFFF; for (var i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  var enc = new TextEncoder(), parts = [], cen = [], off = 0;
  for (var fi = 0; fi < files.length; fi++) {
    var f = files[fi], nm = enc.encode(f.name), cr = crc(f.data), sz = f.data.length;
    var h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(12, 33, true);
    h.setUint32(14, cr, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true);
    parts.push(h.buffer, nm, f.data);
    var c2 = new DataView(new ArrayBuffer(46));
    c2.setUint32(0, 0x02014b50, true); c2.setUint16(4, 20, true); c2.setUint16(6, 20, true); c2.setUint16(14, 33, true);
    c2.setUint32(16, cr, true); c2.setUint32(20, sz, true); c2.setUint32(24, sz, true); c2.setUint16(28, nm.length, true); c2.setUint32(42, off, true);
    cen.push(c2.buffer, nm);
    off += 30 + nm.length + sz;
  }
  var cs = cen.reduce(function (s, b) { return s + (b.byteLength || b.length); }, 0);
  var e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(cen, [e.buffer]), { type: 'application/zip' });
};

Garden.prototype.bind = function () {
  var self = this;
  window.addEventListener('resize', function () { self.resize(); });
  window.addEventListener('keydown', function (e) { self.key(e); });
  this.inp.addEventListener('input', function (e) { self.inputDiff(e.target); });
  this.inp.addEventListener('compositionstart', function () { self.composing = true; });
  this.inp.addEventListener('compositionend', function () {
    self.composing = false;
    setTimeout(function () { if (!self.composing) self.inputDiff(self.inp); }, 0);
  });
  this.app.addEventListener('pointerdown', function (e) {
    self.ptype = e.pointerType || 'mouse';
    if (e.target === self.cv) {
      if (self.touch) { try { self.inp.focus({ preventScroll: true }); } catch (err) {} }
      self.onTap(e.clientX, e.clientY);
    }
    if (!self.touch) self.refocus();
  });
  window.addEventListener('pointermove', function (e) {
    self.mx = e.clientX; self.my = e.clientY;
    self.ptype = e.pointerType || self.ptype;
  });
  window.addEventListener('pointerup', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') { self.mx = null; self.my = null; }
  });
  window.addEventListener('pointercancel', function () { self.mx = null; self.my = null; });
  document.addEventListener('pointerleave', function () { self.mx = null; self.my = null; });
};

/* gestures: a single tap/click spawns a butterfly after a short delay, so a
   second tap within 300ms can cancel it and bloom a new flower instead. */
Garden.prototype.onTap = function (x, y) {
  var now = performance.now(), self = this, t = this._tap;
  if (t && (now - t.t) < 300 && Math.hypot(x - t.x, y - t.y) < 32) {
    if (t.timer) clearTimeout(t.timer);
    this._tap = null;
    this.bloomAt(x, y);
    return;
  }
  var tap = { x: x, y: y, t: now, timer: 0 };
  tap.timer = setTimeout(function () {
    if (self._tap === tap) { self._tap = null; self.spawnFly(x, y); }
  }, 250);
  this._tap = tap;
};
Garden.prototype.bloomAt = function (cx, cy) {
  if (!this.W) return;
  var now = performance.now();
  var l = {
    free: true, ch: '', id: this.uid++, birth: now, tb: now,
    ws: Math.floor(this.rand() * 1e9), wi: 0, prev: null
  };
  this.gen(l);
  l.x = cx; l.y = cy; l.tx = cx; l.ty = cy;
  this.flowers.push(l);
};

/* ---------------- math ---------------- */
/* h, spr, eo, eb, rng, bez, at are imported from ./src/math.js and
   attached to Garden.prototype above. */
Garden.prototype.jit = function (id, f, amp) {
  if (!amp) return [0, 0, 0];
  return [
    (this.h(id * 1.37 + f * 7.13) * 2 - 1) * amp,
    (this.h(id * 2.71 + f * 3.11) * 2 - 1) * amp,
    (this.h(id * 5.3 + f * 1.7) * 2 - 1) * 0.035
  ];
};
Garden.prototype.path = function (c, p, closed) {
  var n = p.length; if (n < 2) return;
  function m(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  if (closed) {
    var s = m(p[n - 1], p[0]); c.moveTo(s[0], s[1]);
    for (var i = 0; i < n; i++) { var q = m(p[i], p[(i + 1) % n]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
    c.closePath();
  } else {
    c.moveTo(p[0][0], p[0][1]);
    for (var j = 1; j < n - 1; j++) { var q2 = m(p[j], p[j + 1]); c.quadraticCurveTo(p[j][0], p[j][1], q2[0], q2[1]); }
    c.lineTo(p[n - 1][0], p[n - 1][1]);
  }
};
Garden.prototype.backend = function (g) {
  var self = this;
  return {
    fill: function (p, col) { g.beginPath(); self.path(g, p, true); g.fillStyle = col; g.fill(); },
    stroke: function (p, col, w) { g.beginPath(); self.path(g, p, false); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); },
    rect: function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); },
    text: function (ch, x, y, S, col) { g.font = '700 ' + S + 'px ' + self.F; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = col; g.fillText(ch, x, y); }
  };
};

/* ---------------- layout ---------------- */
Garden.prototype.resize = function () {
  var c = this.cv, r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  if (!r.width || !r.height) return;
  this.W = r.width; this.H = r.height; this.dpr = d;
  c.width = Math.round(r.width * d);
  c.height = Math.round(r.height * d);
  this.layout(true);
};
Garden.prototype.mw = function (ch) {
  if (this.cache[ch] != null) return this.cache[ch];
  this.g.font = '700 100px ' + this.F;
  var w = this.g.measureText(ch).width / 100;
  if (ch === ' ') w *= 1.4;
  return (this.cache[ch] = w);
};
Garden.prototype.layoutCore = function (A, W, H, prevWrapped) {
  var self = this;
  var maxW = W * 0.8, S0 = H * 0.28, LH = 2.1;
  var ws = A.map(function (l) { return self.mw(l.ch); });
  var words = []; var cur = null;
  A.forEach(function (l, i) {
    if (l.ch === ' ') { if (cur) { words.push(cur); cur = null; } words.push({ sp: true, idx: [i] }); }
    else { if (!cur) cur = { idx: [] }; cur.idx.push(i); }
  });
  if (cur) words.push(cur);
  function lineW(li, S) {
    var e = li.length;
    while (e > 0 && A[li[e - 1]].ch === ' ') e--;
    var w = 0;
    for (var k = 0; k < e; k++) w += ws[li[k]];
    return w * S;
  }
  function wrap(S) {
    var lines = [[]]; var lw = 0;
    for (var wi = 0; wi < words.length; wi++) {
      var wd = words[wi], ww = 0;
      for (var k = 0; k < wd.idx.length; k++) ww += ws[wd.idx[k]];
      ww *= S;
      if (!wd.sp && lw > 0 && lw + ww > maxW) { lines.push([]); lw = 0; }
      for (var k2 = 0; k2 < wd.idx.length; k2++) lines[lines.length - 1].push(wd.idx[k2]);
      lw += ww;
    }
    return lines;
  }
  var lines = [A.map(function (_, i) { return i; })];
  var unit = lineW(lines[0], 1);
  var S = unit > 0 ? Math.min(S0, maxW / unit) : S0;
  var multi = words.filter(function (w) { return !w.sp; }).length > 1;
  var wrapped = multi && (S < H * 0.1 || (prevWrapped && S < H * 0.14));
  if (wrapped) {
    var lo = H * 0.03, hi = H * 0.15;
    for (var k3 = 0; k3 < 22; k3++) {
      var mid = (lo + hi) / 2, ls = wrap(mid);
      var ok = ls.every(function (li) { return lineW(li, mid) <= maxW; }) && ls.length * LH * mid <= H * 0.82;
      if (ok) lo = mid; else hi = mid;
    }
    S = lo; lines = wrap(S);
    if (lines.length < 2) wrapped = false;
  }
  var n = lines.length, lh = LH * S;
  lines.forEach(function (li, k) {
    var x = W / 2 - lineW(li, S) / 2;
    var y = H / 2 + (k - (n - 1) / 2) * lh + 0.33 * S;
    li.forEach(function (i) {
      var l = A[i], w = ws[i] * S;
      l.tx = x + w / 2; l.ty = y; l.tw = w; l.line = k; x += w;
    });
  });
  return { S: S, wrapped: wrapped, n: n };
};
Garden.prototype.layout = function (snap) {
  if (!this.W) return;
  var A = this.letters.filter(function (l) { return !l.dead; });
  var res = this.layoutCore(A, this.W, this.H, this.wrapped);
  this.wrapped = res.wrapped;
  A.forEach(function (l) { if (l.x == null) { l.x = l.tx; l.y = l.ty; } });
  var S = res.S, last = A[A.length - 1];
  this.St = S;
  this.ctx_ = last ? last.tx + last.tw / 2 + 0.07 * S : this.W / 2;
  this.cty = last ? last.ty - 0.33 * S : this.H / 2;
  if (snap || !this.Sd) {
    this.Sd = S; this.cx = this.ctx_; this.cy = this.cty;
    A.forEach(function (l) { l.x = l.tx; l.y = l.ty; });
  }
};

/* ---------------- growth ---------------- */
Garden.prototype.vine = function (base, dir, len, curvy, waves, phase, bend, n) {
  if (!n) n = 40;
  var x = base[0], y = base[1], P = [[x, y]];
  for (var i = 1; i <= n; i++) {
    var t = i / n;
    var a = dir + bend * t + Math.sin(t * waves + phase) * curvy * 0.35;
    x += Math.cos(a) * (len / n);
    y += Math.sin(a) * (len / n);
    P.push([x, y]);
  }
  return P;
};
Garden.prototype.curl = function (P, sgn, r0) {
  var Q = P.slice();
  var end = Q[Q.length - 1];
  var prev = Q[Q.length - 2] || end;
  var base = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  var cx = end[0] + Math.cos(base + sgn * Math.PI / 2) * r0;
  var cy = end[1] + Math.sin(base + sgn * Math.PI / 2) * r0;
  var a0 = Math.atan2(end[1] - cy, end[0] - cx);
  for (var i = 1; i <= 12; i++) {
    var t = i / 12;
    var a = a0 + sgn * t * 2.6;
    var rr = r0 * (1 - t * 0.55);
    Q.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return Q;
};
Garden.prototype.weave = function (r, startLayer) {
  var cuts = [], layer = startLayer, u0 = 0;
  var n = 1 + Math.floor(r() * 3);
  for (var i = 0; i < n; i++) cuts.push(0.15 + r() * 0.65);
  cuts.sort(function (a, b) { return a - b; });
  var segs = [];
  for (var c = 0; c < cuts.length; c++) {
    if (cuts[c] <= u0) continue;
    segs.push({ u0: u0, u1: cuts[c], layer: layer });
    if (r() < 0.3) { var g = 0.02 + r() * 0.03; u0 = Math.min(0.98, cuts[c] + g); }
    else u0 = cuts[c];
    layer = 1 - layer;
  }
  segs.push({ u0: u0, u1: 1, layer: layer });
  return segs;
};
Garden.prototype.layerAt = function (segs, u) {
  for (var i = 0; i < segs.length; i++) if (u >= segs[i].u0 && u <= segs[i].u1) return segs[i].layer;
  return segs[segs.length - 1].layer;
};
Garden.prototype.wordParams = function (ws) {
  var r = this.rng(ws * 7 + 13);
  var dens = this.opts.density;
  return {
    roseP: 0.3 + r() * 0.3,
    leafy: (0.6 + r() * 0.8) * dens,
    dens: dens,
    lean: (r() - 0.5) * 0.6,
    big: 0.85 + r() * 0.45,
    curvy: 0.8 + r() * 0.6,
    bridgeP: Math.min(0.95, (0.45 + r() * 0.35) * dens),
    w: 0.5
  };
};
Garden.prototype.grow = function (r, E, nid, p, o) {
  var tip = o.tip || (r() < p.roseP ? 'rose' : r() < 0.45 ? 'fan' : r() < 0.6 ? 'leaf' : 'curl');
  var P = o.pts || this.vine(o.base, o.dir, o.len, (0.35 + r() * 0.45) * p.curvy, 1 + r() * 1.6, r() * 6.28, (r() - 0.5) * 1.2, 40);
  if (tip === 'curl') P = this.curl(P, r() < 0.5 ? -1 : 1, 0.05 + r() * 0.05);
  var segs = this.weave(r, o.layer0 != null ? o.layer0 : (r() < 0.5 ? 0 : 1));
  var dur = Math.max(MOTION.growMin, (o.len || 0.8) * MOTION.growDur);
  var thorns = [], nt = Math.floor(r() * 2.5);
  for (var i = 0; i < nt; i++) thorns.push({ u: 0.15 + r() * 0.65, s: r() < 0.5 ? -1 : 1 });
  E.push({ t: 'stem', id: nid(), pts: P, segs: segs, d0: o.d0, dur: dur, w: o.depth ? 0.82 : 1, thorns: thorns });
  var nl = Math.floor(r() * 2.8 * p.leafy);
  var sd = r() < 0.5 ? -1 : 1;
  for (var j = 0; j < nl; j++) {
    var u = 0.25 + r() * 0.6, qa = this.at(P, u);
    sd = -sd;
    E.push({ t: 'leaf', id: nid(), x: qa[0][0], y: qa[0][1], a: qa[1] + sd * (0.55 + r() * 0.5), L: (0.14 + r() * 0.2) * (o.depth ? 0.8 : 1), bend: (r() - 0.5) * 1.2, layer: this.layerAt(segs, u), d0: o.d0 + dur * u });
  }
  var tp = this.at(P, 1), tpP = tp[0], ta = tp[1], td = o.d0 + dur * 0.8, tl = this.layerAt(segs, 1);
  if (tip === 'rose') {
    var R = (0.13 + r() * 0.15) * p.big * (o.depth ? 0.75 : 1);
    var over = tpP[1] > -0.78 && tpP[1] < 0.05 && Math.abs(tpP[0]) < p.w * 0.5;
    var layer = over ? (r() < 0.22 ? 1 : 0) : (r() < 0.6 ? 1 : tl);
    E.push({ t: 'rose', id: nid(), x: tpP[0], y: tpP[1], R: R, rot: (r() - 0.5) * 1.0, ph1: r() * 6.28, ph2: r() * 6.28, turns: 1.8 + r() * 1, layer: layer, d0: td });
    if (r() < 0.2) {
      var oo = ta + (r() < 0.5 ? 1 : -1) * 1.3;
      E.push({ t: 'rose', id: nid(), x: tpP[0] + Math.cos(oo) * R * 1.4, y: tpP[1] + Math.sin(oo) * R * 1.4, R: R * (0.6 + r() * 0.3), rot: (r() - 0.5) * 1.2, ph1: r() * 6.28, ph2: r() * 6.28, turns: 1.8 + r(), layer: layer, d0: td + 120 });
    }
  } else if (tip === 'fan') {
    var spread = 0.6 + r() * 0.3;
    for (var j2 = 0; j2 < 2; j2++) E.push({ t: 'leaf', id: nid(), x: tpP[0], y: tpP[1], a: ta + (j2 - 0.5) * spread, L: 0.2 + r() * 0.2, bend: (j2 - 0.5) * 0.8, layer: tl, d0: td + j2 * 60 });
  } else if (tip === 'leaf') {
    E.push({ t: 'leaf', id: nid(), x: tpP[0], y: tpP[1], a: ta + (r() - 0.5) * 0.3, L: 0.16 + r() * 0.16, bend: (r() - 0.5), layer: tl, d0: td });
  }
  if (!o.depth && r() < 0.3) {
    var u2 = 0.35 + r() * 0.35, qa2 = this.at(P, u2);
    this.grow(r, E, nid, p, { base: qa2[0], dir: qa2[1] + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.4), len: (o.len || 0.8) * (0.35 + r() * 0.2), d0: o.d0 + dur * u2, depth: 1, layer0: this.layerAt(segs, u2) });
  }
  return P;
};
Garden.prototype.gen = function (l) {
  var r = this.rng((l.ws ^ Math.imul(l.wi + 1, 2654435761)) + Math.floor(this.rand() * 1e6));
  var p = this.wordParams(l.ws), E = [], k0 = 0;
  var nid = function () { return l.id * 100 + (k0++); };
  var w = this.mw(l.ch);
  function inX() { return (r() - 0.5) * w * 0.7; }
  p.w = w;
  var nUp = 1 + (r() < 0.45 * p.dens ? 1 : 0);
  for (var i = 0; i < nUp; i++) {
    this.grow(r, E, nid, p, { base: [inX(), -r() * 0.3], dir: -Math.PI / 2 + p.lean * 0.5 + (r() - 0.5) * 0.7, len: 0.6 + r() * 0.5, d0: 40 + i * 130, tip: l.wi === 0 && i === 0 ? 'rose' : null });
  }
  if (r() < 0.4 * p.dens) this.grow(r, E, nid, p, { base: [inX(), -0.1 - r() * 0.35], dir: Math.PI / 2 + (r() - 0.5) * 0.8, len: 0.35 + r() * 0.35, d0: 160 });
  if (l.prev && r() < p.bridgeP) {
    var pw = this.mw(l.prev.ch);
    var px = -(pw + w) / 2;
    var a = [inX(), -0.05 - r() * 0.55], b = [px + (r() - 0.5) * 0.25, -0.05 - r() * 0.55];
    var bulge = (r() < 0.55 ? -1 : 1) * (0.4 + r() * 0.4), dx = b[0] - a[0];
    var Pb = this.bez(a, [a[0] + dx * 0.15, a[1] + bulge], [b[0] - dx * 0.15, b[1] + bulge * 0.9], b, 40);
    if (r() < 0.45) Pb = Pb.slice(0, Math.floor(Pb.length * (0.7 + r() * 0.2)));
    var tipB = r() < 0.5 ? 'curl' : (r() < 0.5 ? 'leaf' : 'rose');
    this.grow(r, E, nid, p, { pts: Pb, len: Math.abs(dx) + Math.abs(bulge), d0: 90, tip: tipB });
  }
  if (l.wi === 0) this.grow(r, E, nid, p, { base: [-w * 0.3, -0.15 - r() * 0.4], dir: Math.PI + (r() - 0.5) * 1.2, len: 0.45 + r() * 0.3, d0: 120, tip: 'curl' });
  l.els = E;
  l.endEls = null;
  var T = [], tr = this.rng(l.id * 977 + Math.floor(this.rand() * 1e6));
  this.grow(tr, T, function () { return l.id * 100 + 90 + T.length; }, p, { base: [w * 0.25, -0.1 - tr() * 0.45], dir: (tr() - 0.5) * 1.4, len: 0.45 + tr() * 0.25, d0: 0, tip: 'curl', depth: 1 });
  l.tend = T.filter(function (e) { return e.t === 'stem'; }).slice(0, 1);
};
Garden.prototype.genEnd = function (l, rel) {
  var r = this.rng(l.ws + l.wi * 31 + Math.floor(this.rand() * 1e6));
  var p = this.wordParams(l.ws), E = [], k0 = 50;
  var nid = function () { return l.id * 100 + (k0++); };
  var w = this.mw(l.ch), n = 1 + Math.floor(r() * 2.5);
  p.w = w;
  for (var i = 0; i < n; i++) {
    var dir = -Math.PI / 2 + 0.6 + (i - (n - 1) / 2) * 0.9 + (r() - 0.5) * 0.4;
    this.grow(r, E, nid, p, { base: [(r() - 0.2) * w * 0.6, -r() * 0.5], dir: dir, len: 0.4 + r() * 0.45, d0: rel + 40 + i * 90, depth: 1, tip: (i === 0 || r() < 0.5) ? 'rose' : 'fan' });
  }
  l.endEls = E;
};

/* ---------------- draw ---------------- */
Garden.prototype.strokeRange = function (B, P, a, b, col, w) {
  var n = P.length - 1, ia = a * n, ib = b * n;
  function lerp(t) { var i = Math.min(n - 1, Math.floor(t)), f = t - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f]; }
  var pts = [lerp(ia)];
  for (var i = Math.floor(ia) + 1; i < ib; i++) pts.push(P[i]);
  pts.push(lerp(ib));
  if (pts.length >= 2) B.stroke(pts, col, w);
};
Garden.prototype.thorn = function (B, P, u, s, S) {
  var qa = this.at(P, u), p = qa[0], a = qa[1], d = a + s * 2.3, L = S * 0.045;
  B.stroke([p, [p[0] + Math.cos(d) * L, p[1] + Math.sin(d) * L]], this.cc.blue, S * 0.022);
};
Garden.prototype.leaf = function (B, bx, by, a, L, bend) {
  if (L < 0.5) return;
  var ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  function ax(u) { var b = Math.sin(Math.PI * u) * bend * 0.15 * L; return [bx + ca * u * L + px * b, by + sa * u * L + py * b]; }
  function hw(u) { return L * 0.18 * Math.sin(Math.PI * Math.pow(u, 0.8)); }
  var N = 12, s1 = [], s2 = [];
  for (var i = 0; i <= N; i++) {
    var u = i / N, c = ax(u), w = hw(u);
    s1.push([c[0] + px * w, c[1] + py * w]);
    s2.push([c[0] - px * w, c[1] - py * w]);
  }
  var tip = ax(1), base = ax(0);
  var poly = [base];
  for (var k = 1; k < N; k++) poly.push(s1[k]);
  poly.push(tip, tip);
  for (var k2 = N - 1; k2 >= 1; k2--) poly.push(s2[k2]);
  poly.push(base);
  B.fill(poly, this.cc.blue);
  if (L > 6) {
    var v = [];
    for (var j = 0; j <= 8; j++) v.push(ax(0.08 + 0.72 * j / 8));
    B.stroke(v, this.cc.vein, Math.max(0.8, L * 0.03));
  }
};
Garden.prototype.rose = function (B, cx, cy, R, rot, e, a, tl) {
  var cr = Math.cos(rot), sr = Math.sin(rot);
  var tm = tl ? Math.hypot(tl[0], tl[1]) : 0;
  var ux = tm ? tl[0] / tm : 0, uy = tm ? tl[1] / tm : 0, sq = -0.28 * tm;
  function T(x, y, z) {
    if (z == null) z = 0;
    var dx = x * cr - y * sr, dy = x * sr + y * cr;
    if (tm) { var k = (dx * ux + dy * uy) * sq; dx += k * ux + tl[0] * R * z; dy += k * uy + tl[1] * R * z; }
    return [cx + dx, cy + dy];
  }
  var Petals = [
    [0, -0.36, 0.56, 0.54, 0, 0, 0],
    [-0.5, -0.06, 0.6, 0.6, -0.35, 0, 0],
    [0.52, -0.06, 0.6, 0.6, 0.35, 0, 0],
    [-0.42, 0.3, 0.62, 0.48, 0.2, 0.12, 1],
    [0.47, 0.3, 0.62, 0.48, -0.2, 0.12, 1],
    [0.05, 0.42, 0.56, 0.38, 0, 0.14, 0]
  ];
  var lw = Math.max(0.8, R * 0.045), st = 85, self = this;
  var vs = 1 + (this.h(e.id * 2.3) - 0.5) * 0.22;
  var vrot = (this.h(e.id * 4.7) - 0.5) * 0.5;
  Petals.forEach(function (q, i) {
    var s = self.spr((a - i * st) / 1000, MOTION.petalK, MOTION.petalW);
    if (s <= 0.001) return;
    var open = (1 - Math.min(1, s)) * (q[0] < 0 ? 0.5 : -0.5);
    var ang = q[4] + open + vrot, ca = Math.cos(ang), sa = Math.sin(ang);
    function pt(th) {
      var rr = 1 + 0.08 * Math.sin(3 * th + e.ph1 + i) + 0.04 * Math.sin(5 * th + e.ph2);
      var lx = Math.cos(th) * q[2] * vs * rr, ly = Math.sin(th) * q[3] * (2 - vs) * rr;
      var ppx = q[0] + lx * ca - ly * sa, ppy = q[1] + lx * sa + ly * ca;
      return T(ppx * s * R, (0.5 + (ppy - 0.5) * s) * R, q[5]);
    }
    var pts = [];
    for (var k = 0; k < 26; k++) pts.push(pt(k / 26 * Math.PI * 2));
    B.fill(pts, self.cc.red);
    if (q[6] && R >= 12 && s > 0.4) {
      var arc = [];
      for (var k2 = 0; k2 <= 14; k2++) arc.push(pt(Math.PI * (1.18 + 0.64 * k2 / 14)));
      self.strokeRange(B, arc, 0, Math.min(1, (s - 0.4) / 0.5), self.cc.line, lw * 0.8);
    }
  });
  if (R >= 20) {
    var si = this.spr((a - 200) / 1000, MOTION.petalK, MOTION.petalW);
    if (si > 0.02) {
      var innN = 3;
      for (var ii = 0; ii < innN; ii++) {
        var ang2 = ii / innN * Math.PI * 2 + 0.5 + vrot;
        var ox = Math.cos(ang2) * 0.18, oy = Math.sin(ang2) * 0.15 - 0.06, pa = [];
        for (var k3 = 0; k3 < 20; k3++) {
          var th3 = k3 / 20 * Math.PI * 2;
          var lx3 = Math.cos(th3) * 0.26 * vs, ly3 = Math.sin(th3) * 0.2 * (2 - vs);
          pa.push(T((ox + lx3) * si * R, (oy + ly3) * si * R, 0.32));
        }
        B.fill(pa, this.cc.red);
      }
    }
  }
  var fr = this.eo((a - Petals.length * st - 80) / 520);
  if (fr > 0 && R > 3) {
    var sp = [];
    var turns = R < 20 ? Math.min(e.turns, 1.3) : R < 32 ? e.turns * 0.8 : e.turns;
    for (var j = 0; j <= 70; j++) {
      var u = j / 70, th = e.ph1 + u * turns * Math.PI * 2, rr = R * (0.08 + 0.57 * u);
      sp.push(T(Math.cos(th) * rr * 1.05, Math.sin(th) * rr * 0.72 - 0.12 * R, 0.34 - 0.24 * u));
    }
    this.strokeRange(B, sp, 0, fr, this.cc.line, lw);
    if (R >= 14) {
      var scl = [];
      for (var j2 = 0; j2 <= 36; j2++) {
        var u2 = j2 / 36;
        scl.push(T((-0.72 + 1.5 * u2) * R, 0.36 * R + 0.16 * R * Math.abs(Math.sin(u2 * Math.PI * 3)), 0.18));
      }
      this.strokeRange(B, scl, 0, fr, this.cc.line, lw);
    }
  }
};
Garden.prototype.wpt = function (st, l, x, y) {
  if (l.birth != null && this._now != null) {
    var t = (this._now - l.birth) * (st.speed || 1) / 1000;
    if (t > 0 && t < 2.5) {
      var hh = Math.max(0, (l.y - y) / st.S), dmp = Math.exp(-t * 3.2), dir = (l.id % 2 ? 1 : -1);
      x += st.S * 0.07 * hh * dmp * Math.sin(t * 11) * dir;
      y += st.S * 0.035 * hh * dmp * Math.sin(t * 11 + 1.2);
    }
  }
  if (st.sway && this._now != null) {
    var hh3 = Math.max(0, (l.y - y) / st.S), ts = this._now / 1000;
    x += Math.sin(ts * 1.1 + l.id * 0.7) * st.S * 0.022 * hh3 * st.sway;
    y += Math.cos(ts * 0.83 + l.id * 1.3) * st.S * 0.011 * hh3 * st.sway;
  }
  if (st.face && l.lean) {
    var hh2 = Math.min(2.5, Math.max(0, (l.y - y) / st.S)), ff = hh2 * hh2 * 0.5 + hh2 * 0.5;
    x += l.lean[0] * st.S * 0.1 * ff;
    y += l.lean[1] * st.S * 0.05 * ff;
  }
  return st.warp ? st.warp(x, y, l) : [x, y];
};
Garden.prototype.drawStem = function (B, e, l, age, kk, st, f, amp, layer, frO) {
  var S = st.S;
  var fr = frO != null ? frO : this.eo((age - e.d0) / e.dur) * kk;
  if (fr <= 0) return;
  var j = this.jit(e.id, f, amp);
  var P = [];
  for (var p = 0; p < e.pts.length; p++) {
    var q = e.pts[p];
    P.push(this.wpt(st, l, l.x + q[0] * S + j[0], l.y + q[1] * S + j[1]));
  }
  for (var s = 0; s < e.segs.length; s++) {
    var sg = e.segs[s];
    if (sg.layer !== layer) continue;
    var b = Math.min(sg.u1, fr);
    if (b <= sg.u0) continue;
    this.strokeRange(B, P, sg.u0, b, st.C.blue, S * 0.022 * (e.w || 1));
  }
  for (var t = 0; t < e.thorns.length; t++) {
    var th = e.thorns[t];
    if (fr > th.u && this.layerAt(e.segs, th.u) === layer) this.thorn(B, P, th.u, th.s, S);
  }
};
Garden.prototype.drawEl = function (B, e, l, age, kk, st, f, amp) {
  var S = st.S, j = this.jit(e.id, f, amp), self = this;
  function wx(x, y) { return self.wpt(st, l, l.x + x * S + j[0], l.y + y * S + j[1]); }
  var rw = st.rotw ? st.rotw(e) : 0;
  if (e.t === 'leaf') {
    var sc = this.spr((age - e.d0) / 1000, MOTION.leafK, MOTION.leafW) * kk;
    if (sc <= 0) return;
    var p = wx(e.x, e.y);
    this.leaf(B, p[0], p[1], e.a + j[2] + rw, e.L * S * sc, e.bend);
  } else if (e.t === 'rose') {
    var a = age - e.d0;
    if (a < 0) return;
    if (kk <= 0.001) return;
    var p2 = wx(e.x, e.y);
    var tl = st.face ? this.faceTurn(e, p2[0], p2[1]) : null;
    if ((st.face || st.perchOn) && !l.dead && a > 700) this.perch.push({ id: e.id, x: p2[0], y: p2[1], R: e.R * S * kk });
    this.rose(B, p2[0], p2[1], e.R * S * kk, e.rot + j[2] + rw + (tl ? tl[0] * 0.22 : 0), e, a, tl);
  }
};
Garden.prototype.render = function (B, now, st) {
  var S = st.S, L = st.letters, sp = st.speed || 1;
  this.cc = st.C; this._now = now;
  var i, l;
  if (st.face || st.perchOn) this.perch = [];
  if (st.face) {
    for (i = 0; i < L.length; i++) {
      l = L[i];
      var tx = 0, ty = 0;
      var A = (!l.dead && l.ch !== ' ') ? this.near(l.x, l.y - S * 0.6) : null;
      if (A) {
        var dx = A[0] - l.x, dy = A[1] - (l.y - S * 0.6), d = Math.hypot(dx, dy), reach = Math.max(260, S * 3.2);
        if (d < reach && d > 1) { var w = 1 - d / reach, s = w * w * (3 - 2 * w); tx = dx / d * s; ty = dy / d * s; }
      }
      var c = l.lean || (l.lean = [0, 0]);
      c[0] += (tx - c[0]) * 0.07; c[1] += (ty - c[1]) * 0.07;
    }
  }
  var f = st.boil ? Math.floor(now / 120) : 0;
  var amp = st.boil ? Math.max(0.8, S * 0.01) : 0;
  var self = this;
  function kd(ll) { return ll.dead ? 1 - self.eo((now - ll.dead) / st.wither) : 1; }
  function active(list) {
    var out = [];
    for (var ai = 0; ai < list.length; ai++) if (!list[ai].dead) out.push(list[ai]);
    return out;
  }
  function draw(layer, list, act) {
    for (var li = 0; li < list.length; li++) {
      var ll = list[li];
      if (ll.ch === ' ' || !ll.els) continue;
      var age = (now - ll.birth) * sp, kk = kd(ll);
      var each = function (e) {
        if (e.t === 'stem') self.drawStem(B, e, ll, age, kk, st, f, amp, layer);
        else if (e.layer === layer) self.drawEl(B, e, ll, age, kk, st, f, amp);
      };
      ll.els.forEach(each);
      if (ll.endEls) ll.endEls.forEach(each);
      var idx = act.indexOf(ll), nx = idx >= 0 ? act[idx + 1] : null;
      if (ll.tend && (ll.dead || !nx || nx.ch === ' ')) {
        var fr = self.eo(((now - ll.tb) * sp - 150) / 450);
        if (ll.cut != null) fr *= 1 - self.eo((now - ll.cut) * sp / 150) * Math.min(0.85, st.recoil / (0.6 * S));
        for (var ti = 0; ti < ll.tend.length; ti++) self.drawStem(B, ll.tend[ti], ll, age, kk, st, f, amp, layer, fr * kk);
      }
    }
  }
  var act = active(L);
  draw(0, L, act);
  for (i = 0; i < L.length; i++) {
    l = L[i];
    if (l.ch !== ' ' && (st.textAll || !l.dead)) B.text(l.ch, l.x, l.y, S, st.C.text);
  }
  draw(1, L, act);
  /* double-tap blooms: free-standing flowers that only live in Type mode */
  var FL = st.flowers;
  if (FL && FL.length) {
    var actF = active(FL);
    draw(0, FL, actF);
    draw(1, FL, actF);
  }
};

/* ---------------- butterflies ---------------- */
Garden.prototype.near = function (x, y) {
  if (this.mx == null) return null;
  return [this.mx, this.my];
};
Garden.prototype.faceTurn = function (e, x, y) {
  var wx = 0, wy = 0;
  var A = this.near(x, y);
  if (A) {
    var dx = A[0] - x, dy = A[1] - y, d = Math.hypot(dx, dy), reach = 300;
    if (d < reach && d > 0.001) {
      var w = 1 - d / reach, s = w * w * (3 - 2 * w) * Math.min(1, d / 40);
      wx = dx / d * s; wy = dy / d * s;
    }
  }
  var c = this.fa[e.id] || [0, 0];
  c[0] += (wx - c[0]) * 0.09; c[1] += (wy - c[1]) * 0.09;
  this.fa[e.id] = c;
  return c;
};
Garden.prototype.spawnFly = function (cx, cy) {
  var i;
  if (this.flies.length >= MOTION.flyCap) {
    for (i = 0; i < this.flies.length; i++) if (this.flies[i].st !== 'leave') { this.flyOff(this.flies[i]); break; }
  }
  var taken = {};
  for (i = 0; i < this.flies.length; i++) if (this.flies[i].st !== 'leave' && this.flies[i].pid != null) taken[this.flies[i].pid] = 1;
  var best = null, bd = 1e9;
  for (i = 0; i < this.perch.length; i++) {
    var p = this.perch[i];
    if (taken[p.id]) continue;
    var d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bd) { bd = d; best = p; }
  }
  this.flies.push({
    id: this.uid++,
    x: cx, y: cy,
    tx: best ? best.x : cx, ty: best ? best.y - best.R * 0.55 : cy,
    hx: cx, hy: cy,
    st: best ? 'fly' : 'wander', pid: best ? best.id : null,
    t0: performance.now(), ph: Math.random() * 6.283,
    open: 0, ang: 0, size: Math.max(12, this.Sd * 0.09)
  });
};
Garden.prototype.flyOff = function (f) {
  f.st = 'leave';
  f.tx = f.x < this.W / 2 ? -140 : this.W + 140;
  f.ty = f.y - this.H * 0.3;
};
Garden.prototype.butterfly = function (B, x, y, s, ang, open, C) {
  var ca = Math.cos(ang), sa = Math.sin(ang);
  function T(px, py) { return [x + (px * ca - py * sa) * s, y + (px * sa + py * ca) * s]; }
  function wing(cx, cy, rx, ry, a, side) {
    var pts = [], c = Math.cos(a), sn = Math.sin(a);
    for (var k = 0; k < 22; k++) {
      var th = k / 22 * Math.PI * 2, r = 1 + 0.08 * Math.sin(th * 3);
      var lx = Math.cos(th) * rx * r, ly = Math.sin(th) * ry * r;
      pts.push(T(side * (cx + lx * c - ly * sn) * (0.12 + 0.88 * open), cy + lx * sn + ly * c));
    }
    return pts;
  }
  B.fill(wing(0.34, -0.06, 0.52, 0.56, 0.25, 1), C.text);
  B.fill(wing(0.34, -0.06, 0.52, 0.56, 0.25, -1), C.text);
  B.fill(wing(0.3, 0.14, 0.4, 0.42, -0.3, 1), C.blue);
  B.fill(wing(0.3, 0.14, 0.4, 0.42, -0.3, -1), C.blue);
  var body = [];
  for (var i = 0; i < 12; i++) { var th2 = i / 12 * Math.PI * 2; body.push(T(Math.cos(th2) * 0.07, Math.sin(th2) * 0.34)); }
  B.fill(body, C.red);
  var lw = Math.max(0.6, s * 0.03);
  B.stroke([T(0, -0.34), T(-0.11, -0.6)], C.red, lw);
  B.stroke([T(0, -0.34), T(0.11, -0.6)], C.red, lw);
};
Garden.prototype.drawFlies = function (B, now, C) {
  var keep = [];
  for (var i = 0; i < this.flies.length; i++) {
    var f = this.flies[i];
    var t = (now - f.t0) / 1000;
    if (f.st === 'leave') {
      f.x += (f.tx - f.x) * 0.045;
      f.y += (f.ty - f.y) * 0.04;
      if (f.x < -160 || f.x > this.W + 160 || f.y < -160) continue;
      f.ang += (0 - f.ang) * 0.05;
      this.butterfly(B, f.x, f.y, f.size, f.ang, Math.abs(Math.cos((now - f.t0) / 55)), C);
      keep.push(f);
      continue;
    }
    var p = null;
    if (f.pid != null) {
      for (var k = 0; k < this.perch.length; k++) if (this.perch[k].id === f.pid) { p = this.perch[k]; break; }
    }
    if (f.st === 'fly' && !p) f.st = 'wander';
    var tx, ty;
    if (p) { tx = p.x; ty = p.y - p.R * 0.55; }
    else {
      if (t > MOTION.flyLinger) { this.flyOff(f); continue; }
      tx = f.hx + Math.sin(t * 1.3 + f.ph) * 90;
      ty = f.hy + Math.sin(t * 2.1 + f.ph) * 60;
    }
    var sp = p ? 0.12 : 0.07;
    f.x += (tx - f.x) * sp + Math.sin(t * 7 + f.ph) * 0.6;
    f.y += (ty - f.y) * sp + Math.cos(t * 9 + f.ph) * 0.4;
    f.ang = Math.atan2(ty - f.y, tx - f.x) * 0.5;
    if (p && Math.hypot(tx - f.x, ty - f.y) < 4) f.st = 'sit';
    f.open = f.st === 'sit'
      ? 0.3 + 0.6 * Math.abs(Math.cos((now - f.t0) / 90 + f.ph))
      : 0.15 + 0.85 * Math.abs(Math.cos((now - f.t0) / 45 + f.ph));
    this.butterfly(B, f.x, f.y, f.size, f.ang, f.open, C);
    keep.push(f);
  }
  this.flies = keep;
};

/* ---------------- input ---------------- */
Garden.prototype.key = function (e) {
  if (this.mode !== 'type') return;
  if (e.metaKey || e.ctrlKey || e.altKey) {
    if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (e.shiftKey) this.saveSVG(); else this.savePNG();
    }
    return;
  }
  var now = performance.now(), self = this;
  this._kd = true;
  setTimeout(function () { self._kd = false; }, 0);
  if (e.key === 'Backspace') { e.preventDefault(); this.wither(now); return; }
  if (e.key === 'Enter') { e.preventDefault(); this.letters = []; this.flowers = []; this.layout(); return; }
  if (e.key === ' ') { e.preventDefault(); this.add(' ', now); return; }
  if (e.key && e.key.length === 1) { e.preventDefault(); this.add(e.key, now); return; }
};
Garden.prototype.add = function (ch, now) {
  var A = this.letters.filter(function (l) { return !l.dead; });
  var last = A[A.length - 1];
  if (ch === ' ') {
    if (last && last.ch !== ' ') { last.cut = now; this.genEnd(last, now - last.birth); }
    this.letters.push({ ch: ' ', id: this.uid++, birth: now, els: [] });
    this.layout();
    this.changed();
    return;
  }
  var same = last && last.ch !== ' ';
  var l = {
    ch: ch, id: this.uid++, birth: now, tb: now,
    ws: same ? last.ws : Math.floor(this.rand() * 1e9),
    wi: same ? last.wi + 1 : 0,
    prev: same ? last : null
  };
  this.gen(l);
  this.letters.push(l);
  this.layout();
  this.changed();
};
Garden.prototype.wither = function (now) {
  var A = this.letters.filter(function (l) { return !l.dead; });
  var last = A[A.length - 1];
  if (!last) return;
  last.dead = now;
  var pv = A[A.length - 2];
  if (pv && pv.ch !== ' ') { pv.cut = null; pv.endEls = null; pv.tb = now; }
  this.layout();
  this.changed();
};
Garden.prototype.inputDiff = function (el) {
  if (this.mode !== 'type' || this._kd) { this.iv = this.composing ? el.value : SENT; if (!this.composing) el.value = SENT; return; }
  var old = this.iv == null ? SENT : this.iv, cur = el.value;
  var p = 0;
  while (p < old.length && p < cur.length && old[p] === cur[p]) p++;
  var dels = old.length - p;
  if (p === 0 && old[0] === SENT && old.length > 1) dels -= 1;
  var now = performance.now();
  for (var i = 0; i < dels; i++) this.wither(now);
  for (var j = p; j < cur.length; j++) {
    var ch = cur[j];
    if (ch === SENT) continue;
    if (ch.charCodeAt(0) === 10) { this.letters = []; this.flowers = []; this.layout(); }
    else this.add(ch, now);
  }
  if (this.composing) this.iv = cur;
  else { el.value = SENT; this.iv = SENT; }
};

/* ---------------- frame ---------------- */
Garden.prototype.mainState = function () {
  return {
    letters: this.letters,
    flowers: this.flowers,
    S: this.Sd,
    C: this.pal().C,
    boil: this.opts.boil,
    recoil: this.opts.recoil,
    speed: 1,
    wither: 260,
    sway: MOTION.sway,
    face: true
  };
};
Garden.prototype.paint = function (now) {
  var g = this.g, d = this.dpr;
  g.setTransform(d, 0, 0, d, 0, 0);
  g.fillStyle = this.pal().bg;
  g.fillRect(0, 0, this.W, this.H);
  var B = this.backend(g), st = this.mainState();
  this.render(B, now, st);
  this.drawFlies(B, now, st.C);
};
Garden.prototype.frame = function () {
  var now = performance.now();
  if (this.mode === 'poster') {
    this.lt = now;
    if (this.P && !this.busy) this.posterDraw(this.pcv.getContext('2d'), now - this.pt0);
    return;
  }
  var dt = Math.min(64, now - (this.lt || now));
  this.lt = now;
  var k = 1 - Math.exp(-dt / 80);
  this.Sd += (this.St - this.Sd) * k;
  this.cx += (this.ctx_ - this.cx) * k;
  this.cy += (this.cty - this.cy) * k;
  for (var i = 0; i < this.letters.length; i++) {
    var l = this.letters[i];
    if (!l.dead && l.tx != null) { l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k; }
  }
  this.letters = this.letters.filter(function (l) { return !(l.dead && now - l.dead > 300); });
  this.paint(now);
};

/* ---------------- export ---------------- */
Garden.prototype.dl = function (blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 100);
};
Garden.prototype.savePNG = function () {
  var self = this;
  this.paint(performance.now());
  this.cv.toBlob(function (b) { if (b) self.dl(b, 'garden.png'); self.refocus(); });
};
Garden.prototype.saveSVG = function () {
  var sc = this.svgCtx();
  this.render(this.backend(sc.ctx), performance.now(), this.mainState());
  function n(v) { return Math.round(v * 100) / 100; }
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(this.W) + '" height="' + n(this.H) +
    '" viewBox="0 0 ' + n(this.W) + ' ' + n(this.H) + '">' +
    '<rect width="100%" height="100%" fill="' + this.pal().bg + '"/>' + sc.parts.join('') + '</svg>';
  this.dl(new Blob([svg], { type: 'image/svg+xml' }), 'garden.svg');
  this.refocus();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { window.garden = new Garden(); });
} else {
  window.garden = new Garden();
}
