import {
  gU16, bU16, bU32, gBytes, gConcat, pngChunk, deflateBytes,
  quantizeColors, buildPaletteLUT, gifLZW, gifSubBlocks, nextTick
} from './encoders.js';
import { Garden } from './garden.js';

/* ---------------- export helpers ---------------- */
/* binary encoders, quantization and LZW now live in ./encoders.js */

export var EXPORT_FORMATS = {
  motion: [
    { id: 'mp4', label: 'MP4', sub: 'H.264 / AVC', cap: 'mp4' },
    { id: 'webm', label: 'WebM', sub: 'VP9 / VP8', cap: 'webm' },
    { id: 'gif', label: 'GIF', sub: 'Animated GIF', cap: 'gif' },
    { id: 'apng', label: 'APNG', sub: 'Animated PNG', cap: 'apng' },
    { id: 'mov', label: 'MOV', sub: 'ProRes / QuickTime', cap: 'mov' },
    { id: 'pngzip', label: 'PNG Sequence', sub: '.zip \u00b7 frame by frame', cap: 'png' },
    { id: 'svgzip', label: 'SVG Sequence', sub: '.zip \u00b7 vector frames', cap: 'svg' }
  ],
  still: [
    { id: 'png', label: 'PNG', sub: 'Lossless bitmap', cap: 'png' },
    { id: 'jpeg', label: 'JPEG', sub: 'Compressed bitmap', cap: 'jpeg' },
    { id: 'webp', label: 'WEBP', sub: 'Modern web image', cap: 'webp' },
    { id: 'svg', label: 'SVG', sub: 'Vector \u00b7 editable', cap: 'svg' },
    { id: 'pdf', label: 'PDF', sub: 'Printable document', cap: 'pdf' }
  ]
};

/* ---------------- poster export ---------------- */
Garden.prototype.fname = function (suffix) {
  var base = 'garden-' + (this.ptext || 'loop').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() + '-' + this.preset;
  return suffix ? base + suffix : base;
};
Garden.prototype.svgCtx = function () {
  var parts = [];
  function nn(v) { return Math.round(v * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var c = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    font: '700 16px sans-serif', textAlign: 'center', textBaseline: 'alphabetic',
    _d: '', _has: false,
    setTransform: function () {},
    beginPath: function () { this._d = ''; this._has = false; },
    moveTo: function (x, y) { this._d += 'M' + nn(x) + ' ' + nn(y); this._has = true; },
    lineTo: function (x, y) { this._d += 'L' + nn(x) + ' ' + nn(y); this._has = true; },
    quadraticCurveTo: function (a, b, x, y) { this._d += 'Q' + nn(a) + ' ' + nn(b) + ' ' + nn(x) + ' ' + nn(y); this._has = true; },
    closePath: function () { this._d += 'Z'; },
    fill: function () { if (this._has) parts.push('<path d="' + this._d + '" fill="' + this.fillStyle + '"/>'); },
    stroke: function () { if (this._has) parts.push('<path d="' + this._d + '" fill="none" stroke="' + this.strokeStyle + '" stroke-width="' + nn(this.lineWidth) + '" stroke-linecap="round" stroke-linejoin="round"/>'); },
    fillRect: function (x, y, w, h) { parts.push('<rect x="' + nn(x) + '" y="' + nn(y) + '" width="' + nn(w) + '" height="' + nn(h) + '" fill="' + this.fillStyle + '"/>'); },
    fillText: function (ch, x, y) {
      var m = /(\d+(?:\.\d+)?)px/.exec(this.font), fs = m ? parseFloat(m[1]) : 16;
      parts.push('<text x="' + nn(x) + '" y="' + nn(y) + '" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="' + nn(fs) + '" fill="' + this.fillStyle + '">' + esc(ch) + '</text>');
    }
  };
  return { ctx: c, parts: parts };
};
Garden.prototype.posterSVG = function (t, scale) {
  var sc = this.svgCtx();
  this.posterDraw(sc.ctx, t, 1);
  var W = Math.round(this.ZW * (scale || 1)), H = Math.round(this.ZH * (scale || 1));
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + this.ZW + ' ' + this.ZH + '">' + sc.parts.join('') + '</svg>';
};
Garden.prototype.stillBlob = function (scale, t, type, q) {
  var self = this, W = Math.round(this.ZW * scale), H = Math.round(this.ZH * scale);
  return new Promise(function (res) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    self.posterDraw(c.getContext('2d'), t, scale);
    c.toBlob(function (b) { res(b); }, type, q);
  });
};
Garden.prototype.makePDF = function (jpeg, w, h) {
  var enc = new TextEncoder();
  function cat(list) { return gConcat(list); }
  var header = enc.encode('%PDF-1.4\n%VENDURE\n');
  var objs = {};
  objs[1] = enc.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objs[2] = enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs[3] = enc.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  objs[4] = cat([enc.encode('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n'), jpeg, enc.encode('\nendstream')]);
  var content = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q';
  objs[5] = enc.encode('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
  var out = [header], off = header.length, offsets = {}, i;
  for (i = 1; i <= 5; i++) {
    offsets[i] = off;
    var b = cat([enc.encode(i + ' 0 obj\n'), objs[i], enc.encode('\nendobj\n')]);
    out.push(b); off += b.length;
  }
  var xrefOff = off, xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (i = 1; i <= 5; i++) xref += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
  out.push(enc.encode(xref + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOff + '\n%%EOF\n'));
  return new Blob(out, { type: 'application/pdf' });
};
Garden.prototype.caps = function () {
  var MR = typeof MediaRecorder !== 'undefined';
  var ts = function (m) { return !!(MR && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)); };
  var webp = false;
  try { var cv = document.createElement('canvas'); cv.width = cv.height = 2; webp = cv.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) {}
  var mp4 = ts('video/mp4;codecs=avc1.42E01E') || ts('video/mp4');
  var webm = ts('video/webm;codecs=vp9') || ts('video/webm;codecs=vp8') || ts('video/webm');
  return {
    mp4: mp4,
    webm: webm,
    mov: ts('video/quicktime') || mp4 || webm,
    gif: true,
    apng: typeof CompressionStream !== 'undefined',
    png: true, jpeg: true, webp: webp, svg: true, pdf: typeof Blob !== 'undefined'
  };
};
Garden.prototype.pickVideoMime = function (kind) {
  var c = {
    mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'],
    webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
    mov: ['video/quicktime', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  }[kind] || [];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
  return null;
};
Garden.prototype.expSettings = function () {
  var g = function (id, d) { var e = document.getElementById(id); return e ? e.value : d; };
  return {
    scale: parseFloat(g('pexpscale', '1')) || 1,
    fps: parseInt(g('pexpfps', '30'), 10) || 30,
    quality: g('pexpq', 'high')
  };
};
Garden.prototype.qualityValue = function (kind) {
  var q = this.expSettings().quality;
  if (kind === 'jpeg' || kind === 'webp') return q === 'standard' ? 0.72 : q === 'prores' ? 0.98 : 0.9;
  if (kind === 'video') return q === 'standard' ? 8e6 : q === 'prores' ? 40e6 : 16e6;
  return q;
};
Garden.prototype.prog = function (cur, total, label) {
  var wrap = document.getElementById('pexpprog'), bar = document.getElementById('pexpbar'), txt = document.getElementById('pexpprogtext');
  if (wrap) wrap.hidden = false;
  var p = total ? Math.max(0, Math.min(1, cur / total)) : 0;
  if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
  if (txt) txt.textContent = label || (Math.round(p * 100) + '%');
};
Garden.prototype.progDone = function () {
  var wrap = document.getElementById('pexpprog'), bar = document.getElementById('pexpbar');
  if (bar) bar.style.width = '0%';
  if (wrap) wrap.hidden = true;
};
Garden.prototype.posterExportName = function (ext) {
  return this.fname() + '.' + ext;
};
Garden.prototype.runStill = function (fmt) {
  var s = this.expSettings(), t = this.P.T * 0.4, q = this.qualityValue(fmt);
  if (fmt === 'svg') {
    var svg = this.posterSVG(t, s.scale);
    this.dl(new Blob([svg], { type: 'image/svg+xml' }), this.posterExportName('svg'));
    return Promise.resolve();
  }
  var self = this;
  if (fmt === 'pdf') {
    return this.stillBlob(s.scale, t, 'image/jpeg', 0.94).then(function (b) {
      return b.arrayBuffer();
    }).then(function (buf) {
      self.dl(self.makePDF(new Uint8Array(buf), Math.round(self.ZW*s.scale), Math.round(self.ZH*s.scale)), self.posterExportName('pdf'));
    });
  }
  var type = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
  return this.stillBlob(s.scale, t, type, q).then(function (b) {
    if (b) self.dl(b, self.posterExportName(fmt === 'jpeg' ? 'jpg' : fmt));
  });
};
Garden.prototype.runSequence = function (kind) {
  var self = this, s = this.expSettings(), P = this.P;
  var N = Math.max(1, Math.round(P.T / 1000 * s.fps)), files = [];
  this.setStatus('Rendering frames\u2026');
  return new Promise(function (resolve, reject) {
    var i = 0;
    function next() {
      if (i >= N) { resolve({ files: files, N: N }); return; }
      var idx = i, t = i * 1000 / s.fps;
      self.prog(i, N, 'Rendering frame ' + (i + 1) + '/' + N + ' (' + Math.round(i / N * 100) + '%)');
      if (kind === 'svg') {
        try { files.push({ name: 'frame_' + String(idx + 1).padStart(4, '0') + '.svg', data: new TextEncoder().encode(self.posterSVG(t, 1)) }); }
        catch (e) { reject(e); return; }
        i++;
        setTimeout(next, 0);
        return;
      }
      var c = self._seqCanvas(s.scale);
      self.posterDraw(c.getContext('2d'), t, s.scale);
      c.toBlob(function (b) {
        if (!b) { reject(new Error('Frame capture failed')); return; }
        b.arrayBuffer().then(function (buf) {
          files.push({ name: 'frame_' + String(idx + 1).padStart(4, '0') + '.png', data: new Uint8Array(buf) });
          i++;
          setTimeout(next, 0);
        });
      }, 'image/png');
    }
    next();
  });
};
Garden.prototype._seqCanvas = function (scale) {
  if (!this.__sc || this.__scScale !== scale || this.__scWidth !== this.ZW || this.__scHeight !== this.ZH) {
    this.__sc = document.createElement('canvas');
    this.__sc.width = Math.round(this.ZW * scale);
    this.__sc.height = Math.round(this.ZH * scale);
    this.__scScale = scale;
    this.__scWidth = this.ZW; this.__scHeight = this.ZH;
  }
  return this.__sc;
};
Garden.prototype.exportVideoFmt = function (kind) {
  var self = this, s = this.expSettings(), P = this.P;
  var mime = this.pickVideoMime(kind);
  if (!mime) return Promise.reject(new Error('Video not supported in this browser'));
  var size = Math.round(this.ZW * s.scale);
  var c = document.createElement('canvas'); c.width = size; c.height = Math.round(this.ZH * s.scale);
  var g = c.getContext('2d');
  var stream = c.captureStream(0), track = stream.getVideoTracks()[0];
  var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: this.qualityValue('video') });
  var chunks = [];
  rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
  var N = Math.max(1, Math.round(P.T / 1000 * s.fps));
  return new Promise(function (resolve, reject) {
    rec.onerror = function () { reject(new Error('Recording failed')); };
    rec.onstop = function () {
      var ext = mime.indexOf('quicktime') >= 0 ? 'mov' : mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      resolve({ blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: ext, N: N });
    };
    self.setStatus('Recording ' + (mime.indexOf('quicktime') >= 0 ? 'MOV' : mime.indexOf('mp4') >= 0 ? 'MP4' : 'WebM') + '\u2026');
    self.posterDraw(g, 0, s.scale);
    rec.start();
    var t0 = performance.now(), i = -1;
    (function step() {
      i++;
      if (i >= N) { rec.stop(); return; }
      self.posterDraw(g, i * 1000 / s.fps, s.scale);
      if (track.requestFrame) track.requestFrame();
      self.prog(i, N, 'Recording ' + Math.round(i / N * 100) + '%');
      var target = t0 + (i + 1) * 1000 / s.fps;
      setTimeout(step, Math.max(0, target - performance.now()));
    })();
  });
};
Garden.prototype.exportGIF = async function () {
  var self = this, s = this.expSettings(), P = this.P;
  var W = Math.round(this.ZW * s.scale), H = Math.round(this.ZH * s.scale), N = Math.max(1, Math.round(P.T / 1000 * s.fps));
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d', { willReadFrequently: true });
  var per = Math.max(400, Math.floor(24000 / N));
  var step = Math.max(1, Math.floor(Math.sqrt(W * H / per)));
  var samples = [], i, x, y;
  for (i = 0; i < N; i++) {
    self.posterDraw(g, i * 1000 / s.fps, s.scale);
    var data = g.getImageData(0, 0, W, H).data;
    for (y = 0; y < H; y += step) for (x = 0; x < W; x += step) {
      var p = (y * W + x) * 4;
      samples.push(data[p], data[p + 1], data[p + 2]);
    }
    self.prog(i, N * 2, 'Analyzing colors ' + Math.round(i / N * 100) + '%');
    if (i % 5 === 0) await nextTick();
  }
  var pal = quantizeColors(samples, 256), lut = buildPaletteLUT(pal);
  var parts = [];
  parts.push(gBytes([71, 73, 70, 56, 57, 97])); // GIF89a
  parts.push(gBytes(gU16(W).concat(gU16(H)).concat([0xF7, 0, 0])));
  var gct = new Uint8Array(768);
  for (i = 0; i < 256; i++) { var col = pal[i] || [0, 0, 0]; gct[i * 3] = col[0]; gct[i * 3 + 1] = col[1]; gct[i * 3 + 2] = col[2]; }
  parts.push(gct);
  parts.push(gBytes([0x21, 0xFF, 0x0B, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 0x03, 0x01, 0x00, 0x00, 0x00]));
  var delay = Math.max(2, Math.round(100 / s.fps));
  for (i = 0; i < N; i++) {
    self.posterDraw(g, i * 1000 / s.fps, s.scale);
    var px = g.getImageData(0, 0, W, H).data;
    var idx = new Uint8Array(W * H);
    for (var q = 0; q < idx.length; q++) { var o = q * 4; idx[q] = lut[((px[o] >> 3) << 10) | ((px[o + 1] >> 3) << 5) | (px[o + 2] >> 3)]; }
    var lzw = gifLZW(idx, 8);
    parts.push(gBytes([0x21, 0xF9, 0x04, 0x04, delay & 255, (delay >> 8) & 255, 0, 0x00]));
    parts.push(gBytes([0x2C].concat(gU16(0), gU16(0), gU16(W), gU16(H), [0x00])));
    parts.push(gBytes([8]));
    parts.push(gifSubBlocks(lzw));
    self.prog(N + i, N * 2, 'Encoding GIF ' + Math.round(i / N * 100) + '%');
    if (i % 3 === 0) await nextTick();
  }
  parts.push(gBytes([0x3B]));
  this.dl(new Blob(parts, { type: 'image/gif' }), this.posterExportName('gif'));
  this.setStatus('Saved GIF \u00b7 ' + N + ' frames @ ' + s.fps + ' fps');
};
Garden.prototype.exportAPNG = async function () {
  if (typeof CompressionStream === 'undefined') throw new Error('APNG requires a newer browser');
  var self = this, s = this.expSettings(), P = this.P;
  var W = Math.round(this.ZW * s.scale), H = Math.round(this.ZH * s.scale), N = Math.max(1, Math.round(P.T / 1000 * s.fps));
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d', { willReadFrequently: true });
  var parts = [gBytes([137, 80, 78, 71, 13, 10, 26, 10])];
  parts.push(pngChunk('IHDR', gBytes(bU32(W).concat(bU32(H), [8, 6, 0, 0, 0]))));
  parts.push(pngChunk('acTL', gBytes(bU32(N).concat(bU32(0)))));
  var seq = 0;
  for (var i = 0; i < N; i++) {
    self.posterDraw(g, i * 1000 / s.fps, s.scale);
    var id = g.getImageData(0, 0, W, H).data;
    var raw = new Uint8Array((W * 4 + 1) * H), row = W * 4;
    for (var yy = 0; yy < H; yy++) {
      raw[yy * (row + 1)] = 0;
      raw.set(id.subarray(yy * row, (yy + 1) * row), yy * (row + 1) + 1);
    }
    var comp = await deflateBytes(raw);
    var fctl = gBytes(bU32(seq++).concat(bU32(W), bU32(H), bU32(0), bU32(0), bU16(1), bU16(s.fps), [0, 0]));
    parts.push(pngChunk('fcTL', fctl));
    if (i === 0) parts.push(pngChunk('IDAT', comp));
    else parts.push(pngChunk('fdAT', gConcat([gBytes(bU32(seq++)), comp])));
    self.prog(i, N, 'Encoding APNG ' + Math.round(i / N * 100) + '%');
    if (i % 3 === 0) await nextTick();
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  this.dl(new Blob(parts, { type: 'image/apng' }), this.posterExportName('png'));
  this.setStatus('Saved APNG \u00b7 ' + N + ' frames @ ' + s.fps + ' fps');
};
Garden.prototype.exportFormat = async function (fmt) {
  if (this.busy || !this.P) return;
  var self = this, s = this.expSettings();
  this.setBusy(true);
  this.setStatus('');
  var st = document.getElementById('pexpstatus'); if (st) st.textContent = '';
  this.prog(0, 1, 'Preparing\u2026');
  try {
    if (EXPORT_FORMATS.still.some(function (f) { return f.id === fmt; })) {
      await this.runStill(fmt);
      var ext = fmt === 'jpeg' ? 'jpg' : fmt;
      this.setStatus('Saved ' + ext.toUpperCase() + ' \u00b7 ' + Math.round(this.ZW * s.scale) + '\u00d7' + Math.round(this.ZH * s.scale));
    } else if (fmt === 'gif') {
      await this.exportGIF();
    } else if (fmt === 'apng') {
      await this.exportAPNG();
    } else if (fmt === 'pngzip' || fmt === 'svgzip') {
      var kind = fmt === 'svgzip' ? 'svg' : 'png';
      var res = await this.runSequence(kind);
      this.dl(this.zip(res.files), this.fname() + '-' + kind + '-frames.zip');
      this.setStatus('Saved ' + res.N + ' ' + kind.toUpperCase() + ' frames \u00b7 ' + s.fps + ' fps');
    } else {
      var vr = await this.exportVideoFmt(fmt);
      this.dl(vr.blob, this.posterExportName(vr.ext));
      this.setStatus('Saved ' + vr.ext.toUpperCase() + ' \u00b7 ' + vr.N + ' frames @ ' + s.fps + ' fps');
    }
    if (st) st.textContent = this.status;
  } catch (e) {
    this.setStatus(e && e.message ? e.message : 'Export failed');
    if (st) st.textContent = this.status;
  } finally {
    this.setBusy(false);
    this.progDone();
  }
};
Garden.prototype.zip = function (files) {
  var crcT = this._crcT || (this._crcT = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })());
  var crc = function (d) { var c = 0xFFFFFFFF; for (var i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  var enc = new TextEncoder(), parts = [], cen = [], off = 0;
  for (var fi = 0; fi < files.length; fi++) {
    var f = files[fi], nm = enc.encode(f.name), cr = crc(f.data), sz = f.data.length;
    var h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(12, 33, true);
    h.setUint32(14, cr, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true);
    parts.push(h.buffer, nm, f.data);
    var c2 = new DataView(new ArrayBuffer(46));
    c2.setUint32(0, 0x02014b50, true); c2.setUint16(4, 20, true); c2.setUint16(6, 20, true); c2.setUint16(14, 33, true);
    c2.setUint32(16, cr, true); c2.setUint32(20, sz, true); c2.setUint32(24, sz, true); c2.setUint16(28, nm.length, true); c2.setUint32(42, off, true);
    cen.push(c2.buffer, nm);
    off += 30 + nm.length + sz;
  }
  var cs = cen.reduce(function (s, b) { return s + (b.byteLength || b.length); }, 0);
  var e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(cen, [e.buffer]), { type: 'application/zip' });
};

/* ---------------- export ---------------- */
Garden.prototype.dl = function (blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 100);
};
Garden.prototype.savePNG = function () {
  var self = this, sel = this.sel;
  this.sel = null; /* never bake the edit selection box into an export */
  this.paint(performance.now());
  this.cv.toBlob(function (b) { if (b) self.dl(b, 'garden.png'); self.sel = sel; self.refocus(); });
};
Garden.prototype.saveSVG = function () {
  var sc = this.svgCtx();
  this.render(this.backend(sc.ctx), performance.now(), this.mainState());
  function n(v) { return Math.round(v * 100) / 100; }
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(this.W) + '" height="' + n(this.H) +
    '" viewBox="0 0 ' + n(this.W) + ' ' + n(this.H) + '">' +
    '<rect width="100%" height="100%" fill="' + this.pal().bg + '"/>' + sc.parts.join('') + '</svg>';
  this.dl(new Blob([svg], { type: 'image/svg+xml' }), 'garden.svg');
  this.refocus();
};
