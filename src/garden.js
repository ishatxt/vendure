import { h, spr, eo, eb, rng, bez, at } from './math.js';
import { defaultState, hashToState, loadSaved } from './state.js';
import { FONT, SENT } from './constants.js';
import { pal } from './palettes.js';

/* pure helpers are imported and attached to the prototype so existing
   `this.h(...)` style calls keep working. */
Garden.prototype.h = h;
Garden.prototype.spr = spr;
Garden.prototype.eo = eo;
Garden.prototype.eb = eb;
Garden.prototype.rng = rng;
Garden.prototype.bez = bez;
Garden.prototype.at = at;

/* palette colours: shared by the editor canvas and the recipient gift page,
   both of which render through frame.js/draw.js */
Garden.prototype.pal = function () {
  return pal(this.palette);
};

export function Garden() {
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
  this.opts = { boil: true, recoil: 20, density: 1, curvy: 1, size: 1, roses: 1 };
  this.rand = Math.random;
  this.mx = null; this.my = null;
  this.emode = false; this.sel = null; this.drag = null;
  this.flies = []; this.perch = []; this.fa = {}; this._flyLast = 0;
  this._now = 0;
  this.composing = false;
  this._kd = false;
  this.touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  this.ptype = 'mouse';
  this.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
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
  this._offs = null;
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
    this.applyOffsets(this._offs);
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
  (function loop() { self.raf = requestAnimationFrame(loop); if (!document.hidden) self.frame(); })();
  /* respect the OS "reduce motion" setting live, without a reload */
  if (window.matchMedia) {
    var rq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onr = function () { self.reduce = rq.matches; self.changed(); };
    if (rq.addEventListener) rq.addEventListener('change', onr);
    else if (rq.addListener) rq.addListener(onr);
  }
  /* drop the giant dt accumulated while the tab was backgrounded */
  document.addEventListener('visibilitychange', function () { self.lt = performance.now(); });

  if (!this.touch) setTimeout(function () { try { self.inp.focus({ preventScroll: true }); } catch (e) {} }, 60);
}
