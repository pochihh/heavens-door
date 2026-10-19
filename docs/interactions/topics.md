# Topics on whiteboards

A topic is the existing board text object. Plain topics have a compact transparent footprint; their text mirror determines identical bounds during selection and editing. Shapes retain their existing presentation. Topic content stays in the `.whiteboard` file until converted into a card.

## Creation and editing

- Use **New topic** in the canvas controls or canvas context menu. Creation immediately selects the topic and starts editing.
- Start a new connector from an anchor, then release on empty canvas. The connector remains active. Double-click empty canvas to create a topic and its connecting branch in one board edit. Escape or right-click cancels. Existing destination cards/topics still complete a normal connector. Reconnecting an existing edge never creates a topic.
- With a topic or ordinary card selected, **Tab** creates a child topic and **Enter** creates a sibling. A root's sibling is another independent root. Menus expose the same actions. Each new topic starts editing immediately and is placed clear of existing content, without rearranging it.
- Double-click a topic, use **Edit topic**, or press **F2** to edit. Inside the editor, Tab and Enter retain text-editing behavior. Command/Ctrl+Enter commits and returns focus to the canvas; Escape discards the current edit and returns focus. Clicking away commits. Normal Quit/Reload commits the focused control before the session finishes saving.

Branch relationships are explicit `kind: branch` edges between placement IDs. A child has one parent and branches cannot form cycles. Ordinary connectors remain independent and may have arbitrary cross-links. Structure does not change file ownership. Reconnection validates branch structure, and all existing moves/transfers preserve the same edge metadata.

## Convert to card

The topic context menu exposes **Convert to card**. It creates an ordinary Markdown file in the owning board's folder. The first line becomes its title; remaining text becomes its body. It keeps the placement ID, position, fill color and connections, and takes the normal card width/editor. The board change and new file are one revision-checked, undoable transaction. A conflict creates no orphan note or overwritten file. Conversion never creates asset/annotation metadata.

## Scope and checks

This pass adds fast creation and conversion. Automatic branch layout, collapse, subtree drag/reparenting and a full drawing toolbar remain separate design work. The visible Topic button joins existing canvas controls; right-click and keyboard access remain available.

Verification on October 19: all 216 tests and lint/types pass. Actual browser input verified equal selection/edit bounds for single-line (162.125 × 23) and multiline (218.734375 × 46) topics, connector drag followed by double-click creation, child/sibling shortcuts, immediate focus recovery, and dark/light appearance. The packaged macOS Test app verified creation, typing, a child branch, conversion to an editable Markdown card, Undo/Redo with the connected child retained, and saving a still-focused topic draft on normal Quit. An additive **Topic UI checks** board remains in the local test workspace for review. Stable release version is unchanged.

Final temporary build: `0.1.27-test.17`. It is open on **Topic UI checks**. The installed stable app remains unchanged.
