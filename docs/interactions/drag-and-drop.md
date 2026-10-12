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

For property editing, preserve keyboard editing and start dragging only on the property label/grip. Editable controls must never accidentally begin a reorder. Update this specification and its runnable regression whenever the gesture changes.

## Tabs in all docks

The split containers in the Main Dock and both Side Docks are **Tab Groups**. There is no whole-group drag handle. The Side Dock tab context menu retains close/move/split/merge commands, including moving a whole Tab Group. Open it with right-click, Shift+F10 or the Menu key; there is no persistent **…** button.

Main Dock tabs share one row, up to 186px wide. Inactive tabs shrink toward a 32px icon; their close buttons hide below 100px and their titles hide below 52px. The active tab retains at least 112px and its close button. There are no scrolling arrows. At extreme counts, wheel/trackpad scrolling and Search tabs reach the remaining tabs. Opening, selecting, moving, or resizing a group reveals its active tab without scrolling the document. Dragging uses the existing edge auto-scroll and swap preview, with no automatic active-tab reveal during a drag. The fixed Search tabs button lists every tab in that group, with fuzzy title/path search, full names, and keyboard navigation. Arrow keys, Home and End select tabs in the strip; middle-click closes one.

Right-click, Shift+F10, and the Menu key open the same tab menu. Close other tabs keeps the clicked tab; Close tabs to the right uses the current strip order. Closing the last tab removes that group and collapses its split; the final Main Dock pane remains available when all tabs are closed. Restoring an older layout also removes empty splits. These operations affect only that group, remove closed-tab navigation history, and preserve all files. Pending edits must save successfully before any tabs close. Unavailable bulk actions are disabled.

| Stage | Behavior |
| --- | --- |
| Lift | At the 5px threshold, create the phantom with active styling. An inactive Side Dock tab starts at its current width and animates to the expanded size; its label fades in using the normal selection timing. Every Side Dock tab phantom shows icon + name; Main Dock tab phantoms use active document styling. Keep the original grab offset when expanding an inactive tab. The original active tab animates to its inactive appearance while its strip previews the drop. |
| Source | Hide the lifted tab. If it was active, show the next tab in order, or the previous tab when it was last. An inactive drag leaves source selection alone. A sole-tab source keeps an empty View and its full Tab Strip available for dropping back. |
| Destination | Reserve an empty insertion slot and show only the floating phantom until drop in every Tab Group. An oversized Side Dock phantom and its slot narrow together to fit beside the destination icons. Other tabs in the target strip appear inactive. The destination content stays unchanged until drop. Duplicate Main Dock file tabs are hidden temporarily in the target, then reused on drop rather than duplicated. |
| Reorder | Keep the source slot when lifting within a Tab Group. Reorder when the phantom’s right boundary crosses 25% of its next neighbor, or its left boundary crosses 75% of its previous neighbor. Grabbing either end of a wide tab gives the same result for the same tab movement. The pointer still chooses the destination Tab Group and triggers edge auto-scroll. Neighbor displacement matches Starred; tab size and label transitions remain enabled during dragging. Size animation alone never changes the insertion order; swaps require pointer movement or edge scrolling. Release commits the displayed insertion slot. |
| Drop | Move/reorder the tab and activate it at the destination. Remove an empty source group only after a committed move, retaining one Main Dock pane. Save the resulting layout only after release. Moving a Main Dock tab carries its view position unless the target already has that file open. |
| Cancel | Escape, pointer cancel, window blur, unmount, an invalid destination or release outside the viewport restores original order, selection and content. Remove every phantom, preview and temporary style. |

Side Dock tabs can move between the Left and Right Side Docks only. Main Dock tabs can move between Main Dock Tab Groups only. Saved view tabs use the same interaction within their own view block; they cannot cross into another block or a dock. Their drop saves the `views` array order, and Alt+Left/Right offers the same operation without dragging. Crossing those families is invalid, not a conversion or a file move. The same underlying file may remain open in other Main Dock Tab Groups.

A collapsed or empty Side Dock temporarily exposes an empty destination while a Side Dock tab is lifted; it stays open only after a successful drop.

To create a vertical split, move within 20px above or below the middle of an existing Side Dock Tab Group. The target is confined below its Tab Strip. Show an accent-colored horizontal divider at the group midpoint only while this target is active. The phantom follows the pointer freely, retaining its grab offset; it never snaps below the source header or to the divider. Do not insert a tab placeholder or change the destination View while previewing a split. On release, the existing group stays above and the dragged tab becomes active in a new group below; each receives half the destination group’s weight. A lone tab cannot split its own empty source. Leaving the middle target or cancelling clears the divider without saving. The top and bottom content edges are not split targets; dropping there cancels. Side Dock splits only stack top-to-bottom.

During the drag, the source group keeps its size even when empty. After a successful transfer away, an empty Side Dock source group disappears; Main Dock empty Tab Groups remain. Dropping back into a sole-tab source restores it without a saved change.

Dragging operates within one app window and does not create floating windows. Left/Right, Home and End select Side Dock tabs; group menus provide non-drag alternatives. Tab Group splitters preview adjacent weights while held, persist on release, and restore starting proportions on pointer cancellation. Arrow keys resize them too. Layout changes remain independent of content undo.

## Tag property rows

`TagProperties` reuses `useBookmarkDrag` in reorder-only mode: property labels start the vertical drag, values remain editable, and leaving the list cancels rather than removing the property. A type icon changes to the grip on label hover. The shared phantom retains the hovered appearance and follows only Y; no destination tint or duplicate row. Alt+Up/Down performs the same reorder. Persist YAML key order on this card, never change the tag schema from a card’s property list. Only keys already present on the card participate; dragging never creates missing properties.


## Card tag pills

Tag pills use `useBookmarkDrag` in horizontal, reorder-only mode. Five pixels start the drag; the phantom retains the pill’s color and active state, stays on its row and leaves one empty slot. Neighbor movement uses the shared 150ms animation. Dragging leaves properties unchanged until release and never removes a tag. The strip scrolls horizontally as needed; input and property values never initiate this drag. Escape, blur, pointer cancel or releasing outside the strip restores order without writing. Alt+Left/Right is the keyboard alternative. Persist an order change only on drop through shared content undo. Every valid drop activates the dragged tag and opens its properties, even if the final index is unchanged; that selection-only change writes no content. Cancellation preserves the previous selection. The pill’s separate More button never starts a drag.


## Tag definition properties

Default and Optional sections on a tag page share one grouped vertical drag using `useBookmarkDrag`. Property labels move within or between the sections with the same phantom, empty insertion slot and 150ms neighbor animation; only Y moves. Headers accept drops into empty sections without permanent empty space. Dropping changes order and optional membership together, preserving the field definition/default; Escape, outside drop and cancellation write nothing. The schema save is undoable and never rewrites existing cards. A label click edits its definition; a completed drag suppresses that click and saves only the `.tag` definition. Alt+Up/Down reorders within the section. The property context menu remains a non-drag way to move between Default and Optional. Inherited rows open their source tag and do not rewrite the parent definition through child reordering. Card values and membership remain unchanged.

Parent-tag pills below the tag title use the same horizontal phantom, empty slot and Alt+Left/Right reorder as card-tag pills. Only a valid drop saves the `inherits` order; the first parent has precedence. Existing cards are not rewritten.

## Kanban cards

Use the shared phantom and neighbor animation for Kanban. Pointer-down remains a click until movement exceeds 5 px. A full-height insertion slot shows the destination. Acquire a nearby column within 12 px and release it outside 24 px; within a column, use the shared 25% / 75% directional thresholds. The preview follows the pointer vertically without snapping to rows, with the whole card clamped below the destination column’s status heading (including its spacing and any progress-group label) and above the Kanban block’s bottom edge. Moving back inside resumes free motion immediately; the visual clamp does not turn an outside drop into a valid drop. Horizontal column snapping is retained. The insertion gap shows the pending row without moving the preview to it. Vertical position follows without a transition delay. Leaving the columns releases the snap. Scroll horizontally within the Kanban and vertically in the surrounding page near its visible edges; keep the source card's appearance and fill color throughout.

A drop saves both placement and any grouping-property change together. Escape, pointer cancellation, losing the window, and dropping outside restore the original arrangement without writing. Titles and read-only property previews behave as the card surface for clicking and dragging. More buttons never start a drag. Allow swap previews and positional drops under every sort. A completed positional drop switches to Manual and preserves the current ordering of the other columns. Honor reduced-motion preferences. See [View blocks](../view-blocks.md#manual-kanban-order) for the file contract.

## Documents between places

Explorer rows (including real folders), saved entries, Slipbox/Journal/Template cards, and Table grips, Gallery cards, Kanban cards and Timeline bars can be dragged onto another folder or board. Whiteboard cards and child-board tiles use the same destinations. Open board tabs are also destinations: dropping onto an inactive board tab adds the item to that board without switching documents. Dragging the tab itself continues to move tabs between groups. The center half of an explorer folder row means “inside”; the top and bottom gaps retain navigation reordering. The entire child-board tile and open canvas accept drops. Highlight a valid board immediately with the accent outline; release moves into it. No dwell timer, label or progress UI. The containing canvas never masks a child-board destination. Highlight only valid destinations with the accent outline. The floating preview keeps the grab offset and follows both axes outside its original list. Cancel, Escape, blur, pointer cancellation or an invalid outside drop changes nothing.

- An unplaced card dropped onto a board moves its Markdown file into that board and adds a real placement. A canvas drop uses its camera coordinates; a tile or explorer row appends below existing items.
- A tile/canvas drop moves an owned card directly. Other destinations offer **Move card** or **Add reference** after release. Dismissing the menu does nothing. Move preserves its ID and other references, removes the old owned/source placement and attached edges, and rewrites relative Markdown/HTML links. Add reference leaves the source file and placement intact. A colliding card filename gets a numbered name.
- Dragging a reference between boards moves only that reference. Its original file and owning placement stay intact. Other references remain unchanged. The separate Add reference action still creates another reference.
- Dropping a card/file onto a physical folder moves the real file. Folder drops never create reference files. Special-library folders are real storage targets; Trash remains available through the explicit delete action.
- A whiteboard always moves its complete folder, including child boards, cards and assets. It appears only under its new real parent; board references are unsupported. Its canonical metadata, document paths and links follow the move. The mother whiteboard accepts child boards, not card placements. Moving a board into itself or a descendant is invalid; a name collision never overwrites a folder.

A canvas multi-selection moves as one undoable transaction. Keep every selected placement’s relative X/Y, size, color, collapse state and stroke; carry all edges between those placements with their labels, anchors, arrowheads and styles. Remove edges crossing the selection boundary. Real card files and board folder trees move; selected reference placements move without moving their originals. Pointer drops into another open canvas retain the grab offset; tile/row/tab drops place the group below existing content. The group phantom includes all selected items and their internal edges. Any selected board or descendant is an invalid destination. Validate the whole transfer before writing, journal it, and recover the entire group after an interrupted move. Undo/redo refuses to overwrite external edits.

All committed moves are undoable. Within view blocks, existing property/date/manual-order gestures retain their meaning and do not change file ownership. Within a canvas, ordinary geometry moves retain their meaning. Block/editor text drags and tab drags stay separate from document transfers.

## Timeline rows

Drag the card itself horizontally to reschedule, vertically to reorder, or diagonally to do both in one gesture. No separate side grips. The cursor is grab on hover and grabbing during movement. Keep a transparent row and draw only the moving bar, preserving its grab offset, free Y movement and canvas bounds below the ruler. Use the shared directional swap thresholds and 150ms neighbor animation to preview the insertion slot. The date preview follows X at the current scale. Release saves the date and full indexed row order in one undoable transaction and switches to Manual. Purely vertical moves preserve dates exactly. Alt+Up/Down on a focused card performs the same reorder. Keep vertical edge autoscroll in the surrounding page.

Endpoint grips retain the east–west cursor and resize dates without reordering. Day scale uses 15-minute increments; horizontal movement converts a date-only value to a timed value. Names stay at the actual bar start. Do not shift names inward as the canvas pans; a fully offscreen bar becomes a pinned arrow with the full name on hover.

Empty canvas dragging pans horizontally with a hand cursor; it never reorders or reschedules. Rebase the rendered date buffer at its boundaries while preserving the date under the pointer. Escape restores the previous viewport.

Unscheduled cards appear in a bottom collapse as wrapping, name-sized timeline bars. They use the shared measured phantom outside the timeline and the same moving bar and neighbor swap preview inside its tracks. Drop preserves both the previewed date/time and insertion row, attaching the defining tag and chosen property when absent through the standard atomic view mutation. Escape, blur, pointer cancellation or dropping outside writes nothing. New-card hover previews do not write; only release creates the card.

## Table rows and canvas

Grid and Compact Table use the shared hover/focus grip with grab/grabbing cursors and Alt+Up/Down. Lift after 5px, preserve the measured row and column widths, preview neighbor swaps at the shared thresholds, and clip the floating row to the horizontal viewport. The row stays below Grid headers. On drop, switch to Manual and save `order.rows` in the view owner; keep the rendered rows and scroll position during saving. Escape, blur, cancellation and invalid drops write nothing.

Horizontal drags across displayed cells or empty table space pan the table. Ordinary clicks still open cards or property editors; active inputs and row grips are excluded from panning. Vertical movement remains page scrolling. Escape restores the previous horizontal position. Panning changes no files.

## Registered workspaces

Manage workspaces reuses the shared vertical reorder gesture for every registration, including missing folders. A six-dot handle appears on row hover or keyboard focus and remains visible in the phantom. The current-workspace check occupies a separate leading slot. Drag the handle or folder/status details; name editing and action buttons never start dragging. Alt+Up/Down reorders a focused row. Save registration order only on release; cancellation preserves it.
