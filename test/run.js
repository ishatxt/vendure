/* Node test harness for the pure encoders/helpers.
   Run with: npm test  (or: node test/run.js) */

import {
  gU16, gU32, bU16, bU32, gBytes, gConcat,
  crcBytes, buildPaletteLUT, quantizeColors, gifLZW, gifSubBlocks
} from '../src/encoders.js';
import { h, spr, eo, eb, rng, bez, at } from '../src/math.js';
import { PAL } from '../src/palettes.js';
import { defaultState, stateToHash, hashToState, ASPECTS, shareToHash, parseShare, artText, cleanText } from '../src/state.js';

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

console.log('edit-mode offsets');
eq('offsets round-trip hash',
  hashToState('#' + stateToHash({ ptext: 'hi', offs: [[0, 12.5, -8], [1, 0, 3]] })).offs,
  [[0, 12.5, -8], [1, 0, 3]]);
ok('empty offsets -> no d= param',
  stateToHash({ ptext: 'hi', offs: [] }).indexOf('d=') === -1);
ok('offsets param present when non-empty',
  stateToHash({ ptext: 'hi', offs: [[2, 5, 5]] }).indexOf('d=2%3A5%3A5') !== -1 ||
  stateToHash({ ptext: 'hi', offs: [[2, 5, 5]] }).indexOf('d=2:5:5') !== -1);

console.log('share links');
(function () {
  var state = {
    palette: 3, preset: 'breathe', ptext: 'be mine', seed: 42, aspect: '1:1',
    opts: { boil: true, recoil: 20, density: 1.2, curvy: 1, size: 1, roses: 1 }
  };
  var h = shareToHash('be mine', 'Sam', 'Alex', state);
  var p = parseShare('#' + h);
  ok('gift hash parses', p.ok);
  eq('message round-trips', p.message, 'be mine');
  eq('names round-trip', [p.from, p.to], ['Sam', 'Alex']);
  eq('garden state round-trips', [p.state.palette, p.state.seed, p.state.opts.density], [3, 42, 1.2]);
  ok('share version is carried', new URLSearchParams(h).get('sv') === '1');
  eq('same fragment opens in the editor', hashToState('#' + h).ptext, 'be mine');
  ok('no leading # in the hash', h.charAt(0) !== '#');

  /* unicode, emoji and non-latin names */
  var u = parseShare('#' + shareToHash('caf\u00e9 \u2764\uFE0F \u65e5\u672c\u8a9e', 'Am\u00e9lie', '\u041e\u043b\u044f', state));
  eq('unicode message survives', u.message, 'caf\u00e9 \u2764\uFE0F \u65e5\u672c\u8a9e');
  eq('non-english names survive', [u.from, u.to], ['Am\u00e9lie', '\u041e\u043b\u044f']);
  eq('art text drops invisible marks', artText('caf\u00e9 \u2764\uFE0F \u65e5\u672c\u8a9e', 40), 'caf\u00e9 \u2764 \u65e5\u672c\u8a9e');
  /* zero-width joiners are normalised to a space by cleanText, accents are dropped */
  eq('art text handles invisible characters', [artText('a\u200db', 40), artText('e\u0301', 40), artText('a\u00adb', 40)], ['a b', 'e', 'ab']);
  eq('art text drops astral emoji', artText('hi \uD83D\uDE00', 40), 'hi');

  /* special characters never escape the payload */
  var x = parseShare('#' + shareToHash('<script>&"\'', '<b>Sam</b>', 'A&B', state));
  eq('markup characters come back verbatim', [x.message, x.from, x.to], ['<script>&"\'', '<b>Sam</b>', 'A&B']);

  /* length limits, on code-point boundaries */
  var long = new Array(61).join('x');
  eq('message clamps to 40', Array.from(parseShare('#' + shareToHash(long, long, long, state)).message).length, 40);
  eq('names clamp to 32',
    [Array.from(parseShare('#' + shareToHash('hi', long, long, state)).from).length,
      Array.from(parseShare('#' + shareToHash('hi', long, long, state)).to).length], [32, 32]);
  var emoji = '';
  for (var i = 0; i < 45; i++) emoji += '\uD83D\uDE00';
  var em = parseShare('#' + shareToHash(emoji, 'Sam', 'Alex', state));
  ok('emoji clamp without splitting pairs', (function () {
    try { return Array.from(em.message).length === 40 && encodeURIComponent(em.message).length > 0; }
    catch (e) { return false; }
  })());

  /* empty fields are allowed (the page falls back gracefully) */
  var none = parseShare('#' + shareToHash('', '', '', state));
  ok('empty gift is still a valid payload', none.ok && none.message === '' && none.from === '' && none.to === '');

  /* hand-edited / broken links */
  eq('no hash -> empty', parseShare('').reason, 'empty');
  eq('bare # -> empty', parseShare('#').reason, 'empty');
  eq('plain permalink -> legacy', parseShare('#p=0&w=hi&s=7').reason, 'legacy');
  eq('newer share version -> version', parseShare('#sv=99&w=hi').reason, 'version');
  eq('zero version -> corrupt', parseShare('#sv=0&w=hi').reason, 'corrupt');
  eq('non-numeric version -> corrupt', parseShare('#sv=abc&w=hi').reason, 'corrupt');
  eq('broken percent-encoding -> corrupt', parseShare('#sv=%E0%A4%A&f=%').reason, 'corrupt');
  ok('never throws on junk', ['#p=zzz&o=a,b,c', '#&', '#d=::::', '#a=99:99'].every(function (s) {
    try { parseShare(s); return true; } catch (e) { return false; }
  }));
  eq('palette is clamped into range', parseShare('#sv=1&w=hi&p=999').state.palette, 12);
  var big = parseShare('#sv=1&w=hi&o=99,99,99,99,99,1').state.opts;
  eq('opts are clamped', [big.density, big.curvy, big.size, big.roses], [3, 3, 2.5, 3]);
  var offs = parseShare('#sv=1&w=hi&d=1:99999:2,900:1:1').state.offs;
  eq('offsets are sanitised', [offs.length, offs[0][1]], [1, 4000]);

  /* helpers */
  eq('cleanText collapses whitespace', cleanText('  a \n b  ', 40), 'a b');
  eq('cleanText clamps on code points', cleanText('a'.repeat(50), 10), 'aaaaaaaaaa');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
