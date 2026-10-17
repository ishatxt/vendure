import { PAL } from './palettes.js';
import { PRESETS } from './constants.js';
import { EXPORT_FORMATS } from './export.js';
import { Garden } from './garden.js';

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
  this.bindSliders();
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
