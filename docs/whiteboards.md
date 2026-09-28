# Whiteboard folders and card membership

This is the implemented contract. `src/core/workspace.ts` owns recognition and membership; `src/core/format.ts` owns serialization; `src/renderer/Board.tsx` owns canvas rendering.

## One matching file per folder

```text
My workspace/
  My workspace.whiteboard       mother whiteboard
  Ideas/
    Ideas.whiteboard            makes Ideas a whiteboard
    first.md                    belongs to Ideas
    external.md                 also belongs to Ideas
    Research/
      Research.whiteboard       sub-whiteboard
      paper.md                  belongs to Research, not Ideas
  _assets/
    figure.png                  ordinary folder, omitted in whiteboard mode
    source.md                   accessible in file mode; no automatic placement
  Other/
    wrong-name.whiteboard       does not make Other a whiteboard
```

The filename must be `<folder-name>.whiteboard`, with exact spelling and case, and its content must parse. A different `.whiteboard` filename remains an ordinary file available in file mode. Renaming a folder externally requires renaming its board file to match. Membership follows direct directory children, not recursive descendants. An actual whiteboard beneath ordinary directories appears under its nearest whiteboard ancestor in navigation.

The workspace folder name supplies the mother board's displayed name and metadata filename. The app creates that metadata file if missing, without moving notes. A malformed existing file is preserved and reported. The mother canvas contains only sub-whiteboards. Existing or externally added root notes remain accessible in file mode; **Organize root cards** explicitly moves them into a free `Notes/Notes.whiteboard` (or numbered name). Migration preserves a single old root card layout, IDs and supported relative attachment links, and creates history/recovery copies. Multiple root layouts or unsupported incoming links require manual attention rather than a guessed merge.

## Every direct card appears

A valid `.md` file directly inside a whiteboard folder must have a placement on that board. This applies to canvas creation, Explorer creation, external creation and discovery on reopen. Card identity prevents duplicate insertion when the same ID already has a placement. A moved card with a stable `card-id` retains existing references; its new parent board gains an owned placement. Removing a direct card's placement cannot hide that file: reconciliation restores a placement. The UI omits **Remove reference** for owned cards and sub-whiteboards.

References to cards in other folders remain optional placements and may be removed without deleting notes. Deleting a card through its menu or canvas Delete moves its Markdown to workspace trash and removes its placements/attached edges on the current board in one undo step. Meaningful content requires confirmation; empty cards do not. Other boards retain recognizable missing references. See [deletion behavior](interactions/edges-and-style.md#deletion). Invalid Markdown/frontmatter is reported rather than silently rewritten. Imported notes without a `card-id` receive a provisional path-based identity; discovery preserves their bytes, and the ID is written when they are edited. External renames of such ID-less notes cannot preserve their identity until an ID is stored.

## Inline filename editing

Click the filename above a card to rename it. The input receives focus without selecting its text; `.md` is a protected suffix. The navigation breadcrumb uses the same behavior. Enter or clicking away saves once; Escape cancels. Filename interactions do not drag the card or activate its body editor. Errors retain the entered name for correction. The full-path tooltip belongs to the filename, not the card body.

Renaming stays within the current folder and does not change the H1. Pending content edits save first. The revision-checked recovery transaction removes the old path and creates the new one as a single undo action. Existing card IDs remain stable; imported cards without a stored ID persist their existing provisional identity before the path changes. Placements, `card:` links, tabs and saved navigation entries continue to resolve by ID. Literal path-based Markdown/wiki links are not rewritten by this operation. Filename collisions and invalid names are rejected; capitalization-only renames currently require an intermediate name to remain safe on case-insensitive filesystems.

## Breadcrumb navigation and whiteboard renaming

The document toolbar shows workspace-relative breadcrumbs, ending in the current card filename or whiteboard folder name. Whiteboard ancestors navigate in the same tab; their context menu offers **Open in new tab**. Ordinary folders appear as path labels without inventing whiteboards. The current name uses the same inline edit controls as a card’s floating filename. The workspace root name stays read-only.

A nested whiteboard rename moves the actual folder and renames its matching `.whiteboard` file. The folder move preserves attachments, including binary files. Card IDs, nested board references, saved placements, starred/recent entries, icons, open tabs and view memories follow the new paths. Conventional relative Markdown links and images are rebased; arbitrary HTML, wiki syntax and paths embedded in code are not rewritten. A recovery journal protects the multi-step operation, which also has a normal undo/redo entry. Name collisions, stale indexed content and unindexed/invalid notes prevent the rename. Capitalization-only changes require an intermediate name.

**Open in new tab** opens in the current Main Dock Tab Group. **Open in another Tab Group** reuses the first other group in layout order, or creates a split when only one group exists. **Workspace settings → New split direction** chooses right (default) or below. An already-open destination activates its existing tab in that group. The old new-tab destination preference is retired and ignored, so existing workspaces follow the same menu behavior. Explorer, breadcrumb, and whiteboard menus share these commands.

## Default column and collapse

- Canvas creation uses the chosen coordinates and an expanded 340px-wide card in auto-height mode (120px minimum). The stored initial height of 280 is a fallback until measured.
- Other newly discovered cards use a collapsed 340px-wide card with a minimum 70px title footprint. The leading H1 retains its formatting and wrapping; an empty title shows the workspace prompt. The full path remains available by hovering the filename.
- On first automatic insertion, the board records `inbox: {x, y}`. It starts 80 canvas units to the right of existing content, with `y: 60`; an empty board starts at `x: 80`.
- New arrivals append below placements overlapping that column, with a 12-unit gap. The anchor persists, so later discoveries and restarts do not move existing cards. Batch discovery uses filename order; later arrivals append regardless of alphabetical position.
- Collapse is per placement, stored as optional `collapsed: true/false`. Omitted means expanded. The existing `width` and `height` retain the expanded width and fixed/fallback height. Collapse/expand changes neither note content nor position, and participates in shared undo and persistent history.
- The same upper-right chevron toggles state without moving. Clicking a collapsed title expands it for direct editing; double-clicking its outer frame also expands it. Expanded cards retain in-place editing. Expansion restores fixed height or fits the current content in auto-height mode, without rearranging neighbors, so it can overlap the next collapsed row; users can drag it to a working area.
- Collapsed placements mount neither note bodies nor editors. Plain titles and their inline Markdown come from the derived index. The same H1 styles are used in both states. One ResizeObserver per board measures wrapped collapsed titles and auto-height cards, so selection, connections, culling and Zoom to fit use their displayed heights. New intake rows reserve 70 units plus the existing 12-unit gap. Existing placement coordinates remain untouched; wrapped titles can extend beyond that default spacing, just as expanding a card can overlap its neighbors.

## Card height and action menus

Cards have a floating row above their top edge: editable filename on the left, three-dot **Card actions** on the right. The collapse chevron sits inside the upper-right corner with a 7px inset, at the same coordinates in both states. Controls appear on hover, selection or keyboard focus; the row also remains visible during editing and while its menu is open. Crossing from the card into the row preserves hover. Whiteboard tiles use the same menu position for **Whiteboard actions**, with **Open whiteboard**; their preview grids remain manually sized.

- **Auto height** is checked by default. A missing `autoHeight` field means enabled for cards; whiteboard tiles always keep fixed geometry. This also makes existing cards without a mode use auto height.
- Auto-height cards grow and shrink with formatted content, live edits, wrapping and loaded images, with a minimum expanded height of 120 canvas units. CSS supplies the natural height; there is no per-card editor or autosave loop for measuring it.
- Unchecking **Auto height** freezes the measured expanded height. Dragging the L-shaped corner likewise switches to fixed height, starting from the displayed size; even a width-only resize selects fixed mode. Recheck the menu item to fit content again.
- Collapse preserves height mode. A mode change while collapsed uses the last measured expanded height, or the stored fallback if the body has not yet rendered. It never stores the title-only height as the expanded height.
- `autoHeight` is an optional per-placement boolean in `.whiteboard`. Mode changes, manual resize and collapse participate in normal undo/history and revision checks. Measurements themselves are derived view state and produce no file writes or history entries.
- Geometry measurements are separate for expanded/collapsed states and invalidated by card revision or width changes. Unknown auto-height cards above the viewport are rendered once to measure their extent before culling; this keeps tall cards visible when restoring a camera near their bottom. Cards below the viewport or far to either side remain culled. Content completion and ResizeObserver update connections, selection and Zoom to fit.

## Canvas interactions and rendering

Right-click empty canvas to open **Canvas actions** with **New card** and **New whiteboard**. The new item’s top-left corner uses the clicked board coordinates, accounting for pan and zoom. A whiteboard asks for its name and retains that position while the dialog is open; submitting keeps the parent board visible. Creation and the parent placement share one undo entry. The mother whiteboard disables **New card**. Right-drag still pans and never opens the menu; Escape and outside clicks dismiss it. Keyboard Context Menu / Shift+F10 on the focused canvas uses its center.

The UI calls every board a **whiteboard**, regardless of its nesting. Expanded cards have no label bar. A content press starts a pending move; release within the 3px screen-space threshold (|dx| + |dy|) enables editing at the clicked position. Crossing that threshold makes the entire gesture a drag, including when it returns to its start. Cancellation never opens an editor. Drag previews, outer padding or borders to move; an already active editor keeps normal text selection. Existing multi-card selections do not open an editor on release. Collapsed titles follow the same rule: drag to move, click-release to expand and edit. Whiteboard tiles drag by their body. Double-click or **Open whiteboard** navigates in the same Main Dock tab. **Open in new tab** stays in the current Tab Group; **Open in another Tab Group** reuses another split or creates one. Both use the same L-shaped resize handle. Dragging a selected item moves its selection as a group; resizing affects just that item. Moving/resizing temporarily raises the items above other placements. A completed move appends its placements to the board’s ordered card list, preserving their relative order, so they stay in front after deselection and reload. That order participates in the same undo/history entry as the move. An active editor retains a thin draggable strip along its top edge. The strip and frame use a grab cursor, movement uses grabbing, text editing uses a text cursor, and links/buttons use a pointer.

Unselected cards cannot scroll their content; their wheel input follows normal canvas navigation. Selected scrollable preview/editor content keeps the wheel at both boundaries without handing it to the board. Auto-height content with no scroll container still navigates the board. Pinch and Ctrl/Command-wheel always zoom. The percentage control invokes **Zoom to fit**; there is no separate Fit control or percentage text field.

The **Navigation device** icon after the zoom controls cycles **Auto → Mouse → Trackpad → Auto**. It uses Lucide WandSparkles, Mouse and Touchpad icons with a tooltip describing the current mode and next click. Auto is the default for existing and new workspaces. The `whiteboardInput` preference lives in `.heavens-door/settings.json` and applies to every whiteboard in the workspace. Mouse bypasses detection and always zooms with wheel input; Trackpad bypasses detection and pans, with pinch and Ctrl/Command-wheel still zooming. Selected card scrolling takes priority in all modes. Switching modes cancels undecided input and clears recent automatic detection memory without moving the camera.

In Auto mode, wheel interpretation lives in `navigation.ts`. Events separated by no more than 220 ms keep one pan/zoom action, including trailing inertia; an explicit pinch or modifier change begins a new action. Line/page deltas indicate mouse zoom, horizontal pixel movement indicates trackpad pan, and large vertical pixel deltas are a mouse hint. Small ambiguous input uses the last confident choice from the same window (valid for ten seconds), or waits up to 48 ms for a clearer sample before falling back to pan. If clearer evidence arrives after an ambiguous or remembered decision, it informs the next gesture without changing the current action. Buffered movement is applied once and in order. Device recognition is heuristic because browser wheel events carry no reliable hardware ID; a purely vertical trackpad start can still resemble a mouse. Pointer gestures, explicit zoom controls, blur and disposal cancel undecided input. Automatic detection memory is temporary; only the chosen Auto/Mouse/Trackpad mode is persisted. Camera updates accumulate in order and paint once per frame, so mixed pan/pinch input cannot discard one another.

Selecting a card or entering its editor preserves the current zoom and pan position. Camera changes require explicit navigation or Zoom to fit. Expanded card content stays formatted from 20% through 300% zoom. There is no distant title-only rendering mode. Navigation paints one world transform per frame and updates the overscanned card set only after significant motion or settling. Offscreen cards unmount except the active editor or dragged placements. Mounted previews retain their DOM during zoom and geometry saves. A per-view cache holds up to 256 revision-keyed previews of up to 32,000 characters each; oversized previews still render, but are not cached after unmount. Local images use browser lazy loading. No additional editor instances are mounted for previews.

Whiteboard tiles show an inline icon/name header, card and whiteboard counts below, and a compact grid of child titles. Miniature cards are 88 × 34 canvas units, with 12-unit column gaps, 8-unit row gaps and single-line ellipsis. They have a neutral fill and rounded corners; only nested whiteboards carry a map icon. The grid clips at the tile’s lower inset without scrolling. Resizing reveals more rows/columns, with only enough indexed items mounted to fill the visible area (including a partially clipped last row). They use the existing snapshot/index, including cached H1 titles and missing-card fallbacks, without recursive board rendering or child-body reads.

## Empty and editable titles

The app reserves a leading H1 in previews and formatted editors. Only a heading at the beginning of a note (apart from whitespace) supplies the title; a later H1 remains a body section. A note without one displays a virtual empty H1 above its existing content. The default **A new card** text is a gray CSS prompt and may be changed per workspace with `titlePlaceholder` in settings. It is never inserted into the Markdown or counted as text.

Typing in the empty title creates `# Your title`. The editor keeps that first block as H1, and Enter moves into the body. An empty reserved heading is omitted when serializing; opening/focusing a card produces no save. New card bodies remain empty on disk until edited. Unsaved title text remains visible when collapsing while a save is in flight. The filename and title remain independent.

## File example

The format remains version 1 with optional collapse, auto-height and intake-column fields. Membership links and layout placement IDs must agree:

```markdown
---
whiteboard: true
whiteboard_version: 1
---
# Ideas

## Cards
- [Card](card:stable-card-id) ^placement-id

%% whiteboard-layout
{
  "version": 1,
  "cards": [{"id": "placement-id", "x": 520, "y": 60, "width": 340, "height": 280, "collapsed": true, "autoHeight": true}],
  "edges": [],
  "inbox": {"x": 520, "y": 60}
}
%%
```

## Writes and verification

Internal note creation and automatic placement are one revision-checked transaction and one undo action. External discovery changes only the matching `.whiteboard`; the externally authored `.md` remains untouched. A batched watcher updates the incremental index before reconciliation. Startup handles changes made while the app was closed. Board revision conflicts stop a write instead of replacing unseen edits. Geometry already present in the board is preserved.

`tests/workspace.test.ts` covers recognition, external discovery, persistent placement, grouped undo, rename identity and revision conflicts. `tests/board.test.tsx` checks 200 collapsed cards without body reads and expansion without geometry loss, alongside 200-preview DOM retention across zoom/saves, cache reuse after culling, board tile gestures, auto-height menus/resize/geometry, and delayed-save drag regressions. Session tests also reject stale edits that would overwrite a newer height mode. `tests/shell.test.ts` covers root migration and recovery.

## Edges and mention links

Manual `edges` connect placement IDs and render as editable curves. Optional endpoint sides, arrowheads, stroke settings, label and label size are stored with each edge. Placement `strokeColor`, `strokeWidth` and `strokeStyle` remain readable legacy fields; card and whiteboard tile borders now come from the theme. A source card’s hidden `card-color` frontmatter supplies its shared fill (hex, or null for Theme). Placement `fillColor` remains the fill for whiteboard tiles and a legacy fallback for cards without shared color metadata. The layout accepts `showMentions`. Legacy `mentionStyle`, `canvasColor` and `gridColor` remain readable and round-trip, but the theme now controls those visuals. All fields are optional and validated; existing version-1 boards remain readable. Mention links themselves are derived from the card-link index and are never serialized into `edges`. See [interaction and Style View rules](interactions/edges-and-style.md).
