# Whiteboard rendering comparison

Current follow-up: the [integrated cached renderer](integrated-renderer.md) is now implemented inside Whiteboard behind a Test-only switch. The measurements and limitations below describe the earlier isolated experiment.

October 22, 2026. These are native macOS renderer experiments, not a declaration that the application meets its 10,000-element performance target. The cached renderers remain isolated in the benchmark and are not enabled in the Test app.

## Workload and method

The fixture contains 6,000 placed elements and 4,000 edges: 2,500 Markdown cards, 2,000 Text elements, 1,300 distinct SVG images, 196 board tiles and four 20-page PDF readers. Cards include code, math, tasks, links, long paragraphs and CJK text. The PDFs use the shared vector/text reader fixture. Real scanned/image-heavy documents are checked separately through a copy of Review; this synthetic fixture does not establish scanned-PDF performance.

The harness uses the actual Whiteboard, image, Markdown and PDF components. The fixture uses the default light palette. The reference viewport is 1,600 × 968 CSS pixels at device pixel ratio 2, on this macOS arm64 host. Runtime GPU diagnostics confirm acceleration. Source fingerprints include the main renderer sources, the runner and package lock. Comparisons must use matching fingerprints, viewport and recorded machine metadata, and run on the same reference computer.

Before measuring the overview, the harness waits for all 80 PDF pages, completed page painting, all 1,300 images and document fonts. Earlier development runs did not wait for complete PDF loading; the final named runs supersede them. Cached runs sample 180 frames per gesture, with a 30-pixel pan and a 12% zoom excursion. The much slower baseline uses 30 frames over the same path. Frame percentiles are hardware diagnostics rather than timing assertions for shared CI.

## What was compared

- **Full DOM/SVG:** existing component rendering and camera publication.
- **Retained camera, CSS compositing, and WebGL edges:** diagnostic attempts that retained the rich DOM scene. They did not solve the overview bottleneck. A separate SVG-hidden probe also remained slow.
- **Simplified DOM:** reduced the scene from approximately 151,000 to 40,000 DOM nodes, while preserving image previews and promoting selected elements. It remained outside the frame budget. Its optional component path exists only for comparison; no app entry enables it.
- **Retained Canvas and WebGL:** capture the actual fully rendered scene with 1.5× display-resolution headroom, then draw it as a cached overview. The hidden rich scene is excluded from rendering and React camera publication is suspended during the measured gestures. Both restore live content for a subsequent card-edit check. This is a drawing-path experiment, not an implementation of interactive cached cards.

A browser trace attributed about 7.4 seconds to Chromium's `Layerize` work across six overview frames. This fixture's dominant cost sits in browser scene/layer construction, rather than a TypeScript arithmetic loop. Replacing only edge drawing or changing the application language would leave that cost in place.

| Approach | Overview pan p95 | Overview zoom p95 | Frames per gesture | Capture |
| --- | ---: | ---: | ---: | ---: |
| Full DOM/SVG | 1270.5 ms | 1412.4 ms | 30 | — |
| Retained Canvas | 18.5 ms | 18.5 ms | 180 | 9.91 s |
| Retained WebGL | 18.7 ms | 19.2 ms | 180 | 9.24 s |

Matched source fingerprint: `d2e524e615d5e6bb604efe1f6cc84a71f7be0f1b7649fbd3595a400f8cbb7970`. All three native harnesses completed, with 6,000 placements, 1,300 images and all 80 PDF canvases painted before overview measurement. Cached image checks passed; cached interaction parity remains unimplemented.

The retained runs compare the displayed image against the source capture, with automatic limits on pixel error. They also require extra resolution for the tested zoom range. The captured texture is bounded to 16 million pixels; the reference run uses about 56 MB of RGBA source pixels plus a 25 MB display surface. These are logical pixel allocations, not a measurement of total GPU memory.

## Adoption decision

Do not enable these cached renderers in the app yet. Whole-scene capture takes several seconds and the prototype retains the original rich scene in memory. The renderer working set remains large. It also lacks direct interaction through the cached surface, offscreen-content loading, revision-aware invalidation and a tested production recovery path. A successful card edit after restoring the original view does not prove interaction parity during cached rendering. The reports therefore keep `featureParity` and adoption approval false even when warmed frame timing passes.

The useful result is that retained previews can remove the layer-construction cost. Canvas and WebGL are close enough in these measurements that there is no evidence yet for adding PixiJS or rewriting the application. The next prototype should use bounded previews per element or tile, a scene/spatial index independent of React, and live DOM overlays for readable or active content. It must not keep thousands of hidden editors or create whole-window captures during navigation.

For Markdown previews, evaluate a bounded staging renderer using the existing HTML/CSS and fonts. Electron supports [offscreen bitmaps and shared GPU textures](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering); the shared-texture route requires native integration and should only follow measurements showing that bitmap transfer is a bottleneck. This is an evaluation path, not an installed native module. PDF/image preparation and preview delivery must remain cancellable and prioritized.

Direct links, checkboxes, Text shortcuts, PDF selection, drag/drop, references, multi-selection and undo need explicit parity checks. First interaction must promote/replay against the current content revision without a camera or geometry jump. Readable text must use live rendering or a preview whose density covers display demand; large PDFs need viewport detail. Cache eviction, repeated tab/zoom cycles, GPU recovery, dense overlap and Windows profiling are still required. The [foundation proposal](whiteboard-foundation.md) lists the remaining gates.

## Runtime changes in this pass

The app keeps its existing renderer. PDF raster demand now follows display density and board zoom in power-of-two buckets with headroom. A four-million-pixel full-page preview stays visible while a sharper visible crop renders into a separate buffer. The crop is capped at sixteen million pixels. It replaces its displayed bitmap only after completion, tracks viewport movement after settling, and scales its placement with PDF resizing. Detached canvases release their backing buffers. An already-sharp base preview does not allocate an additional crop merely to satisfy oversampling headroom.

Native checks verify a 1,200-pixel-wide PDF at 300% board zoom on Retina: the crop covers the visible page, provides about 1.33 source pixels per display pixel, stays opaque and retains its canvas through a pan. Source text is visibly crisp in the generated quality screenshot. Fast zoom jumps can temporarily show the previous raster while refinement finishes; source-image resolution and the crop budget still limit extreme cases. This is not a guarantee for arbitrary high-density displays.

The first board render now uses the saved camera rather than a temporary default view. Image geometry waits for loading to complete, including completed error placeholders. Fully visible PDF pages use a subpixel tolerance when choosing the current page, avoiding changes driven solely by rounding differences.

## Reproduce

Run one native workload at a time. The harness opens only generated content and writes only under `.local/board-benchmark/`. A reused label replaces that label's generated build/report; use a new label to retain evidence. Do not store personal workspaces there.

```sh
npm run benchmark:board -- baseline measured-baseline
npm run benchmark:board -- snapshot-canvas measured-canvas
npm run benchmark:board -- snapshot-webgl measured-webgl
node scripts/compare-board-benchmarks.mjs measured-baseline measured-canvas measured-webgl
npm run test:reader
```

Other diagnostic modes are `retained`, `compositor`, `containment`, `gpu-edges`, `gpu-kernel`, `overview`, `overview-gpu` and `trace`. GPU-only probes do not establish complete edge styles or interaction parity. Trace mode uses six frames and saves a browser trace; normal modes save renderer CPU profiles, screenshots, source-capture comparisons and JSON results.

The comparison checkpoint rejects mismatched sources/viewport/host, incomplete PDF painting, insufficient resolution headroom and image-fidelity failures. `passed` means the harness completed. `budgetPassed` concerns measured frame timing only. Neither establishes production readiness. The JS heap estimate exposed by Chromium is coarse; use the reported renderer process memory as a separate diagnostic, without treating it as GPU memory or a cache-plateau test.

## Final reader validation

Lint/type checking and all 349 tests pass. The native reader fixture checks a live DOM card at 300% zoom alongside the PDF crop, then exercises code editing, source selection, annotations, resizing, low-zoom persistence, tab switching and popup virtualization. Quality screenshots are saved under `.local/reader-check/`.

A separate run profiles a copy of Review with seven PDF readers and 88 page layouts. At a fixed 100% reading zoom, all eight intersecting pages had painted previews with at least two source pixels per display pixel and completed text layers. Reading pan p95 was 18.6 ms; overview pan/zoom p95 was 18.1/18.3 ms at the saved 21.91% camera. There were zero idle repaints, zero observed blank/replaced canvases among continuously visible warmed pages, and no measured gesture long tasks. New pages still paint progressively. These numbers describe this Review snapshot, not the 10,000-element fixture.

The fixed reading-zoom method now waits for visible-page raster density and text readiness; older reader measurements used a relative zoom gesture and are not direct comparisons. Raw results are in `.local/reader-benchmark/sharpness-final/report.json`.

Temporary package: `0.1.2718-test.3`, installed and signature-verified under `.local/test-app/mac-arm64/Heaven's Door Test.app`. After unlock, Test.2 quit normally and its bundle was retained under `.local/test-app/previous-test.2/`. Test.3 reopened the preserved Review workspace; PDF previews loaded and switching to Other and back succeeded without an app error. No personal card content was edited. The Test counter remains 3 and the stable release remains `0.1.2718`. The renderer experiments remain outside the packaged runtime.

## Bounded tile follow-up

The [bounded preview experiment](bounded-previews.md) avoids retaining the complete rich DOM and compares separate preview drawing with cached tiles. It adds byte-budget, stale-render, transparency, first-click, saved-cache and repeated-pressure checks. It remains isolated because full interaction, layering, dynamic invalidation and resource gates are incomplete.
