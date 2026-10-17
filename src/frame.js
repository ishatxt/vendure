import { MOTION } from './constants.js';
import { Garden } from './garden.js';

/* ---------------- frame ---------------- */
Garden.prototype.mainState = function () {
  var red = this.reduce;
  return {
    letters: this.letters,
    flowers: this.flowers,
    S: this.Sd,
    C: this.pal().C,
    boil: red ? false : this.opts.boil,
    recoil: this.opts.recoil,
    /* high speed makes growth complete instantly under reduced motion */
    speed: red ? 999 : 1,
    wither: red ? 1 : 260,
    sway: red ? 0 : MOTION.sway,
    reduce: red,
    face: !red
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
  if (this.emode && this.sel && !this.sel.dead) this.drawSel(B, st);
};
/* dashed selection box around the picked letter (Type/Edit mode only) */
Garden.prototype.drawSel = function (B, st) {
  var l = this.sel, S = st.S;
  if (l.tx == null || l.ch === ' ') return;
  var hw = (l.tw || S * 0.5) / 2 + S * 0.06;
  var x0 = l.x - hw, y0 = l.y - 0.84 * S, w = hw * 2, h = S * 1.1;
  B.dashRect(x0, y0, w, h, st.C.blue || '#FFFFFF');
  /* small handle dot at the letter's anchor */
  B.dot(l.x, l.y, S * 0.035, st.C.blue || '#FFFFFF');
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
