# What was done — Vendure

Status: **Phases 0–3, 5, 7 complete and verified.**

## Overview

Vendure is a single-file, vanilla-JS canvas app (`index.html`). This work
split the pure helpers into ES modules, made the poster size aspect-aware,
added persistence/sharing, and added tap gestures. The goal was to land
**Phases 0–2 of a 7-phase roadmap**.

Roadmap (0–3, 5, 7 done):

- Phase 0 — module split, `ZW/ZH` poster-dimension refactor, state schema
- Phase 1 — persistence & sharing
- Phase 2 — tap gestures (single tap = butterfly, double tap = blooms a flower)
- Phase 3 — generative parameter ranges *(completed this session)*
- Phase 4 — export / Lottie *(not started)*
- Phase 5 — interaction / editing *(completed this session)*
- Phase 6 — audio export (separate WAV) *(not started)*
- Phase 7 — perf / a11y / PWA *(completed this session)*

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app. `<script type="module">` with imports; all `Garden.prototype.*` methods. |
| `src/math.js` | Pure math helpers: `h, spr, eo, eb, rng, bez, at`. |
| `src/encoders.js` | Pure encoders: `gU16/gU32/bU16/bU32/gBytes/gConcat/crcTable/crcBytes/pngChunk/deflateBytes/quantizeColors/buildPaletteLUT/gifLZW/gifSubBlocks/nextTick`. |
| `src/palettes.js` | `PAL` (13 palettes). |
| `src/state.js` | `STATE_VERSION, STORAGE_KEY, ASPECTS, defaultState, stateToHash, hashToState, loadSaved, saveSaved, clearSaved, absURL, shareOrCopy, copyText, copyBlob`. |
| `src/_app.mjs` | Generated Node mirror of the inline module script (only import paths differ). Used for headless testing. |
| `manifest.json` | PWA web app manifest (standalone, dark, icons). |
| `sw.js` | Service worker: precached app shell + runtime Google-Fonts cache (offline). |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Generated app icons (script in `/tmp/opencode/genicon.mjs`). |
| `package.json` | `"type":"module"`, `npm test`, `npm run serve`. |
| `test/run.js` | Node test harness — 29 assertions, all passing. |

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
- `localStorage` key `typegarden.v1` (kept from the original name for
  backward-compat — existing saved gardens survive the rename); schema
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

## Phase 3 — generative parameter ranges (completed this session)

Four knobs now control how the garden grows. They live in `this.opts` alongside
the existing `boil`/`recoil`, are persisted, shareable, and drive generation:

| Param | Range | What it scales |
| --- | --- | --- |
| `density` | 0.5–2.0 | stem/leaf/bridge frequency (`leafy`, `dens`, `bridgeP`) |
| `curvy` | 0.5–2.0 | vine curvature and waviness (`p.curvy`) |
| `size` | 0.6–1.6 | rose/bloom scale (`p.big`) |
| `roses` | 0.0–2.0 | rose-vs-other tip probability (`p.roseP`, capped at 0.85) |

Changes:

- `this.opts` default gains `curvy:1, size:1, roses:1`.
- `wordParams()` reads all four and multiplies into the per-word params, so the
  same seed now yields a different garden when a knob moves.
- Poster panel has a new **Garden** group with four range sliders
  (`#sdensity/#scurvy/#ssize/#sroses` + value readouts), wired by
  `bindSliders()`; `syncSliders()` refreshes them in `applyState`.
- `Garden.prototype.regrow()` re-runs `gen()` on every live letter and flower
  (restarting growth) in Type mode, or `buildPoster()` in Poster mode.
- `serialize()`/`applyState()` carry the new fields; `src/state.js`
  `defaultState()` matches.
- Permalink gains a compact `o=density,curvy,size,roses,recoil,boil` param,
  written only when non-default (keeps stock URLs short). Round-trip verified.
- CSS: `.pslider` row (label · range · tabular-num readout).

Verified: `node --check` OK; `npm test` 26/0; smoke 23/0; restore 4/0; mirror in
sync; permalink opts round-trip + "no `o=` when default" both pass.

## Phase 5 — interaction / editing (completed this session)

An **Edit** button (`#modes`) turns Type mode into a lightweight editor. Edit is
a sub-mode of Type: same canvas, but typing and tap gestures are suspended.

- `this.emode` flag + `this.sel` (selected letter) + `this.drag` (active drag).
- `setMode('edit')` enters edit; `syncEmode()` mirrors state to the button,
  `#edithint` ("drag to move · del removes"), and the canvas cursor
  (`#app.emode` → `grab` / `.dragging` → `grabbing`).
- **Pick** — `pick(wx, wy)` hit-tests each live letter's draw box
  (`x ± tw/2`, `y ∈ [-0.78S, +0.22S]`), scanning back-to-front so the topmost
  letter wins. `toWorld()` maps screen→canvas via `getBoundingClientRect`.
- **Drag** — `editTap` arms `this.drag` with the grab offset; `editMove` stores
  the move as `l.ox/l.oy` (offset from the layout target) and updates `l.tx/ty`
  so the frame lerp follows. `editUp` clears it.
- **Offset survival** — `layout()` re-applies `l.ox/oy` after `layoutCore`, so
  moved letters stay put across retype/regrow/resize/spacer changes.
- **Delete** — `editDelete()` withers `this.sel`, clears the selection, and
  resyncs the hidden input (`inp.value = SENT; iv = SENT`) so `liveText()` and
  subsequent keystrokes remain correct. `Delete`/`Backspace` route here while
  editing; `Escape` deselects.
- **Highlight** — `drawSel()` draws a dashed box + anchor dot via new portable
  `backend` primitives `dashRect` (built from short stroke segments) and `dot`
  (16-gon), so canvas and SVG backends both work. `savePNG` temporarily clears
  `this.sel` so exports never include the selection box.
- **Persistence** — `serialize()` adds `offs` (`[index, ox, oy]` triples over
  live letters); `applyState()` stores them and boot/`loadJSON` call
  `applyOffsets()` after replay. Permalink gains a compact
  `d=i:ox:oy,...` param, written only when non-empty.

Verified: `npm test` 29/0 (offsets round-trip + "no `d=` when empty"); smoke
23/0; restore 4/0; a dedicated `edit.mjs` jsdom suite 20/0 (enter edit, pick,
drag, offset-survives-layout, serialize, delete + input resync, exit). Mirror
in sync; `node --check` clean.

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
  - `loadJSON()` replays a Type-mode project's words
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
butterfly (appears after 250 ms); double-tap to bloom a flower. Click **Edit**
to drag letters around or delete them.

## Phase 7 — perf / a11y / PWA (completed this session)

- **Reduced motion**: `this.reduce` reads `prefers-reduced-motion: reduce` on
  boot and a `matchMedia('change')` listener keeps it live. `mainState()` then
  returns `sway: 0`, `boil: false`, `face: false`, `speed: 999` (growth completes
  instantly) and `wither: 1`; `wpt()` skips the birth "pop" when `st.reduce`.
  Poster mode is intentionally left at full motion (it is an animation tool).
- **DPR cap**: `resize()` clamps `devicePixelRatio` to 2 — the 3× buffer cost
  isn't worth the visual gain.
- **Background pause**: the rAF loop skips `frame()` while `document.hidden`, and
  a `visibilitychange` handler resets `this.lt` so returning doesn't jump.
- **Focus + ARIA**: `:focus-visible` outline on `#app`/`#pexp` controls (with
  `:focus:not(:focus-visible)` removed); `#cv` labelled; `#modes` is a labelled
  `role="group"`; mode buttons carry `aria-pressed`. New
  `updateModeButtons()` is the single source of truth for the active highlight
  and `aria-pressed` (called from both `syncEmode()` and `setMode()`).
- **PWA**: added `manifest.json` (standalone, dark, 192/512 + maskable icons),
  generated PNG icons (`genicon.mjs`), `<link rel="manifest">`, theme-color,
  apple-touch meta, and a root `sw.js` service worker. The SW precaches the app
  shell, does network-first for navigations (so a redeploy shows up) and
  stale-while-revalidate for same-origin assets, plus a cache-first strategy for
  Google Fonts so the typeface survives offline. Registration is skipped on
  `file://`.

## Next steps

- Phase 3 — generative parameter ranges — **done**.
- Phase 5 — interaction / editing — **done**.
- Phase 7 — perf / a11y / PWA — **done**.
- Remaining: Phase 4 (Lottie export), Phase 6 (audio/WAV export).
- Optionally add the jsdom smoke test into `test/` (jsdom as a devDependency) so
  the DOM/integration coverage runs under `npm test`.
