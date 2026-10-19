# Text on whiteboards

Text uses the existing board text object. Plain text items have a compact transparent footprint; the text mirror determines identical bounds during selection and editing. Shapes retain their existing presentation. Text content stays in the `.whiteboard` file until converted into a card.

## Creation and editing

- Use **New text** in the canvas controls or canvas context menu. Creation immediately selects the text and starts editing.
- Start a new connector from an anchor, then release on empty canvas. The connector remains active. Double-click empty canvas to create text and its connecting branch in one board edit. Escape or right-click cancels. Existing destination cards/text still complete a normal connector. Reconnecting an existing edge never creates text.
- With text or ordinary card selected, **Tab** creates child text and **Enter** creates a sibling. A root's sibling is another independent root. Menus expose the same actions. Each new text item starts editing immediately and is placed clear of existing content, without rearranging it.
- Double-click text, use **Edit text**, or press **F2** to edit. While editing, Tab saves the draft and creates a child; Enter saves it and creates a sibling. Alt+Enter inserts a line break at the caret. These shortcuts also work immediately after creation, without a select/deselect step. IME composition does not trigger creation. Command/Ctrl+Enter commits and returns focus to the canvas; Escape discards the current edit and returns focus. Clicking away commits. Normal Quit/Reload commits the focused control before the session finishes saving.

Plain text connectors leave an eight-pixel gap from the compact text bounds on all sides. Cards, images and shaped objects keep their existing attachment points.

**Settings → Whiteboard → Text** contains defaults for the font size and text color, using the shared theme/palette controls, plus a shortcut reference. Defaults apply to newly created text only; existing text keeps its saved appearance.

Branch relationships are explicit `kind: branch` edges between placement IDs. A child has one parent and branches cannot form cycles. Ordinary connectors remain independent and may have arbitrary cross-links. Structure does not change file ownership. Reconnection validates branch structure, and all existing moves/transfers preserve the same edge metadata.

## Convert to card

The Text context menu exposes **Convert to card**. It creates an ordinary Markdown file in the owning board's folder. The first line becomes its title; remaining text becomes its body. It keeps the placement ID, position, fill color and connections, and takes the normal card width/editor. The board change and new file are one revision-checked, undoable transaction. A conflict creates no orphan note or overwritten file. Conversion never creates asset/annotation metadata.

## Scope and checks

This pass adds fast creation and conversion. Automatic branch layout, collapse, subtree drag/reparenting and a full drawing toolbar remain separate design work. The visible Text button joins existing canvas controls; right-click and keyboard access remain available.

Verification on October 19: all 218 tests and lint/types pass. Browser input verified direct Enter/Tab creation with draft preservation and focus transfer, Alt+Enter line breaks at the caret, identical compact edit/selection bounds, connector spacing, and Text settings in light and dark themes. The earlier native Test.17 pass verified conversion, Undo/Redo and normal Quit persistence. Existing user fixtures in **Topic UI checks** are preserved.

The follow-up is packaged as `0.1.27-test.19` in `.local/test-app-next`, ready to launch after quitting the current Test app. The running session and installed stable app remain unchanged.
