# Bounded previews and cached tiles

Current follow-up: the [integrated cached renderer](integrated-renderer.md) is now implemented inside Whiteboard behind a Test-only switch. The measurements and limitations below describe the earlier isolated experiment.

October 22, 2026. This is an isolated renderer experiment. It is not enabled in the Test app and does not establish complete interaction parity or a production memory limit. The normal app retains the renderer and PDF sharpness changes described in [the earlier comparison](rendering-comparison.md).

## What this tests

The shared fixture has 6,000 placements and 4,000 edges: 2,500 rich Markdown cards, 2,000 Text elements, 1,300 distinct image assets, 196 board tiles and four expanded 20-page PDFs. The stage renders actual Whiteboard components in batches of at most 40 placements. It waits for fonts, images, card content and all 80 PDF page canvases before recording previews. The stage drops its old DOM between batches.

The full timing and soak measurements correspond to local commit `1b1c671`. Later guards are verified separately in `.local/preview-benchmark/final-guards-smoke-2/report.json`; the smoke workload is not a replacement for the full timing evidence.

Source previews are transparent: the grid is rendered independently using the app's existing grid CSS and camera. A regression check verifies that plain Text does not acquire an opaque background. Native screenshots are cropped and resized with explicitly released browser `ImageBitmap`s. The first version used repeated [NativeImage crop/resize copies](https://www.electronjs.org/docs/latest/api/native-image), and the browser-process peak exceeded 1 GB. The browser bitmap path reduces that peak; it does not eliminate staging/GPU memory costs.

Drawing 6,000 separate images on every camera frame remained slow. The next path composes previews and edges into a small number of 512-pixel cached tiles, using 1.5× display-resolution headroom for the measured overview. Tile composition yields between tiles. Camera movement then draws the retained tiles without rendering Markdown, reading notes or changing the stage.

This is a Canvas 2D experiment using Chromium's accelerated rendering. It does not add PixiJS, a native module or a language rewrite. The measurements support reducing repeated work before selecting another drawing library.

## Measurements

Final full report: `.local/preview-benchmark/retained-tiles-soak/report.json`, source fingerprint `a1be449a118fc0ba09c2577546a367f49f88ac386b703bc0fa4b00c0e6589a51`. All 6,000 previews and 80 PDF page previews were prepared. Both displayed and stored pixels passed the deliberately reordered revision race. Timing budgets passed; interaction adoption remains false.

| Measurement | Result |
| --- | --- |
| Separate previews and edges, pan p95 | 414.7 ms |
| Separate previews only, pan p95 | 403.7 ms |
| Edges only, pan p95 | 21.7 ms |
| Cached tiles, pan / zoom p95 | 18.7 / 18.8 ms |
| Tile composition | 819 ms, 30 tiles; longest tile 5.8 ms |
| Decoded source / tile pixels | 8.42 / 26.14 MB |
| First source preview / all cold previews | 733 ms / 59.04 s |
| Saved cache / fresh-renderer reopen | 4.50 MB / 301 ms |
| Pointer hit p95 / first editor focus | 0.2 ms / 45 ms |
| Completed pressure cycles / idle frames | 20 / 0 |

Timing uses a 1,600 × 968 CSS viewport, DPR 2, on the named macOS arm64 host in each report. Direct diagnostic paths use 30 sampled frames; tile pan/zoom use 180 frames each, over the same 30-pixel pan and 12% zoom excursion. These are renderer diagnostics rather than portable CI timing assertions.

The fresh-renderer reopen reads the generated cache file, loads the renderer, validates identity and PNG sizes, decodes the tiles and paints the original overview. It verifies identical canvas pixels. It does not include opening/indexing a real workspace, and it does not prove the app's proposed 100 ms warm-board target. Cold preparation remains far too slow for a required foreground operation. Per-element atlas packing, demand prioritization and a revision-aware persistent preview cache remain necessary.

## Correctness and resource checks

The decoded-preview LRU has a 16 MiB limit. Encoded source blobs have a separate 16 MiB limit; tile pixels have a 32 MiB limit. Display surfaces, temporary capture/crop buffers, native browser image caches and PDF documents are additional allocations. Reported logical bytes must not be presented as total RAM or GPU memory.

New work receives its generation token before any asynchronous decode. Pixels, measured geometry and the encoded source commit together only if that token is current. The native race check deliberately lets an older red preview finish after a newer blue one; both the displayed pixels and stored source must remain blue, with the newer geometry. Source-preview installation and cached-source restoration reject superseded work. Tile-level scene epochs and partial invalidation remain adoption requirements. Unit tests also exercise cancellation, replacement, eviction and release.

Pressure cycles replace six overview previews with 200% detail images, restore all original previews, and verify the same rendered pixels. They check the byte ceiling, release counters, unchanged DOM size and zero idle repaints. They also record per-process working sets without forcing garbage collection. Twenty cycles reclaimed substantial process memory during the run, but later samples still rose. The overview renderer fell from about 410 MiB to 264 MiB, then ended around 331 MiB; its peak was higher. GPU and staging processes have separate costs. These samples and logical pixel ceilings do not establish a long-term process-memory plateau. The reports retain the raw process samples rather than silently excluding transient peaks.

Readable regions promote into the existing Whiteboard/editor. The native check clicks once, verifies focus and the intended paragraph/caret, types real input and follows an external link through the core link handler. It checks that the camera stays fixed. The fixture's link destination is recorded locally; it does not launch an external browser. Workspace history is absent from this fixture, so undo is explicitly unverified rather than replaced with a mock undo stack.

Saved tiles carry a source signature, viewport/DPR, geometry and PNG dimensions. Validation rejects mismatches, duplicate/unknown geometry IDs, invalid bounds, PNG dimension mismatches and tile allocations above the budget before decoding. Native checks reject a stale signature and recreate the view in a fresh renderer. This is a rebuildable benchmark cache under `.local/`, not a new document format or a cache implementation installed in user workspaces.

## Visual evidence and remaining gates

The built-in comparison checks the direct prototype against its tiled image, including alpha. Rasterization differs, so this is a bounded-error check rather than pixel equivalence. A separate diagnostic compares `tiles-screen.png` against a freshly rendered app screenshot of the same fixture, masking only the existing app's bottom-right controls. The final diagnostic recorded mean RGBA error 1.12/255, with 3.08% of compared pixels differing by more than 20 in an RGB channel. The empty background region matched exactly. Its `reference-comparison.json` records both source fingerprints and the mask. The two implementations intentionally have different fingerprints; this visual diagnostic is not a same-source timing comparison.

The prototype uses the app's edge geometry, colors and dash rules, but its Canvas arrowheads and labels do not implement every SVG detail. The fixture is predominantly separated elements. Its readable-region cap and simple masking do not settle dense overlap, translucent layering or z order. The current tile builder covers this fixture's bounds; it is not a viewport-driven infinite-board tile scheduler. A preflight guard now rejects an oversized plan before allocating or evicting tiles, preserving the last completed view. The native guard test moves a fixture object far away and verifies that rejection does not replace the valid tile cache.

Before adoption, implement and test:

- Density buckets, hysteresis and viewport-prioritized tiles across arbitrary zoom, board extents and display sizes. A low-resolution overview must not become the readable representation.
- Geometry/content/font/theme/source revision keys, dependency invalidation and partial tile rebuilding. Keep old completed pixels until current replacements are ready.
- Shared camera and command ownership, avoiding separate live/overview camera authorities. First pointer/keyboard input must reach current content without additional clicks or altered semantics.
- Dense overlap and transparency, semantic hit regions, references, Text shortcuts, drag/drop, multi-selection, PDF selection/annotations, accessibility, real IME, and real workspace undo.
- Long-lived process/GPU memory checks, staging cancellation/recycling, context-loss recovery, real scanned documents and Windows measurements.

The current production renderer remains the recovery path. Performance passing here is not permission to replace working editors with inert pictures.

## Reproduce

Run one native workload at a time, without parallel builds/tests:

```sh
npm run benchmark:previews -- preview-smoke --smoke
npm run benchmark:previews -- retained-tiles-soak --soak
npm run benchmark:board -- trace current-reference
npm run lint
npm test
```

`--smoke` prepares 36 representative placements and all 80 PDF pages; it does not establish 10,000-element performance. The default full run has three pressure cycles; `--soak` uses twenty. Output goes only under `.local/preview-benchmark/<label>/`. A reused label replaces that label's generated renderer/report/profile/cache; keep personal workspaces outside that directory. The app reference goes under `.local/board-benchmark/<label>/`.

`report.json` distinguishes completion (`passed`), warmed timing (`budgetPassed`) and interaction adoption (`featureParity`, deliberately false). Screenshots, a generated `tile-cache.json`, signatures, process-memory samples and first-click/race results accompany it. Failed development smoke runs do not supersede a final full report.

Validation at the measured checkpoint: lint/type checking, all 352 tests and the production build pass. The full native soak and the fresh app-renderer reference completed. The stable version and Test counter are unchanged; no renderer experiment is packaged into Test.3.

The follow-up native guard check also verifies cached-source restore ordering, ignores camera callbacks from a retired live overlay, and checks that all preview/source/tile pixels return to zero after fixture teardown. This fixes prototype teardown without claiming that separate live/overview camera controllers are suitable for production. The fixture keeps workspace undo unverified.

Final source validation: lint/type checking and all 353 tests pass after the follow-up guards. Native `final-guards-smoke-2` passes first-click typing/link handling, unchanged camera on teardown, both stale-work races, oversized-plan rejection, transparent Text, cache release, stale saved-cache rejection and fresh-renderer pixel restoration. After unlock, the already-built Test.3 replaced Test.2 following a normal Quit, with the previous bundle preserved. The packaged app reopened Review, loaded its PDF previews and passed a tab-switch check. The experiments remain isolated from that runtime; the stable version and Test counter did not change.
