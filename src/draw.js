import { MOTION } from './constants.js';
import { Garden } from './garden.js';

/* ---------------- math ---------------- */
/* h, spr, eo, eb, rng, bez, at are imported from ./math.js and
   attached to Garden.prototype in garden.js. */
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
    /* dashed outline built from short stroke segments (portable across the
       canvas + SVG-shim backends, neither of which needs setLineDash) */
    dashRect: function (x, y, w, h, col) {
      var seg = Math.max(4, (w + h) / 24), i;
      function edge(x0, y0, x1, y1) {
        var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.max(1, Math.round(L / (seg * 2)));
        for (i = 0; i < n; i++) {
          var a = i / n, b = (i + 0.5) / n;
          self.stroke([[x0 + dx * a, y0 + dy * a], [x0 + dx * b, y0 + dy * b]], col, 1.5);
        }
      }
      edge(x, y, x + w, y); edge(x + w, y, x + w, y + h);
      edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
    },
    dot: function (x, y, r, col) {
      var P = [];
      for (var a = 0; a < 16; a++) { var t = a / 16 * Math.PI * 2; P.push([x + Math.cos(t) * r, y + Math.sin(t) * r]); }
      self.fill(P, col);
    },
    text: function (ch, x, y, S, col) { g.font = '700 ' + S + 'px ' + self.F; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = col; g.fillText(ch, x, y); }
  };
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
  if (!st.reduce && l.birth != null && this._now != null) {
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
