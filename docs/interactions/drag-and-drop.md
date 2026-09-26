# Shared drag-and-drop interactions

Shared visuals and geometry: `src/renderer/sortable.ts`. Consumers: Starred/Recent in `Explorer.tsx`, and Main/Side Dock tabs through `tab-drag.ts`. Regressions: `tests/explorer.test.tsx`, `tests/docks.test.tsx` and `tests/desktop.test.tsx`.

The reference is Toby's `obsidian-super-tag` plugin, specifically `docs/ui-patterns/sortable-property-popover/interaction-spec.md`, its `sortable-property-list.template.ts`, and the corresponding property renderer. This implementation adapts those interactions to React and cross-list bookmarks; attribution is in `THIRD_PARTY_NOTICES.md`.

## Shared behavior

1. Start on the item's label/icon, never its separate action buttons or property values. A 5px pointer threshold keeps ordinary clicks working. Saved lists keep their document icon on hover and throughout dragging; no grip substitution.
2. Create one fixed-position phantom at its measured size. Tab phantoms always use active styling; even an inactive Side Dock tab expands from its current size to icon + name without changing the selected View. Use the normal 180 ms size transition and 120 ms label fade, with the shared easing; the invisible slot grows with the phantom and the previous active tab collapses through its usual transition. Reduced motion makes these changes immediate. When entering a different Side Dock Tab Group, narrow an oversized phantom to fit beside its destination icons (minimum 80px). Restore its measured active width when returning or leaving the strip; retain the proportional grab position. Copy its computed visual styles, including descendants. Add no opacity, scaling or shadow. Include the original backing surface so translucent fills do not let destination text bleed through the phantom. Freeze its perpendicular coordinate within a list: vertical lists lock X; horizontal tab strips lock Y. Between Tab Groups the tab phantom follows both axes, then locks to the destination strip. The pointer retains its grab position along the active axis, proportionally when a tab narrows.
3. Hide the source in layout and insert one placeholder at the destination. Bookmarks and tabs use an empty insertion slot matching the phantom’s size. Tabs show only the floating phantom until drop. A new Side Dock split uses the divider preview described below, without a tab placeholder. Other tabs in the destination strip appear inactive; no second copy of the dragged tab is rendered visibly. React retains ownership of the original row. For list reordering and Tab Strip insertion, the placeholder is the insertion marker; do not add a second line, tinted drop area, or extra overlapping destination row. When a Recent item already exists in Starred, temporarily hide that existing destination copy too.
4. Use directional swap thresholds. Bookmarks use the pointer: moving down/right swaps after 25% of the next row, moving up/left before 75% of the previous row. Tabs use the phantom’s right boundary moving right and left boundary moving left against those same thresholds, independent of where the tab was grabbed. Compare neighbors’ layout positions, excluding animated displacement. Large pointer jumps can cross several rows in one event.
5. Before moving the placeholder, record visible row rectangles. Cancel outstanding animations, reposition, then animate the deltas for 150ms with `cubic-bezier(0.2,0,0,1)`. Skip motion when reduced motion is requested. Cancelled animations must not accumulate or snap the wrong row.
6. Clamp the phantom along the destination section's axis while over it. Auto-scroll the shared Starred/Recent panel near its edge. Moving outside permits dragging a bookmark out; the phantom then shows a “Remove from Starred” hint. Bookmarks keep the cross-axis position locked throughout; tabs can cross between strips as described above.
7. Use document-level pointer move/up handlers filtered by pointer ID. Losing pointer capture must not silently cancel a legitimate release. Remove listeners, animations, placeholder and phantom on every completion path. Suppress the click generated after an actual drag.
8. Persist only after release, and only when the final bookmark order changes. Pointer movement updates DOM geometry, not workspace files. Tab dragging changes transient React state once at lift and once at completion so the source can display its fallback View; it does not write the saved layout during previews.

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

`createDragPhantom`, `animateReorder` and `crossed` are shared by bookmark and tab gestures. They own the copied appearance, 150 ms neighbor displacement and directional thresholds. Bookmark persistence remains in `useBookmarkDrag`; tab placement remains in `useTabDrag` and existing layout operations. Keep file operations, content edits and board-card geometry out of these gestures. Do not introduce native browser drag ghosts for these consumers.

For a future property editor, preserve keyboard editing and start dragging only on the property label/grip. Editable controls must never accidentally begin a reorder. Update this specification and its runnable regression whenever the gesture changes.

## Tabs in all docks

The split containers in the Main Dock and both Side Docks are **Tab Groups**. There is no whole-group drag handle. The Side Dock tab context menu retains close/move/split/merge commands, including moving a whole Tab Group. Open it with right-click, Shift+F10 or the Menu key; there is no persistent **…** button.

| Stage | Behavior |
| --- | --- |
| Lift | At the 5px threshold, create the phantom with active styling. An inactive Side Dock tab starts at its current width and animates to the expanded size; its label fades in using the normal selection timing. Every Side Dock tab phantom shows icon + name; Main Dock tab phantoms use active document styling. Keep the original grab offset when expanding an inactive tab. The original active tab animates to its inactive appearance while its strip previews the drop. |
| Source | Hide the lifted tab. If it was active, show the next tab in order, or the previous tab when it was last. An inactive drag leaves source selection alone. A sole-tab source keeps an empty View and its full Tab Strip available for dropping back. |
| Destination | Reserve an empty insertion slot and show only the floating phantom until drop in every Tab Group. An oversized Side Dock phantom and its slot narrow together to fit beside the destination icons. Other tabs in the target strip appear inactive. The destination content stays unchanged until drop. Duplicate Main Dock file tabs are hidden temporarily in the target, then reused on drop rather than duplicated. |
| Reorder | Keep the source slot when lifting within a Tab Group. Reorder when the phantom’s right boundary crosses 25% of its next neighbor, or its left boundary crosses 75% of its previous neighbor. Grabbing either end of a wide tab gives the same result for the same tab movement. The pointer still chooses the destination Tab Group and triggers edge auto-scroll. Neighbor displacement matches Starred; tab size and label transitions remain enabled during dragging. Size animation alone never changes the insertion order; swaps require pointer movement or edge scrolling. Release commits the displayed insertion slot. |
| Drop | Move/reorder the tab and activate it at the destination. Save the resulting layout only after release. Moving a Main Dock tab carries its view position unless the target already has that file open. |
| Cancel | Escape, pointer cancel, window blur, unmount, an invalid destination or release outside the viewport restores original order, selection and content. Remove every phantom, preview and temporary style. |

Side Dock tabs can move between the Left and Right Side Docks only. Main Dock tabs can move between Main Dock Tab Groups only. Crossing those families is invalid, not a conversion or a file move. The same underlying file may remain open in other Main Dock Tab Groups.

A collapsed or empty Side Dock temporarily exposes an empty destination while a Side Dock tab is lifted; it stays open only after a successful drop.

To create a vertical split, move within 20px above or below the middle of an existing Side Dock Tab Group. The target is confined below its Tab Strip. Show an accent-colored horizontal divider at the group midpoint only while this target is active. The phantom follows the pointer freely, retaining its grab offset; it never snaps below the source header or to the divider. Do not insert a tab placeholder or change the destination View while previewing a split. On release, the existing group stays above and the dragged tab becomes active in a new group below; each receives half the destination group’s weight. A lone tab cannot split its own empty source. Leaving the middle target or cancelling clears the divider without saving. The top and bottom content edges are not split targets; dropping there cancels. Side Dock splits only stack top-to-bottom.

During the drag, the source group keeps its size even when empty. After a successful transfer away, an empty Side Dock source group disappears; Main Dock empty Tab Groups remain. Dropping back into a sole-tab source restores it without a saved change.

Dragging operates within one app window and does not create floating windows. Left/Right, Home and End select Side Dock tabs; group menus provide non-drag alternatives. Tab Group splitters preview adjacent weights while held, persist on release, and restore starting proportions on pointer cancellation. Arrow keys resize them too. Layout changes remain independent of content undo.
