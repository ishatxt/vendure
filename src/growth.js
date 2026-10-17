import { MOTION } from './constants.js';
import { Garden } from './garden.js';

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
  var dens = this.opts.density, curvy = this.opts.curvy, size = this.opts.size, roses = this.opts.roses;
  return {
    roseP: Math.min(0.85, (0.3 + r() * 0.3) * roses),
    leafy: (0.6 + r() * 0.8) * dens,
    dens: dens,
    lean: (r() - 0.5) * 0.6,
    big: (0.85 + r() * 0.45) * size,
    curvy: (0.8 + r() * 0.6) * curvy,
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
