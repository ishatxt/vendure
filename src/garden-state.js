import { STATE_VERSION, ASPECTS, stateToHash, saveSaved, absURL, shareOrCopy, copyText, copyBlob } from './state.js';
import { Garden } from './garden.js';

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
    opts: { boil: !!this.opts.boil, recoil: this.opts.recoil, density: this.opts.density, curvy: this.opts.curvy, size: this.opts.size, roses: this.opts.roses },
    offs: this.offsets()
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
    if (s.opts.curvy != null) this.opts.curvy = s.opts.curvy;
    if (s.opts.size != null) this.opts.size = s.opts.size;
    if (s.opts.roses != null) this.opts.roses = s.opts.roses;
  }
  if (s.mode) this._wantMode = s.mode;
  this._offs = (s.offs && s.offs.length) ? s.offs : null;
  this.syncSliders();
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
  shareOrCopy(url, 'Vendure', this.ptext).then(function (r) {
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
        self.applyOffsets(self._offs);
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
