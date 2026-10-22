# Integrated cached whiteboard renderer

October 22, 2026. Implemented in the actual Whiteboard behind the Test-only **Experimental cached whiteboard** switch under Settings → Developer. It is off by default. The stable version remains `0.1.2718`; this is not a release or an assertion that all performance gates are met.

## Architecture and ownership

The existing Whiteboard owns the camera, selection, gestures, rich editors and workspace commands. The new Canvas surface is a disposable drawing cache within that same board. It does not own files, references, annotations or undo, and requires no file migration, new rendering dependency or native module.

- A spatial index provides viewport and pointer queries. Edge geometry is shared with the existing SVG path, connector and label UI; unchanged geometry survives subsequent renders.
- At very small zoom, fixed-size cards and board tiles show their shape, color and title; Text uses measured geometry and vector drawing. Rich images and PDFs use snapshots of their actual components. Preparation runs in small batches, yields between expensive work and pauses during camera movement.
- The surface composes 512-pixel viewport tiles. Content, geometry and style changes invalidate affected tiles instead of redrawing every element on every camera frame. The original grid remains independent.
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
