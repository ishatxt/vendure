/* Recipient-page (share.html) suite.
   Runs in its own process on purpose: share-page.js deliberately does not
   import ui.js or export.js, so this catches the gift page depending on a
   prototype method that only those modules define — which happened once, with
   this.pal, and is invisible to the editor's smoke test.
   Run with: npm test  (or: node test/gift.js) */

var RealURL = URL;
var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b)); }

function def(name, val) {
  try { Object.defineProperty(globalThis, name, { value: val, configurable: true, writable: true }); }
  catch (e) { /* read-only global; ignore */ }
}

var ctx = new Proxy({}, {
  get: function (t, p) {
    if (p === 'measureText') return function () { return { width: 50 }; };
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
    return (typeof t[p] !== 'undefined') ? t[p] : function () {};
  },
  set: function (t, p, v) { t[p] = v; return true; }
});

function mkEl(id) {
  return {
    id: id, value: '', attrs: {}, hidden: false, disabled: false,
    style: { setProperty: function () {}, getPropertyValue: function () { return ''; } },
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, removeEventListener: function () {},
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    appendChild: function () {}, removeChild: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getContext: function () { return ctx; },
    focus: function () {}, click: function () {},
    getBoundingClientRect: function () {
      return (id === 'cv')
        ? { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }
        : { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 };
    },
    get textContent() { return this._t || ''; }, set textContent(v) { this._t = v; }
  };
}

var els = {}, themeColor = mkEl('meta');
def('document', {
  readyState: 'complete', hidden: false, title: '',
  fonts: { load: function () { return Promise.resolve(); }, ready: Promise.resolve() },
  documentElement: mkEl('html'), body: mkEl('body'),
  getElementById: function (id) { return els[id] || (els[id] = mkEl(id)); },
  querySelector: function (sel) { return sel === 'meta[name="theme-color"]' ? themeColor : null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {}, removeEventListener: function () {},
  createElement: function () { return mkEl('x'); }
});
def('window', globalThis);
def('addEventListener', function () {});
def('removeEventListener', function () {});
def('requestAnimationFrame', function () { return 0; });
def('cancelAnimationFrame', function () {});
def('navigator', { share: null, clipboard: null });
def('localStorage', { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} });
def('Blob', class { constructor() {} });
def('URL', { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} });

/* flip to false to emulate a visitor who allows motion */
var reduceMatches = true;
def('matchMedia', function () {
  return {
    matches: reduceMatches, media: '',
    addListener: function () {}, removeListener: function () {},
    addEventListener: function () {}, removeEventListener: function () {}
  };
});

/* a real gift link, exactly as the editor writes one */
var HASH = '#p=0&k=breathe&w=caf%C3%A9%20%F0%9F%98%80&s=7&a=1%3A1&sv=1&f=Sam&t=Alex';
def('location', { hash: HASH, origin: 'http://x', pathname: '/share.html', search: '', href: 'http://x/share.html' + HASH });

var errors = [];
var base = new RealURL('../src/', import.meta.url).href;

try {
  var st = await import(base + 'state.js');
  var page = await import(base + 'share-page.js');
  var Garden = (await import(base + 'garden.js')).Garden;

  /* the page boots from the URL alone, with none of the editor's modules */
  ok('editor-only modules stay out of the gift page',
    typeof Garden.prototype.buildUI === 'undefined' &&
    typeof Garden.prototype.exportFormat === 'undefined' &&
    typeof Garden.prototype.pal === 'function');

  var payload = st.parseShare(HASH);
  eq('page is marked ready', document.documentElement.getAttribute('data-state'), 'ready');
  eq('recipient name is shown', els.gname.textContent, 'Alex');
  eq('sender line is shown', els.gfromto.textContent, 'From Sam');
  eq('eyebrow is shown', els.geyebrow.textContent, 'A little gift for you');
  eq('error copy is left untouched', document.getElementById('gerrhead').textContent, '');
  eq('page title names the recipient', document.title, 'A garden for Alex \u00b7 Vendure');
  eq('theme colour follows the palette', themeColor.getAttribute('content'), '#000000');
  ok('canvas describes the garden to screen readers', String(els.cv.getAttribute('aria-label')).indexOf('caf') > -1);
  ok('screen-reader line carries both names', els.gmsg.textContent.indexOf('From Sam') === 0 && els.gmsg.textContent.indexOf('For Alex') > -1);

  /* reduced motion (matchMedia above says so): grown before the first frame */
  var art = page.artwork;
  ok('artwork mounted', !!art);
  eq('artwork respects reduced motion', art.reduce, true);
  ok('letters are born in the past, not grown live',
    art.letters.every(function (l) { return performance.now() - l.birth > 1000; }));
  for (var i = 0; i < 4; i++) art.frame();
  /* the emoji stays in the message but never becomes a letter */
  eq('garden spells the message without the emoji',
    art.letters.filter(function (l) { return !l.dead; }).map(function (l) { return l.ch; }).join(''), 'caf\u00e9');
  ok('the message itself keeps the emoji', payload.message.indexOf('\uD83D\uDE00') > -1);

  /* butterflies must not depend on editor-only code either */
  art.perch = [{ id: 1, x: 400, y: 300, R: 20 }];
  art.spawnFly(200, 200);
  for (var b = 0; b < 20; b++) art.frame();
  eq('a butterfly can fly here', art.flies.length, 1);
  art.resize();
  art.frame();
  ok('resize repaints', true);

  /* the animated path: letters arrive one after another, like typing */
  reduceMatches = false;
  var art2 = page.mountArtwork(document.getElementById('cv'), payload.state, 'for my love');
  eq('animated mount spells the message',
    art2.letters.map(function (l) { return l.ch; }).join(''), 'for my love');
  ok('letters are staggered into the future', art2.letters.some(function (l) { return l.birth > performance.now(); }));
  ok('no butterfly is spawned before its time', art2.flies.length === 0);
  for (var f = 0; f < 6; f++) art2.frame();
  ok('animated frames render', true);
} catch (e) {
  errors.push(e.stack || String(e));
}
ok('no runtime errors on the recipient page', errors.length === 0);
errors.forEach(function (e) { console.log(e); });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
