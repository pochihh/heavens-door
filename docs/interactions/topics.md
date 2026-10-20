# Text on whiteboards

Text uses the existing board text object. All Text items auto-size around their text and explicit line breaks, with no resize handle. The text mirror determines identical bounds during selection and editing. Ellipse padding keeps the full text rectangle inside its curve; shaped selections use a soft highlight along their existing border. Text content stays in the `.whiteboard` file until converted into a card.

## Creation and editing

- Use **New text** in the canvas context menu. Creation immediately selects the text and starts editing.
- Start a new connector from an anchor, then release on empty canvas. The connector remains active. Double-click empty canvas to create text and its connecting branch in one board edit. Escape or right-click cancels. Existing destination cards/text still complete a normal connector. Reconnecting an existing edge never creates text.
- With text or ordinary card selected, **Tab** creates child text and **Enter** creates a sibling. A root's sibling is another independent root. Menus expose the same actions. Each new text item starts editing immediately and is placed clear of existing content, without rearranging it. Placement reads live text dimensions so rapid typing cannot put a child inside its parent. Children inherit their branch direction.
- Double-click text, use **Edit text**, or press **Space / F2** to edit with the caret at the end. Typing on selected Text replaces its content and enters editing; Escape restores the original content. While editing, Tab saves the draft and creates a child; Enter saves it and creates a sibling. Alt+Enter inserts a line break at the caret. These shortcuts also work immediately after creation, without a select/deselect step. IME composition does not trigger creation. Command/Ctrl+Enter commits and returns focus to the canvas; Escape discards the current edit and returns focus. Clicking away commits. Normal Quit/Reload commits the focused control before the session finishes saving.

With one item selected, **Shift+Tab** selects its branch parent, **Up/Down** selects same-parent peers by Y position, and **Left/Right** selects connected neighbors by X position. Arrows retain caret behavior while typing; Shift+Tab commits and selects the parent.

While editing a left-facing branch, the Text item’s right edge stays fixed and its label grows leftward, with right-aligned lines for plain Text. Committing saves the new left coordinate and text together; Escape restores both. Reconnecting the branch determines the next edit’s growth direction. Right-facing and standalone Text keep their left coordinate. This uses ordinary placement coordinates, with no new file fields.

Facing edge curves stay within the gap between their anchors, so lower siblings cannot make the curve bend back. Backward and same-side manual connections retain their outward routing.

Plain text connectors leave an eight-pixel gap from the compact text bounds on all sides. Cards, images and shaped objects keep their existing attachment points.

**Settings → Whiteboard → Text** contains defaults for the font size and text color, using the shared theme/palette controls, plus a shortcut reference. Defaults apply to newly created text only; existing text keeps its saved appearance.

Branch relationships are explicit `kind: branch` edges between placement IDs. A child has one parent and branches cannot form cycles. Ordinary connectors remain independent and may have arbitrary cross-links. Structure does not change file ownership. Either arrow endpoint can reconnect to text, cards, images, shapes or boards. A valid branch reconnection retains the parent/child relationship. If it would give an item two parents or introduce a cycle, that arrow becomes an ordinary connector instead of rejecting the drop; its ID and style stay intact. Reconnecting or deleting an arrow never removes its former text endpoint. Standalone text without arrows is valid. Existing moves/transfers preserve the edge metadata.

## Convert to card

The Text context menu exposes **Convert to card**. With several Text items selected, **Convert N text elements to cards** converts them in one undoable transaction and stays on the board. It creates an ordinary Markdown file in the owning board's folder. The first line becomes its title; remaining text becomes its body. It keeps the placement ID, position, fill color and connections, and takes the normal card width/editor. The board change and new file are one revision-checked, undoable transaction. A conflict creates no orphan note or overwritten file. Conversion never creates asset/annotation metadata.

## Scope and checks

This pass adds fast creation and conversion. Automatic branch layout, collapse, subtree drag/reparenting and a full drawing toolbar remain separate design work. Canvas controls contain navigation and Style; creation remains available from right-click and keyboard access.

Regression checks cover rapid Enter/Tab placement, facing-curve monotonicity in all four directions, Space/F2 caret placement, direct replacement and composition entry, left-facing growth/commit/cancel, navigation, batch conversion, Undo/Redo and existing arrow reconnection. Browser checks exercise actual repeated quick-creation keys and live fractional-width geometry in both themes. Native Test builds use separate additive review boards; existing user fixtures are preserved.
