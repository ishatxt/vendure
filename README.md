<div align="center">

# Vendure

**Type a word. Watch it grow.**

A tiny, build-free generative garden that lives on a `<canvas>`. Every keystroke
sprouts a letter that sways and blooms into vines, leaves and roses. Works
offline, installs as a PWA, and exports animated loops and print-ready stills.

`vanilla JS` · `zero dependencies` · `no build step` · `offline-first`

</div>

---

## Features

- **Three modes**
  - **Type** — keystrokes grow flowers; `space` cuts a word, `backspace`
    withers the last letter, `enter` clears the garden.
  - **Edit** — drag letters around, delete the selected one, drop butterflies.
  - **Poster** — a dedicated stage for composing and exporting a composition.
- **Living motion** — stems grow with damped springs, leaves unfurl, petals
  open, and the whole garden sways and "boils" like hand-drawn animation.
- **Butterflies** — tap to summon one; it flies in, perches on a rose, wanders,
  and leaves.
- **13 palettes**, four generative sliders (density, curvature, bloom size,
  roses), and motion presets.
- **Share & persist** — every garden has a permalink; state autosaves to
  `localStorage` and restores on reload.
- **Rich export**
  - *Motion:* MP4, WebM, GIF, APNG, MOV (ProRes), PNG sequence `.zip`,
    SVG sequence `.zip`.
  - *Still:* PNG, JPEG, WEBP, SVG, PDF — up to 4× resolution.
- **Offline PWA** — app-shell service worker plus a cache-first Google Fonts
  strategy, so it keeps running with no network.
- **Accessibility** — honours `prefers-reduced-motion`, labelled controls,
  focus-visible outlines, and pauses rendering while the tab is hidden.

## Getting started

Vendure uses native ES modules, so it must be served over HTTP — opening
`index.html` directly via `file://` will not work.

```sh
# any static server works; this one needs only python3
npm run serve          # → http://localhost:8080
```

Then open <http://localhost:8080> and start typing.

### Tests

The pure helpers and the module graph are covered by a dependency-free Node
test suite (no `npm install` required — Node 18+ with ES modules):

```sh
npm test
```

This runs two suites:

| Suite | What it covers |
| --- | --- |
| `test/run.js` | Endianness, CRC-32, GIF LZW round-trips, colour quantizer, palette LUT, math helpers, state hashing, aspect table |
| `test/modules.js` | Imports the **real** ES modules against a minimal DOM stub and exercises typing, growth, butterflies, poster and export paths |

## Project structure

```
index.html            app shell — markup only; boots the module entry point
manifest.json         PWA manifest
sw.js                 service worker — offline shell + font cache (must stay at root)
src/
  app.js              entry point: imports every module, starts the Garden
  garden.js           Garden constructor + prototype math helpers
  constants.js        FONT, SENT, MOTION, PRESETS
  math.js             pure math / easing / noise helpers        (DOM-free)
  encoders.js         pure binary encoders (PNG/GIF/APNG/zip)   (DOM-free)
  state.js            pure persistence + permalink helpers       (DOM-free)
  palettes.js         13 colour palettes
  ui.js               palette swatches, poster panel, export dialog
  garden-state.js     serialize / applyState, persistence, share links
  poster.js           poster mode: build, draw, modes, status
  export.js           PNG/GIF/APNG/video/SVG/PDF/zip export
  input.js            keyboard, gestures, edit mode, sliders
  draw.js             canvas + SVG backends, leaves, roses, render
  layout.js           text layout and wrapping
  growth.js           vine / curl / weave generative growth
  butterflies.js      butterfly spawn, perch, flight
  frame.js            main state, paint, rAF loop
  style.css           all styles
test/
  run.js              Node test harness
  modules.js          module-graph smoke test
assets/               demo recording + source icon
docs/                 progress log
```

### Architecture

The app is a single `Garden` class built from **mixins**. `garden.js` defines
the constructor; every other `src/*.js` module attaches methods to
`Garden.prototype`. `src/app.js` is the one place that imports them all and
touches the DOM to start things up.

The modules in `math.js`, `encoders.js`, `state.js` and `palettes.js` are
**DOM-free and side-effect-free**, which is what makes them directly
unit-testable in Node.

## Browser support

Any current evergreen browser with ES modules, `<canvas>` and service workers
(Chrome, Edge, Firefox, Safari). Export codecs such as WebCodecs / `MediaRecorder`
are used opportunistically — formats your browser can't produce are simply
unavailable in the export dialog.

## License

No license has been chosen for this project yet.
