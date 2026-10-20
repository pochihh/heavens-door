# Connector proximity checks

Measured on 2026-10-20 on the development Mac. The fixture in `scripts/connector-benchmark-fixture.ts` contains 200 Markdown cards with rendered prose, 200 two-line Text elements (plain and shaped), and 200 edges. All 400 elements are mounted at 25% zoom; the viewport clips the board when narrower than its full width. The Test workspace also contains this fixture as **Connector performance checks**, without replacing existing review boards.

## Geometry query

Run `npm run benchmark:connectors`. It creates 1,600 placement anchors and 400 selected edge endpoints with one height lookup per placement, then performs 10,000 measured radius-and-snap queries after 2,000 warmup queries, cycling through 20%, 50%, 100% and 300% zoom.

| Measurement | Result |
| --- | ---: |
| Build cached scene | 0.880 ms |
| Query pair, median | 0.0115 ms |
| Query pair, 95th percentile | 0.0145 ms |
| Query pair, maximum | 0.1066 ms |
| Height lookups, including all queries | 400 |

These are CPU query timings, not frame-rate measurements.

## Full renderer

The frame measurements below were recorded before removing the minimum screen-radius floor. The latest native cursor-centered wheel-zoom check separately verified identical connector keys and distance strength at 20%, 25%, 50%, 100%, 200% and 300% zoom, using the same 400-element fixture.

The production-bundled review harness used the real Whiteboard, Markdown previews, navigation and shared anchor/endpoint hint layer in Electron 44, with a 1280 × 828 CSS-pixel viewport at 25% board zoom. All 400 elements were mounted and selected, together with their 200 edges. The synthetic marquee extended beyond the viewport to include all 400 placements. Pointer phases exercised selected anchors and edge endpoints, a live connection, and a live connection while horizontally panning. Each phase recorded 60 animation-frame intervals after 12 warmup frames. Only the synthetic pointer ID's capture was bypassed, because synthetic pointers cannot acquire native pointer capture. Production React profiling is disabled, so no React duration claim is made.

The isolated benchmark window disables background throttling to keep measuring while Codex is focused; this is not an application setting change. Browser and background-throttled helper runs had large scheduling gaps and were not used for the final frame-performance result.

| Phase | Median frame interval | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| Idle baseline | 16.7 ms | 17.5 ms | 17.7 ms |
| Selected elements and edges, pointer moving | 16.7 ms | 33.5 ms | 34.2 ms |
| Connecting | 16.7 ms | 33.4 ms | 34.2 ms |
| Connecting and panning | 16.7 ms | 34.0 ms | 34.3 ms |

At sampled cursor positions, at most 31 individual connectors/endpoints were visible (24 while connecting or panning). Pointer dispatch was at most 0.2 ms in the measured interaction phases. A DOM observer recorded **zero changes** to existing edge path geometry throughout. Initial selection/connection setup produced long frames of 131.6 ms and 67.7 ms before the measured steady-state samples; setup is not free.

A separate normal-zoom UI check selected two neighboring cards: exactly the facing right/left anchors appeared, one per card. Clicking them created an edge. Keyboard reconnection to a third card preserved the edge count and moved its endpoint. Light and dark appearances were checked. An actual pointer drag reconnected a selected edge endpoint to a third card without changing the number of edges. Only the nearby endpoint remained visible; moving to a toolbar hid both hints while keeping their keyboard targets. Automated tests also cover zoom-only refresh, cursor-centered zoom invariance, and keyboard reconnection.

This is a local Electron renderer check, not a guarantee of 60 fps on all hardware. There are occasional dropped frames; repeat profiling if board limits or connector rendering change. No spatial tree is needed for 2,000 cached candidates at these measured query costs.
