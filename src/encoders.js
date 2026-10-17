/* Binary encoders and quantization helpers, extracted from index.html.
   Pure functions (no DOM/Garden state) so they can be unit-tested in Node. */

var _CRCT = null;

export function gU16(n) { return [n & 255, (n >> 8) & 255]; }
export function gU32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
export function bU16(n) { return [(n >> 8) & 255, n & 255]; }
export function bU32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
export function gBytes(arr) { var a = new Uint8Array(arr.length); for (var i = 0; i < arr.length; i++) a[i] = arr[i] & 255; return a; }
export function gConcat(parts) {
  var n = 0, i;
  for (i = 0; i < parts.length; i++) n += parts[i].length;
  var out = new Uint8Array(n), o = 0;
  for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
  return out;
}
export function crcTable() {
  if (_CRCT) return _CRCT;
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (_CRCT = t);
}
export function crcBytes(d) {
  var t = crcTable(), c = 0xFFFFFFFF;
  for (var i = 0; i < d.length; i++) c = t[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function pngChunk(type, data) {
  var typeB = new TextEncoder().encode(type);
  var out = new Uint8Array(12 + data.length);
  var dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(typeB, 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crcBytes(out.subarray(4, 8 + data.length)));
  return out;
}
export function deflateBytes(bytes) {
  return new Promise(function (resolve, reject) {
    if (typeof CompressionStream === 'undefined') { reject(new Error('CompressionStream unsupported')); return; }
    var cs = new CompressionStream('deflate');
    var w = cs.writable.getWriter();
    w.write(bytes).then(function () { return w.close(); }).then(function () {
      return new Response(cs.readable).arrayBuffer();
    }).then(function (b) { resolve(new Uint8Array(b)); }).catch(reject);
  });
}
/* median-cut color quantization */
export function quantizeColors(samples, maxColors) {
  var N = samples.length / 3;
  if (!N) return [[0, 0, 0]];
  var idx = new Uint32Array(N);
  for (var i = 0; i < N; i++) idx[i] = i;
  function mkBox(lo, hi) {
    var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (var i = lo; i < hi; i++) {
      var p = idx[i] * 3, r = samples[p], g = samples[p + 1], b = samples[p + 2];
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      if (g < gmin) gmin = g; if (g > gmax) gmax = g;
      if (b < bmin) bmin = b; if (b > bmax) bmax = b;
    }
    return { lo: lo, hi: hi, rmin: rmin, rmax: rmax, gmin: gmin, gmax: gmax, bmin: bmin, bmax: bmax };
  }
  var boxes = [mkBox(0, N)];
  while (boxes.length < maxColors) {
    var bi = -1, best = 0, k;
    for (k = 0; k < boxes.length; k++) {
      var bx = boxes[k];
      if (bx.hi - bx.lo < 2) continue;
      var sc = Math.max(bx.rmax - bx.rmin, bx.gmax - bx.gmin, bx.bmax - bx.bmin);
      if (sc > best) { best = sc; bi = k; }
    }
    if (bi < 0 || best <= 0) break;
    var box = boxes[bi];
    var dr = box.rmax - box.rmin, dg = box.gmax - box.gmin, db = box.bmax - box.bmin;
    var ax = (dr >= dg && dr >= db) ? 0 : (dg >= db ? 1 : 2);
    var sub = Array.prototype.slice.call(idx.subarray(box.lo, box.hi));
    sub.sort(function (a, b) { return samples[a * 3 + ax] - samples[b * 3 + ax]; });
    for (k = 0; k < sub.length; k++) idx[box.lo + k] = sub[k];
    var mid = (box.lo + box.hi) >> 1;
    boxes.splice(bi, 1, mkBox(box.lo, mid), mkBox(mid, box.hi));
  }
  return boxes.map(function (bx) {
    var r = 0, g = 0, b = 0, n = bx.hi - bx.lo || 1;
    for (var i = bx.lo; i < bx.hi; i++) { var p = idx[i] * 3; r += samples[p]; g += samples[p + 1]; b += samples[p + 2]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}
export function buildPaletteLUT(pal) {
  var lut = new Uint8Array(32768), P = pal.length, r, g, b, i;
  for (r = 0; r < 32; r++) for (g = 0; g < 32; g++) for (b = 0; b < 32; b++) {
    var R = r << 3, G = g << 3, B = b << 3, bi = 0, bd = 1e9;
    for (i = 0; i < P; i++) {
      var p = pal[i], dr = R - p[0], dg = G - p[1], db = B - p[2], d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = i; }
    }
    lut[(r << 10) | (g << 5) | b] = bi;
  }
  return lut;
}
/* GIF LZW (LSB-first, Weiner-style code-size growth) */
export function gifLZW(pixels, minCodeSize) {
  var clear = 1 << minCodeSize, eoi = clear + 1, maxmax = 4096;
  var codeSize = minCodeSize + 1, maxcode = (1 << codeSize) - 1, next = clear + 2;
  var dict = new Map(), out = [], cur = 0, bits = 0;
  function emit(code) {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(cur & 255); cur >>= 8; bits -= 8; }
    if (next > maxcode) { if (codeSize < 12) { codeSize++; maxcode = (1 << codeSize) - 1; } else maxcode = maxmax; }
  }
  emit(clear);
  var prefix = pixels[0];
  for (var i = 1; i < pixels.length; i++) {
    var k = pixels[i], key = prefix * 256 + k, got = dict.get(key);
    if (got !== undefined) { prefix = got; continue; }
    emit(prefix);
    if (next < maxmax) { dict.set(key, next); next++; }
    else { emit(clear); dict = new Map(); codeSize = minCodeSize + 1; maxcode = (1 << codeSize) - 1; next = clear + 2; }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}
export function gifSubBlocks(bytes) {
  var n = 0, i;
  for (i = 0; i < bytes.length; i += 255) n += 1 + Math.min(255, bytes.length - i);
  var out = new Uint8Array(n + 1), o = 0;
  for (i = 0; i < bytes.length; i += 255) {
    var c = Math.min(255, bytes.length - i);
    out[o++] = c;
    for (var j = 0; j < c; j++) out[o++] = bytes[i + j];
  }
  out[o] = 0;
  return out;
}
export function nextTick() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
