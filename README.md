# Vendure

Type to grow a living garden. Letters sprout, sway, and bloom — a small
vanilla-JS canvas app with three modes:

- **Type** — keystrokes grow flowers (space cuts, backspace withers, enter clears)
- **Edit** — drag letters around, delete them, tap to summon butterflies
- **Poster** — export animated loops (video, GIF, APNG) and stills (PNG, SVG, PDF)

Works offline as an installable PWA. State persists locally and every garden
has a shareable permalink.

## Run

ES modules require a server (not `file://`):

```sh
npm run serve   # http://localhost:8080
```

## Test

```sh
npm test        # node test/run.js — pure helpers, encoders, state
```

## Structure

```
index.html          app shell (markup only, ~160 lines)
manifest.json       PWA manifest
sw.js               service worker: offline shell + font cache
src/
  app.js            entry point: loads modules, starts the app
  garden.js         Garden constructor + prototype math helpers
  constants.js      FONT, SENT, MOTION, PRESETS
  ui.js             palette swatches, poster panel, export dialog
  garden-state.js   serialize/applyState, persistence, share links
  poster.js         poster mode: build, draw, modes, status
  export.js         PNG/GIF/APNG/video/SVG/PDF/zip export
  input.js          keyboard, gestures, edit mode, sliders
  draw.js           canvas/SVG backends, leaves, roses, render
  layout.js         text layout and wrapping
  growth.js         vine/curl/weave generative growth
  butterflies.js    butterfly spawn, perch, flight
  frame.js          main state, paint, rAF loop
  style.css         all styles
  state.js          pure persistence/hash helpers (DOM-free)
  encoders.js       pure binary encoders (DOM-free)
  math.js           pure math/easing/noise helpers (DOM-free)
  palettes.js       color palettes
test/run.js         Node test harness
assets/             demo recording, source icon
docs/               progress log
```

Pure logic (`math`, `encoders`, `state`, `palettes`) is DOM-free and
unit-tested in Node. Everything under `src/` except `garden.js` and
`app.js` is a mixin that attaches methods to `Garden.prototype`;
`app.js` is the only file that touches the DOM directly.
