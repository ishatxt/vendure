/* Module-graph smoke test.
   Imports the real ES modules (not a bundled blob) with a minimal DOM stub,
   then exercises the main code paths. This catches errors that only surface
   at runtime, e.g. a module referencing a name it forgot to import
   (ReferenceError: X is not defined) — which previously blanked the canvas.
   Run with: npm test  (or: node test/modules.js) */

var RealURL = URL;

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

function def(name, val) {
  try { Object.defineProperty(globalThis, name, { value: val, configurable: true, writable: true }); }
  catch (e) { /* read-only global; ignore */ }
}

var ctx = new Proxy({}, {
  get: function (t, p) {
    if (p === 'measureText') return function () { return { width: 50 }; };
    if (p === 'canvas') return t.__c;
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
    return (typeof t[p] !== 'undefined') ? t[p] : function () {};
  },
  set: function (t, p, v) { t[p] = v; return true; }
});

function mkEl(id) {
  return {
    id: id, value: '', style: {}, hidden: false, disabled: false, checked: false,
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, removeEventListener: function () {}, setAttribute: function () {}, getAttribute: function () { return null; },
    appendChild: function () {}, removeChild: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getContext: function () { ctx.__c = this; return ctx; },
    toBlob: function (cb) { cb && cb({}); }, toDataURL: function () { return ''; }, click: function () {}, focus: function () {}, play: function () {}, pause: function () {},
    getBoundingClientRect: function () {
      return (id === 'cv' || id === 'pcv')
        ? { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }
        : { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 };
    },
    get innerHTML() { return ''; }, set innerHTML(v) {},
    get textContent() { return ''; }, set textContent(v) {},
    get files() { return []; },
    get value() { return this._v || ''; }, set value(v) { this._v = v; }
  };
}

var els = {};
def('document', {
  readyState: 'complete', hidden: false,
  fonts: { load: function () { return Promise.resolve(); } },
  documentElement: mkEl('html'), body: mkEl('body'),
  getElementById: function (id) { return els[id] || (els[id] = mkEl(id)); },
  addEventListener: function () {}, removeEventListener: function () {},
  createElement: function () { return mkEl('x'); },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; }
});
def('window', globalThis);
def('addEventListener', function () {});
def('removeEventListener', function () {});
def('matchMedia', function () { return { matches: false, media: '', addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; });
def('requestAnimationFrame', function () { return 0; });
def('cancelAnimationFrame', function () {});
def('location', { hash: '', origin: 'http://x', pathname: '/', search: '', href: 'http://x/' });
def('localStorage', { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} });
def('navigator', { share: null, clipboard: null });
def('MediaRecorder', undefined);
def('Blob', class { constructor() {} });
def('URL', { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} });

var errors = [];
var base = new RealURL('../src/', import.meta.url).href;
var modules = ['garden.js', 'ui.js', 'garden-state.js', 'poster.js', 'export.js', 'input.js', 'draw.js', 'layout.js', 'growth.js', 'butterflies.js', 'frame.js'];

try {
  for (var i = 0; i < modules.length; i++) await import(base + modules[i]);
  var Garden = (await import(base + 'garden.js')).Garden;
  var g = new Garden();

  for (var ci = 0; ci < 'hello world'.length; ci++) g.add('hello world'[ci], performance.now());
  var past = performance.now() - 9000;
  g.letters.forEach(function (l) { l.birth = past; l.tb = past; });
  for (var f = 0; f < 25; f++) g.frame();
  ok('renders typed letters with full growth', g.letters.length === 11);

  g.perch = [{ id: 1, x: 400, y: 300, R: 20 }];
  g.spawnFly(100, 100); g.spawnFly(700, 200);
  var B = g.backend(ctx);
  for (var b = 0; b < 30; b++) g.drawFlies(B, performance.now() + b * 40, g.pal().C);
  ok('butterflies spawn and draw', g.flies.length === 2);

  g.buildPoster();
  g.posterDraw(ctx, 500);
  g.render(B, performance.now(), g.mainState());
  g.posterSVG(0, 1);
  ok('poster build, still render, and SVG export', true);
} catch (e) {
  errors.push(e.stack || String(e));
}
ok('no runtime errors across code paths', errors.length === 0);
errors.forEach(function (e) { console.log(e); });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
