# Integrated cached whiteboard renderer

October 22, 2026. Implemented in the actual Whiteboard behind the Test-only **Experimental cached whiteboard** switch under Settings → Developer. It is off by default. The stable version remains `0.1.2718`; this is not a release or an assertion that all performance gates are met.

**Navigation correction:** the earlier warmed rAF timings below did not establish real interaction performance. The [Retina navigation follow-up](#retina-navigation-follow-up) reproduces the user-reported zoom delay and tile seams, records compositor presentation timing, and documents the fixes.

## Architecture and ownership

The existing Whiteboard owns the camera, selection, gestures, rich editors and workspace commands. The new Canvas surface is a disposable drawing cache within that same board. It does not own files, references, annotations or undo, and requires no file migration, new rendering dependency or native module.

- A spatial index provides viewport and pointer queries. Edge geometry is shared with the existing SVG path, connector and label UI; unchanged geometry survives subsequent renders.
- At very small zoom, fixed-size cards and board tiles show their shape, color and title; Text uses measured geometry and vector drawing. Rich images and PDFs use snapshots of their actual components. Preparation runs in small batches, yields between expensive work and pauses during camera movement.
- The surface composes 512-pixel viewport tiles with a two-pixel sampling bleed. Content, geometry and style changes invalidate affected tiles instead of redrawing every element on every camera frame. The original grid remains independent.
- Hover, selection or readable zoom promotes content to the existing DOM editor/reader. Transitive overlaps are promoted together to preserve stacking order. Completed cached content remains visible until live images, PDF pixels and selectable text are ready. The first pointer press uses the existing gesture handlers, including while a PDF reader is loading.
- Fonts and theme values participate in geometry and source signatures. Measured dimensions survive tab switches for the current session. Editing and file moves still use revision-checked workspace transactions and the original undo groups.
- Camera/layout saves now have a compact preferences response. They neither construct a full workspace snapshot nor broadcast another snapshot back to the initiating window. Other windows continue receiving change notifications. Save failure recovery and save-before-close still use the existing preference queue.

## Resource limits and sharpness

Decoded source previews share a 64 MiB per-window LRU cache; each board surface has a separate 64 MiB tile cache. The display canvas is capped at 16 million pixels. One source snapshot is capped at four million pixels and 8,192 pixels per dimension. Preparation rejects PDFs above 256 pages before requesting all pages, and falls back to the existing reader for oversized snapshots. These are logical pixel limits, not measurements of the entire process or GPU allocation.

Preview density uses zoom and display density, bucketed with headroom. The tile budget must fit the whole visible viewport before admitting a density. Readable zoom uses the original live content; the PDF reader retains its high-resolution visible-crop path. Reloading a PDF invalidates all cached references and unfinished source captures. Late or cancelled work cannot overwrite newer pixels.

Repeated eviction of the same source stops preparation and promotes the existing live element. This prevents a cache-pressure regeneration loop, at the cost of potentially slower dense scenes. Snapshot failures and lost drawing contexts retain the existing renderer as a recovery path. Actual GPU-crash recovery is still unverified.

## Native verification

The harness launches the normal Electron application, preload bridge and workspace worker. It creates actual Markdown, whiteboard and asset files in a disposable workspace. Native mouse/key events exercise the normal UI; save/undo checks inspect the resulting files. Reports verify the indexed element count before measuring and wait for the actual preparation queue and visible tiles to complete.

The mixed workload contains **6,000 placements and 4,000 edges**, including 2,500 rich cards, 2,000 Text elements, 1,300 distinct images, 196 child boards and four expanded 20-page PDFs. Distant regular cards intentionally use reduced detail. An additional real-app workload contains 10,000 Text elements. Review runs use a copy of the preserved seven-PDF, 88-page workspace, never its original files.

Recorded frame intervals are renderer `requestAnimationFrame` intervals during native wheel input, **not input-to-display latency**. Native tab/first-click timings use polling and are coarse upper bounds. Cold preparation and warm gestures are reported separately. Run one native suite at a time.

Commands:

```sh
npm run lint
npm test
npm run test:retained -- my-smoke
npm run test:retained -- my-mixed --full --trace
npm run test:retained -- my-text --text-only
npm run test:retained -- my-review --review=/absolute/path/to/workspace
npm run test:reader -- --retained
npm run test:reader
```

Each retained run replaces only its generated `.local/retained-check/<label>/` output. Use a fresh label to preserve reports, screenshots and optional CPU profiles; never store personal data there. The source fingerprint covers renderer sources, the fixture, runner, native probe and package lock. Reader checks use `.local/reader-retained-check/` or `.local/reader-check/`.

Unit checks cover indexed geometry, overlap closure, tile admission, session measurements, source invalidation, stale work, byte-budget eviction, finite retries and compact preference saving. Native coverage includes first-click editing, actual save/undo, dragging, group movement with its internal edge, moving an original file into a cached child board and undo, PDF selection/highlight/comment, PDF resizing, code/checkbox geometry, block extraction, low-zoom persistence, tabs and PDF popup virtualization.

## Measurements and remaining gates

On this Apple M3 Mac, the final named reports recorded:

| Real-app workload | Cold demanded preparation | Warm pan p95 / p99 | Warm live placements | Idle repaints |
| --- | ---: | ---: | ---: | ---: |
| 6,000 placements + 4,000 edges | 44.30 s | 17.5 / 32.5 ms | 0 | 0 |
| 10,000 Text elements | 11.76 s | 17.5 / 33.35 ms | 0 | 0 |
| Review copy at 18% zoom, 14 placements + 6 edges | 6.33 s | 17.4 / 33.27 ms | 0 | 0 |

The mixed run prepared all 1,300 images and 80 PDF pages before timing. Its warm DOM contained 1,269 nodes; decoded source previews occupied 2,047,872 bytes and pan tiles occupied 55,574,528 bytes. Native first-click editing, actual save/undo, drag/undo, group movement with its internal edge and cached-child-board file transfer/undo passed. The first editor appeared within the 262 ms polling bound; warm tab draws were bounded at 109 and 200 ms, so the 100 ms tab gate is not established.

Review prepared all 88 PDF pages, with 33,277,528 decoded source bytes and a tile cache reaching its 64 MiB limit during the gesture. Its first press dragged an actually cached PDF and undo restored it; live PDF search typing left the camera unchanged. A separate run at Review's saved 64.65% camera measured 16.8 / 17.3 ms, with visible readers live. The retained and default native reader suites both passed PDF/highlight/comment, resizing, code/checkbox geometry, block extraction, deep zoom, tab persistence and popup checks. At 300% zoom the PDF detail crop remained opaque, covered the visible page and provided about 1.33 source pixels per display pixel; regular card text remained live DOM.

No gesture long JavaScript tasks were observed in those measured windows. Camera movement produced one compact preferences save, with no card-body reads or full-snapshot requests in the gesture interval. That is not a claim of zero work, zero disk writes, or universal frame latency.

Reports: `.local/retained-check/integrated-final-10000/report.json`, `text-10000/report.json`, `review-cached-settled/report.json` and `review-integrated-final/report.json` (the latter three under the same retained-check directory). The mixed source fingerprint is `e9f81c6f12b8c3f31131b9ca10a5d245efe294da7778ac5b78596327ba1e6a54`. The later Review harness additionally records host/display metadata and requires 600 ms of stable queue/tile state to avoid declaring a transient layout gap warm. The mixed report independently recorded the complete image/page counts and zero subsequent idle frames. Lint/type checking and all 367 unit/integration tests passed.

This is an integrated experimental renderer, not the older isolated screenshot prototype. The following still prevent default adoption:

- Cold image/PDF preparation is substantial (44–48 seconds in the fully demanded mixed scene). Content appears progressively; warmed pan timing must not be presented as cold-open performance.
- Dense overlap and large selections can promote a large DOM set. Cache-pressure fallback preserves operations but can make those scenes slow. These cases still need representative native stress measurements.
- First editor creation, warm-tab latency and occasional long frames do not yet establish all budgets in the foundation proposal.
- Cached custom webfonts, math, IME and accessibility need broader fidelity/interaction checks. Native readable content is preserved, but that alone does not verify every cached preview.
- Windows, repeated long-duration memory plateau, real GPU loss and a complete reference/connector/external-drop replay remain unverified.

Keep the default renderer available while these gates are addressed. The historical [renderer comparison](rendering-comparison.md), [bounded preview experiment](bounded-previews.md) and [foundation budgets](whiteboard-foundation.md) explain the earlier measurements and adoption criteria.

## Packaged Test verification

`0.1.2718-test.4` was built with the existing temporary-build script, and its bundle identifier/version and ad-hoc signature were verified. Test.3 quit normally before packaging and its previous bundle remains under `.local/test-app/previous-test.3/`. The counter is now 4; stable `0.1.2718` and build number 4 are unchanged. No release, tag or remote push was created.

The packaged Test.4 reopened the preserved Review workspace. Its General settings visibly reported Test.4, and **Experimental cached whiteboard** was enabled through Settings → Developer. Review → Other → Review switched successfully, the saved camera returned, and PDF content rendered without a visible application error. No personal card content was edited during this packaged check. The switch remains enabled for the user's review; turning it off returns to the original renderer. It is off by default in a fresh Test profile and unavailable in stable builds.

## Retina navigation follow-up

The Test.4 user reported slower navigation, black tile grids during zoom and delayed PDF refinement. The earlier 17 ms numbers measured gaps between JavaScript animation callbacks during a warmed pan, on the 1× reference display. They did not measure click latency, time to finish PDF refinement or actual compositor presentation. The packaged app was running at 2× density on the other display. Those numbers were insufficient grounds for enabling the renderer as an improvement to the user's Review experience.

The new native replay places its disposable window on the actual Retina display and verifies **1710 × 1073 CSS pixels at DPR 2**. It records rAF and Chromium `AnimationFrame::Presentation` timestamps separately, along with PDF document loads, zoom range, visible-page resolution and graphics traces. A true-pan check explicitly uses Trackpad mode in the disposable app and asserts that zoom did not change. This matters because Review's saved Mouse mode intentionally turns wheel input into zoom; the first diagnostic labelled “pan” was therefore another zoom replay and is superseded by the corrected reports below. No input preference is changed in the personal workspace.

The corrected before replay reproduced reading zoom at **99.9 ms rAF p95** and **83.335 ms presentation p95 / 100.049 ms p99**. The trace showed GPU waits while repeatedly rasterizing the transformed live readers. An experimental constant compositing hint removed most of that cost, but could retain soft text after zoom. The implemented version applies the hint only while navigating and removes it after 150 ms of inactivity, including cleanup on disposal. Settled PDF/text rendering remains live and sharp. No graphics backend or hardware acceleration setting was changed.

The cached path also synchronously promoted a PDF reader on every pointer crossing. The corrected before sweep caused **69 document loads**. Hover now waits for a 150 ms dwell, does not promote new readers during navigation, and keeps an already-live overlap group stable. Pointer presses, double-clicks and drag targets still promote immediately. The matching final sweep caused **3 document loads**, rather than repeatedly recreating every crossed reader.

The tile grid was a separate correctness bug: fractional placement of separately sampled/clipped bitmaps left partially transparent border pixels. Tiles now carry a two-pixel bleed and composite through adjacent integer device-pixel clips. Admission is limited to 63 padded tiles so their decoded bytes still fit the 64 MiB tile budget. A native uniform-white regression checks 1,598,400 interior pixels at each of four fractional zooms (21.37%, 27.48%, 34.99%, 48.81%). Before the fix it found 7,272–13,850 under-opaque pixels per case; after the fix every sampled color and alpha value is 255. This isolates tile sampling; it is not a PDF content-fidelity test.

Final native Review replay (`navigation-verified-retina/report.json`, under `.local/retained-check/`):

| Gesture | rAF p95 | Presentation p95 / p99 |
| --- | ---: | ---: |
| Overview pan | 17.7 ms | 33.331 / 35.936 ms |
| Overview zoom, 18% → 57% → 18% | 17.6 ms | 17.890 / 37.117 ms |
| Reading pan | 17.5 ms | 16.778 / 50.003 ms |
| Reading zoom, 65% → 206% → 65% | 17.7 ms | 33.334 / 49.998 ms |

These short replay distributions are hardware diagnostics, not a universal latency guarantee. In particular, occasional 37–50 ms presentation gaps remain; this does not meet every foundation budget. The settled reading view had 15 intersecting PDF pages, all with completed selectable text and at least 1.538 source pixels per display pixel. Both native reader suites also passed on the actual Retina display, including PDF dragging, middle-button panning, highlighting/comment input, resizing, code/checkbox geometry, extraction, deep zoom and popup checks. Their 300% PDF detail crop covered the visible page, stayed opaque, retained its canvas through a pan and supplied 1.333 source pixels per display pixel within the 16-million-pixel budget. All 369 tests and lint/type checks passed.

Evidence: `navigation-corrected-cached` is the before replay; `navigation-verified-retina` is the final replay; `navigation-seams-before` and `navigation-seams-fixed-2` isolate tile opacity. `navigation-composite-cached` is the constant-hint experiment, not the shipped behavior. Each folder contains its report, source fingerprint, screenshots and per-gesture trace files. The current replay commands are:

```sh
npm run test:retained -- navigation-review --navigation --retina --review=/absolute/workspace
npm run test:retained -- navigation-dom --navigation --dom --retina --review=/absolute/workspace
npm run test:retained -- tile-opacity --navigation --retina --seams --review=/absolute/workspace
npm run test:reader -- --retained --retina
npm run test:reader -- --retina
```

Retina checks fail if a matching physical 2× display is unavailable; the harness does not silently substitute a lower-density run. All workspaces are disposable copies. The 10,000-element replay remains a separate warmed scale and command regression, rather than evidence for Review zoom responsiveness.

The post-fix 10,000-element native command regression (`navigation-regression-10000`) prepared all 1,300 images and 80 PDF pages, completed first-click editing, actual save/undo, dragging, group movement/internal-edge preservation and cached-board file transfer/undo without renderer errors. Its cold preparation remained 48.8 seconds and warmed rAF pan p95 was 17.6 ms on the original 1× scale fixture; neither supersedes the Retina Review presentation results above. A separate native smoke check verifies that a right press on a cached card opens its card menu immediately and Escape closes it, preserving that behavior despite delayed hover promotion.

Test.5 packaging and relaunch: `0.1.2718-test.5` was built and signature-verified using the existing temporary-build script. Test.4 quit normally with Saved status and its bundle is retained under `.local/test-app/previous-test.4/`. General settings visibly confirm Test.5. The preserved Review workspace reopened at its saved camera (about 90.6%), with the experimental renderer still enabled, sharp PDF content visible and Saved status. No personal card content was changed during verification. Stable `0.1.2718`, build number 4 and release publishing remain unchanged; the temporary counter is 5.


## Overlapping PDF layers

A separate overlap regression reproduced a toolbar from the rear PDF drawing and intercepting input above the front PDF's page. Media placements lacked a stacking context, so PDF toolbar, text and highlight layers could compete with neighbouring attachments. The shared placement root now uses `isolation:isolate`; selection and dragging keep their existing ordering, and comments and controls remain unclipped.

The native reader suite now creates two overlapping real PDF placements and checks the actual browser hit target with neither, either and both PDFs selected. The check failed before the CSS change and passes with both the original and cached renderers on the physical Retina display. Both complete reader suites also pass their existing drag, pan, resize, search, annotation, high-resolution detail, editor, extraction and popup checks. Reports and overlap screenshots are in `.local/reader-check/` and `.local/reader-retained-check/`; the failing reproduction is retained in `.local/pdf-overlap-before/`. The fix applies to both renderers and leaves existing selection ordering and overflow behavior intact.


Test.6 packaging and relaunch: the existing temporary-build workflow produced and signature-verified `0.1.2718-test.6`, preserving Test.5 under `.local/test-app/previous-test.5/`. General settings visibly confirm Test.6. The preserved Review workspace reopened at its saved camera with the experimental renderer enabled, Saved status and clean PDF overlap layering. No personal card content was edited. Stable `0.1.2718` and build number 4 remain unchanged; no release was published. Windows and another 10,000-element performance replay were not run for this CSS-only fix.


## Core baseline and independent PDF page surfaces

The Test.6 whole-attachment cache could replace PDFs with generic dark card rectangles when their preview bitmaps disappeared. The replacement used the complete attachment bounds, including the comment area, so it also looked too wide. The native `--stability` regression reuses a compiled pre-change app and deliberately evicts the board preview/tile caches. Its screenshot reproduces the reported dark boxes; the sampled white page falls to channel value 38 at 18% zoom (`pressure-before`). This is a controlled cache-pressure reproduction, not a claim that every graphics failure has the same cause.

PDFs now remain on their original per-page reader surface across zoom and hover. They no longer participate in whole-attachment snapshots. Visible pages use a separate 64 MiB decoded-image cache, keyed by source path, content checksum and page; a cached page is shown before any needed refinement. Offscreen page pixels remain bounded, and the existing reader still provides selectable text, highlighting, comments and high-resolution detail. The six-level pressure replay (7%, 12%, 18%, 30%, 65%, 80%) keeps the sampled page white at 255 with no document reloads during the transitions (`pressure-acceptance`). Changing/relinking source content changes the checksum and cannot reuse another revision's page image. Both native reader modes pass search, annotations, resize, overlap, 300% detail and popup checks, with observed cache reuse and bytes below the limit.

The core renderer skips empty tiles and substitutes small text strokes for unreadable overview glyphs. While zooming in, it reuses the current tile density and refines after motion stops; zooming out still observes viewport tile admission. Card movement now updates the selected DOM elements and connected SVG/mention lines directly per frame, then saves one board mutation on release. Escape restores the preview. Placement signatures and unchanged scene geometry are reused. Native checks verify the actual intermediate card/edge position while the file model remains unchanged, along with cancellation, delayed-save handling, group relationships, file moves, undo and context menus.

Two separate real-file, native Electron fixtures are now retained:

| Fixture | Cards | Text | Images | Boards | PDF attachments | Edges | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Core, no PDF | 2,500 | 2,000 | 1,300 | 200 | 0 | 4,000 | 10,000 |
| Existing mixed fixture | 2,500 | 2,000 | 1,300 | 196 | 4 | 4,000 | 10,000 |

The mixed test asserts all 80 PDF pages exist and render; the core test asserts zero PDF sources and zero page-cache bytes. Both run native editing, save/undo, movement, continuous drag, cancellation, multi-selection and transfer into a child board, on the physical Retina display. Both final unprofiled runs pass their functional assertions (`core-final-unprofiled`, `mixed-final-unprofiled`). CPU sampling is optional; their normal drag reports retain separate whole-operation and pointer-held presentation intervals.

**The 10,000-element performance target is not yet accepted.** The final core run took 36.8 seconds to prepare every demanded image preview; mixed took 38.6 seconds. Pointer-held drag presentation had a 16.7 ms median but 66.7 ms p95 and about 83.3 ms p99 in both final runs. Earlier intermediate runs were better; those are not grounds to claim the remaining spikes are solved. These intervals come from Chromium presentation trace timestamps and do not measure physical input-to-display latency. The new fixtures are regression evidence, not a declaration of smooth 60 fps under all operations. Cold image preparation, gesture boundaries and long-session memory remain work for the core whiteboard. Windows was not tested.

The separate warmed navigation replays (`core-acceptance-navigation`, `review-acceptance-navigation`) report presentation p95 around 17–33 ms. Review had zero PDF document reloads during each hover, pan and zoom phase, and its board tile cache used about 4–9 MiB instead of filling the 64 MiB budget with mostly empty tiles. These short runs do not supersede the less favorable continuous-drag results. The original editing and file behavior remain the reference; PDF performance must be measured independently. All 370 automated tests, lint/type checks and both native reader suites pass.

```sh
# Original mixed 10,000-element test, including 80 PDF pages.
npm run test:retained -- mixed-10000 --full --retina
# Additional mixed core test: still 10,000 elements, with no PDF files.
npm run test:retained -- core-10000 --no-pdf --retina
# Same navigation/presentation replay on the core fixture.
npm run test:retained -- core-navigation --no-pdf --navigation --retina
# Repeat with a disposable copy of the real Review workspace.
npm run test:retained -- review-navigation --navigation --retina --review=/absolute/workspace
# Force board-cache eviction while checking actual PDF screen pixels.
npm run test:retained -- pdf-pressure --stability --retina --review=/absolute/workspace
```

`--trace` adds CPU sampling and intermediate diagnostic screenshots; use normal runs for final timing comparisons. These native checks require a physical Retina display. CI's ordinary unit suite verifies fixture composition; it does not substitute for the local native interaction tests. All generated projects/workspaces are under `.local/retained-check/`. Personal workspaces are copied for tests and never mutated by the probes.


Test.7 packaging and relaunch: `0.1.2718-test.7` was built and signature-verified by the temporary-build script. Test.6 quit normally with Saved status and its bundle is retained under `.local/test-app/previous-test.6/`. General settings visibly confirm Test.7. The preserved Review workspace reopened at its saved camera (about 23%), with all seven PDF attachments displaying page content, the experimental renderer enabled and Saved status. No personal card content was edited during this verification. Stable `0.1.2718` and build number 4 are unchanged, and nothing was published. This Test build is for reviewing the PDF correction and core interaction changes; it does not mark the 10,000-element performance acceptance complete.


## Image continuity at overview zoom

The `--images` native regression adds an image to an ordinary card in the existing fixture, without changing the element count. It first shows that card and a standalone image at readable zoom, then checks their actual screenshot colors at 6%, 2.4% and 0.8% zoom, including a return to 6%. It evicts the detailed preview and composed-tile caches before each sample. The pre-change app loses the card image at 6% and paints the ordinary card fill instead (`images-before`). This exposes a missing check in the earlier count-only overview tests.

Image-bearing placements now retain a separate thumbnail with at most 64 pixels along either dimension, inside a 32 MiB decoded-pixel LRU budget. Normal preview capture also saves a small copy. Live card images acquire that thumbnail after navigation settles; image load events participate in the existing readiness checks. Simplified card rendering uses available image pixels rather than discarding them for a plain outline. Sufficient cached detail is reused when zooming out, and both thumbnail and detail revisions are invalidated on source reload. PDFs keep their independent page cache. Detailed live images still use the original image when reading or editing; this does not replace source files with thumbnails.

Both `images-core-10000` and `images-mixed-10000` pass all eight native color samples, idle rendering (zero additional frames), editing/save/undo, dragging, multi-selection, child-board transfer and context-menu checks on the physical Retina display. The core fixture has zero PDF sources/pages; the mixed fixture renders all 80 PDF pages. Thumbnail bytes during the pressure samples stayed below 2.1 MB. All 372 automated tests and lint/type checks pass, including thumbnail revision invalidation and dimension/byte bounds.

Cold preparation is still substantial: 46.9 seconds for core and 43.0 seconds for mixed in these runs. Warm pan rAF p95 was 17.5/17.2 ms; pointer-held presentation p95 was 83.3/50.0 ms respectively. These are short hardware diagnostics, not proof of a universal frame-rate guarantee or a cold-start improvement. Previously unread card bodies may still use title-only overview rendering. The bounded thumbnail cache is rebuildable and can itself evict older images under sustained pressure.

```sh
npm run test:retained -- image-smoke --images --retina
npm run test:retained -- image-core --no-pdf --images --retina
npm run test:retained -- image-mixed --full --images --retina
```


### Packaged macOS launch check

Opening the persistent no-PDF manual workspace from the packaged Test.8 app exposed a separate startup limit. The process stopped at roughly 4,070 workspace file handles, while the workspace worker waited forever for its watcher to become ready. Command-line fixture runs inherited a higher descriptor limit, so they did not reproduce this launch condition. A worker regression injects `EMFILE` during watcher initialization: before the correction it times out with “Opening hung.”

On macOS/Linux the main process now requests a 16,384-descriptor soft limit through Electron's existing `process.setFdLimit` API, bounded by the OS hard limit. Watcher startup errors also reject the opening request and return the existing recoverable error UI. Windows skips this process API. These are process-local limits; no system-wide settings are changed. The native 10,000-element runs above remain the image/rendering regressions; the packaged launch is checked separately.


Packaged verification: the original 65,536 request remained above this Mac's 61,440 kernel cap and did not resolve the inherited limit. The final 16,384 request does: Test.10 (`0.1.2718-test.10`) opened the persistent `10k-core-no-pdf` workspace through its registered-workspace UI, displayed Bench with the experimental renderer enabled, and reached Saved. General settings visibly confirm the running version. Test.7, Test.8 and Test.9 bundles are preserved separately; the existing script verified the final app signature. Stable `0.1.2718`, build number 4 and release publishing are unchanged. All 373 automated tests pass; lint/types pass. The watcher-error test fails before the fix and reports EMFILE correctly afterward. Windows and long-session memory were not rechecked in this pass.


## October 24 card and PDF interaction regressions

The card preview cache retains the edited HTML through the save/read-only handoff, with an editor-initialization fallback. Reading and editing share their content lane and checkbox CSS. The native reader check compares actual content widths, block positions/heights and checkbox colors. It also types inline math and watches five edit/save handoffs for invisible frames. Both DOM and experimental modes pass on the DPR 2 display, with zero blank samples. A separate delayed-request regression verifies edited text remains visible before the saved preview arrives. The suite additionally checks all-page comment ordering in single-page PDF mode, stable camera navigation, notes above an overlapping selected PDF, and canvas hits through empty comment-column space.

Both 10,000-element fixture runs pass editing, save/undo, drag/cancel, multi-selection, child-board transfer, context menus and eight image continuity samples down to 0.8% zoom. `feedback-core-10000` has no PDFs; `feedback-mixed-10000` renders 80 pages. Both idle checks report zero additional frames. The core run prepared demanded previews in 39.9 seconds, with warm pan rAF p95 16.8 ms and pointer-held presentation p95 50.0 ms. Mixed took 43.9 seconds, with 17.4/50.0 ms respectively. These short runs do not settle cold-start, long-session memory or universal frame-rate guarantees. All 380 automated tests and lint/type checks pass. Windows was not retested.

```sh
npm run test:reader -- --retina
npm run test:reader -- --retina --retained
npm run test:retained -- feedback-core-10000 --no-pdf --retina --images
npm run test:retained -- feedback-mixed-10000 --full --retina --images
```

Test.11 (`0.1.2718-test.11`) is packaged and signature-verified. Test.10 is preserved under `.local/test-app/previous-test.10/`. Stable `0.1.2718`, build number 4, and release publishing remain unchanged. The Mac locked before the final packaged relaunch, which remains pending an unlock.
