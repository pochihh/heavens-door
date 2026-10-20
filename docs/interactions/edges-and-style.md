# Edges, mentions and Style View

## Vocabulary

| Term | Meaning |
| --- | --- |
| Edge | A manually drawn, editable relationship between two placements on one whiteboard. Saved in that `.whiteboard` file. |
| Anchor | One of four attachment points on a text item, card, image, shape or whiteboard tile: top, right, bottom, left. |
| Endpoint | Either end of an existing edge, attached to an anchor. Drag it to reconnect the edge. |
| Mention | A link in card content to another card. The current editor creates stable `card:<id>` Markdown links. |
| Mention link | A passive line visualizing a mention when both cards have placements on the displayed whiteboard. Derived from the index; never saved as an edge. |
| Backlink | An incoming mention, seen from the referenced card. |
| Reference / placement | A visual instance of an existing card on a whiteboard. This is an object, not a line or a mention. |
| Connection | General conversational description. Use **Edge** or **Mention link** in controls and documentation when identifying the kind. |
| Style View | A movable Side Dock View that follows the active whiteboard and its selection. Its tab label is **Style**. |

Cards and whiteboard tiles are equal edge endpoints. This does not turn a whiteboard into a Markdown card. Edges attach to placement IDs; changing a note's filename does not change the edge. Two placements of one card remain distinct endpoints.

The previous app saved its straight lines in `edges`; those remain manual edges and now use curved rendering. They are not silently converted to mentions. Old edges without arrowhead fields stay without arrows; new edges initially have an arrow at the destination. After a style edit, new edges inherit the workspace’s last edited complete edge style. Arrowheads are independent styling at each end, not a semantic direction written into the source note.

## Drawing and selecting

The interaction reference is `obsidian-whiteboard`'s **Edges and Note Links** UX and its `beginConnection`, `connectionGeometry` and endpoint-reconnection code.

- Selected or edited cards and selected whiteboard tiles reveal four anchors. There is no persistent connection tool mode.
- Drag an anchor to another anchor, or click the first anchor and then the destination anchor. A curved preview follows the pointer. Only the nearest candidate within 32 screen pixels reveals its four destination anchors; empty canvas and unrelated elements stay clear. A keyboard-started connection keeps every destination reachable with Tab.
- Dropping on a card/tile body chooses its nearest side. Anchors snap within 14 screen pixels, separately from the earlier nearby-anchor reveal. Source and destination cannot be the same placement.
- Escape, right-click, pointer cancellation or window blur cancels without writing a file. When drawing a new arrow, releasing on empty canvas keeps a preview active so a double-click can create connected Text. Reconnecting an existing arrow onto empty canvas preserves the original edge.
- A completed edge is selected. Its two endpoint handles can be dragged onto text, cards, images, shapes or whiteboard tiles. Releasing a handle without a destination preserves the existing edge.
- Multiple manual edges may connect the same pair of placements, in either direction and with the same or different anchors. Creation always assigns a new edge ID; reconnection updates only the selected edge ID. Each edge retains its own label, style, selection, deletion and undo behavior. Version-1 files already support this; no schema migration is needed. Identical anchors can produce overlapping curves/labels; users can reconnect an endpoint to another side to separate them. Automatic parallel-curve spacing is not currently applied.
- Click an edge to select it. Shift-click adds; Cmd/Ctrl-click toggles. These modifiers also work with cards for mixed selection. Canvas rectangle selection includes curves crossing its region.
- Selected edges show endpoint handles and a center label affordance. Click the label affordance or double-click the path to edit the label. The label retains its font size, position and wrapping during selection and editing; its draft is visible immediately as the user types. Enter or blur saves one edit; Escape cancels. Unchanged labels do not create edits. See the [in-place editing contract](../design-system.md#editing-in-place).
- Right-click an edge for **Edit edge label**, **Show Style View**, and **Delete edge**. Delete/Backspace on the canvas deletes selected cards and edges in one undoable action. Deleting an edge alone never deletes its text or other endpoint elements, or removes a mention from Markdown.

Paths live behind card content in viewport-sized SVGs outside the compositor-scaled card layer. Native SVG group transforms follow the same camera frame as cards, keeping curves, markers and labels sharp throughout zoom without rebuilding their path geometry. The handle layer stays above cards and below canvas controls; anchor hit areas stay a constant screen size. Invisible wide hit paths make thin curves selectable. Pointer preview updates are batched to one animation frame, and the completed gesture creates one board edit/undo step. Moving, resizing, collapsing and auto-height measurement update endpoints using the displayed geometry. Arrowed ends reserve a short straight shaft before the tip, scaled to line width, so a steep fan curve does not appear detached from its arrowhead. Facing anchors divide their available gap between those approaches and the curve without looping back; very tight gaps shorten the approaches proportionally. Drawing and reconnection previews, hit testing, selection and drag previews use that same geometry.

## Passive mention links

Mention links are straight, muted, center-to-center lines behind cards and manual edges. They do not accept selection or dragging. An explicit edge and a mention link between the same cards may coexist. Visibility is a board option in Style View; the theme controls line appearance. Hiding them changes neither note content nor backlinks.

The worker queries its indexed outgoing links once for a displayed board, restricted to cards placed there. The renderer maps card IDs to placements; duplicate mentions in the same source are deduplicated. Notes are not reread during panning or edge drawing. Current mention indexing supports the app's stable `card:` links; plain relative Markdown links and Obsidian wikilinks are not yet resolved into this overlay. Whiteboard membership links do not imply mentions. Manual edges support whiteboard tiles independently of this card-mention index.

## Style View

Style is a normal movable/closable Side Dock View, registered in the Right Side Dock by default. Existing saved layouts gain it without rearranging their other Views. The Action Ribbon and canvas palette action reveal it where it lives. Selecting an object does not automatically open or relocate a dock.

The View follows the active Main Dock whiteboard, including when the same file appears in two Tab Groups. Opening a Card View shows its shared fill color; other document types show an empty state. With no selection it retains the mention-link visibility toggle; canvas, grid and passive mention-line appearance belong to the theme.

| Selection | Available options |
| --- | --- |
| Edges only | Color; start/end arrows; arrowhead style; stroke style and width; label size; label text for a single edge. |
| Cards only | Color. |
| Whiteboard tiles only | Color. |
| Cards + whiteboard tiles | Color. |
| Any selection including edges and cards/tiles | Separate fill and edge sections, each with its full controls and its own selected count. |

Mixed selections are grouped by item type instead of being restricted to shared properties. Section headings use a centered dot: **Cards · 2 selected**, **Edges · 3 selected**. Whiteboard tiles share the fill section, titled **Whiteboards** when alone or **Cards & whiteboards** alongside cards. Empty sections and a redundant overall count are omitted. When values differ, no value is pressed; there is no **Mixed** text. Assigning a value applies only to that section’s selected items as one undoable transaction. Theme colors can be restored with the theme swatch. Custom colors are validated hexadecimal values. Stroke style offers solid, dashed and dotted. Arrows has two independent pressed buttons: Start arrow and End arrow. They allow neither, either or both ends. When the complete start/end configuration differs across selected edges, both buttons are unpressed with no mixed highlight. Clicking one then sets that end only on every selected edge, clearing the opposite end. Once directions agree, the two buttons toggle independently again. Direction changes preserve each edge’s arrowhead shape. Arrowhead style offers preview buttons for **Open arrow**, **Filled triangle** and **Outlined triangle**. Choosing a shape changes enabled ends only; it never adds arrows. With no enabled ends the shape buttons are disabled. Enabling an end preserves shapes already present and uses the opposite end’s shape when available, otherwise Open arrow. Existing independently styled ends remain intact until the user chooses a shape for the selection. Legacy `none` strokes render as solid and are not offered in the controls.

Card fill belongs to the source card; card and whiteboard tile borders come from the theme. Edge styling belongs to its containing whiteboard. Viewing/selecting never writes; committed style changes use the shared save, conflict detection, undo and checkpoint mechanisms. Existing geometry, content editing and navigation behavior remain separate from Style View.

## Card color and workspace palette

**Card color** is the card's shared fill, stored in its hidden YAML `card-color` field as a six-digit hex value. All references and miniature card previews use that value, as does Card View. Choosing Theme stores explicit `null`, so it overrides any legacy placement fill. Existing files without this field keep their old per-placement fills until the user chooses a shared color; the app does not guess which old placement should win.

Geometry, collapse and height mode remain per placement. Whiteboard tile fills remain per placement as well. A mixed card/tile fill change writes source card metadata and the relevant board in one revision-checked, undoable transaction. Card borders, shadows and rounding are theme-controlled. Auto-height stays in Card actions and collapse keeps its existing corner control. Color saves flush a pending editor draft first and advance its revision without discarding typing that arrives during the save. The Markdown body and unrelated frontmatter stay intact.

Style controls use direct buttons. Stroke width buttons show actual line thickness; stroke-style buttons show solid/dashed/dotted samples; arrow buttons show the corresponding direction; label sizes and the mention-visibility toggle use compact button groups. The Edges section order is **Color → Arrows → Arrowhead style → Stroke style → Stroke width → Font size → Label** (Label appears for a single edge). It stays available in mixed selections; cards and whiteboard tiles expose just Color. The default width buttons are **1, 2 and 4 px**. Saved widths outside these presets still render at their actual width and are not changed merely by selection. Active options have a persistent pressed state and keyboard focus. Mixed values have no pressed option and no extra label. There are no style dropdowns. Custom colors use a native picker plus a hex field and an explicit Apply action.

The default palette contains eight muted hues: Rose `#c9838a`, Terracotta `#c99579`, Ochre `#c6ad72`, Sage `#91aa8b`, Teal `#80aaa6`, Blue `#8aa5c5`, Lavender `#a699c3`, Slate `#8b929e`, plus Theme. The Edit palette action opens a draft editor in Style View: add, name, recolor, reorder, remove, reset, Save or Cancel. Up to 24 swatches are stored in `.heavens-door/settings.json`. Escape cancels the palette editor.

Palette selections copy their hex value. Editing or deleting a swatch changes **future selections only**, never existing cards, edges or boards. Theme appearance still adapts: opaque CSS `color-mix` blends fill into the card surface (38% color in light themes, 24% in dark), and stroke into muted foreground (68%/78%). Shared `--tint-*` tokens control these roles; swatches show the literal palette color at full opacity for clear recognition in either theme. Soft blending applies only to the resulting card/tile fill or edge stroke. Alpha transparency is not used for card bodies, so edges behind them do not show through.


## Theme appearance and compatibility

The file owns explicit user color choices and edge styles. The theme owns card/tile borders, shadow and rounding, the canvas, the adaptive dot grid and passive mention-line appearance. Style View does not offer controls for that decoration. Color changes fill in the card/tile section, and stroke in the Edges section; the source hex is copied unchanged to the relevant files. A selection containing both exposes separate Color controls in its fill and edge sections.

Existing placement stroke fields, `canvasColor`, `gridColor` and `mentionStyle` still round-trip for compatibility, but no longer override theme rendering. This change does not migrate or delete those fields, introduce palette references, or adopt the proposed nested `style` schema. See [grid and theme tokens](../design-system.md#whiteboard-grid-and-theme-owned-appearance).


## Remembered edge style

The workspace’s existing SQLite cache stores the last successfully edited edge’s complete style: literal hex color (or Theme), thickness, line pattern, both arrowheads and label size. New edges copy these values into their normal `.whiteboard` record. Label text, IDs, endpoint targets and anchor sides are never copied. This cache is local convenience state, survives app restart, is shared by windows using that workspace, and can be discarded without affecting document styles. It is not written to notes, workspace settings or Git history.

Only a successful edge style change updates the cache, including Color in the Edges section of a mixed selection. Selection, opening a board, moving/reconnecting an edge, changing label text, undo/history navigation and external edits do not change it. For a multi-edge style change, the last changed edge in board order supplies the complete style; we do not invent a combination of mixed values. With no cache, a new edge is solid, 2 units wide, Theme colored, with a destination arrow and 14-unit label text.

## Deletion

Selection never opens a floating canvas toolbar. Styling lives in Style View; edge actions remain in the edge context menu. Card **… → Delete card** and canvas Delete/Backspace use the same operation. Delete does not intercept typing in editors, filename inputs or edge labels. Whiteboard tiles are not deleted by this card operation.

Empty cards delete immediately. Whitespace, the generated blank H1 and app-owned `card-id` / `card-color` metadata do not count as content. Any real title/body, image/link markup or other frontmatter property requires confirmation. The title placeholder is not file content. Batch deletion asks once if any selected card contains content; cancel preserves the entire selection and all files.

The card's exact Markdown bytes move into `.heavens-door/trash/<uuid>.md`, excluded from indexing and automatic placements. Its placements on the current whiteboard and attached edges are removed together; other whiteboards retain recognizable missing references. The file, placement geometry and edges restore together with Cmd/Ctrl+Z; redo repeats the deletion. Both the board and cards are revision-checked after confirmation, so a concurrent external edit aborts rather than deleting unreviewed content. Trash files persist across restart; the in-session undo stack does not. No trash-management UI is introduced here.

**Remove reference** remains in the card menu for optional placements from other folders (and missing cards). It removes only that placement and attached edges; the source note remains. Local folder members cannot be detached this way.

## Future customization

All Style View choices are default presets, not a permanently fixed menu. Future workspace customization can change the available presets while the theme controls their visual presentation. Preset editors and extension APIs are deferred; no extra settings surface is added now. Documents and the remembered edge style continue storing literal color/width/style values rather than preset references, so changing future options will not restyle existing edges. The current width validator still accepts 0.5–8 and all three supported arrowhead shapes round-trip unchanged.

## Whiteboard deletion

Whiteboard tiles and Whiteboard explorer rows reuse the card Delete menu action and Delete/Backspace selection gesture. Delete whiteboard uses the shared confirmation dialog, then the existing folder-to-Trash operation. It includes every nested board, local card, and asset in that folder; references to cards stored elsewhere do not delete their files. Check the complete folder stamp again after confirmation to reject concurrent changes. Undo restores the folder and its identities; redo returns it to Trash. The mother whiteboard cannot be deleted.

## Copy and apply styles

Select one whiteboard element and press **Command+Shift+C** (Windows: **Ctrl+Shift+C**) to copy its style. Select one or more targets and press **Command+Shift+V** (**Ctrl+Shift+V**) to apply it. Both actions are also in element context menus and can be rebound in Keyboard shortcuts. They do not run while editing text or fields.

Stroke color, width and pattern apply wherever supported; fill applies to placements. Font size transfers between Text and edge labels. Text-to-Text also copies shape and text color. Edge-to-edge also copies arrowheads. Other fields remain unchanged, including content, position, connections, edge labels and image crop/caption. Backend fill/border fields still round-trip even where the current UI leaves their rendering to the theme. Card fill updates the source note and all its references. A mixed application is one revision-checked Undo action.

The style clipboard is shared across boards and splits within this app window. It is separate from the system clipboard, so normal copied text and images remain available; it does not persist after closing the window or transfer to another app window.

## Shared font sizes

Text and edge labels use the same **Font size** control: **S, M, L, XL**, with default sizes **14, 20, 28, 40 px**. Whiteboard → Text in Settings uses these same presets for new Text. With no explicit style, Text uses M and labels use S. New choices store the preset name (`s`, `m`, `l`, `xl`), and rendering resolves `--whiteboard-font-size-s`, `--whiteboard-font-size-m`, `--whiteboard-font-size-l`, or `--whiteboard-font-size-xl`, with the shared defaults as fallbacks. Future themes can override those tokens for both kinds of text together. There is no theme editor yet.

Existing numeric sizes remain literal and are not rewritten or rounded; those and mixed sizes leave the preset buttons unpressed until a preset is chosen. Numeric sizes from 8–120 px remain supported in files and style copy/paste. New preset choices use the existing revision-checked save and Undo path. Text stays transparent regardless of its stored fill.

When editing Text, **Escape** or **Command+Enter** (Windows: **Ctrl+Enter**) saves the draft and returns to selection without creating a sibling. **Command/Ctrl+Z** restores the pre-edit text and position as one Undo action. Alt+Enter inserts a newline. Enter and Tab retain sibling/child creation.
