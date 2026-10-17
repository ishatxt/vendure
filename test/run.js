/* Node test harness for the pure encoders/helpers.
   Run with: npm test  (or: node test/run.js) */

import {
  gU16, gU32, bU16, bU32, gBytes, gConcat,
  crcBytes, buildPaletteLUT, quantizeColors, gifLZW, gifSubBlocks
} from '../src/encoders.js';
import { h, spr, eo, eb, rng, bez, at } from '../src/math.js';
import { PAL } from '../src/palettes.js';
import { defaultState, stateToHash, hashToState, ASPECTS } from '../src/state.js';

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b)); }

console.log('endianness');
eq('gU16 little', gU16(0x1234), [0x34, 0x12]);
eq('gU32 little', gU32(0x11223344), [0x44, 0x33, 0x22, 0x11]);
eq('bU16 big', bU16(0x1234), [0x12, 0x34]);
eq('bU32 big', bU32(0x11223344), [0x11, 0x22, 0x33, 0x44]);

console.log('crc32');
var crc = crcBytes(new TextEncoder().encode('123456789'));
ok('crc32("123456789") === 0xCBF43926', crc === 0xCBF43926);

console.log('gBytes/gConcat');
eq('gBytes masks', Array.from(gBytes([256, -1, 3])), [0, 255, 3]);
eq('gConcat', Array.from(gConcat([gBytes([1, 2]), gBytes([3])])), [1, 2, 3]);

console.log('palette LUT');
var lut = buildPaletteLUT(PAL[0].slice(2).map(function (c) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}));
ok('LUT has 32768 entries', lut.length === 32768);

console.log('quantizeColors');
var samples = [];
for (var i = 0; i < 300; i++) samples.push((i * 7) % 256, (i * 13) % 256, (i * 29) % 256);
var pal = quantizeColors(samples, 16);
ok('quantize returns <= maxColors', pal.length <= 16 && pal.length >= 1);
ok('quantize channels in range', pal.every(function (c) { return c.every(function (v) { return v >= 0 && v <= 255; }); }));

console.log('gif LZW round-trip');
function lzwDecode(bytes, minCodeSize) {
  var clear = 1 << minCodeSize, eoi = clear + 1;
  var codeSize, maxcode, next, dict, bitpos = 0, out = [], prev = null;
  function reset() {
    dict = []; for (var i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = []; dict[eoi] = [];
    next = clear + 2; codeSize = minCodeSize + 1; maxcode = (1 << codeSize) - 1;
  }
  reset();
  function read() {
    var code = 0;
    for (var i = 0; i < codeSize; i++) {
      var byte = bytes[(bitpos >> 3)] || 0;
      code |= ((byte >> (bitpos & 7)) & 1) << i;
      bitpos++;
    }
    return code;
  }
  while (true) {
    var code = read();
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    var entry;
    if (code < next && dict[code]) entry = dict[code].slice();
    else if (prev) entry = prev.concat([prev[0]]);
    else break;
    for (var j = 0; j < entry.length; j++) out.push(entry[j]);
    if (prev && next < 4096) {
      dict[next] = prev.concat([entry[0]]);
      next++;
      if (next > maxcode && codeSize < 12) { codeSize++; maxcode = (1 << codeSize) - 1; }
    }
    prev = entry;
  }
  return out;
}
function roundtrip(name, pixels, minCodeSize) {
  var enc = gifLZW(pixels, minCodeSize);
  var dec = lzwDecode(new Uint8Array(enc), minCodeSize);
  var same = dec.length === pixels.length && dec.every(function (v, i) { return v === pixels[i]; });
  ok(name, same);
}
(function () {
  var a = []; for (var i = 0; i < 400; i++) a.push(i % 16);
  roundtrip('small 16-color stream', a, 4);
})();
(function () {
  var a = []; for (var i = 0; i < 5000; i++) a.push((Math.sin(i * 0.03) * 127 + 128) & 255);
  roundtrip('large 8-bit stream', a, 8);
})();
(function () {
  var a = new Array(20000).fill(7);
  roundtrip('runs of a single value', a, 8);
})();

console.log('gif sub-blocks');
(function () {
  var b = []; for (var i = 0; i < 600; i++) b.push(i & 255);
  var sb = gifSubBlocks(b);
  var rebuilt = [];
  var p = 0;
  while (sb[p] !== 0) { var n = sb[p++]; for (var j = 0; j < n; j++) rebuilt.push(sb[p++]); }
  ok('sub-blocks rebuild & terminate', rebuilt.length === b.length && rebuilt.every(function (v, i) { return v === b[i]; }));
})();

console.log('math');
ok('h() in [0,1)', [0, 1, 2.5, 99].every(function (n) { var v = h(n); return v >= 0 && v < 1; }));
ok('eo clamps', eo(-1) === 0 && eo(2) === 1 && eo(0.5) > 0 && eo(0.5) < 1);
ok('eb clamps', eb(-1) === 0 && eb(2) === 1);
ok('spr(0)=0', spr(0) === 0);
ok('rng deterministic', rng(42)() === rng(42)());
ok('bez endpoints', JSON.stringify(bez([0, 0], [1, 0], [1, 1], [2, 1], 2)[0]) === JSON.stringify([0, 0]));
ok('at returns point+angle', Array.isArray(at([[0, 0], [1, 1], [2, 2]], 0.5)));

console.log('state');
eq('defaultState round-trips hash',
  hashToState('#' + stateToHash(defaultState())).ptext, 'in bloom');
eq('hash preserves seed', hashToState('#s=123').seed, 123);
eq('aspect table square', ASPECTS['1:1'], [1080, 1080]);
ok('empty hash -> null', hashToState('') === null);
ok('PAL has 13 palettes', PAL.length === 13);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
