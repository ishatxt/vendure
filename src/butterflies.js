import { MOTION } from './constants.js';
import { Garden } from './garden.js';

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
  var i, W = this.W, H = this.H;
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
    x: cx < W / 2 ? -40 : W + 40,
    y: cy + (this.rand() - 0.5) * H * 0.4,
    vx: 0, vy: 0,
    st: best ? 'fly' : 'wander',
    pid: best ? best.id : null,
    hx: cx, hy: cy,
    born: performance.now(),
    phase: Math.random() * 6,
    seed: Math.random() * 100,
    size: Math.max(14, this.Sd * 0.09),
    ang: 0, open: 1,
    until: 0
  });
};
Garden.prototype.flyOff = function (f) {
  f.st = 'leave';
  f.pid = null;
  f.ex = f.x < this.W / 2 ? -80 : this.W + 80;
  f.ey = f.y - this.H * 0.3;
};
Garden.prototype.butterfly = function (B, x, y, s, ang, open, C) {
  var ca = Math.cos(ang), sa = Math.sin(ang);
  function T(px, py) { return [x + (px * ca - py * sa) * s, y + (px * sa + py * ca) * s]; }
  function wing(cx, cy, rx, ry, a, side) {
    var pts = [], co = Math.cos(a), si = Math.sin(a);
    for (var k = 0; k < 22; k++) {
      var th = k / 22 * Math.PI * 2, r = 1 + 0.08 * Math.sin(th * 3);
      var lx = Math.cos(th) * rx * r, ly = Math.sin(th) * ry * r;
      pts.push(T(side * (cx + lx * co - ly * si) * (0.12 + 0.88 * open), cy + lx * si + ly * co));
    }
    return pts;
  }
  B.fill(wing(0.46, 0.28, 0.36, 0.3, 0.5, 1), C.text);
  B.fill(wing(0.46, 0.28, 0.36, 0.3, 0.5, -1), C.text);
  B.fill(wing(0.55, -0.32, 0.55, 0.36, -0.55, 1), C.text);
  B.fill(wing(0.55, -0.32, 0.55, 0.36, -0.55, -1), C.text);
  if (open > 0.35) {
    B.fill(wing(0.66, -0.4, 0.13, 0.11, 0, 1), C.red);
    B.fill(wing(0.66, -0.4, 0.13, 0.11, 0, -1), C.red);
  }
  var body = [];
  for (var i = 0; i < 18; i++) { var th2 = i / 18 * Math.PI * 2; body.push(T(Math.cos(th2) * 0.08, Math.sin(th2) * 0.48)); }
  B.fill(body, C.blue);
  var lw = Math.max(0.8, s * 0.05);
  B.stroke([T(0, -0.42), T(-0.14, -0.72), T(-0.24, -0.86)], C.blue, lw);
  B.stroke([T(0, -0.42), T(0.14, -0.72), T(0.24, -0.86)], C.blue, lw);
};
Garden.prototype.drawFlies = function (B, now, C) {
  var dt = Math.min(48, now - (this._flyLast || now)); this._flyLast = now;
  var keep = [], W = this.W, H = this.H, i;
  var byId = {};
  for (i = 0; i < this.perch.length; i++) byId[this.perch[i].id] = this.perch[i];
  for (i = 0; i < this.flies.length; i++) {
    var f = this.flies[i];
    var t = (now - f.born) / 1000;
    var tx, ty, p = null;
    if (f.st === 'fly' || f.st === 'sit') {
      p = f.pid != null ? byId[f.pid] : null;
      if (!p) this.flyOff(f);
      else { tx = p.x + p.R * 0.05; ty = p.y - p.R * 0.55; }
    }
    if (f.st === 'wander') {
      tx = f.hx + Math.sin(t * 1.3 + f.seed) * 70;
      ty = f.hy + Math.sin(t * 2.1 + f.seed) * 40;
      if (t > MOTION.flyWander) this.flyOff(f);
    }
    if (f.st === 'leave') { tx = f.ex; ty = f.ey; }
    if (f.st === 'sit') {
      f.x += (tx - f.x) * 0.35; f.y += (ty - f.y) * 0.35;
      f.ang *= 0.85; f.phase += dt * 0.004;
      var burst = Math.sin(now / 1000 * 0.9 + f.seed) > 0.75;
      f.open = burst ? 0.2 + 0.8 * Math.abs(Math.cos(now / 1000 * 9 + f.seed))
        : 0.25 + 0.15 * Math.sin(f.phase);
      if (now > f.until) this.flyOff(f);
    } else {
      var dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
      var sp = f.st === 'leave' ? 0.42 : Math.min(0.34, 0.06 + d * 0.0016);
      var wob = Math.cos(t * 4.3 + f.seed) * 0.1, flut = Math.sin(t * 7 + f.seed) * 0.12;
      f.vx += ((dx / d * sp + wob) - f.vx) * 0.06 * dt / 16;
      f.vy += ((dy / d * sp + flut) - f.vy) * 0.06 * dt / 16;
      f.x += f.vx * dt;
      f.y += f.vy * dt + Math.sin(t * 13 + f.seed) * 0.6;
      f.ang += (Math.max(-0.5, Math.min(0.5, f.vx * 1.4)) - f.ang) * 0.1;
      f.open = Math.abs(Math.cos(t * 17 + f.seed));
      if (f.st === 'fly' && d < 5) { f.st = 'sit'; f.phase = 0; f.until = now + MOTION.flyRest * 1000; }
      if (f.st === 'leave' && (f.x < -60 || f.x > W + 60 || f.y < -60)) continue;
    }
    this.butterfly(B, f.x, f.y, f.size, f.ang, f.open, C);
    keep.push(f);
  }
  this.flies = keep;
};
