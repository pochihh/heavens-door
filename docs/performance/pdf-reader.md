# PDF board performance

PDF page dimensions stay mounted while nearby page canvases and text layers are virtualized. Board zoom changes raster density after settling, without changing document geometry. Pages still loading must not supply a temporary height to board culling: a board reopened halfway down a tall PDF must finish loading that PDF.

PDF readers share a cancellable paint queue. It admits one PDF.js rendering continuation (or text-layer start) per animation frame, fairly across readers. Camera movement pauses new painting until 150 ms after the last camera event. Existing raster previews follow the board transform during the gesture; newly visible pages and sharper previews finish afterward. Popup scrolling does not pause the queue.

Continuous board readers measure and report their visible page after the camera settles, never synchronously inside a camera paint. Horizontally offscreen readers do not report a page. Tracking the page does not invalidate the continuous reader's measured height or rebuild comment page positions. Explicit page navigation, search, highlight creation, and source recovery still use the normal reader actions.

## Checks

- `npm run test:reader` runs native PDF/editor checks in a generated workspace and isolated app profile. It includes real tab selection, PDF dragging/panning, page virtualization, and popup reading.
- `npm run benchmark:reader -- /absolute/path/to/workspace run-name` profiles a **copy** of an existing workspace. The source must not overlap the output directory. The workspace must initially show the Review board, with an Other board tab available. The script does not open the source in its test application.
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
