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

A valid `.md` file directly inside a whiteboard folder must have a placement on that board. This applies to canvas creation, Explorer creation, external creation and discovery on reopen. Card identity prevents duplicate insertion when the same ID already has a placement. A moved card with a stable `card-id` retains existing references; its new parent board gains an owned placement. Removing a direct card's placement cannot hide that file: reconciliation restores a placement. The UI disables **Remove reference** for owned cards and sub-whiteboards.

References to cards in other folders remain optional placements and may be removed without deleting notes. A deleted note leaves a recognizable missing reference. Invalid Markdown/frontmatter is reported rather than silently rewritten. Imported notes without a `card-id` receive a provisional path-based identity; discovery preserves their bytes, and the ID is written when they are edited. External renames of such ID-less notes cannot preserve their identity until an ID is stored.

## Default column and collapse

- Canvas creation uses the chosen coordinates and an expanded 340 × 280 card.
- Other newly discovered cards use a collapsed 340px-wide card with a minimum 70px title footprint. The leading H1 retains its formatting and wrapping; an empty title shows the workspace prompt. The full path remains available on hover.
- On first automatic insertion, the board records `inbox: {x, y}`. It starts 80 canvas units to the right of existing content, with `y: 60`; an empty board starts at `x: 80`.
- New arrivals append below placements overlapping that column, with a 12-unit gap. The anchor persists, so later discoveries and restarts do not move existing cards. Batch discovery uses filename order; later arrivals append regardless of alphabetical position.
- Collapse is per placement, stored as optional `collapsed: true/false`. Omitted means expanded. The existing `width` and `height` retain the expanded dimensions. Collapse/expand changes neither note content nor position, and participates in shared undo and persistent history.
- The same upper-right chevron toggles state without moving. Clicking a collapsed title expands it for direct editing; double-clicking its outer frame also expands it. Expanded cards retain in-place editing. Expansion restores the saved height without rearranging neighbors, so it can overlap the next collapsed row; users can drag it to a working area.
- Collapsed placements mount neither note bodies nor editors. Plain titles and their inline Markdown come from the derived index. The same H1 styles are used in both states. One ResizeObserver per board measures wrapped collapsed titles, so selection, connections, culling and Zoom to fit use their displayed heights. New intake rows reserve 70 units plus the existing 12-unit gap. Existing placement coordinates remain untouched; wrapped titles can extend beyond that default spacing, just as expanding a card can overlap its neighbors.

## Canvas interactions and rendering

The UI calls every board a **whiteboard**, regardless of its nesting. Expanded cards have no label bar. Click their content to edit in place; drag the outer padding or border to move. Whiteboard tiles drag by their body and open through double-click or the corner arrow. Both use the same L-shaped resize handle. Dragging a selected item moves its selection as a group; resizing affects just that item. Moving/resizing temporarily raises the items above other placements. After release, selected items remain above unselected ones; z-order is not saved.

Unselected cards cannot scroll their content; their wheel input follows normal canvas navigation. Selected preview/editor content scrolls until its directional boundary, then hands the wheel to the board. Pinch and Ctrl/Command-wheel always zoom. The percentage control invokes **Zoom to fit**; there is no separate Fit control or percentage text field.

Expanded card content stays formatted from 20% through 300% zoom. There is no distant title-only rendering mode. Navigation paints one world transform per frame and updates the overscanned card set only after significant motion or settling. Offscreen cards unmount except the active editor or dragged placements. Mounted previews retain their DOM during zoom and geometry saves. A per-view cache holds up to 256 revision-keyed previews of up to 32,000 characters each; oversized previews still render, but are not cached after unmount. Local images use browser lazy loading. No additional editor instances are mounted for previews.

Whiteboard tiles show an inline icon/name header, card and whiteboard counts below, and a compact grid of child titles. Miniature cards are 88 × 34 canvas units, with 12-unit column gaps, 8-unit row gaps and single-line ellipsis. They have a neutral fill and rounded corners; only nested whiteboards carry a map icon. The grid clips at the tile’s lower inset without scrolling. Resizing reveals more rows/columns, with only enough indexed items mounted to fill the visible area (including a partially clipped last row). They use the existing snapshot/index, including cached H1 titles and missing-card fallbacks, without recursive board rendering or child-body reads.

## Empty and editable titles

The app reserves a leading H1 in previews and formatted editors. Only a heading at the beginning of a note (apart from whitespace) supplies the title; a later H1 remains a body section. A note without one displays a virtual empty H1 above its existing content. The default **A new card** text is a gray CSS prompt and may be changed per workspace with `titlePlaceholder` in settings. It is never inserted into the Markdown or counted as text.

Typing in the empty title creates `# Your title`. The editor keeps that first block as H1, and Enter moves into the body. An empty reserved heading is omitted when serializing; opening/focusing a card produces no save. New card bodies remain empty on disk until edited. Unsaved title text remains visible when collapsing while a save is in flight. The filename and title remain independent.

## File example

The format remains version 1 with optional collapse and intake-column fields. Membership links and layout placement IDs must agree:

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
  "cards": [{"id": "placement-id", "x": 520, "y": 60, "width": 340, "height": 280, "collapsed": true}],
  "edges": [],
  "inbox": {"x": 520, "y": 60}
}
%%
```

## Writes and verification

Internal note creation and automatic placement are one revision-checked transaction and one undo action. External discovery changes only the matching `.whiteboard`; the externally authored `.md` remains untouched. A batched watcher updates the incremental index before reconciliation. Startup handles changes made while the app was closed. Board revision conflicts stop a write instead of replacing unseen edits. Geometry already present in the board is preserved.

`tests/workspace.test.ts` covers recognition, external discovery, persistent placement, grouped undo, rename identity and revision conflicts. `tests/board.test.tsx` checks 200 collapsed cards without body reads and expansion without geometry loss, alongside 200-preview DOM retention across zoom/saves, cache reuse after culling, board tile gestures, and delayed-save drag regressions. `tests/shell.test.ts` covers root migration and recovery.
