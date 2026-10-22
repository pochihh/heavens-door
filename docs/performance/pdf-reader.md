# PDF board performance

PDF page dimensions stay mounted while nearby page canvases and text layers are virtualized. Board zoom changes raster density after settling, without changing document geometry. Pages still loading must not supply a temporary height to board culling: a board reopened halfway down a tall PDF must finish loading that PDF.

PDF readers share a cancellable paint queue. It admits one PDF.js rendering continuation (or text-layer start) per animation frame, fairly across readers. Camera movement pauses new painting until 150 ms after the last camera event. Existing raster previews follow the board transform during the gesture; newly visible pages and sharper previews finish afterward. Popup scrolling does not pause the queue.

Continuous board readers measure and report their visible page after the camera settles, never synchronously inside a camera paint. Horizontally offscreen readers do not report a page. Tracking the page does not invalidate the continuous reader's measured height or rebuild comment page positions. Explicit page navigation, search, highlight creation, and source recovery still use the normal reader actions.

## Checks

- `npm run test:reader` runs native PDF/editor checks in a generated workspace and isolated app profile. It includes real tab selection, PDF dragging/panning, page virtualization, and popup reading.
- `npm run benchmark:reader -- /absolute/path/to/workspace run-name` profiles a **copy** of an existing workspace. The source must not overlap the output directory. The workspace must initially show the Review board. If an Other board tab is open, tab-switch timings are measured; otherwise that phase is explicitly reported as skipped, and `test:reader` still checks actual tab switching in its generated fixture. The script does not open the source in its test application.
- Results and the renderer CPU profile are saved under `.local/reader-benchmark/run-name/`. That run's copied workspace/profile are disposable and replaced when the name is reused. Keep any user workspace outside this directory. Do not commit copied files or CPU profiles.
- The benchmark waits for actual page painting, measures overview pan/zoom and reading-zoom pan, counts board requests and long tasks, and verifies actual tab changes and reader recovery. Run benchmarks alone, without parallel builds/tests. Compare the same source files, camera, and hardware. Frame times are diagnostic measurements, not portable CI limits.
- Unit regressions cover queue fairness/cancellation, camera pause/resume, offscreen page tracking, deferred page saves, and loading-height culling.

## October 21 measurement

The user's Review board snapshot contained seven expanded PDFs, 88 pages, and approximately 36 MB of PDF source data. It was profiled locally on macOS; original files were left intact.

| Measurement | Before | After |
| --- | ---: | ---: |
| Zoom frame time, 95th percentile | 34.3 ms | 18.2 ms |
| Zoom worst frame | 67.9 ms | 18.6 ms |
| Board saves during zoom | 92 | 0 |
| Board saves during reading-zoom pan | 116 | 0 |
| Long tasks during measured gestures | 1 | 0 |

Final overview pan measured 18.3 ms at the 95th percentile; reading-zoom pan measured 18.5 ms. Real tab changes returned the board UI in 16–45 ms and reconstructed page dimensions in 143–218 ms. Raster painting continues progressively afterward. The earlier tab probe clicked a wrapper instead of the tab button and has been corrected; its old tab timings are not valid comparisons.

Initial overview rendering took about 2.75 seconds in the final snapshot run. Rendering work is deliberately spread across frames so input remains responsive. Very large scanned pages can still have expensive individual image draws; this pass does not introduce document caching or a separate rendering process. Windows runtime performance remains unmeasured.

Validation: lint/type checking, all 338 tests, and native reader checks pass. One existing ASAR fixture test failed on the first full run; its isolated rerun and the subsequent full suite passed. The packaged `0.1.2718-test.81` was reopened in the original Review workspace, and real tab switching and PDF previews were checked there. All 15 original Markdown/PDF files matched their initial snapshot hashes before reopening. Stable release version remains `0.1.2718`.


## October 22 continuity correction

Keeping CPU frames short did not prevent visible flashing: changing pixel density remounted the page canvas and queued its replacement after clearing the old image. The reader now retains one display canvas per mounted page, renders replacements into a detached buffer, and copies a completed result into the display synchronously. Cancelled or superseded work cannot clear the current preview. Text-layer changes are separate from raster density changes. Offscreen pages remain virtualized, so a page entering view for the first time still loads progressively.

The native benchmark now checks idle repaint count and samples pages that remain continuously visible through zoom and settling. It must observe warmed pages and reject blanking/replacement. The pre-fix build failed this check; the revised renderer recorded zero blanking/replacement observations and zero idle repaints. These are visual continuity checks, not new frame-rate claims. Native reader checks additionally verify search highlights without camera movement on typing, next-match focus, selected-text highlight creation with focused note input, and resizing without replacing or clearing the displayed page.

The old local Test counter had incorrectly carried into the `0.1.2718` series. It was corrected to start this series at `0.1.2718-test.1`; the final persistence correction is packaged as `0.1.2718-test.2`. Stable package versions and public releases are unchanged. The version tests now exercise a real package/lock stable bump followed by Test numbering, as well as the existing counter unit tests.

The 20% navigation and saved-layout limits, and separate 25% Zoom-to-fit floor, are removed. Navigation and persistence share the same camera limits. The numeric guard is 0.01%, with nonzero fractional labels below 1%. This does not establish large-scene performance: the separate [whiteboard foundation proposal](whiteboard-foundation.md) defines the agreed 10,000-element target and proposed validation gates.


Final validation: lint/type checking and all 342 tests pass. Native reader checks saved a camera at approximately 1.06%, read it back through the workspace backend, and restored the same transform after real tab changes without an application error. The packaged `0.1.2718-test.2` saved approximately 12.16% in the preserved Review workspace and restored it after switching tabs. The stable version remains `0.1.2718`.

The October 22 continuity snapshot's overview pan/zoom frame intervals measured 41.5/32.2 ms at the 95th percentile; reading-zoom pan measured 17.4 ms. Its camera/workload differs from the October 21 snapshot, so these are not direct before/after comparisons. They still show that overview performance needs further work. Zero flashing observations does not mean the whole board meets the proposed frame-time budget. The copy had no Other tab open, so that benchmark explicitly skipped tab timings; the native generated fixture separately exercised actual tab switching.


## Zoom sharpness

The reader now requests raster density from board zoom and device pixel ratio, using power-of-two buckets with headroom. A bounded four-million-pixel base preview remains visible while a viewport crop (at most sixteen million pixels) refines large pages. Both commit from a completed buffer; text selection and annotation coordinates remain independent of raster resolution. Detail crop placement uses page-relative percentages during resizing, and detached canvases release their backing stores.

`test:reader` includes a 1,200-pixel PDF at 300% board zoom on Retina. It checks display-pixel coverage, opacity, visible-area coverage and canvas identity through panning, then restores the prior width/camera and checks normal editing, saved low zoom, tab switching and popup reading. The fixture waits for the expand action to finish saving before its synthetic width mutation. A first run raced that mutation against the preceding UI save; the harness now explicitly waits for the saved expanded state.

The [rendering comparison](rendering-comparison.md) distinguishes these verified reader changes from the unshipped cached-renderer experiments. A previous raster can remain visible briefly during very fast zoom jumps. Very large high-density viewports can exceed the crop budget; a future tiled renderer must address that case.
