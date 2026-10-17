import { PRESETS } from './constants.js';
import { Garden } from './garden.js';

/* ---------------- poster mode ---------------- */
Garden.prototype.liveText = function () {
  return (this.letters || []).filter(function (l) { return !l.dead; }).map(function (l) { return l.ch; }).join('').trim();
};
/* manual move offsets, as [index-among-live-letters, ox, oy] triples. Index
   keeps them text-aligned so they can be dropped if the text changes. */
Garden.prototype.offsets = function () {
  var out = [], A = this.letters;
  for (var i = 0; i < A.length; i++) {
    var l = A[i];
    if (l.dead || l.ox == null) continue;
    out.push([i, Math.round(l.ox * 100) / 100, Math.round(l.oy * 100) / 100]);
  }
  return out;
};
Garden.prototype.applyOffsets = function (offs) {
  if (!offs || !offs.length) return;
  for (var k = 0; k < offs.length; k++) {
    var o = offs[k], l = this.letters[o[0]];
    if (!l || l.dead) continue;
    l.ox = o[1]; l.oy = o[2];
    if (l.tx != null) { l.tx += l.ox; l.ty += l.oy; }
    if (l.x != null) { l.x = l.tx; l.y = l.ty; }
  }
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
  if (mode !== 'edit' && mode === this.mode && !this.emode) return;
  var self = this;
  /* Edit is a sub-mode of Type: same canvas, gestures/typing suspended. */
  if (mode === 'edit') {
    if (this.emode) return;
    if (this.mode !== 'type') this.setMode('type');
    this.emode = true;
    this.syncEmode();
    this.changed();
    return;
  }
  var exm = document.getElementById('pexp'); if (exm) exm.hidden = true;
  if (mode === 'poster') {
    var t = this.liveText();
    if (t) {
      this.ptext = t.slice(0, 40);
      var w = document.getElementById('pwords'); if (w) w.value = this.ptext;
    }
    this.mode = 'poster';
    this.emode = false;
    this.posterEl.hidden = false;
    this.cv.style.display = 'none';
    document.getElementById('peers').style.display = 'none';
    this.bar.style.display = 'none';
    try { this.inp.blur(); } catch (e) {}
    this.setAspect(this.aspect);
    this.buildPoster();
  } else {
    this.mode = 'type';
    this.emode = false;
    this.sel = null; this.drag = null;
    this.posterEl.hidden = true;
    this.cv.style.display = 'block';
    document.getElementById('peers').style.display = '';
    this.bar.style.display = '';
    this.resize();
    this.refocus();
  }
  this.syncEmode();
  this.applyPalette();
  this.changed();
};
/* mirror edit-state onto the UI: button highlight, hint line, canvas cursor */
Garden.prototype.syncEmode = function () {
  var on = this.emode;
  this.app.classList.toggle('emode', on);
  var hint = document.getElementById('edithint');
  if (hint) hint.hidden = !on;
  this.updateModeButtons();
  var hintFine = document.getElementById('hints');
  if (hintFine) hintFine.classList.toggle('editing', on);
  if (!on) { this.sel = null; this.drag = null; this.app.classList.remove('dragging'); }
};
/* single source of truth for the Type/Edit/Poster button highlight + aria */
Garden.prototype.updateModeButtons = function () {
  var self = this;
  Array.prototype.forEach.call(document.querySelectorAll('#modes .mode'), function (b) {
    var dm = b.getAttribute('data-mode');
    var active = (dm === 'poster') ? (self.mode === 'poster')
      : (dm === 'edit') ? self.emode
        : (self.mode === 'type' && !self.emode);
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
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
