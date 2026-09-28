# Edges, mentions and Style View

## Vocabulary

| Term | Meaning |
| --- | --- |
| Edge | A manually drawn, editable relationship between two placements on one whiteboard. Saved in that `.whiteboard` file. |
| Anchor | One of four attachment points on a card or whiteboard tile: top, right, bottom, left. |
| Endpoint | Either end of an existing edge, attached to an anchor. Drag it to reconnect the edge. |
| Mention | A link in card content to another card. The current editor creates stable `card:<id>` Markdown links. |
| Mention link | A passive line visualizing a mention when both cards have placements on the displayed whiteboard. Derived from the index; never saved as an edge. |
| Backlink | An incoming mention, seen from the referenced card. |
| Reference / placement | A visual instance of an existing card on a whiteboard. This is an object, not a line or a mention. |
| Connection | General conversational description. Use **Edge** or **Mention link** in controls and documentation when identifying the kind. |
| Style View | A movable Side Dock View that follows the active whiteboard and its selection. Its tab label is **Style**. |

Cards and whiteboard tiles are equal edge endpoints. This does not turn a whiteboard into a Markdown card. Edges attach to placement IDs; changing a note's filename does not change the edge. Two placements of one card remain distinct endpoints.

The previous app saved its straight lines in `edges`; those remain manual edges and now use curved rendering. They are not silently converted to mentions. Old edges without arrowhead fields stay without arrows; new edges have an arrow at the destination by default. Arrowheads are independent styling at each end, not a semantic direction written into the source note.

## Drawing and selecting

The interaction reference is `obsidian-whiteboard`'s **Edges and Note Links** UX and its `beginConnection`, `connectionGeometry` and endpoint-reconnection code.

- Selected or edited cards and selected whiteboard tiles reveal four anchors. There is no persistent connection tool mode.
- Drag an anchor to another anchor, or click the first anchor and then the destination anchor. During this temporary gesture all destinations reveal their anchors and a curved preview follows the pointer.
- Dropping on a card/tile body chooses its nearest side. Anchors have a small screen-space capture radius. Source and destination cannot be the same placement.
- Escape, right-click, pointer cancellation, window blur, clicking empty canvas, or a drag ending without a destination cancels without writing a file.
- A completed edge is selected. Its two endpoint handles can be dragged onto other cards/tiles. Releasing a handle without a destination preserves the existing edge.
- One manual edge per unordered placement pair is the creation/reconnection rule. Repeating a pair selects its existing edge. Legacy duplicate edges are preserved when loading.
- Click an edge to select it. Shift-click adds; Cmd/Ctrl-click toggles. These modifiers also work with cards for mixed selection. Canvas rectangle selection includes curves crossing its region.
- Selected edges show endpoint handles and a center label affordance. Click the label affordance or double-click the path to edit the label. Enter or blur saves; Escape cancels the label edit.
- Right-click an edge for **Edit edge label**, **Show Style View**, and **Delete edge**. Delete/Backspace on the canvas deletes selected edges only. It never deletes a mentioned card or removes a mention from Markdown.

Paths live behind card content. Invisible wide hit paths make thin curves selectable. Pointer preview updates are batched to one animation frame, and the completed gesture creates one board edit/undo step. Moving, resizing, collapsing and auto-height measurement update endpoints using the displayed geometry.

## Passive mention links

Mention links are straight, muted, center-to-center lines behind cards and manual edges. They do not accept selection or dragging. An explicit edge and a mention link between the same cards may coexist. Visibility and overall appearance are board options in Style View; hiding them changes neither note content nor backlinks.

The worker queries its indexed outgoing links once for a displayed board, restricted to cards placed there. The renderer maps card IDs to placements; duplicate mentions in the same source are deduplicated. Notes are not reread during panning or edge drawing. Current mention indexing supports the app's stable `card:` links; plain relative Markdown links and Obsidian wikilinks are not yet resolved into this overlay. Whiteboard membership links do not imply mentions. Manual edges support whiteboard tiles independently of this card-mention index.

## Style View

Style is a normal movable/closable Side Dock View, registered in the Right Side Dock by default. Existing saved layouts gain it without rearranging their other Views. The Action Ribbon, selection toolbar and canvas palette action reveal it where it lives. Selecting an object does not automatically open or relocate a dock.

The View follows the active Main Dock whiteboard, including when the same file appears in two Tab Groups. Switching to another document shows an empty state. With no selection it shows canvas color, grid color, mention-link visibility and mention-link stroke controls.

| Selection | Available options |
| --- | --- |
| Edges only | Stroke color, style, width; start/end arrowheads; label size; label text for a single edge. |
| Cards only | Fill; stroke color, style, width; auto height; collapsed state. |
| Whiteboard tiles only | Fill; stroke color, style, width. |
| Cards + whiteboard tiles | Fill; stroke color, style, width. |
| Any selection including edges and cards/tiles | Stroke color, style, width only. |

Shared means supported by **every** selected item. When values differ, the control shows **Mixed** rather than choosing one item's value. Assigning a value applies it to the entire selection as one undoable board edit. Theme colors can be restored with the theme swatch. Custom colors are validated hexadecimal values. Stroke style offers none, solid, dashed and dotted. Each endpoint offers none, arrow, filled triangle or outline triangle.

Styles belong to the placement or edge in its whiteboard, not to the source card's frontmatter. Viewing/selecting never writes; committed style changes use the shared save, conflict detection, undo and checkpoint mechanisms. Existing geometry, content editing and navigation behavior remain separate from Style View.
