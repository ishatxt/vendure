import { SENT } from './constants.js';
import { Garden } from './garden.js';

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
    if (self.drag) self.editMove(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', function (e) {
    if (self.drag) self.editUp();
    if (e.pointerType && e.pointerType !== 'mouse') { self.mx = null; self.my = null; }
  });
  window.addEventListener('pointercancel', function () { if (self.drag) self.editUp(); self.mx = null; self.my = null; });
  document.addEventListener('pointerleave', function () { self.mx = null; self.my = null; });
};

/* gestures: a single tap/click spawns a butterfly after a short delay, so a
   second tap within 300ms can cancel it and bloom a new flower instead. */
Garden.prototype.onTap = function (x, y) {
  if (this.emode) { this.editTap(x, y); return; }
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
/* ---------------- edit mode ----------------
   Pick a letter by its draw box, drag it (offset from its layout target), and
   delete it. Offsets live in l.ox/l.oy and are re-applied by layout(), so a
   moved letter stays moved across retype/regrow/resize. */
Garden.prototype.toWorld = function (x, y) {
  var r = this.cv.getBoundingClientRect();
  return [x - r.left, y - r.top];
};
Garden.prototype.pick = function (wx, wy) {
  var A = this.letters, S = this.Sd;
  for (var i = A.length - 1; i >= 0; i--) {
    var l = A[i];
    if (l.dead || l.ch === ' ' || l.tx == null) continue;
    var hw = (l.tw || S * 0.5) / 2;
    if (wx >= l.x - hw && wx <= l.x + hw && wy >= l.y - 0.78 * S && wy <= l.y + 0.22 * S) return l;
  }
  return null;
};
Garden.prototype.editTap = function (x, y) {
  var w = this.toWorld(x, y), l = this.pick(w[0], w[1]);
  this.sel = l;
  if (l) {
    this.drag = { l: l, dx: w[0] - l.x, dy: w[1] - l.y };
    this.app.classList.add('dragging');
    try { this.cv.setPointerCapture && this.cv.setPointerCapture(1); } catch (e) {}
  }
};
Garden.prototype.editMove = function (x, y) {
  if (!this.drag) return;
  var w = this.toWorld(x, y), l = this.drag.l;
  var nx = w[0] - this.drag.dx, ny = w[1] - this.drag.dy;
  if (l.tx == null) { l.tx = l.x; l.ty = l.y; }
  l.ox = (l.ox || 0) + (nx - l.tx);
  l.oy = (l.oy || 0) + (ny - l.ty);
  l.tx = nx; l.ty = ny;
};
Garden.prototype.editUp = function () {
  if (!this.drag) return;
  this.drag = null;
  this.app.classList.remove('dragging');
  this.changed();
};
Garden.prototype.editDelete = function () {
  var l = this.sel;
  if (!l || l.dead) { this.sel = null; return; }
  l.dead = performance.now();
  this.sel = null;
  /* keep the hidden input in sync so liveText()/next keystrokes stay correct */
  this.inp.value = SENT; this.iv = SENT;
  this.layout();
  this.changed();
};
Garden.prototype.regrow = function () {
  if (this.mode === 'poster') { this.buildPoster(); return; }
  var now = performance.now(), i, l;
  for (i = 0; i < this.letters.length; i++) {
    l = this.letters[i];
    if (l.ch === ' ' || l.dead) continue;
    l.els = null; l.endEls = null; l.tend = null;
    l.birth = now; l.tb = now; l.cut = null;
    this.gen(l);
  }
  for (i = 0; i < this.flowers.length; i++) {
    l = this.flowers[i];
    l.els = null; l.endEls = null; l.tend = null;
    l.birth = now; l.tb = now;
    this.gen(l);
  }
};
/* Generative range sliders in the Poster panel. Each writes into this.opts
   (persisted + shared) and re-grows the garden so changes are visible live. */
Garden.prototype.bindSliders = function () {
  var self = this;
  var map = [
    { id: 'sdensity', key: 'density', fmt: function (v) { return v.toFixed(2); } },
    { id: 'scurvy', key: 'curvy', fmt: function (v) { return v.toFixed(2); } },
    { id: 'ssize', key: 'size', fmt: function (v) { return v.toFixed(2); } },
    { id: 'sroses', key: 'roses', fmt: function (v) { return v.toFixed(2); } }
  ];
  this._sliders = map;
  map.forEach(function (m) {
    var el = document.getElementById(m.id), out = document.getElementById(m.id + 'v');
    if (!el) return;
    el.value = self.opts[m.key];
    if (out) out.textContent = m.fmt(self.opts[m.key]);
    el.addEventListener('input', function () {
      var v = parseFloat(el.value);
      self.opts[m.key] = v;
      if (out) out.textContent = m.fmt(v);
      self.regrow();
      self.changed();
    });
  });
};
Garden.prototype.syncSliders = function () {
  if (!this._sliders) return;
  for (var i = 0; i < this._sliders.length; i++) {
    var m = this._sliders[i];
    var el = document.getElementById(m.id), out = document.getElementById(m.id + 'v');
    if (el) el.value = this.opts[m.key];
    if (out) out.textContent = m.fmt(this.opts[m.key]);
  }
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
  if (e.key === 'Backspace') { e.preventDefault(); if (this.emode) this.editDelete(); else this.wither(now); return; }
  if (e.key === 'Delete') { if (this.emode) { e.preventDefault(); this.editDelete(); } return; }
  if (this.emode) {
    if (e.key === 'Escape') { this.sel = null; this.changed(); }
    return; /* no typing while editing */
  }
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
