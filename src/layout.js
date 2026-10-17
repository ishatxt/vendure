import { Garden } from './garden.js';

/* ---------------- layout ---------------- */
Garden.prototype.resize = function () {
  var c = this.cv, r = c.getBoundingClientRect();
  /* cap DPR at 2: past that the pixel cost isn't worth the visual gain */
  var d = Math.min(window.devicePixelRatio || 1, 2);
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
  A.forEach(function (l) {
    if (l.ox != null) { l.tx += l.ox; l.ty += l.oy; }
    if (l.x == null) { l.x = l.tx; l.y = l.ty; }
  });
  var S = res.S, last = A[A.length - 1];
  this.St = S;
  this.ctx_ = last ? last.tx + last.tw / 2 + 0.07 * S : this.W / 2;
  this.cty = last ? last.ty - 0.33 * S : this.H / 2;
  if (snap || !this.Sd) {
    this.Sd = S; this.cx = this.ctx_; this.cy = this.cty;
    A.forEach(function (l) { l.x = l.tx; l.y = l.ty; });
  }
};
