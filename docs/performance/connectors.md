# Connector proximity checks

Measured on 2026-10-20 on the development Mac. The fixture in `scripts/connector-benchmark-fixture.ts` contains 200 Markdown cards with rendered prose, 200 two-line Text elements (plain and shaped), and 200 edges. All 400 elements are mounted at 25% zoom; the viewport clips the board when narrower than its full width. The Test workspace also contains this fixture as **Connector performance checks**, without replacing existing review boards.

## Geometry query

Run `npm run benchmark:connectors`. It creates 1,600 placement anchors and 400 selected edge endpoints with one height lookup per placement, then performs 10,000 measured radius-and-snap queries after 2,000 warmup queries, cycling through 20%, 50%, 100% and 300% zoom.

| Measurement | Result |
| --- | ---: |
| Build cached scene | 0.822 ms |
| Query pair, median | 0.0109 ms |
| Query pair, 95th percentile | 0.0138 ms |
| Query pair, maximum | 0.1067 ms |
| Height lookups, including all queries | 400 |

These are CPU query timings, not frame-rate measurements.

## Full renderer

The production-bundled review harness used the real Whiteboard, Markdown previews, navigation and shared anchor/endpoint hint layer in Electron 44, with a 1280 × 828 CSS-pixel viewport at 20% board zoom. All 400 elements were mounted. The idle and unselected-hover phases started without selection; the following phases selected all 400 elements together with 201 edges (the 200 fixture links plus one created by the native drawing check). The reveal radius was 320 board units, with no screen-space floor. The synthetic marquee extended beyond the viewport to include all 400 placements. Pointer phases exercised unselected anchors, selected anchors and edge endpoints, a live connection, and a live connection while horizontally panning. Each phase recorded 60 animation-frame intervals after 12 warmup frames. Only the synthetic pointer ID's capture was bypassed, because synthetic pointers cannot acquire native pointer capture. Production React profiling is disabled, so no React duration claim is made.

The isolated benchmark window disables background throttling to keep measuring while Codex is focused; this is not an application setting change. Browser and background-throttled helper runs had large scheduling gaps and were not used for the final frame-performance result.

| Phase | Median frame interval | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| Idle baseline | 16.7 ms | 17.4 ms | 17.6 ms |
| Unselected elements, pointer moving | 16.7 ms | 17.1 ms | 17.7 ms |
| Selected elements and edges, pointer moving | 16.7 ms | 33.4 ms | 33.4 ms |
| Connecting | 16.7 ms | 33.3 ms | 33.4 ms |
| Connecting and panning | 16.7 ms | 33.3 ms | 33.4 ms |

At sampled cursor positions, at most 20 connectors were visible without selection, 25 with the full mixed selection, and 21 while connecting or panning. Pointer dispatch was at most 0.3 ms in the measured interaction phases. A DOM observer recorded **zero changes** to existing edge path geometry throughout. One 78.3 ms long frame occurred outside the measured steady-state samples; setup is not free.

Native checks also verified that the same 15 connectors and distance strengths remain visible at 20%, 25%, 50%, 100%, 200% and 300% cursor-centered zoom. At 20% zoom, hit tests just inside all four sides of a small plain Text element reached its content rather than an anchor, and a click still selected the Text. Drawing from an unselected element created one edge. Native hit testing also confirmed that an unselected edge contributes no reconnection handle, the nearest overlapping element anchor receives the pointer, and a selected edge endpoint wins at a shared anchor in a mixed selection. Automated interaction tests cover selection-free drawing, selected-only edge endpoints, endpoint priority in mixed selections, camera-only updates, control/gesture suppression, pointer reconnection and keyboard reconnection. Keyboard targets remain limited to selected elements when idle so this change does not add every board anchor to the Tab order.

This is a local Electron renderer check, not a guarantee of 60 fps on all hardware. There are occasional dropped frames; repeat profiling if board limits or connector rendering change. No spatial tree is needed for 2,000 cached candidates at these measured query costs.
