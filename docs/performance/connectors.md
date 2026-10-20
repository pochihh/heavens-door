# Connector proximity checks

Measured on 2026-10-20 on the development Mac. The fixture in `scripts/connector-benchmark-fixture.ts` contains 200 Markdown cards with rendered prose, 200 two-line Text elements (plain and shaped), and 200 edges. All 400 elements fit in the viewport at 25% zoom. The Test workspace also contains this fixture as **Connector performance checks**, without replacing existing review boards.

## Geometry query

Run `npm run benchmark:connectors`. It creates 1,600 connector points with one height lookup per placement, then performs 10,000 measured radius-and-snap queries after 2,000 warmup queries, cycling through 20%, 50%, 100% and 300% zoom.

| Measurement | Result |
| --- | ---: |
| Build cached scene | 0.520 ms |
| Query pair, median | 0.0138 ms |
| Query pair, 95th percentile | 0.0155 ms |
| Query pair, maximum | 0.1049 ms |
| Height lookups, including all queries | 400 |

These are CPU query timings, not frame-rate measurements.

## Full renderer

The production-bundled review harness used the real Whiteboard, Markdown previews, navigation and connector layers in Chrome at 2560 × 1233. A marquee selected all 400 placements and their 200 edges. It then exercised selection hover, a live connection, and a live connection while horizontally panning. Each phase recorded 60 animation-frame intervals after 12 warmup frames. The pointer stream was synthetic; only its pointer ID's capture was bypassed, because synthetic pointers cannot acquire browser pointer capture. Production React profiling is disabled, so no React duration claim is made from that build.

| Phase | Median frame interval | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| Idle baseline | 16.7 ms | 17.5 ms | 17.7 ms |
| Selected elements, pointer moving | 16.7 ms | 33.4 ms | 34.3 ms |
| Connecting | 16.7 ms | 33.8 ms | 34.3 ms |
| Connecting and panning | 17.6 ms | 34.3 ms | 34.4 ms |

At sampled cursor positions, at most 17 individual connectors were visible (16 during pan). Pointer dispatch was at most 0.2 ms in these measured phases. A DOM observer recorded **zero changes** to existing edge path geometry throughout. Initial selection/connection setup produced long frames of 98.6 ms and 61.8 ms before the measured steady-state samples; setup is not free. Development-mode runs were substantially slower and unstable, so they are not used to claim shipped frame performance.

A separate normal-zoom UI check selected two neighboring cards: exactly the facing right/left anchors appeared, one per card. Clicking them created an edge. Keyboard reconnection to a third card preserved the edge count and moved its endpoint. Light and dark appearances were checked.

This is a local production-renderer check, not a guarantee of 60 fps on all hardware or a native Electron GPU benchmark. There are occasional dropped frames; repeat profiling if board limits or connector rendering change. No spatial tree is needed for 1,600 cached points at these measured query costs.
