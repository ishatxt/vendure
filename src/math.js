/* Pure math helpers, extracted from index.html so they can be unit-tested. */

export function h(n) { var x = Math.sin(n) * 43758.5453; return x - Math.floor(x); }

export function spr(t, k, w) {
  if (k == null) k = 7; if (w == null) w = 16;
  if (t <= 0) return 0;
  return 1 - Math.exp(-t * k) * Math.cos(t * w);
}

export function eo(t) { if (t <= 0) return 0; if (t >= 1) return 1; return 1 - Math.pow(1 - t, 3); }

export function eb(t) {
  if (t <= 0) return 0; if (t >= 1) return 1;
  var c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function rng(seed) {
  var s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bez(a, b, c, d, n) {
  var P = [];
  for (var i = 0; i <= n; i++) {
    var t = i / n, u = 1 - t;
    P.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]
    ]);
  }
  return P;
}

export function at(P, u) {
  var n = P.length;
  var i = Math.min(n - 2, Math.max(1, Math.round(u * (n - 1))));
  return [P[i], Math.atan2(P[i + 1][1] - P[i - 1][1], P[i + 1][0] - P[i - 1][0])];
}
