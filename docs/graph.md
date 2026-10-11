# Graph

Graph is a dockable Core plugin. The Action Ribbon opens it in a side dock. Drag its tab into a Main Dock tab strip for a larger view, or drag it back into either side dock. Its toolbar also opens it in the Main Dock; the main tab menu can return it to the side dock. Disable it under Settings → Core plugins → Graph.

Whiteboards are larger outlined circles with opaque interiors; cards are solid circles. Nodes use their existing saved colors. The mother whiteboard is excluded, and no center placeholder is drawn. Boards sit in inner rings, their descendants farther out, and disconnected cards around the rim. Referenced Slipbox cards and mentioned Journal notes are connected to the working graph without changing their ownership.

Board membership uses solid lines. Board references and mentions use distinct dashed lines; drawn whiteboard edges are also included. Graph options toggle each link type. Hover shows the node name and its neighbors with a short ease-out transition for labels, emphasis and dimming. Click a card for its popup or a board for same-tab navigation; right-click offers other opening options. Find a node uses the same indexed fuzzy search as mentions. Arrow keys select nodes, Enter opens one, and Home fits the graph.

Drag nodes to rearrange the visualization. In 2D, drag the background to pan. In 3D, drag the background to orbit and Shift-drag to pan. Scroll zooms in both modes. Spring motion settles rather than running continuously; reduced motion is respected. Reset restores the radial layout. Dragged positions last only while that graph view is mounted; they do not change any card or whiteboard files.

The graph is derived from local files and the rebuildable link index. It resolves standard Markdown, legacy card links and unambiguous Obsidian wiki links through the editor's existing resolver. Duplicate names are not guessed. Code samples and unresolved links create no edges. Templates, Trash and editable system guides are excluded. It does not create a graph file or a separate source of truth.
