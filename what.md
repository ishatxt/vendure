# What was done — Type Garden

Status: **Phases 0–2 complete and verified.**

## Overview

Type Garden is a single-file, vanilla-JS canvas app (`index.html`). This work
split the pure helpers into ES modules, made the poster size aspect-aware,
added persistence/sharing, and added tap gestures. The goal was to land
**Phases 0–2 of a 7-phase roadmap**.

Roadmap (only 0–2 done):

- Phase 0 — module split, `ZW/ZH` poster-dimension refactor, state schema
- Phase 1 — persistence & sharing
- Phase 2 — tap gestures (single tap = butterfly, double tap = blooms a flower)
- Phase 3 — generative parameter ranges *(not started)*
- Phase 4 — export / Lottie *(not started)*
- Phase 5 — interaction / editing *(not started)*
- Phase 6 — audio export (separate WAV) *(not started)*
- Phase 7 — perf / a11y / PWA *(not started)*

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app. `<script type="module">` with imports; all `Garden.prototype.*` methods. |
| `src/math.js` | Pure math helpers: `h, spr, eo, eb, rng, bez, at`. |
| `src/encoders.js` | Pure encoders: `gU16/gU32/bU16/bU32/gBytes/gConcat/crcTable/crcBytes/pngChunk/deflateBytes/quantizeColors/buildPaletteLUT/gifLZW/gifSubBlocks/nextTick`. |
| `src/palettes.js` | `PAL` (13 palettes). |
| `src/state.js` | `STATE_VERSION, STORAGE_KEY, ASPECTS, defaultState, stateToHash, hashToState, loadSaved, saveSaved, clearSaved, absURL, shareOrCopy, copyText, copyBlob`. |
| `src/_app.mjs` | Generated Node mirror of the inline module script (only import paths differ). Used for headless testing. |
| `package.json` | `"type":"module"`, `npm test`, `npm run serve`. |
| `test/run.js` | Node test harness — 26 assertions, all passing. |

## Phase 0 — module split + aspect refactor + state schema

- `index.html` now uses `<script type="module">` and imports from `./src/...`.
  Consequence: it no longer runs from `file://`; serve it (see below).
- Pure helpers moved out of `index.html`; `Garden.prototype.h = h;` style
  assignments keep every `this.h(...)` call site working.
- Removed the inline `PAL` array, the inline encoder block, and the inline math
  methods.
- Introduced aspect-aware poster dimensions:
  - `this.aspect` (`'1:1'` default), `this.ZW`, `this.ZH`, `this._light`.
  - `ASPECTS` = `{'1:1':[1080,1080], '4:5':[1080,1350], '16:9':[1920,1080], '9:16':[1080,1920]}`.
  - Replaced hard-coded `1080`/`540` usage throughout the poster path with
    `ZW`/`ZH` (`buildPoster`, `drawBg`, `posterDraw`, wind warp/rotw, reach light,
    typed caret, `posterFly`, `posterSVG` viewBox, `stillBlob`, PDF size,
    `_seqCanvas` cache key, `exportVideoFmt`, `exportGIF`, `exportAPNG`, status text).
  - `#pcv` `aspect-ratio` is set from `setAspect`.
- `package.json`: `"type":"module"`, `npm test` → `node test/run.js`,
  `npm run serve` → `python3 -m http.server 8080`.

## Phase 1 — persistence & sharing

- Permalink format: `#p=<palette>&k=<preset>&w=<words>&s=<seed>&m=<mode>&a=<aspect>`.
- `localStorage` key `typegarden.v1`; schema
  `{v:1, palette, preset, ptext, seed, mode, aspect, opts}`.
- Boot: constructor applies `defaultState()` then `hashToState(location.hash) || loadSaved()`
  before `buildUI()`, then `syncUI()` after `buildPoster()`; restores Poster mode
  if the state asked for it.
- `changed()` = debounced `persist()` (250 ms) + `updateHash()` (`history.replaceState`).
  Wired into `setPalette`, preset click, `#pwords` input, `#pregrow`, `setMode`.
- Methods added: `serialize`, `applyState`, `changed`, `persist`, `updateHash`,
  `shareLink`, `copyText`, `copyPNG`, `copyPosterSVG`, `saveJSON`, `loadJSON`,
  `syncUI`, `toggleAspect`, `setAspect`, `buildShareUI`.
- UI: `#pcv` aspect-ratio; poster Export group gains Share link + aspect toggle;
  `#shareGarden` in the control bar; 2-column export settings with an `Aspect`
  select (`#pexpaspect`); export info shows `aspect` and `ZW×ZH`.

## Phase 2 — tap gestures (completed this session)

The gesture logic and the missing UI wiring were finished and verified:

1. `bind()` — canvas `pointerdown` now calls `self.onTap(e.clientX, e.clientY)`
   instead of spawning a butterfly immediately.
2. `Garden.prototype.onTap(x, y)` — if a second tap arrives within **300 ms** and
   **32 px** of the first, it cancels the pending single-tap timer and calls
   `bloomAt`. Otherwise it schedules `spawnFly` after a **250 ms** delay (stored
   on `this._tap`).
3. `Garden.prototype.bloomAt(cx, cy)` — builds a free, headless plant
   (`{free:true, ch:'', ...}`), calls `this.gen(l)`, sets `l.x = l.y = cx, cy`,
   and pushes it onto `this.flowers`.
4. `mainState()` now returns `flowers: this.flowers`.
5. `render()` refactored to `draw(layer, list, act)`; it draws letters, then
   `st.flowers` in layers 0 and 1. Poster mode builds its own state without
   `flowers`, so blooms appear in **Type mode only**, never in Poster or exports.
6. `Enter` clears flowers as well as letters — in the `key()` handler and in the
   `inputDiff` newline path.
7. Added the Export-panel buttons the sharing code already referenced:
   `Copy PNG`, `Copy SVG`, `Save .json`, `Load .json`, plus the hidden
   `#pljson` file input, so `buildShareUI` wiring is reachable.
8. `#hints` gained coarse-pointer text: "tap = butterfly · double-tap blooms".

Positioning note: `drawStem`/`drawEl` compute coordinates as `l.x + q[0]*S` at
draw time, so assigning `l.x/l.y` after `gen()` correctly places the bloom. In
Type mode `st.face` is on, so bloomed roses turn toward the pointer and can be
used as butterfly perches.

## Share fixes (follow-up)

The share plumbing existed but a **Type-mode** link did not reproduce the
garden, and there was no visible feedback in Type mode. Fixed:

1. **Live text is serialized.** `serialize()` now returns `this.liveText()` in
   Type mode (and `this.ptext` in Poster mode). Because `stateToHash` uses
   `ptext` for the `w=` parameter, a Type-mode permalink now carries the typed
   words.
2. **Typing updates the permalink/autosave.** `add()` and `wither()` now call
   `changed()`, so `changed() → updateHash()` keeps the address bar and the
   `localStorage` autosave in step with the garden as you type.
3. **Boot replays a shared/autosaved garden.** After `resize()`, if the boot
   state is not Poster mode and has words, `typeText(bootState.ptext)` feeds the
   characters back through `add()`, so the recipient sees the same words. An
   empty Type-mode garden serializes to `w=` (empty), so a plain reload does
   **not** inject a phantom "in bloom".
4. **Visible feedback.** Added a `#toast` element + `Garden.prototype.toast()`;
   `setStatus()` now also shows a transient toast whenever the poster panel (and
   its `#pstatus` line) is hidden — i.e. in Type mode — so Share / Copy / Save
   confirmations are actually visible.
5. **`Load .json` replays words too.** `loadJSON()` clears the garden and, for a
   Type-mode project, feeds `ptext` through `typeText()` so loading behaves like
   opening a share link.

Caveat: Type-mode plant *shapes* are generated with `Math.random`, so a shared
link reproduces the words and settings, not the exact plant geometry (the seed
drives deterministic geometry in Poster mode).

## Verification performed

- `node --check` on the inline module script extracted from `index.html` — OK.
- Static analysis: every `this.<name>()` / `self.<name>()` call resolves to a
  defined prototype method, imported helper, or known function-valued property.
- `npm test` → **26 passed, 0 failed** (endianness, CRC32, GIF LZW round-trips,
  quantizer, palette LUT, math, state hash, aspect table, palette count).
- Headless jsdom smoke test → **23 passed, 0 failed**:
  - constructs in Type mode with a viewport
  - letters grow, lay out, and render over multiple frames
  - single tap schedules a butterfly and spawns nothing immediately
  - double tap cancels the butterfly and blooms exactly one flower
  - the cancelled single tap never fires (verified after a 320 ms wait)
  - a lone tap does spawn a butterfly after the delay
  - `mainState().flowers` is present in Type mode
  - `Enter` clears letters and flowers
  - `serialize → stateToHash → applyState` round-trip
  - Type-mode `serialize()` carries the live text; an empty garden carries none
  - `typeText()` replays characters onto the canvas
  - `shareLink()` builds a permalink containing the typed words
  - `setStatus()` surfaces the toast in Type mode
  - aspect toggle cycles; non-square (`4:5`) poster builds; `posterSVG` viewBox is correct
  - `stillBlob`, `makePDF`, `exportGIF`, `exportAPNG` (small) all produce blobs
- End-to-end restore test (fresh jsdom + cache-busted import) → **4 passed, 0 failed**:
  - a Type-mode share link restores palette/preset/seed/aspect **and** replays the words
  - a Poster-mode share link boots straight into Poster mode with its words
  - a fresh visit with no hash starts empty (no phantom text)
- `git status` left clean apart from the intended edits. `src/_app.mjs` (a tracked
  generated mirror) is regenerated after any `index.html` script change.

## How to run

```sh
npm test          # pure encoder/state tests (Node, no DOM)
npm run serve     # serves on http://localhost:8080 (required; ES modules)
```

Open `http://localhost:8080` and type to grow a garden. Tap once for a
butterfly (appears after 250 ms); double-tap to bloom a flower.

## Next steps

- Phase 3 — generative parameter ranges.
- Optionally add the jsdom smoke test into `test/` (jsdom as a devDependency) so
  the DOM/integration coverage runs under `npm test`.
