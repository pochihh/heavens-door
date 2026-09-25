# Sortable lists and bookmark dragging

Implementation: `src/renderer/sortable.ts`. First consumer: Starred and Recent in `Explorer.tsx`. Regression: `tests/explorer.test.tsx`.

The reference is Toby's `obsidian-super-tag` plugin, specifically `docs/ui-patterns/sortable-property-popover/interaction-spec.md`, its `sortable-property-list.template.ts`, and the corresponding property renderer. This implementation adapts those interactions to React and cross-list bookmarks; attribution is in `THIRD_PARTY_NOTICES.md`.

## Shared behavior

1. Start on a row's label/icon, never its separate action buttons or property values. A 5px pointer threshold keeps ordinary clicks working. Saved lists keep their document icon on hover and throughout dragging; no grip substitution.
2. Create one fixed-position phantom at the source's exact measured size. Copy its computed visual styles, including descendants. Add no opacity, scaling or shadow. Freeze its perpendicular coordinate: vertical lists lock X; horizontal lists lock Y. The pointer retains its original offset along the active axis.
3. Hide the source in layout and insert one empty, equally sized placeholder at the destination. React retains ownership of the original row. The placeholder is the insertion marker; do not add a second line or overlapping destination row. When a Recent item already exists in Starred, temporarily hide that existing destination copy too.
4. Use directional swap thresholds. Moving down/right swaps after the pointer crosses 25% of the next row; moving up/left swaps before 75% of the previous row. Large pointer jumps can cross several rows in one event.
5. Before moving the placeholder, record visible row rectangles. Cancel outstanding animations, reposition, then animate the deltas for 150ms with `cubic-bezier(0.2,0,0,1)`. Skip motion when reduced motion is requested. Cancelled animations must not accumulate or snap the wrong row.
6. Clamp the phantom along the destination section's axis while over it. Auto-scroll the shared Starred/Recent panel near its edge. Moving outside permits dragging a bookmark out; the phantom then shows a “Remove from Starred” hint. Keep the cross-axis position locked throughout.
7. Use document-level pointer move/up handlers filtered by pointer ID. Losing pointer capture must not silently cancel a legitimate release. Remove listeners, animations, placeholder and phantom on every completion path. Suppress the click generated after an actual drag.
8. Persist only after release, and only when the final bookmark order changes. Pointer movement updates DOM geometry, not workspace files or React application state.

## Starred and Recent semantics

| Gesture | Result |
| --- | --- |
| Explorer/Recent → Starred | Add the document at the placeholder, or move its existing bookmark |
| Within Starred | Reorder bookmarks |
| Starred → elsewhere in the window | Remove that bookmark; the document stays on disk |
| Explorer/Recent → elsewhere | No change |
| Escape, pointer cancel, window blur, unmount | Restore the original list; no persistence |
| Release outside the application viewport | Cancel |

Starred and Recent occupy one panel with one vertical scroller. An empty Starred list has no minimum height, border, placeholder text or reserved drop space. Its header accepts a drop. During dragging, only the temporary row placeholder indicates insertion; never highlight the Starred section.

Recent order always comes from opening documents; dragging it does not reorder its history. Context menus provide Add/Remove Starred and Move up/down. Alt+Up/Down reorders a focused Starred row without dragging. The Starred header tooltip explains drag-in, drag-out and reorder.

The plugin reference committed some cancel events. This app intentionally cancels them to avoid changing bookmarks after focus loss. No file move or delete shares this gesture.

## Reuse

`useBookmarkDrag` owns one pointer session and accepts a destination element, a commit callback, and the axis. `crossed` is the common directional-threshold calculation. Only vertical bookmark lists are currently wired into the product. A future horizontal property consumer should reuse the geometry and phantom rules, supply its own persistence callback, and add a horizontal interaction test before shipping. Do not couple property storage or board-card geometry to bookmark preferences.

For a future property editor, preserve keyboard editing and start dragging only on the property label/grip. Editable controls must never accidentally begin a reorder. Update this specification and its runnable regression whenever the gesture changes.


## Module tabs and panel groups

Implementation: `src/renderer/Docks.tsx` and shared `src/layout.ts`. Regression: `tests/docks.test.tsx`.

Dock rearrangement uses native HTML drag-and-drop with `application/heavens-module`, separate from the pointer-based bookmark sorter and document-tab transfer. Drag a module tab to move one module; drag a group's grip to move all its tabs. Every module has exactly one placement across the two docks.

A tab-strip drop merges groups or inserts/reorders a module before a targeted tab. Top/bottom content drop zones create vertical panel groups. Collapsed or empty docks expose a narrow target while a drag is active. The destination dock expands after a successful drop. A source group disappears only if it has no modules left. Drops cannot move file content.

Only the completed drop saves a layout change. Drag end, Escape or blur without a drop clears transient targets. An explicit drop-zone highlight is used here; it does not change the bookmark rule prohibiting a highlighted Starred section. The group menu offers equivalent move/split/merge operations without dragging.

Panel-group splitters preview adjacent weights while held and persist on release; pointer cancellation restores the starting proportions. Arrow keys resize them too. Layout writes are batched independently of card/board content and use workspace preferences, not session undo.
