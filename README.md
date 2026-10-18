<div align="center">

# Vendure

**Type a word. Watch it grow.**

A tiny, build-free generative garden that lives on a `<canvas>`. Every keystroke
sprouts a letter that sways and blooms into vines, leaves and roses. Works
offline, installs as a PWA, and exports animated loops and print-ready stills.

`vanilla JS` · `zero dependencies` · `no build step` · `offline-first`

![Vendure — type a word and watch it grow](assets/vendure.gif)

</div>

---

Vendure turns typing into gardening. There is no form, no toolbar of shapes, and
nothing to configure before you start — you type, and a living composition grows
out of your words, swaying and "boiling" like hand-drawn animation. When you like
what you see, export it as a looping video, an animated GIF, or a
print-ready PDF.

## Highlights

| Feature | What it does |
| :-- | :-- |
| **Three modes** | **Type** to grow · **Edit** to arrange · **Poster** to compose and export. |
| **Living motion** | Stems grow on damped springs, leaves unfurl, petals open, and the garden idles and sways. |
| **Butterflies** | Tap to summon one — it flies in, perches on a rose, wanders, and leaves. |
| **13 palettes** | From *Rose noir* to *Cyanotype*, plus four generative sliders and seven motion presets. |
| **Share & persist** | Every garden has a permalink; state autosaves to `localStorage` and restores on reload. |
| **Rich export** | Video, GIF, APNG, SVG and PNG sequences, plus PDF and vector stills — up to 4× resolution. |
| **Offline PWA** | An app-shell service worker and a cache-first font strategy keep it running with no network. |
| **Accessible** | Honours `prefers-reduced-motion`, labels every control, and pauses rendering while the tab is hidden. |

### Three modes

- **Type** — keystrokes grow flowers. `space` cuts a word, `backspace` withers
  the last letter, `enter` clears the garden.
- **Edit** — drag letters around, delete the selected one, drop butterflies.
- **Poster** — a dedicated stage for composing and exporting a finished piece,
  with aspect ratios, motion presets, and one-click sharing.

## Controls

| Input | Action |
| :-- | :-- |
| Any letter key | Grow a new blooming letter |
| <kbd>Space</kbd> | Cut the current word and finish its vine |
| <kbd>Backspace</kbd> | Wither the last letter |
| <kbd>Enter</kbd> | Clear the whole garden |
| <kbd>Ctrl/⌘</kbd> + <kbd>S</kbd> | Save a PNG |
| <kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Save an SVG |
| Click / tap | Summon a butterfly |
| Double-click / double-tap | Force a full bloom |
| **Drag** (Edit) | Move a letter |
| <kbd>Delete</kbd> (Edit) | Remove the selected letter |
| <kbd>Esc</kbd> (Edit) | Deselect |

## Getting started

Vendure uses native ES modules, so it must be served over HTTP — opening
`index.html` directly via `file://` will not work. There is nothing to build and
nothing to install.

```sh
# any static server works; this one needs only python3
npm run serve          # → http://localhost:8080
```

Then open <http://localhost:8080> and start typing.

### Tests

The pure helpers and the module graph are covered by a dependency-free Node test
suite (no `npm install` required — Node 18+ with ES modules):

```sh
npm test
```

This runs two suites:

| Suite | What it covers |
| :-- | :-- |
| `test/run.js` | Endianness, CRC-32, GIF LZW round-trips, colour quantizer, palette LUT, math helpers, state hashing, aspect table |
| `test/modules.js` | Imports the **real** ES modules against a minimal DOM stub and exercises typing, growth, butterflies, poster and export paths |

## Exporting

The Poster mode ships with an export dialog for both motion and stills. Formats
your browser cannot produce (via WebCodecs / `MediaRecorder`) are simply shown as
unavailable.

**Motion**

| Format | Details |
| :-- | :-- |
| MP4 | H.264 / AVC |
| WebM | VP9 / VP8 |
| GIF | Animated GIF |
| APNG | Animated PNG |
| MOV | ProRes / QuickTime |
| PNG Sequence | `.zip` · frame by frame |
| SVG Sequence | `.zip` · vector frames |

**Still**

| Format | Details |
| :-- | :-- |
| PNG | Lossless bitmap |
| JPEG | Compressed bitmap |
| WEBP | Modern web image |
| SVG | Vector · editable |
| PDF | Printable document |

Both tabs share resolution (1×/2×/4×), frame rate, quality and aspect
(1:1, 4:5, 16:9, 9:16) settings.

### Motion presets

`Breathe` · `Grow & wither` · `Typed` · `Gust` · `Reach` · `Scatter` · `Visitor`

### Palettes

`Rose noir` · `Paper` · `Midnight` · `Citrus` · `Orchid` · `Moss` · `Tomato` ·
`Butter` · `Blush` · `Mono` · `Terracotta` · `Cyanotype` · `Lilac dusk`

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

## Architecture

The app is a single `Garden` class built from **mixins**. `garden.js` defines the
constructor; every other `src/*.js` module attaches methods to
`Garden.prototype`. `src/app.js` is the one place that imports them all and
touches the DOM to start things up.

The modules in `math.js`, `encoders.js`, `state.js` and `palettes.js` are
**DOM-free and side-effect-free**, which is what makes them directly
unit-testable in Node.

## Browser support

Any current evergreen browser with ES modules, `<canvas>` and service workers
(Chrome, Edge, Firefox, Safari). Export codecs such as WebCodecs /
`MediaRecorder` are used opportunistically — formats your browser can't produce
are simply unavailable in the export dialog.

## Privacy

Everything runs locally in your browser. There is no backend, no analytics, and
no account — your gardens are saved to `localStorage` and shared through the URL
fragment, never uploaded anywhere.

## License

No license has been chosen for this project yet.
