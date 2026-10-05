# Boards and System

The whiteboard explorer separates Boards from System: Templates, Slipbox, Journal, Tags and Trash. Home opens the workspace's root whiteboard. System can be collapsed. Drag a system entry into Boards to keep its shortcut there; use its menu to move it back. Boards reorder among siblings without moving their folders. Alt+Up/Down also changes navigation order.

System entries can be starred and appear in Recent. Templates and Slipbox open searchable tables; Journal includes Calendar and a searchable note table. Tags lists tag definitions. Trash lists archived cards and offers Restore. Template rows can create a new card from the template. Ordinary cards open in the shared popup and can be dragged onto a board.

Settings → Core features independently enables Templates, Slipbox, Journal and Calendar, Tags, Trash, and Views and queries. Disabling a feature hides its entry and related controls, retaining its navigation placement, settings and files. Calendar and Tags dock placements return when enabled. Disabled view blocks display their YAML source. Cards remain indexed for Search, Recent and the file explorer.

Special roles follow the configured Templates, new-card and Journal folder paths. Tags uses `tags/`; Trash uses `.heavens-door/trash/`. These folders and their descendants do not appear as whiteboards, including when a feature is disabled. Existing `.whiteboard` files are retained but are not used for automatic card intake. The file explorer always shows the real files. Inbox remains reserved for Read later; Slipbox is the default for unplaced cards.

## Local files

Feature switches and navigation stay in `.heavens-door/settings.json`:

```json
{
  "features": { "journal": false },
  "boardNavigation": {
    "order": {
      "boards:": ["board:Projects", "system:slipbox", "board:Research"],
      "boards:Projects": ["board:Projects/Active", "board:Projects/Archive"],
      "system": ["system:templates", "system:tags", "system:trash"]
    },
    "systemCollapsed": false
  }
}
```

Missing feature switches mean enabled. New boards append after saved entries. Missing board keys are ignored. System keys identify roles, so folder changes do not break shortcuts.

Deleted cards keep their exact Markdown bytes in `.heavens-door/trash/<uuid>.md`. A sibling `<uuid>.json` stores the original path and deletion timestamp. Restore returns the file to its original location, choosing a numbered filename if that path is occupied. Old trash without metadata restores into the configured Slipbox folder. Deletion and restoration use the normal undoable multi-file transaction. No card or tag content depends on the database for recovery.
